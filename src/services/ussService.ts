/**
 * Servicio para consultas de datos de Excesos de Velocidad (USS/Wialon)
 *
 * Estrategia:
 * - Consulta datos desde la tabla uss_excesos_velocidad
 * - El backfill se encarga de sincronizar datos históricos
 * - No llama a la API de Wialon directamente desde el frontend
 */

import { supabase } from '../lib/supabase'
import type {
  ExcesoVelocidad,
  ExcesoStats,
  VehiculoRanking,
  ConductorRanking,
} from '../modules/integraciones/uss/types/uss.types'

// Tipo para filas de la tabla uss_excesos_velocidad (Supabase no tiene tipos generados)
interface USSExcesoRow {
  id: string
  patente: string
  patente_normalizada: string
  vehiculo_id: string | null
  fecha_evento: string
  fecha_fin_evento: string | null
  localizacion: string
  latitud: number | null
  longitud: number | null
  velocidad_maxima: number
  limite_velocidad: number
  exceso: number
  duracion_segundos: number
  conductor_wialon: string | null
  conductor_id: string | null
  wialon_unit_id: number | null
  ibutton: string | null
  periodo_inicio: string
  periodo_fin: string
  created_at: string
}

interface USSStatsRPCResult {
  total_excesos: number
  vehiculos_unicos: number
  conductores_unicos: number
  velocidad_promedio: number
  velocidad_maxima: number
  exceso_promedio: number
  duracion_promedio: number
}

interface USSSyncLogRow {
  completed_at: string | null
  records_synced: number
  status: string
}

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

const excesosCache = new SimpleCache<ExcesoVelocidad[]>(5)
const statsCache = new SimpleCache<ExcesoStats>(5)

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const ussService = {
  /**
   * Obtiene excesos de velocidad para un rango de fechas
   */
  async getExcesos(
    startDate: string,
    endDate: string,
    options?: {
      limit?: number
      offset?: number
      patente?: string
      conductor?: string
      minExceso?: number
    }
  ): Promise<{ data: ExcesoVelocidad[]; count: number }> {
    const cacheKey = `excesos_${startDate}_${endDate}_${JSON.stringify(options)}`
    const cached = excesosCache.get(cacheKey)

    if (cached) {
      return { data: cached, count: cached.length }
    }

    let query = supabase
      .from('uss_excesos_velocidad')
      .select('*', { count: 'exact' })
      .gte('fecha_evento', `${startDate}T00:00:00`)
      .lte('fecha_evento', `${endDate}T23:59:59`)
      .order('fecha_evento', { ascending: false })

    if (options?.patente) {
      query = query.ilike('patente', `%${options.patente}%`)
    }

    if (options?.conductor) {
      query = query.ilike('conductor_wialon', `%${options.conductor}%`)
    }

    if (options?.minExceso) {
      query = query.gte('exceso', options.minExceso)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 25) - 1)
    }

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Error obteniendo excesos: ${error.message}`)
    }

    excesosCache.set(cacheKey, data || [])
    return { data: data || [], count: count || 0 }
  },

  /**
   * Obtiene estadísticas agregadas para un rango de fechas
   */
  async getStats(startDate: string, endDate: string): Promise<ExcesoStats> {
    const cacheKey = `stats_${startDate}_${endDate}`
    const cached = statsCache.get(cacheKey)

    if (cached) {
      return cached
    }

    const { data, error } = await (supabase.rpc as Function)('get_uss_excesos_stats', {
      p_start_date: startDate,
      p_end_date: endDate,
    }) as { data: USSStatsRPCResult | null; error: unknown }

    if (error) {
      // Si la función RPC no existe, calculamos manualmente
      console.warn('RPC no disponible, calculando stats manualmente')
      return this.calculateStatsManually(startDate, endDate)
    }

    const stats: ExcesoStats = {
      totalExcesos: data?.total_excesos || 0,
      vehiculosUnicos: data?.vehiculos_unicos || 0,
      conductoresUnicos: data?.conductores_unicos || 0,
      velocidadPromedio: data?.velocidad_promedio || 0,
      velocidadMaxima: data?.velocidad_maxima || 0,
      excesoPromedio: data?.exceso_promedio || 0,
      duracionPromedio: data?.duracion_promedio || 0,
    }

    statsCache.set(cacheKey, stats)
    return stats
  },

  /**
   * Calcula stats manualmente si no hay RPC
   */
  async calculateStatsManually(startDate: string, endDate: string): Promise<ExcesoStats> {
    const { data, error } = await supabase
      .from('uss_excesos_velocidad')
      .select('velocidad_maxima, exceso, duracion_segundos, patente, conductor_wialon')
      .gte('fecha_evento', `${startDate}T00:00:00`)
      .lte('fecha_evento', `${endDate}T23:59:59`) as { data: Pick<USSExcesoRow, 'velocidad_maxima' | 'exceso' | 'duracion_segundos' | 'patente' | 'conductor_wialon'>[] | null; error: unknown }

    if (error || !data) {
      return {
        totalExcesos: 0,
        vehiculosUnicos: 0,
        conductoresUnicos: 0,
        velocidadPromedio: 0,
        velocidadMaxima: 0,
        excesoPromedio: 0,
        duracionPromedio: 0,
      }
    }

    const vehiculos = new Set(data.map((d) => d.patente))
    const conductores = new Set(data.map((d) => d.conductor_wialon).filter(Boolean))

    const totalVelocidad = data.reduce((sum, d) => sum + (d.velocidad_maxima || 0), 0)
    const totalExceso = data.reduce((sum, d) => sum + (d.exceso || 0), 0)
    const totalDuracion = data.reduce((sum, d) => sum + (d.duracion_segundos || 0), 0)
    const maxVelocidad = Math.max(...data.map((d) => d.velocidad_maxima || 0))

    return {
      totalExcesos: data.length,
      vehiculosUnicos: vehiculos.size,
      conductoresUnicos: conductores.size,
      velocidadPromedio: data.length > 0 ? totalVelocidad / data.length : 0,
      velocidadMaxima: maxVelocidad,
      excesoPromedio: data.length > 0 ? totalExceso / data.length : 0,
      duracionPromedio: data.length > 0 ? totalDuracion / data.length : 0,
    }
  },

  /**
   * Obtiene ranking de vehículos con más excesos
   */
  async getVehiculosRanking(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<VehiculoRanking[]> {
    const { data, error } = await supabase
      .from('uss_excesos_velocidad')
      .select('patente, vehiculo_id, velocidad_maxima, exceso, duracion_segundos')
      .gte('fecha_evento', `${startDate}T00:00:00`)
      .lte('fecha_evento', `${endDate}T23:59:59`) as { data: Pick<USSExcesoRow, 'patente' | 'vehiculo_id' | 'velocidad_maxima' | 'exceso' | 'duracion_segundos'>[] | null; error: unknown }

    if (error || !data) {
      return []
    }

    // Agrupar por patente
    const vehiculosMap = new Map<string, {
      patente: string
      vehiculo_id: string | null
      excesos: number[]
      velocidades: number[]
      duraciones: number[]
    }>()

    for (const row of data) {
      const existing = vehiculosMap.get(row.patente) || {
        patente: row.patente,
        vehiculo_id: row.vehiculo_id,
        excesos: [],
        velocidades: [],
        duraciones: [],
      }
      existing.excesos.push(row.exceso || 0)
      existing.velocidades.push(row.velocidad_maxima || 0)
      existing.duraciones.push(row.duracion_segundos || 0)
      vehiculosMap.set(row.patente, existing)
    }

    // Convertir a ranking
    const ranking: VehiculoRanking[] = Array.from(vehiculosMap.values()).map((v) => ({
      patente: v.patente,
      vehiculo_id: v.vehiculo_id,
      totalExcesos: v.excesos.length,
      velocidadMaxima: Math.max(...v.velocidades),
      excesoPromedio: v.excesos.reduce((a, b) => a + b, 0) / v.excesos.length,
      duracionTotal: v.duraciones.reduce((a, b) => a + b, 0),
    }))

    // Ordenar por total de excesos y limitar
    return ranking
      .sort((a, b) => b.totalExcesos - a.totalExcesos)
      .slice(0, limit)
  },

  /**
   * Obtiene ranking de conductores con más excesos
   */
  async getConductoresRanking(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<ConductorRanking[]> {
    const { data, error } = await supabase
      .from('uss_excesos_velocidad')
      .select('conductor_wialon, conductor_id, velocidad_maxima, patente')
      .gte('fecha_evento', `${startDate}T00:00:00`)
      .lte('fecha_evento', `${endDate}T23:59:59`) as { data: Pick<USSExcesoRow, 'conductor_wialon' | 'conductor_id' | 'velocidad_maxima' | 'patente'>[] | null; error: unknown }

    if (error || !data) {
      return []
    }

    // Agrupar por conductor
    const conductoresMap = new Map<string, {
      conductor: string
      conductor_id: string | null
      velocidades: number[]
      patentes: Set<string>
    }>()

    for (const row of data) {
      const conductor = row.conductor_wialon || 'Sin conductor'
      const existing = conductoresMap.get(conductor) || {
        conductor,
        conductor_id: row.conductor_id,
        velocidades: [],
        patentes: new Set<string>(),
      }
      existing.velocidades.push(row.velocidad_maxima || 0)
      existing.patentes.add(row.patente)
      conductoresMap.set(conductor, existing)
    }

    // Convertir a ranking
    const ranking: ConductorRanking[] = Array.from(conductoresMap.values()).map((c) => ({
      conductor: c.conductor,
      conductor_id: c.conductor_id,
      totalExcesos: c.velocidades.length,
      velocidadMaxima: Math.max(...c.velocidades),
      vehiculosUnicos: c.patentes.size,
    }))

    // Ordenar por total de excesos y limitar
    return ranking
      .sort((a, b) => b.totalExcesos - a.totalExcesos)
      .slice(0, limit)
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
      .from('uss_sync_log')
      .select('completed_at, records_synced, status')
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as { data: USSSyncLogRow | null }

    const { count } = await supabase
      .from('uss_excesos_velocidad')
      .select('*', { count: 'exact', head: true })

    return {
      lastSync: syncLog?.completed_at || null,
      totalRecords: count || 0,
      status: syncLog?.status || 'unknown',
    }
  },

  /**
   * Limpia la caché
   */
  clearCache(): void {
    excesosCache.clear()
    statsCache.clear()
  },
}
