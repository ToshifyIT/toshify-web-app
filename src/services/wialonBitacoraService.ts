/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla wialon_bitacora con datos agrupados por turno (vehículo + día)
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

// Tipo para registro de wialon_bitacora
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

// Nombre de la tabla
const TABLE_NAME = 'wialon_bitacora'

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

const bitacoraCache = new SimpleCache<BitacoraRegistroTransformado[]>(5)
const statsCache = new SimpleCache<BitacoraStats>(5)

// Helper para calcular estado (usado solo si no viene de la BD)
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
   * Obtiene registros de bitácora desde wialon_bitacora (ya agrupados por turno)
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

    // Query directa a wialon_bitacora (ya tiene datos agrupados por turno)
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)
      .order('fecha_turno', { ascending: false })
      .order('hora_inicio', { ascending: false })

    // Aplicar filtros en la query si es posible
    if (options?.patente) {
      query = query.ilike('patente_normalizada', `%${options.patente.toUpperCase().replace(/\s/g, '')}%`)
    }

    if (options?.conductor) {
      query = query.ilike('conductor_wialon', `%${options.conductor}%`)
    }

    if (options?.estado) {
      query = query.eq('estado', options.estado)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    // Transformar registros
    let registros: BitacoraRegistroTransformado[] = (data || []).map((row) => ({
      id: row.id,
      patente: row.patente,
      patente_normalizada: row.patente_normalizada,
      conductor_wialon: row.conductor_wialon || null,
      conductor_id: row.conductor_id || null,
      ibutton: row.ibutton || null,
      fecha_turno: row.fecha_turno,
      hora_inicio: row.hora_inicio || null,
      hora_cierre: row.hora_cierre || null,
      duracion_minutos: row.duracion_minutos || null,
      kilometraje: parseFloat(row.kilometraje) || 0,
      observaciones: row.observaciones || null,
      estado: row.estado || calcularEstado(row.hora_cierre, parseFloat(row.kilometraje) || 0),
      gnc_cargado: row.gnc_cargado || false,
      lavado_realizado: row.lavado_realizado || false,
      nafta_cargada: row.nafta_cargada || false,
    }))

    const total = registros.length

    // Aplicar paginación
    if (options?.offset !== undefined && options?.limit !== undefined) {
      registros = registros.slice(options.offset, options.offset + options.limit)
    } else if (options?.limit) {
      registros = registros.slice(0, options.limit)
    }

    bitacoraCache.set(cacheKey, registros)
    return { data: registros, count: total }
  },

  /**
   * Obtiene estadísticas agregadas
   */
  async getStats(startDate: string, endDate: string): Promise<BitacoraStats> {
    const cacheKey = `stats_${startDate}_${endDate}`
    const cached = statsCache.get(cacheKey)

    if (cached) return cached

    // Obtener todos los turnos para calcular stats
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

    const vehiculos = new Set(registros.map(r => r.patente_normalizada))
    const conductores = new Set(registros.map(r => r.conductor_wialon).filter(Boolean))
    const kmTotal = registros.reduce((sum, r) => sum + r.kilometraje, 0)

    const stats: BitacoraStats = {
      totalTurnos: registros.length,
      vehiculosUnicos: vehiculos.size,
      conductoresUnicos: conductores.size,
      kilometrajeTotal: Math.round(kmTotal * 100) / 100,
      kilometrajePromedio: Math.round((kmTotal / registros.length) * 100) / 100,
      turnosFinalizados: registros.filter(r => r.estado === 'Turno Finalizado').length,
      turnosPocaKm: registros.filter(r => r.estado === 'Poco Km').length,
      turnosEnCurso: registros.filter(r => r.estado === 'En Curso').length,
      conGnc: 0,
      conLavado: 0,
      conNafta: 0,
    }

    statsCache.set(cacheKey, stats)
    return stats
  },

  /**
   * Actualiza checklist de un turno
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
      .from(TABLE_NAME)
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
   * Actualiza estado de un turno
   */
  async updateEstado(id: string, estado: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE_NAME)
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
   * Estado de sincronización
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null
    totalRecords: number
    status: string
  }> {
    // Obtener última sincronización y conteo
    const { data, count } = await supabase
      .from(TABLE_NAME)
      .select('synced_at', { count: 'exact' })
      .order('synced_at', { ascending: false })
      .limit(1)

    const lastSync = data && data.length > 0 ? data[0].synced_at : null

    return {
      lastSync,
      totalRecords: count || 0,
      status: 'success',
    }
  },

  /**
   * Trigger sync - llama al Edge Function para sincronizar datos de Wialon
   */
  async triggerSync(startDate?: string, _endDate?: string): Promise<{ success: boolean; error?: string; turnos?: number }> {
    const fecha = startDate || new Date().toISOString().split('T')[0]

    try {
      const response = await fetch(
        `https://beuuxepwljaljkprypey.supabase.co/functions/v1/sync-wialon-bitacora?fecha=${fecha}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      this.clearCache()

      if (result.success) {
        return { success: true, turnos: result.turnos }
      } else {
        return { success: false, error: result.error || 'Error desconocido' }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error de conexion' }
    }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
