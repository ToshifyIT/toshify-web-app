/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla uss_historico (sincronizada automáticamente desde Wialon)
 * Agrupa datos por vehículo+día para mostrar turnos
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

// Tipo para fila de uss_historico
interface UssHistoricoRow {
  id: number
  patente: string
  conductor: string | null
  ibutton: string | null
  observaciones: string | null
  fecha_hora_inicio: string
  fecha_hora_final: string | null
  kilometraje: string | null
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

// Helper para calcular estado
function calcularEstado(horaFinal: string | null, km: number): string {
  if (!horaFinal) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}

// Helper para extraer fecha de timestamp
function extraerFecha(timestamp: string): string {
  if (!timestamp) return ''
  // Formato: "2025-12-22T14:30:00" o "2025-12-22 14:30:00"
  return timestamp.split(/[T\s]/)[0]
}

// Helper para extraer hora de timestamp
function extraerHora(timestamp: string | null): string | null {
  if (!timestamp) return null
  const match = timestamp.match(/(\d{2}:\d{2})(:\d{2})?/)
  return match ? match[1] : null
}

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

export const wialonBitacoraService = {
  /**
   * Obtiene registros de bitácora desde uss_historico, agrupados por turno
   * DATOS EN TIEMPO REAL - uss_historico se sincroniza automáticamente
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

    // Query directa a uss_historico (datos en tiempo real)
    const { data, error } = await supabase
      .from('uss_historico')
      .select('*')
      .gte('fecha_hora_inicio', `${startDate} 00:00:00`)
      .lte('fecha_hora_inicio', `${endDate} 23:59:59`)
      .order('fecha_hora_inicio', { ascending: false })

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    // Agrupar por patente + fecha (un turno = todos los viajes del día de un vehículo)
    const turnosMap = new Map<string, {
      id: string
      patente: string
      patenteNorm: string
      conductor: string | null
      ibutton: string | null
      fecha: string
      horaInicio: string | null
      horaCierre: string | null
      km: number
      observaciones: string | null
    }>()

    for (const row of (data || []) as UssHistoricoRow[]) {
      const fecha = extraerFecha(row.fecha_hora_inicio)
      const patenteNorm = (row.patente || '').replace(/\s/g, '').toUpperCase()
      const key = `${patenteNorm}_${fecha}`

      const km = parseFloat(row.kilometraje || '0') || 0
      const horaInicio = extraerHora(row.fecha_hora_inicio)
      const horaCierre = extraerHora(row.fecha_hora_final)

      const existing = turnosMap.get(key)

      if (!existing) {
        turnosMap.set(key, {
          id: String(row.id),
          patente: row.patente,
          patenteNorm,
          conductor: row.conductor,
          ibutton: row.ibutton,
          fecha,
          horaInicio,
          horaCierre,
          km,
          observaciones: row.observaciones,
        })
      } else {
        // Acumular km
        existing.km += km
        // Actualizar hora inicio si es más temprano
        if (horaInicio && (!existing.horaInicio || horaInicio < existing.horaInicio)) {
          existing.horaInicio = horaInicio
        }
        // Actualizar hora cierre si es más tarde
        if (horaCierre && (!existing.horaCierre || horaCierre > existing.horaCierre)) {
          existing.horaCierre = horaCierre
        }
        // Actualizar conductor si no tenía
        if (!existing.conductor && row.conductor) {
          existing.conductor = row.conductor
        }
        if (!existing.ibutton && row.ibutton) {
          existing.ibutton = row.ibutton
        }
      }
    }

    // Transformar a registros
    let registros: BitacoraRegistroTransformado[] = Array.from(turnosMap.values()).map((t) => ({
      id: t.id,
      patente: t.patente,
      patente_normalizada: t.patenteNorm,
      conductor_wialon: t.conductor || null,
      conductor_id: null,
      ibutton: t.ibutton || null,
      fecha_turno: t.fecha,
      hora_inicio: t.horaInicio,
      hora_cierre: t.horaCierre,
      duracion_minutos: null,
      kilometraje: Math.round(t.km * 100) / 100,
      observaciones: t.observaciones || null,
      estado: calcularEstado(t.horaCierre, t.km),
      gnc_cargado: false,
      lavado_realizado: false,
      nafta_cargada: false,
    }))

    // Ordenar por fecha y hora descendente
    registros.sort((a, b) => {
      const fechaComp = b.fecha_turno.localeCompare(a.fecha_turno)
      if (fechaComp !== 0) return fechaComp
      return (b.hora_inicio || '').localeCompare(a.hora_inicio || '')
    })

    // Aplicar filtros
    if (options?.patente) {
      const filtro = options.patente.toUpperCase().replace(/\s/g, '')
      registros = registros.filter((r) => r.patente_normalizada.includes(filtro))
    }

    if (options?.conductor) {
      const filtro = options.conductor.toLowerCase()
      registros = registros.filter((r) => r.conductor_wialon?.toLowerCase().includes(filtro))
    }

    if (options?.estado) {
      registros = registros.filter((r) => r.estado === options.estado)
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
   * Actualiza checklist - Placeholder (uss_historico no tiene estas columnas)
   */
  async updateChecklist(
    _id: string,
    _updates: {
      gnc_cargado?: boolean
      lavado_realizado?: boolean
      nafta_cargada?: boolean
    }
  ): Promise<void> {
    // TODO: Implementar con tabla separada si se necesita
    console.warn('updateChecklist pendiente de implementar')
  },

  /**
   * Actualiza estado - Placeholder
   */
  async updateEstado(_id: string, _estado: string): Promise<void> {
    console.warn('updateEstado pendiente de implementar')
  },

  /**
   * Estado de sincronización - uss_historico se sincroniza automáticamente
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
   * Trigger sync - Solo limpia cache (uss_historico se sincroniza automáticamente)
   */
  async triggerSync(_startDate?: string, _endDate?: string): Promise<{ success: boolean; error?: string; turnos?: number }> {
    this.clearCache()
    // uss_historico se sincroniza automáticamente por cron job
    return { success: true }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
