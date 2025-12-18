/**
 * Servicio para consultas de datos de Bitácora Wialon
 *
 * Estrategia:
 * - Consulta datos desde la tabla wialon_bitacora
 * - La Edge Function sync-wialon-bitacora sincroniza datos desde Wialon
 * - No llama a la API de Wialon directamente desde el frontend
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraRegistro,
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

// =====================================================
// CACHÉ EN MEMORIA
// =====================================================

class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>()
  private TTL: number

  constructor(ttlMinutes: number = 5) {
    this.TTL = ttlMinutes * 60 * 1000
  }

  get(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    if (Date.now() > cached.expires) {
      this.cache.delete(key)
      return null
    }
    return cached.data
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.TTL,
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const bitacoraCache = new SimpleCache<BitacoraRegistro[]>(5)
const statsCache = new SimpleCache<BitacoraStats>(5)

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const wialonBitacoraService = {
  /**
   * Obtiene registros de bitácora para un rango de fechas
   */
  async getBitacora(
    startDate: string,
    endDate: string,
    options?: BitacoraQueryOptions
  ): Promise<{ data: BitacoraRegistro[]; count: number }> {
    const cacheKey = `bitacora_${startDate}_${endDate}_${JSON.stringify(options)}`
    const cached = bitacoraCache.get(cacheKey)

    if (cached) {
      return { data: cached, count: cached.length }
    }

    let query = supabase
      .from('wialon_bitacora')
      .select('*', { count: 'exact' })
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)
      .order('fecha_turno', { ascending: false })
      .order('hora_inicio', { ascending: false })

    if (options?.patente) {
      query = query.ilike('patente', `%${options.patente}%`)
    }

    if (options?.conductor) {
      query = query.ilike('conductor_wialon', `%${options.conductor}%`)
    }

    if (options?.estado) {
      query = query.eq('estado', options.estado)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 25) - 1)
    }

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    const registros = (data || []) as BitacoraRegistro[]
    bitacoraCache.set(cacheKey, registros)
    return { data: registros, count: count || 0 }
  },

  /**
   * Obtiene estadísticas agregadas para un rango de fechas
   */
  async getStats(startDate: string, endDate: string): Promise<BitacoraStats> {
    const cacheKey = `stats_${startDate}_${endDate}`
    const cached = statsCache.get(cacheKey)

    if (cached) {
      return cached
    }

    try {
      const { data, error } = await supabase.rpc('get_wialon_bitacora_stats', {
        p_start_date: startDate,
        p_end_date: endDate,
      })

      if (error) throw error

      const stats: BitacoraStats = {
        totalTurnos: data?.total_turnos || 0,
        vehiculosUnicos: data?.vehiculos_unicos || 0,
        conductoresUnicos: data?.conductores_unicos || 0,
        kilometrajeTotal: data?.kilometraje_total || 0,
        kilometrajePromedio: data?.kilometraje_promedio || 0,
        turnosFinalizados: data?.turnos_finalizados || 0,
        turnosPocaKm: data?.turnos_poco_km || 0,
        turnosEnCurso: data?.turnos_en_curso || 0,
        conGnc: data?.con_gnc || 0,
        conLavado: data?.con_lavado || 0,
        conNafta: data?.con_nafta || 0,
      }

      statsCache.set(cacheKey, stats)
      return stats
    } catch {
      // Fallback: calcular manualmente
      return this.calculateStatsManually(startDate, endDate)
    }
  },

  /**
   * Calcula stats manualmente si no hay RPC
   */
  async calculateStatsManually(startDate: string, endDate: string): Promise<BitacoraStats> {
    const { data } = await supabase
      .from('wialon_bitacora')
      .select('patente_normalizada, conductor_wialon, kilometraje, estado, gnc_cargado, lavado_realizado, nafta_cargada')
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)

    if (!data || data.length === 0) {
      return {
        totalTurnos: 0,
        vehiculosUnicos: 0,
        conductoresUnicos: 0,
        kilometrajeTotal: 0,
        kilometrajePromedio: 0,
        turnosFinalizados: 0,
        turnosPocaKm: 0,
        turnosEnCurso: 0,
        conGnc: 0,
        conLavado: 0,
        conNafta: 0,
      }
    }

    const vehiculos = new Set(data.map((d) => d.patente_normalizada))
    const conductores = new Set(data.map((d) => d.conductor_wialon).filter(Boolean))
    const kmTotal = data.reduce((sum, d) => sum + (Number(d.kilometraje) || 0), 0)

    return {
      totalTurnos: data.length,
      vehiculosUnicos: vehiculos.size,
      conductoresUnicos: conductores.size,
      kilometrajeTotal: kmTotal,
      kilometrajePromedio: data.length > 0 ? kmTotal / data.length : 0,
      turnosFinalizados: data.filter((d) => d.estado === 'Turno Finalizado').length,
      turnosPocaKm: data.filter((d) => d.estado === 'Poco Km').length,
      turnosEnCurso: data.filter((d) => d.estado === 'En Curso').length,
      conGnc: data.filter((d) => d.gnc_cargado).length,
      conLavado: data.filter((d) => d.lavado_realizado).length,
      conNafta: data.filter((d) => d.nafta_cargada).length,
    }
  },

  /**
   * Actualiza el checklist de un registro (GNC, Lavado, Nafta)
   */
  async updateChecklist(
    id: string,
    updates: {
      gnc_cargado?: boolean
      lavado_realizado?: boolean
      nafta_cargada?: boolean
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('wialon_bitacora')
      .update(updates)
      .eq('id', id)

    if (error) {
      throw new Error(`Error actualizando checklist: ${error.message}`)
    }

    // Limpiar caché
    this.clearCache()
  },

  /**
   * Actualiza el estado de un registro
   */
  async updateEstado(id: string, estado: string): Promise<void> {
    const { error } = await supabase
      .from('wialon_bitacora')
      .update({ estado })
      .eq('id', id)

    if (error) {
      throw new Error(`Error actualizando estado: ${error.message}`)
    }

    this.clearCache()
  },

  /**
   * Actualiza observaciones de un registro
   */
  async updateObservaciones(id: string, observaciones: string): Promise<void> {
    const { error } = await supabase
      .from('wialon_bitacora')
      .update({ observaciones })
      .eq('id', id)

    if (error) {
      throw new Error(`Error actualizando observaciones: ${error.message}`)
    }

    this.clearCache()
  },

  /**
   * Obtiene el estado de la última sincronización
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null
    totalRecords: number
    status: string
  }> {
    const { data: syncLog } = await supabase
      .from('wialon_bitacora_sync_log')
      .select('completed_at, registros_procesados, status')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { count } = await supabase
      .from('wialon_bitacora')
      .select('*', { count: 'exact', head: true })

    return {
      lastSync: syncLog?.completed_at || null,
      totalRecords: count || 0,
      status: syncLog?.status || 'unknown',
    }
  },

  /**
   * Dispara sincronización manual
   */
  async triggerSync(fechaInicio?: string, fechaFin?: string): Promise<{
    success: boolean
    registros?: number
    error?: string
  }> {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-wialon-bitacora`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fecha_inicio: fechaInicio || new Date().toISOString().split('T')[0],
            fecha_fin: fechaFin || new Date().toISOString().split('T')[0],
          }),
        }
      )

      const result = await response.json()
      this.clearCache()
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },

  /**
   * Limpia la caché
   */
  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
