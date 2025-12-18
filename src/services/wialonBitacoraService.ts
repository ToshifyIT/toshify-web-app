/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla uss_historico que ya tiene datos sincronizados
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

// Tipo para registro transformado
export interface BitacoraRegistroTransformado {
  id: string
  patente: string
  patente_normalizada: string
  conductor_wialon: string | null
  ibutton: string | null
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  kilometraje: number
  observaciones: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
}

// Threshold para "Poco Km"
const POCO_KM_THRESHOLD = 100

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

// Helper para calcular estado
function calcularEstado(horaFinal: string | null, km: number): string {
  if (!horaFinal) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}

// Helper para extraer hora de timestamp
function extraerHora(timestamp: string | null): string | null {
  if (!timestamp) return null
  // Formato: "2025-12-18 18:29:00" o ISO
  const match = timestamp.match(/(\d{2}:\d{2}:\d{2})/)
  if (match) return match[1]
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return null
  return date.toTimeString().substring(0, 8)
}

// Helper para extraer fecha de timestamp
function extraerFecha(timestamp: string): string {
  // Formato: "2025-12-18 18:29:00" o ISO
  const match = timestamp.match(/(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  return timestamp.split('T')[0]
}

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const wialonBitacoraService = {
  /**
   * Obtiene registros de bitácora agrupados por turno (por vehículo y día)
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

    // Query de uss_historico
    const { data, error } = await supabase
      .from('uss_historico')
      .select('*')
      .gte('fecha_hora_inicio', `${startDate} 00:00:00`)
      .lte('fecha_hora_inicio', `${endDate} 23:59:59`)
      .order('fecha_hora_inicio', { ascending: false })

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    // Agrupar por patente y fecha (un turno = todos los viajes del día de un vehículo)
    const turnosMap = new Map<string, {
      id: string
      patente: string
      conductor: string | null
      ibutton: string | null
      fecha_turno: string
      hora_inicio: string
      hora_cierre: string | null
      kilometraje: number
      observaciones: string | null
    }>()

    for (const row of data || []) {
      const fecha = extraerFecha(row.fecha_hora_inicio)
      const patenteNorm = (row.patente || '').replace(/\s/g, '').toUpperCase()
      const key = `${patenteNorm}_${fecha}`

      const existing = turnosMap.get(key)
      const km = parseFloat(row.kilometraje) || 0
      const horaInicio = extraerHora(row.fecha_hora_inicio)
      const horaCierre = extraerHora(row.fecha_hora_final)

      if (!existing) {
        turnosMap.set(key, {
          id: String(row.id),
          patente: row.patente,
          conductor: row.conductor,
          ibutton: row.ibutton,
          fecha_turno: fecha,
          hora_inicio: horaInicio || '',
          hora_cierre: horaCierre,
          kilometraje: km,
          observaciones: row.observaciones,
        })
      } else {
        // Acumular km
        existing.kilometraje += km
        // Actualizar hora cierre si es más tarde
        if (horaCierre && (!existing.hora_cierre || horaCierre > existing.hora_cierre)) {
          existing.hora_cierre = horaCierre
        }
        // Actualizar hora inicio si es más temprana
        if (horaInicio && horaInicio < existing.hora_inicio) {
          existing.hora_inicio = horaInicio
        }
        // Actualizar conductor si no hay
        if (!existing.conductor && row.conductor) {
          existing.conductor = row.conductor
        }
        // Actualizar ibutton si no hay
        if (!existing.ibutton && row.ibutton) {
          existing.ibutton = row.ibutton
        }
      }
    }

    // Convertir a array y transformar
    let registros: BitacoraRegistroTransformado[] = Array.from(turnosMap.values()).map((r) => ({
      id: r.id,
      patente: r.patente,
      patente_normalizada: r.patente.replace(/\s/g, '').toUpperCase(),
      conductor_wialon: r.conductor,
      ibutton: r.ibutton,
      fecha_turno: r.fecha_turno,
      hora_inicio: r.hora_inicio || null,
      hora_cierre: r.hora_cierre,
      kilometraje: Math.round(r.kilometraje * 100) / 100,
      observaciones: r.observaciones,
      estado: calcularEstado(r.hora_cierre, r.kilometraje),
      gnc_cargado: false,
      lavado_realizado: false,
      nafta_cargada: false,
    }))

    // Ordenar por fecha desc, hora inicio desc
    registros.sort((a, b) => {
      if (a.fecha_turno !== b.fecha_turno) {
        return b.fecha_turno.localeCompare(a.fecha_turno)
      }
      return (b.hora_inicio || '').localeCompare(a.hora_inicio || '')
    })

    // Aplicar filtros
    if (options?.patente) {
      const term = options.patente.toLowerCase()
      registros = registros.filter(r =>
        r.patente.toLowerCase().includes(term) ||
        r.patente_normalizada.toLowerCase().includes(term)
      )
    }

    if (options?.conductor) {
      const term = options.conductor.toLowerCase()
      registros = registros.filter(r => r.conductor_wialon?.toLowerCase().includes(term))
    }

    if (options?.estado) {
      registros = registros.filter(r => r.estado === options.estado)
    }

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
   * Placeholder para checklist
   */
  async updateChecklist(
    _id: string,
    _updates: {
      gnc_cargado?: boolean
      lavado_realizado?: boolean
      nafta_cargada?: boolean
    }
  ): Promise<void> {
    // TODO: Implementar con tabla de checklist separada si se necesita
    console.log('updateChecklist - pendiente de implementar')
  },

  /**
   * Placeholder para estado
   */
  async updateEstado(_id: string, _estado: string): Promise<void> {
    // TODO: Implementar si se necesita cambiar estado manualmente
    console.log('updateEstado - pendiente de implementar')
  },

  /**
   * Estado de sincronización
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null
    totalRecords: number
    status: string
  }> {
    const { count } = await supabase
      .from('uss_historico')
      .select('*', { count: 'exact', head: true })

    return {
      lastSync: new Date().toISOString(),
      totalRecords: count || 0,
      status: 'success',
    }
  },

  /**
   * Trigger sync - uss_historico ya se sincroniza automáticamente
   * Los parámetros se aceptan pero no se usan ya que la data viene de uss_historico
   */
  async triggerSync(_startDate?: string, _endDate?: string): Promise<{ success: boolean; error?: string }> {
    this.clearCache()
    return { success: true }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
