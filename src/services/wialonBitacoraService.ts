/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla wialon_bitacora (sincronizada desde Wialon)
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

// Tipo para registro transformado (turno = todos los viajes de un vehículo en un día)
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

// Threshold para "Poco Km"
const POCO_KM_THRESHOLD = 100

// Tipo para fila de wialon_bitacora
interface WialonBitacoraRow {
  id: string
  patente: string
  patente_normalizada: string
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  duracion_minutos: number | null
  kilometraje: string
  ibutton: string | null
  conductor_wialon: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
  synced_at: string | null
  updated_at: string | null
}

// =====================================================
// CACHÉ EN MEMORIA
// =====================================================

class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>()
  private TTL: number
  private maxSize: number

  constructor(ttlMinutes: number = 5, maxSize: number = 50) {
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

const bitacoraCache = new SimpleCache<BitacoraRegistroTransformado[]>(5)
const statsCache = new SimpleCache<BitacoraStats>(5)

// Helper para calcular estado
function calcularEstado(horaFinal: string | null, km: number): string {
  if (!horaFinal) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}


// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const wialonBitacoraService = {
  /**
   * Obtiene registros de bitácora desde wialon_bitacora (ya pre-agregados por turno)
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

    // Query a wialon_bitacora (datos ya pre-agregados por turno)
    let query = supabase
      .from('wialon_bitacora')
      .select('*', { count: 'exact' })
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)
      .order('fecha_turno', { ascending: false })
      .order('hora_inicio', { ascending: false })

    // Aplicar filtros en la query
    if (options?.patente) {
      query = query.ilike('patente_normalizada', `%${options.patente.replace(/\s/g, '').toUpperCase()}%`)
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

    // Transformar datos de la tabla a formato esperado
    const registros: BitacoraRegistroTransformado[] = ((data || []) as WialonBitacoraRow[]).map((row) => {
      const km = parseFloat(row.kilometraje || '0') || 0
      return {
        id: row.id,
        patente: row.patente,
        patente_normalizada: row.patente_normalizada,
        conductor_wialon: row.conductor_wialon,
        conductor_id: null,
        ibutton: row.ibutton,
        fecha_turno: row.fecha_turno,
        hora_inicio: row.hora_inicio,
        hora_cierre: row.hora_cierre,
        duracion_minutos: row.duracion_minutos,
        kilometraje: Math.round(km * 100) / 100,
        observaciones: null,
        estado: row.estado || calcularEstado(row.hora_cierre, km),
        gnc_cargado: row.gnc_cargado || false,
        lavado_realizado: row.lavado_realizado || false,
        nafta_cargada: row.nafta_cargada || false,
      }
    })

    bitacoraCache.set(cacheKey, registros)
    return { data: registros, count: count || registros.length }
  },

  /**
   * Obtiene estadísticas agregadas
   */
  async getStats(startDate: string, endDate: string): Promise<BitacoraStats> {
    const cacheKey = `stats_${startDate}_${endDate}`
    const cached = statsCache.get(cacheKey)

    if (cached) return cached

    const { data: registros } = await this.getBitacora(startDate, endDate, {})

    if (!registros || registros.length === 0) {
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

    for (const r of registros) {
      vehiculos.add(r.patente_normalizada)
      if (r.conductor_wialon) conductores.add(r.conductor_wialon)

      kmTotal += r.kilometraje

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
    }

    const stats: BitacoraStats = {
      totalTurnos: registros.length,
      vehiculosUnicos: vehiculos.size,
      conductoresUnicos: conductores.size,
      kilometrajeTotal: Math.round(kmTotal * 100) / 100,
      kilometrajePromedio: Math.round((kmTotal / registros.length) * 100) / 100,
      turnosFinalizados,
      turnosPocaKm,
      turnosEnCurso,
      conGnc: 0,
      conLavado: 0,
      conNafta: 0,
    }

    statsCache.set(cacheKey, stats)
    return stats
  },

  /**
   * Actualiza checklist - No soportado con uss_historico
   */
  async updateChecklist(
    _id: string,
    _updates: {
      gnc_cargado?: boolean
      lavado_realizado?: boolean
      nafta_cargada?: boolean
    }
  ): Promise<void> {
    // uss_historico no tiene estas columnas
    console.warn('updateChecklist no soportado con uss_historico')
  },

  /**
   * Actualiza estado - No soportado con uss_historico
   */
  async updateEstado(_id: string, _estado: string): Promise<void> {
    console.warn('updateEstado no soportado con uss_historico')
  },

  /**
   * Estado de sincronización
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null
    totalRecords: number
    status: string
  }> {
    // Obtener último registro sincronizado
    const { data: lastRecord } = await supabase
      .from('wialon_bitacora')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single() as { data: { synced_at: string | null } | null }

    const { count } = await supabase
      .from('wialon_bitacora')
      .select('*', { count: 'exact', head: true })

    return {
      lastSync: lastRecord?.synced_at || null,
      totalRecords: count || 0,
      status: 'success',
    }
  },

  /**
   * Trigger sync - wialon_bitacora se sincroniza via Edge Function
   */
  async triggerSync(_startDate?: string, _endDate?: string): Promise<{ success: boolean; error?: string; turnos?: number }> {
    this.clearCache()
    return { success: true }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
