/**
 * Servicio para gestionar Cobros e Incidencias de Cobro
 * 
 * Funcionalidades:
 * - Crear cobro desde incidencia
 * - Aplicar fraccionamiento
 * - Obtener cobros por estado
 * - Aplicar cuotas en facturación
 * 
 * NOTA: Se usa 'as any' porque las tablas cobros_incidencias y cobros_cuotas_fraccionadas
 * son nuevas y no están en los tipos generados de Supabase.
 */

import { supabase } from '../lib/supabase'
import type {
  CobroIncidencia,
  CobroIncidenciaConRelaciones,
  CobroCuotaFraccionadaConPeriodo,
  ControlCobrosStats
} from '../types/incidencias.types'

// Helper para acceder a tablas sin tipos generados
const db = supabase as any

export const cobrosService = {
  /**
   * Crear un cobro desde una incidencia
   */
  async crearCobroDesdeIncidencia(
    incidenciaId: string,
    usuarioId: string
  ): Promise<CobroIncidencia> {
    // Obtener datos de la incidencia
    const { data: incidencia, error: incError } = await db
      .from('incidencias')
      .select('*')
      .eq('id', incidenciaId)
      .single()

    if (incError) throw new Error(`Error obteniendo incidencia: ${incError.message}`)
    if (!incidencia) throw new Error('Incidencia no encontrada')

    // Crear cobro
    const { data: cobro, error: cobError } = await db
      .from('cobros_incidencias')
      .insert({
        incidencia_id: incidenciaId,
        conductor_id: incidencia.conductor_id,
        monto_total: incidencia.monto_penalidades || incidencia.monto || 0,
        descripcion: incidencia.descripcion,
        estado: 'por_aplicar',
        fraccionado: false,
        creado_por: usuarioId
      })
      .select()
      .single()

    if (cobError) throw new Error(`Error creando cobro: ${cobError.message}`)
    return cobro
  },

  /**
   * Obtener cobros en estado "por_aplicar"
   */
  async obtenerCobrosPorAplicar(): Promise<CobroIncidenciaConRelaciones[]> {
    const { data, error } = await db
      .from('cobros_incidencias')
      .select(`
        *,
        incidencia:incidencias(*),
        conductor:conductores(id, nombres, apellidos)
      `)
      .eq('estado', 'por_aplicar')
      .order('creado_at', { ascending: false })

    if (error) throw new Error(`Error obteniendo cobros: ${error.message}`)
    
    // Mapear conductor para incluir nombre_completo
    return (data || []).map((cobro: any) => ({
      ...cobro,
      conductor: cobro.conductor ? {
        ...cobro.conductor,
        nombre_completo: `${cobro.conductor.nombres} ${cobro.conductor.apellidos}`
      } : null
    }))
  },

  /**
   * Obtener cobros fraccionados
   */
  async obtenerCobrosFraccionados(): Promise<CobroIncidenciaConRelaciones[]> {
    const { data, error } = await db
      .from('cobros_incidencias')
      .select(`
        *,
        incidencia:incidencias(*),
        conductor:conductores(id, nombres, apellidos),
        cuotas:cobros_cuotas_fraccionadas(*)
      `)
      .eq('fraccionado', true)
      .order('creado_at', { ascending: false })

    if (error) throw new Error(`Error obteniendo cobros fraccionados: ${error.message}`)
    
    // Mapear conductor para incluir nombre_completo
    return (data || []).map((cobro: any) => ({
      ...cobro,
      conductor: cobro.conductor ? {
        ...cobro.conductor,
        nombre_completo: `${cobro.conductor.nombres} ${cobro.conductor.apellidos}`
      } : null
    }))
  },

  /**
   * Aplicar fraccionamiento a un cobro
   */
  async aplicarFraccionamiento(
    cobroId: string,
    cantidadCuotas: number
  ): Promise<void> {
    // Obtener datos del cobro
    const { data: cobro, error: cobroError } = await db
      .from('cobros_incidencias')
      .select('*')
      .eq('id', cobroId)
      .single()

    if (cobroError) throw cobroError
    if (!cobro) throw new Error('Cobro no encontrado')

    // Calcular monto por cuota
    const montoCuota = Math.round((cobro.monto_total / cantidadCuotas) * 100) / 100

    // Obtener períodos disponibles (semanas abiertas o cerradas recientes)
    const { data: periodos, error: perError } = await db
      .from('periodos_facturacion')
      .select('*')
      .eq('anio', new Date().getFullYear())
      .order('semana', { ascending: true })
      .limit(cantidadCuotas)

    if (perError) throw perError
    if (!periodos || periodos.length < cantidadCuotas) {
      throw new Error(`No hay suficientes períodos (necesita ${cantidadCuotas}, encontró ${periodos?.length || 0})`)
    }

    // Crear cuotas
    const cuotas = periodos.slice(0, cantidadCuotas).map((periodo: any, index: number) => ({
      cobro_id: cobroId,
      numero_cuota: index + 1,
      monto_cuota: montoCuota,
      periodo_id: periodo.id,
      semana: periodo.semana,
      anio: periodo.anio,
      aplicado: false
    }))

    const { error: insertError } = await db
      .from('cobros_cuotas_fraccionadas')
      .insert(cuotas)

    if (insertError) throw insertError

    // Actualizar cobro como fraccionado
    const { error: updateError } = await db
      .from('cobros_incidencias')
      .update({
        estado: 'fraccionado',
        fraccionado: true,
        cantidad_cuotas: cantidadCuotas,
        updated_at: new Date().toISOString()
      })
      .eq('id', cobroId)

    if (updateError) throw updateError
  },

  /**
   * Obtener cuotas pendientes para una semana
   */
  async obtenerCuotasPendientesParaSemana(
    periodoId: string
  ): Promise<CobroCuotaFraccionadaConPeriodo[]> {
    const { data, error } = await db
      .from('cobros_cuotas_fraccionadas')
      .select(`
        *,
        periodo:periodos_facturacion(*)
      `)
      .eq('periodo_id', periodoId)
      .eq('aplicado', false)
      .order('numero_cuota', { ascending: true })

    if (error) throw new Error(`Error obteniendo cuotas: ${error.message}`)
    return data || []
  },

  /**
   * Marcar cuota como aplicada
   */
  async marcarCuotaAplicada(cuotaId: string): Promise<void> {
    const { error } = await db
      .from('cobros_cuotas_fraccionadas')
      .update({
        aplicado: true,
        fecha_aplicacion: new Date().toISOString()
      })
      .eq('id', cuotaId)

    if (error) throw new Error(`Error marcando cuota como aplicada: ${error.message}`)
  },

  /**
   * Obtener estadísticas de control de cobros
   */
  async obtenerControlStats(): Promise<ControlCobrosStats> {
    try {
      // Total de cobros
      const { count: totalCobros } = await db
        .from('cobros_incidencias')
        .select('*', { count: 'exact' })

      // Total monto
      const { data: montoData } = await db
        .from('cobros_incidencias')
        .select('monto_total')

      const totalMonto = (montoData || []).reduce((sum: number, c: any) => sum + (c.monto_total || 0), 0)

      // Cobros fraccionados
      const { count: cobrosFraccionados } = await db
        .from('cobros_incidencias')
        .select('*', { count: 'exact' })
        .eq('fraccionado', true)

      // Cobros aplicados completo
      const { count: cobrosAplicados } = await db
        .from('cobros_incidencias')
        .select('*', { count: 'exact' })
        .eq('estado', 'aplicado_completo')

      // Próximas cuotas (próximo período)
      const { data: proximas } = await db
        .from('cobros_cuotas_fraccionadas')
        .select('monto_cuota')
        .eq('aplicado', false)
        .order('created_at', { ascending: true })
        .limit(10)

      const montoProximo = (proximas || []).reduce((sum: number, c: any) => sum + (c.monto_cuota || 0), 0)

      return {
        total_cobros: totalCobros || 0,
        total_monto: totalMonto,
        cobros_fraccionados: cobrosFraccionados || 0,
        cobros_aplicados_completo: cobrosAplicados || 0,
        proximas_cuotas: proximas?.length || 0,
        monto_proximo: montoProximo
      }
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error)
      return {
        total_cobros: 0,
        total_monto: 0,
        cobros_fraccionados: 0,
        cobros_aplicados_completo: 0,
        proximas_cuotas: 0,
        monto_proximo: 0
      }
    }
  },

  /**
   * Obtener cobro con todas sus cuotas
   */
  async obtenerCobroCompleto(cobroId: string): Promise<CobroIncidenciaConRelaciones | null> {
    const { data, error } = await db
      .from('cobros_incidencias')
      .select(`
        *,
        incidencia:incidencias(*),
        conductor:conductores(id, nombres, apellidos),
        cuotas:cobros_cuotas_fraccionadas(*)
      `)
      .eq('id', cobroId)
      .single()

    if (error) {
      console.error('Error obteniendo cobro:', error)
      return null
    }
    
    // Mapear conductor para incluir nombre_completo
    if (data?.conductor) {
      data.conductor.nombre_completo = `${data.conductor.nombres} ${data.conductor.apellidos}`
    }
    
    return data
  },

  /**
   * Actualizar estado de cobro
   */
  async actualizarEstadoCobro(
    cobroId: string,
    nuevoEstado: 'por_aplicar' | 'fraccionado' | 'aplicado_completo'
  ): Promise<void> {
    const { error } = await db
      .from('cobros_incidencias')
      .update({
        estado: nuevoEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', cobroId)

    if (error) throw new Error(`Error actualizando cobro: ${error.message}`)
  }
}
