/**
 * Servicio para consultas de datos de Excesos de Velocidad (USS/Wialon)
 *
 * Estrategia:
 * - Consulta datos desde la tabla uss_excesos_velocidad
 * - El backfill se encarga de sincronizar datos históricos
 * - No llama a la API de Wialon directamente desde el frontend
 */

import { supabase } from '../lib/supabase'
import { normalizePatente } from '../utils/normalizeDocuments'
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
      sedeId?: string | null
      sortField?: string
      sortDirection?: 'asc' | 'desc'
      velocidadMin?: number
      velocidadMax?: number
    }
  ): Promise<{ data: ExcesoVelocidad[]; count: number }> {
    const cacheKey = `excesos_${startDate}_${endDate}_${options?.sedeId || 'all'}_${JSON.stringify(options)}`
    const cached = excesosCache.get(cacheKey)

    if (cached) {
      return { data: cached, count: cached.length }
    }

    // Determinar campo y dirección de ordenamiento
    const orderField = options?.sortField || 'fecha_evento'
    const orderAsc = options?.sortDirection === 'asc'

    // Usar offset -03:00 (Argentina) para que medianoche local sea correcta en UTC
    // startDate 00:00 Argentina = startDate 03:00 UTC
    // endDate 23:59:59 Argentina = endDate+1 02:59:59 UTC
    // Builder de query reutilizable para uss_excesos_velocidad y geotab_excesos_velocidad
    const buildQuery = (tabla: 'uss_excesos_velocidad' | 'geotab_excesos_velocidad') => {
      let q = supabase
        .from(tabla)
        .select('*', { count: 'exact' })
        .gte('fecha_evento', `${startDate}T00:00:00-03:00`)
        .lte('fecha_evento', `${endDate}T23:59:59-03:00`)
        .order(orderField, { ascending: orderAsc })

      if (options?.sedeId) q = q.eq('sede_id', options.sedeId)
      if (options?.patente) q = q.ilike('patente', `%${options.patente}%`)
      if (options?.conductor) q = q.ilike('conductor_wialon', `%${options.conductor}%`)
      if (options?.minExceso) q = q.gte('exceso', options.minExceso)
      if (options?.velocidadMin) q = q.gte('velocidad_maxima', options.velocidadMin)
      if (options?.velocidadMax) q = q.lte('velocidad_maxima', options.velocidadMax)

      if (options?.limit) {
        q = q.limit(options.limit)
      } else {
        q = q.range(0, 9999)
      }
      if (options?.offset) {
        q = q.range(options.offset, options.offset + (options.limit || 25) - 1)
      }
      return q
    }

    // Ejecutar ambas queries en paralelo: USS + GEOTAB
    const [ussRes, geotabRes] = await Promise.all([
      buildQuery('uss_excesos_velocidad'),
      buildQuery('geotab_excesos_velocidad'),
    ])

    if (ussRes.error) {
      throw new Error(`Error obteniendo excesos (USS): ${ussRes.error.message}`)
    }
    // geotab_excesos_velocidad puede fallar si la tabla aún no está propagada en algún ambiente; no romper la pantalla
    if (geotabRes.error) {
      console.warn('[ussService] geotab_excesos_velocidad query falló:', geotabRes.error.message)
    }

    const ussData = (ussRes.data || []).map((r: any) => ({ ...r, gps_origen: 'USS' as const }))
    const geotabData = (geotabRes.data || []).map((r: any) => ({ ...r, gps_origen: 'GEOTAB' as const }))
    const data = [...ussData, ...geotabData]

    // Re-ordenar combinado en cliente
    data.sort((a: any, b: any) => {
      const va = a[orderField]
      const vb = b[orderField]
      if (va === vb) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return orderAsc ? (va < vb ? -1 : 1) : (va < vb ? 1 : -1)
    })

    excesosCache.set(cacheKey, data)
    return { data, count: data.length }
  },

  /**
   * Obtiene estadísticas agregadas para un rango de fechas
   */
  async getStats(startDate: string, endDate: string, sedeId?: string | null): Promise<ExcesoStats> {
    const cacheKey = `stats_${startDate}_${endDate}_${sedeId || 'all'}`
    const cached = statsCache.get(cacheKey)

    if (cached) {
      return cached
    }

    // Calcular siempre manualmente (combinado USS + GEOTAB).
    // El RPC solo lee uss_excesos_velocidad, por eso no se usa.
    return this.calculateStatsManually(startDate, endDate, sedeId)
  },

  /**
   * Calcula stats manualmente si no hay RPC
   */
  async calculateStatsManually(startDate: string, endDate: string, sedeId?: string | null): Promise<ExcesoStats> {
    const buildStatsQuery = (tabla: 'uss_excesos_velocidad' | 'geotab_excesos_velocidad') => {
      let q = supabase
        .from(tabla)
        .select('velocidad_maxima, exceso, duracion_segundos, patente, conductor_wialon')
        .gte('fecha_evento', `${startDate}T00:00:00-03:00`)
        .lte('fecha_evento', `${endDate}T23:59:59-03:00`)
        .limit(5000)
      if (sedeId) q = q.eq('sede_id', sedeId)
      return q
    }

    const [ussRes, geotabRes] = await Promise.all([
      buildStatsQuery('uss_excesos_velocidad'),
      buildStatsQuery('geotab_excesos_velocidad'),
    ])

    if (geotabRes.error) {
      console.warn('[ussService] geotab_excesos_velocidad stats falló:', geotabRes.error.message)
    }

    type StatsRow = Pick<USSExcesoRow, 'velocidad_maxima' | 'exceso' | 'duracion_segundos' | 'patente' | 'conductor_wialon'>
    const data: StatsRow[] = [
      ...((ussRes.data || []) as StatsRow[]),
      ...((geotabRes.data || []) as StatsRow[]),
    ]

    if (ussRes.error && geotabRes.error) {
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
    limit: number = 10,
    sedeId?: string | null
  ): Promise<VehiculoRanking[]> {
    const buildVehQuery = (tabla: 'uss_excesos_velocidad' | 'geotab_excesos_velocidad') => {
      let q = supabase
        .from(tabla)
        .select('patente, vehiculo_id, velocidad_maxima, exceso, duracion_segundos')
        .gte('fecha_evento', `${startDate}T00:00:00-03:00`)
        .lte('fecha_evento', `${endDate}T23:59:59-03:00`)
        .limit(1000)
      if (sedeId) q = q.eq('sede_id', sedeId)
      return q
    }
    const [ussRes, geotabRes] = await Promise.all([
      buildVehQuery('uss_excesos_velocidad'),
      buildVehQuery('geotab_excesos_velocidad'),
    ])
    if (geotabRes.error) {
      console.warn('[ussService] geotab vehiculos ranking falló:', geotabRes.error.message)
    }
    type VehRow = Pick<USSExcesoRow, 'patente' | 'vehiculo_id' | 'velocidad_maxima' | 'exceso' | 'duracion_segundos'>
    const data: VehRow[] = [
      ...((ussRes.data || []) as VehRow[]),
      ...((geotabRes.data || []) as VehRow[]),
    ]

    if (ussRes.error && geotabRes.error) {
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
      const patenteKey = normalizePatente(row.patente)
      const existing = vehiculosMap.get(patenteKey) || {
        patente: row.patente,
        vehiculo_id: row.vehiculo_id,
        excesos: [],
        velocidades: [],
        duraciones: [],
      }
      existing.excesos.push(row.exceso || 0)
      existing.velocidades.push(row.velocidad_maxima || 0)
      existing.duraciones.push(row.duracion_segundos || 0)
      vehiculosMap.set(patenteKey, existing)
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
    limit: number = 10,
    sedeId?: string | null
  ): Promise<ConductorRanking[]> {
    const buildCondQuery = (tabla: 'uss_excesos_velocidad' | 'geotab_excesos_velocidad') => {
      let q = supabase
        .from(tabla)
        .select('conductor_wialon, conductor_id, velocidad_maxima, patente')
        .gte('fecha_evento', `${startDate}T00:00:00-03:00`)
        .lte('fecha_evento', `${endDate}T23:59:59-03:00`)
        .limit(1000)
      if (sedeId) q = q.eq('sede_id', sedeId)
      return q
    }
    const [ussRes, geotabRes] = await Promise.all([
      buildCondQuery('uss_excesos_velocidad'),
      buildCondQuery('geotab_excesos_velocidad'),
    ])
    if (geotabRes.error) {
      console.warn('[ussService] geotab conductores ranking falló:', geotabRes.error.message)
    }
    type CondRow = Pick<USSExcesoRow, 'conductor_wialon' | 'conductor_id' | 'velocidad_maxima' | 'patente'>
    const data: CondRow[] = [
      ...((ussRes.data || []) as CondRow[]),
      ...((geotabRes.data || []) as CondRow[]),
    ]

    if (ussRes.error && geotabRes.error) {
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

    const [ussCountRes, geotabCountRes] = await Promise.all([
      supabase.from('uss_excesos_velocidad').select('*', { count: 'exact', head: true }),
      supabase.from('geotab_excesos_velocidad').select('*', { count: 'exact', head: true }),
    ])

    const totalRecords = (ussCountRes.count || 0) + (geotabCountRes.count || 0)

    return {
      lastSync: syncLog?.completed_at || null,
      totalRecords,
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
