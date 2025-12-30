// src/services/cabifyIntegrationService.ts
import { supabase } from '../lib/supabase'
import { cabifyService } from './cabifyService'
import type { CabifyDriverEnriched, CabifyPeriod, CabifyMetrics } from '../types/cabify.types'

/**
 * Tipo para los resultados de las funciones RPC de rankings
 */
interface RankingRow {
  dni: string
  nombre: string
  apellido: string
  vehiculo_patente: string
  viajes_finalizados: number
  ganancia_total: number
  score: number
  ganancia_por_hora: number
  horas_conectadas: number
  horario: string | null
  fecha_guardado: string
}

const ALQUILER_A_CARGO = Number(import.meta.env.VITE_ALQUILER_A_CARGO) || 360000
const ALQUILER_TURNO = Number(import.meta.env.VITE_ALQUILER_TURNO) || 245000

/**
 * Servicio para integrar datos de Cabify con la base de datos de Supabase
 */
class CabifyIntegrationService {
  /**
   * Obtener datos de Cabify enriquecidos con información de la BD
   */
  async getEnrichedDriversData(period: CabifyPeriod = 'semana'): Promise<CabifyDriverEnriched[]> {
    try {
      // 1. Obtener datos de Cabify
      const cabifyDrivers = await cabifyService.getDriversData(period)

      // 2. Obtener asignaciones activas con conductores y vehículos
      const { data: asignacionesData, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          modalidad,
          estado,
          fecha_inicio,
          conductor_id,
          vehiculo_id,
          conductores (
            id,
            numero_dni,
            numero_licencia,
            nombres,
            apellidos,
            email,
            telefono_contacto
          ),
          vehiculos (
            id,
            patente,
            marca,
            modelo
          )
        `)
        .eq('estado', 'activa')

      if (error) {
        console.error('❌ Error cargando asignaciones:', error)
        throw error
      }

      const asignaciones = asignacionesData as any[]

      // 3. Crear un mapa de DNI -> Asignación para búsqueda rápida
      const asignacionesPorDNI = new Map<string, any>()

      if (asignaciones) {
        for (const asignacion of asignaciones) {
          if (asignacion.conductores && asignacion.conductores.numero_dni) {
            asignacionesPorDNI.set(
              asignacion.conductores.numero_dni.trim().toLowerCase(),
              asignacion
            )
          }
        }
      }

      // 4. Enriquecer datos de Cabify con información de BD
      const enrichedDrivers: CabifyDriverEnriched[] = []

      for (const cabifyDriver of cabifyDrivers) {
        const dni = cabifyDriver.dni.trim().toLowerCase()
        const asignacion = asignacionesPorDNI.get(dni)

        // Calcular monto de alquiler según modalidad
        let montoAlquiler = 0
        let modalidad: 'Turno' | 'A cargo' | 'Sin asignación' = 'Sin asignación'

        if (asignacion) {
          modalidad = asignacion.modalidad === 'Turno' ? 'Turno' : 'A cargo'
          montoAlquiler = modalidad === 'Turno' ? ALQUILER_TURNO : ALQUILER_A_CARGO
        }

        // Calcular saldo faltante (solo cobro por app cuenta para el alquiler)
        const saldoFaltante = Math.max(0, montoAlquiler - cabifyDriver.cobroApp)
        const cubreAlquiler = cabifyDriver.cobroApp >= montoAlquiler

        enrichedDrivers.push({
          ...cabifyDriver,
          // Datos del conductor desde BD
          conductor_id: asignacion?.conductores?.id,
          numero_licencia: asignacion?.conductores?.numero_licencia,
          telefono_contacto: asignacion?.conductores?.telefono_contacto,

          // Datos del vehículo desde BD
          vehiculo_id: asignacion?.vehiculos?.id,
          vehiculo: asignacion ? `${asignacion.vehiculos?.marca || ''} ${asignacion.vehiculos?.modelo || ''}`.trim() : undefined,
          marca: asignacion?.vehiculos?.marca,
          modelo: asignacion?.vehiculos?.modelo,
          patente: asignacion?.vehiculos?.patente || cabifyDriver.patente,

          // Datos de asignación
          modalidad,
          estado_asignacion: asignacion?.estado,
          fecha_inicio_asignacion: asignacion?.fecha_inicio,

          // Cálculos de alquiler
          montoAlquiler,
          saldoFaltante,
          cubreAlquiler
        })
      }

      return enrichedDrivers

    } catch (error) {
      console.error('❌ Error en integración:', error)
      throw new Error(`Error integrando datos de Cabify: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  /**
   * Calcular métricas agregadas del dashboard
   */
  calculateMetrics(drivers: CabifyDriverEnriched[]): CabifyMetrics {
    const totalEarnings = drivers.reduce((sum, d) => sum + d.gananciaTotal, 0)
    const totalDrivers = drivers.length
    const totalTrips = drivers.reduce((sum, d) => sum + d.viajesFinalizados, 0)
    const totalHours = drivers.reduce((sum, d) => sum + d.horasConectadas, 0)

    // Filtrar conductores con asignación para calcular cumplimiento
    const driversWithAssignment = drivers.filter(d => d.modalidad !== 'Sin asignación')
    const driversCompliant = driversWithAssignment.filter(d => d.cubreAlquiler).length
    const driversNonCompliant = driversWithAssignment.filter(d => !d.cubreAlquiler).length

    const total = driversWithAssignment.length
    const percentageCompliant = total > 0 ? (driversCompliant / total) * 100 : 0
    const percentageNonCompliant = total > 0 ? (driversNonCompliant / total) * 100 : 0

    return {
      totalEarnings,
      totalDrivers,
      totalTrips,
      totalHours,
      driversCompliant,
      driversNonCompliant,
      percentageCompliant: Number(percentageCompliant.toFixed(1)),
      percentageNonCompliant: Number(percentageNonCompliant.toFixed(1))
    }
  }

  /**
   * Filtrar conductores que NO cubren el alquiler
   */
  getNonCompliantDrivers(drivers: CabifyDriverEnriched[]): CabifyDriverEnriched[] {
    return drivers.filter(d =>
      d.modalidad !== 'Sin asignación' && !d.cubreAlquiler
    ).sort((a, b) => b.saldoFaltante - a.saldoFaltante) // Ordenar por mayor saldo faltante
  }

  /**
   * Obtener top conductores por ganancias
   */
  getTopDrivers(drivers: CabifyDriverEnriched[], limit: number = 10): CabifyDriverEnriched[] {
    return [...drivers]
      .filter(d => d.modalidad !== 'Sin asignación') // Excluir sin asignación
      .sort((a, b) => b.gananciaTotal - a.gananciaTotal)
      .slice(0, limit)
  }

  /**
   * Obtener conductores con menor rendimiento
   */
  getBottomDrivers(drivers: CabifyDriverEnriched[], limit: number = 10): CabifyDriverEnriched[] {
    return [...drivers]
      .filter(d => d.modalidad !== 'Sin asignación') // Excluir sin asignación
      .sort((a, b) => a.gananciaTotal - b.gananciaTotal)
      .slice(0, limit)
  }

  /**
   * Obtener conductores sin asignación o dados de baja
   */
  getDriversWithoutAssignment(drivers: CabifyDriverEnriched[]): CabifyDriverEnriched[] {
    return drivers.filter(d => d.modalidad === 'Sin asignación')
  }

  /**
   * Obtener Top 10 Mejores desde histórico con filtro de período
   */
  async getTopMejoresFromHistorico(
    fechaInicio?: string,
    fechaFin?: string
  ): Promise<CabifyRankingDriver[]> {
    // Si no se especifica período, usar la semana actual
    const { startDate, endDate } = this.getDefaultPeriod(fechaInicio, fechaFin)

    // @ts-expect-error - RPC function not in generated types
    const { data, error } = await supabase.rpc('get_cabify_top_mejores', {
      p_fecha_inicio: startDate,
      p_fecha_fin: endDate
    }) as { data: RankingRow[] | null; error: Error | null }

    if (error) {
      console.error('❌ Error obteniendo top mejores:', error)
      // Fallback a la vista si la función falla
      return this.getTopMejoresFallback()
    }

    return (data || []).map((row: RankingRow) => this.mapRankingDriver(row))
  }

  /**
   * Obtener Top 10 Peores desde histórico con filtro de período
   */
  async getTopPeoresFromHistorico(
    fechaInicio?: string,
    fechaFin?: string
  ): Promise<CabifyRankingDriver[]> {
    // Si no se especifica período, usar la semana actual
    const { startDate, endDate } = this.getDefaultPeriod(fechaInicio, fechaFin)

    // @ts-expect-error - RPC function not in generated types
    const { data, error } = await supabase.rpc('get_cabify_top_peores', {
      p_fecha_inicio: startDate,
      p_fecha_fin: endDate
    }) as { data: RankingRow[] | null; error: Error | null }

    if (error) {
      console.error('❌ Error obteniendo top peores:', error)
      // Fallback a la vista si la función falla
      return this.getTopPeoresFallback()
    }

    return (data || []).map((row: RankingRow) => this.mapRankingDriver(row))
  }

  /**
   * Calcular período por defecto (semana actual)
   */
  private getDefaultPeriod(fechaInicio?: string, fechaFin?: string): { startDate: string; endDate: string } {
    if (fechaInicio) {
      return {
        startDate: fechaInicio,
        endDate: fechaFin || new Date().toISOString()
      }
    }

    // Por defecto: inicio de la semana actual hasta ahora
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    const monday = new Date(now)
    monday.setDate(now.getDate() - daysFromMonday)
    monday.setHours(0, 0, 0, 0)

    return {
      startDate: monday.toISOString(),
      endDate: now.toISOString()
    }
  }

  /**
   * Fallback: obtener top mejores desde vista (sin filtro)
   */
  private async getTopMejoresFallback(): Promise<CabifyRankingDriver[]> {
    const { data, error } = await supabase
      .from('cabify_top_mejores')
      .select('*')

    if (error) {
      console.error('❌ Error en fallback top mejores:', error)
      return []
    }

    return (data || []).map(row => this.mapRankingDriver(row))
  }

  /**
   * Fallback: obtener top peores desde vista (sin filtro)
   */
  private async getTopPeoresFallback(): Promise<CabifyRankingDriver[]> {
    const { data, error } = await supabase
      .from('cabify_top_peores')
      .select('*')

    if (error) {
      console.error('❌ Error en fallback top peores:', error)
      return []
    }

    return (data || []).map(row => this.mapRankingDriver(row))
  }

  /**
   * Mapear datos de ranking a estructura común
   */
  private mapRankingDriver(row: any): CabifyRankingDriver {
    return {
      dni: row.dni,
      nombre: row.nombre,
      apellido: row.apellido,
      nombreCompleto: `${row.nombre} ${row.apellido}`.trim(),
      vehiculoPatente: row.vehiculo_patente,
      viajesFinalizados: row.viajes_finalizados || 0,
      gananciaTotal: parseFloat(row.ganancia_total) || 0,
      score: parseFloat(row.score) || 0,
      gananciaPorHora: parseFloat(row.ganancia_por_hora) || 0,
      horasConectadas: parseFloat(row.horas_conectadas) || 0,
      horario: row.horario,
      fechaActualizacion: row.fecha_guardado
    }
  }
}

/**
 * Tipo para conductores en ranking
 */
export interface CabifyRankingDriver {
  dni: string
  nombre: string
  apellido: string
  nombreCompleto: string
  vehiculoPatente: string
  viajesFinalizados: number
  gananciaTotal: number
  score: number
  gananciaPorHora: number
  horasConectadas: number
  horario: 'CARGO' | 'Diurno' | 'Nocturno' | null
  fechaActualizacion: string
}

// Exportar instancia singleton
export const cabifyIntegrationService = new CabifyIntegrationService()
