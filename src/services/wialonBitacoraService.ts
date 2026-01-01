/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla wialon_bitacora (sincronizada desde Wialon)
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

// Tipo para registro de bitácora
export interface BitacoraRegistroTransformado {
  id: string
  patente: string
  patente_normalizada: string
  conductor_wialon: string | null
  conductor_id: string | null
  ibutton: string | null
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  duracion_minutos: number | null
  kilometraje: number
  observaciones: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
}

// Tipo para fila de wialon_bitacora
interface WialonBitacoraRow {
  id: string
  patente: string
  patente_normalizada: string
  conductor_wialon: string | null
  conductor_id: string | null
  ibutton: string | null
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  duracion_minutos: number | null
  kilometraje: number
  observaciones: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
  created_at: string
}

// Tipo para stats query (campos seleccionados)
interface WialonBitacoraStatsRow {
  patente_normalizada: string
  conductor_wialon: string | null
  kilometraje: number
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
}

// Tipo para sync log
interface SyncLogRow {
  completed_at: string | null
  status: string
}

// =====================================================
// CACHÉ EN MEMORIA
// =====================================================

class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>()
  private TTL: number
  private maxSize: number

  constructor(ttlMinutes: number = 2, maxSize: number = 50) {
    this.TTL = ttlMinutes * 60 * 1000
    this.maxSize = maxSize
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
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }
    this.cache.set(key, {
      data,
      expires: Date.now() + this.TTL,
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const bitacoraCache = new SimpleCache<BitacoraRegistroTransformado[]>(2) // Cache de 2 min para datos en tiempo real
const statsCache = new SimpleCache<BitacoraStats>(2)

// Helper para formatear hora (HH:MM)
function formatearHora(hora: string | null): string | null {
  if (!hora) return null
  // Si ya es HH:MM, devolverlo
  if (/^\d{2}:\d{2}$/.test(hora)) return hora
  // Si es HH:MM:SS, extraer HH:MM
  const match = hora.match(/(\d{2}:\d{2})/)
  return match ? match[1] : null
}

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const wialonBitacoraService = {
  /**
   * Obtiene registros de bitácora desde wialon_bitacora
   * La tabla ya contiene los turnos procesados y agrupados
   */
  async getBitacora(
    startDate: string,
    endDate: string,
    options?: BitacoraQueryOptions
  ): Promise<{ data: BitacoraRegistroTransformado[]; count: number }> {
    const cacheKey = `bitacora_${startDate}_${endDate}_${JSON.stringify(options)}`
    const cached = bitacoraCache.get(cacheKey)

    if (cached) {
      return { data: cached, count: cached.length }
    }

    // Query a wialon_bitacora (tabla con turnos ya procesados)
    let query = supabase
      .from('wialon_bitacora')
      .select('*', { count: 'exact' })
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)
      .order('fecha_turno', { ascending: false })
      .order('hora_inicio', { ascending: false })

    // Aplicar filtros en la query
    if (options?.patente) {
      query = query.ilike('patente', `%${options.patente}%`)
    }

    if (options?.conductor) {
      query = query.ilike('conductor_wialon', `%${options.conductor}%`)
    }

    if (options?.estado) {
      query = query.eq('estado', options.estado)
    }

    // Aplicar paginación
    if (options?.offset !== undefined && options?.limit !== undefined) {
      query = query.range(options.offset, options.offset + options.limit - 1)
    } else if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    // Transformar a registros
    const registros: BitacoraRegistroTransformado[] = ((data || []) as WialonBitacoraRow[]).map((row) => ({
      id: row.id,
      patente: row.patente,
      patente_normalizada: row.patente_normalizada,
      conductor_wialon: row.conductor_wialon,
      conductor_id: row.conductor_id,
      ibutton: row.ibutton,
      fecha_turno: row.fecha_turno,
      hora_inicio: formatearHora(row.hora_inicio),
      hora_cierre: formatearHora(row.hora_cierre),
      duracion_minutos: row.duracion_minutos,
      kilometraje: Number(row.kilometraje) || 0,
      observaciones: row.observaciones,
      estado: row.estado,
      gnc_cargado: row.gnc_cargado,
      lavado_realizado: row.lavado_realizado,
      nafta_cargada: row.nafta_cargada,
    }))

    bitacoraCache.set(cacheKey, registros)
    return { data: registros, count: count || registros.length }
  },

  /**
   * Obtiene estadísticas agregadas desde wialon_bitacora
   */
  async getStats(startDate: string, endDate: string): Promise<BitacoraStats> {
    const cacheKey = `stats_${startDate}_${endDate}`
    const cached = statsCache.get(cacheKey)

    if (cached) return cached

    // Query directa para stats (sin paginación)
    const { data: rawData, error } = await supabase
      .from('wialon_bitacora')
      .select('patente_normalizada, conductor_wialon, kilometraje, estado, gnc_cargado, lavado_realizado, nafta_cargada')
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)

    // Cast a tipo conocido
    const data = (rawData || []) as WialonBitacoraStatsRow[]

    if (error || data.length === 0) {
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

    // Single pass O(n)
    const vehiculos = new Set<string>()
    const conductores = new Set<string>()
    let kmTotal = 0
    let turnosFinalizados = 0
    let turnosPocaKm = 0
    let turnosEnCurso = 0
    let conGnc = 0
    let conLavado = 0
    let conNafta = 0

    for (const r of data) {
      vehiculos.add(r.patente_normalizada)
      if (r.conductor_wialon) conductores.add(r.conductor_wialon)

      kmTotal += Number(r.kilometraje) || 0

      switch (r.estado) {
        case 'Turno Finalizado':
          turnosFinalizados++
          break
        case 'Poco Km':
          turnosPocaKm++
          break
        case 'En Curso':
          turnosEnCurso++
          break
      }

      if (r.gnc_cargado) conGnc++
      if (r.lavado_realizado) conLavado++
      if (r.nafta_cargada) conNafta++
    }

    const stats: BitacoraStats = {
      totalTurnos: data.length,
      vehiculosUnicos: vehiculos.size,
      conductoresUnicos: conductores.size,
      kilometrajeTotal: Math.round(kmTotal * 100) / 100,
      kilometrajePromedio: Math.round((kmTotal / data.length) * 100) / 100,
      turnosFinalizados,
      turnosPocaKm,
      turnosEnCurso,
      conGnc,
      conLavado,
      conNafta,
    }

    statsCache.set(cacheKey, stats)
    return stats
  },

  /**
   * Actualiza checklist en wialon_bitacora
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
      // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Error actualizando checklist: ${error.message}`)
    }

    this.clearCache()
  },

  /**
   * Actualiza estado en wialon_bitacora
   */
  async updateEstado(id: string, estado: string): Promise<void> {
    const { error } = await supabase
      .from('wialon_bitacora')
      // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
      .update({
        estado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Error actualizando estado: ${error.message}`)
    }

    this.clearCache()
  },

  /**
   * Estado de sincronización desde wialon_bitacora
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null
    totalRecords: number
    status: string
  }> {
    // Obtener último registro de sync
    const { data: syncLogRaw } = await supabase
      .from('wialon_bitacora_sync_log')
      .select('completed_at, status')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Cast a tipo conocido
    const syncLog = syncLogRaw as SyncLogRow | null

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
   * Trigger sync - Solo limpia cache (wialon_bitacora se sincroniza por Edge Function)
   */
  async triggerSync(_startDate?: string, _endDate?: string): Promise<{ success: boolean; error?: string; turnos?: number }> {
    this.clearCache()
    // wialon_bitacora se sincroniza por Edge Function (cron job)
    return { success: true }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
