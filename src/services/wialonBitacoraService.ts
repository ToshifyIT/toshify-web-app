/**
 * Servicio para consultas de datos de Bitácora Wialon
 * Usa la tabla wialon_bitacora (sincronizada desde Wialon)
 */

import { supabase } from '../lib/supabase'
import type {
  BitacoraStats,
  BitacoraQueryOptions,
} from '../modules/integraciones/uss/bitacora/types/bitacora.types'

/** Normaliza patente: quita espacios, guiones y pasa a mayúsculas */
function normalizarPatente(p: string): string {
  return p.replace(/[\s\-]/g, '').toUpperCase()
}

/** Cache de patentes normalizadas por sede (evita queries repetidas) */
const patentesPorSedeCache = new Map<string, { patentes: string[]; expires: number }>()
const PATENTES_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

async function getPatentesPorSede(sedeId: string): Promise<string[] | null> {
  const cached = patentesPorSedeCache.get(sedeId)
  if (cached && Date.now() < cached.expires) {
    return cached.patentes
  }

  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('patente')
    .eq('sede_id', sedeId)
    .is('deleted_at', null)

  if (!vehiculos || vehiculos.length === 0) return null

  const patentes = vehiculos.map((v: { patente: string }) => normalizarPatente(v.patente))
  patentesPorSedeCache.set(sedeId, { patentes, expires: Date.now() + PATENTES_CACHE_TTL })
  return patentes
}

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
  periodo_inicio: string | null
  periodo_fin: string | null
  duracion_minutos: number | null
  kilometraje: number
  observaciones: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
  tipo_turno?: string | null // turno, a_cargo - viene de asignaciones
  turno_indicador?: string | null // D, N - indicador diurno/nocturno
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
  periodo_inicio: string | null
  periodo_fin: string | null
  duracion_minutos: number | null
  kilometraje: number
  observaciones: string | null
  estado: string
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
  horario: string | null // 'diurno' | 'nocturno' | 'todo_dia'
  vehiculo_modalidad: string | null // 'turno' | 'a_cargo'
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
// CONSOLIDACIÓN: Agrupar trips del mismo día/conductor/patente
// =====================================================

function consolidarRegistros(registros: BitacoraRegistroTransformado[]): BitacoraRegistroTransformado[] {
  const grupos = new Map<string, BitacoraRegistroTransformado[]>()

  for (const reg of registros) {
    // Clave: fecha + patente + conductor (normalizado)
    const conductor = (reg.conductor_wialon || 'sin_conductor').toLowerCase().trim()
    const key = `${reg.fecha_turno}_${reg.patente_normalizada}_${conductor}`
    if (!grupos.has(key)) {
      grupos.set(key, [])
    }
    grupos.get(key)!.push(reg)
  }

  const resultado: BitacoraRegistroTransformado[] = []

  for (const [, trips] of grupos) {
    if (trips.length === 1) {
      resultado.push(trips[0])
      continue
    }

    // Ordenar por hora_inicio
    trips.sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''))

    const primero = trips[0]
    const ultimo = trips[trips.length - 1]

    // Sumar km
    const kmTotal = trips.reduce((sum, t) => sum + t.kilometraje, 0)

    // Hora inicio = la más temprana, hora cierre = la más tardía
    const horaInicio = primero.hora_inicio
    const horaCierre = ultimo.hora_cierre || ultimo.hora_inicio

    // Calcular duración real entre primera entrada y última salida
    let duracionMinutos: number | null = null
    if (horaInicio && horaCierre) {
      const [h1, m1] = horaInicio.split(':').map(Number)
      const [h2, m2] = horaCierre.split(':').map(Number)
      duracionMinutos = (h2 * 60 + m2) - (h1 * 60 + m1)
      if (duracionMinutos < 0) duracionMinutos += 24 * 60 // cruce de medianoche
    }

    // Periodo inicio = el más temprano, periodo fin = el más tardío
    const periodos = trips.map(t => t.periodo_inicio).filter(Boolean).sort()
    const periodosFin = trips.map(t => t.periodo_fin).filter(Boolean).sort()

    // Estado: usar el más relevante (Finalizado > En Curso > Poco Km > Pendiente)
    const estadoPrioridad: Record<string, number> = {
      'Turno Finalizado': 1,
      'Finalizado': 1,
      'En Curso': 2,
      'Poco Km': 3,
      'Pendiente': 4,
    }
    const mejorEstado = trips.reduce((best, t) => {
      const pBest = estadoPrioridad[best.estado] || 99
      const pCurrent = estadoPrioridad[t.estado] || 99
      return pCurrent < pBest ? t : best
    })

    // Checklist: true si alguno tiene true
    const gncCargado = trips.some(t => t.gnc_cargado)
    const lavadoRealizado = trips.some(t => t.lavado_realizado)
    const naftaCargada = trips.some(t => t.nafta_cargada)

    resultado.push({
      ...primero,
      hora_inicio: horaInicio,
      hora_cierre: horaCierre,
      periodo_inicio: periodos[0] || null,
      periodo_fin: periodosFin[periodosFin.length - 1] || null,
      duracion_minutos: duracionMinutos,
      kilometraje: Math.round(kmTotal * 100) / 100,
      estado: mejorEstado.estado,
      gnc_cargado: gncCargado,
      lavado_realizado: lavadoRealizado,
      nafta_cargada: naftaCargada,
    })
  }

  // Ordenar por fecha desc, hora desc
  resultado.sort((a, b) => {
    const fechaCmp = b.fecha_turno.localeCompare(a.fecha_turno)
    if (fechaCmp !== 0) return fechaCmp
    return (b.hora_inicio || '').localeCompare(a.hora_inicio || '')
  })

  return resultado
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

    // wialon_bitacora no tiene sede_id: filtrar por patentes normalizadas de la sede
    if (options?.sedeId) {
      const patentes = await getPatentesPorSede(options.sedeId)
      if (patentes) {
        query = query.in('patente_normalizada', patentes)
      } else {
        return { data: [], count: 0 }
      }
    }

    // Aplicar filtros en la query
    if (options?.patente) {
      // Buscar en patente, patente_normalizada, conductor e ibutton con OR
      const term = options.patente.replace(/[\s\-.]/g, '').toUpperCase()
      query = query.or(
        `patente.ilike.%${options.patente}%,patente_normalizada.ilike.%${term}%,conductor_wialon.ilike.%${options.patente}%,ibutton.ilike.%${options.patente}%`
      )
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

    const { data, error } = await query

    if (error) {
      throw new Error(`Error obteniendo bitácora: ${error.message}`)
    }

    // Transformar a registros
    const registros: BitacoraRegistroTransformado[] = ((data || []) as WialonBitacoraRow[]).map((row) => {
      // Map DB columns to display fields
      let tipoTurno: string | null = null
      let turnoIndicador: string | null = null

      if (row.vehiculo_modalidad) {
        tipoTurno = row.vehiculo_modalidad === 'a_cargo' ? 'a_cargo' : row.vehiculo_modalidad
      }
      if (row.horario) {
        turnoIndicador = row.horario === 'diurno' ? 'diurno' : row.horario === 'nocturno' ? 'nocturno' : 'todo_dia'
      }

      return {
        id: row.id,
        patente: row.patente,
        patente_normalizada: row.patente_normalizada,
        conductor_wialon: row.conductor_wialon,
        conductor_id: row.conductor_id,
        ibutton: row.ibutton,
        fecha_turno: row.fecha_turno,
        hora_inicio: formatearHora(row.hora_inicio),
        hora_cierre: formatearHora(row.hora_cierre),
        periodo_inicio: row.periodo_inicio,
        periodo_fin: row.periodo_fin,
        duracion_minutos: row.duracion_minutos,
        kilometraje: Number(row.kilometraje) || 0,
        observaciones: row.observaciones,
        estado: row.estado,
        gnc_cargado: row.gnc_cargado,
        lavado_realizado: row.lavado_realizado,
        nafta_cargada: row.nafta_cargada,
        tipo_turno: tipoTurno,
        turno_indicador: turnoIndicador,
      }
    })

    // Consolidar: agrupar trips del mismo día/conductor/patente en 1 registro
    const consolidados = consolidarRegistros(registros)

    bitacoraCache.set(cacheKey, consolidados)
    return { data: consolidados, count: consolidados.length }
  },

  /**
   * Obtiene estadísticas agregadas desde wialon_bitacora
   */
  async getStats(startDate: string, endDate: string, sedeId?: string | null): Promise<BitacoraStats> {
    const cacheKey = `stats_${startDate}_${endDate}_${sedeId || 'all'}`
    const cached = statsCache.get(cacheKey)

    if (cached) return cached

    // Query directa para stats (sin paginación)
    let statsQuery = supabase
      .from('wialon_bitacora')
      .select('patente_normalizada, conductor_wialon, kilometraje, estado, gnc_cargado, lavado_realizado, nafta_cargada')
      .gte('fecha_turno', startDate)
      .lte('fecha_turno', endDate)
      .limit(5000)
    if (sedeId) {
      const patentes = await getPatentesPorSede(sedeId)
      if (patentes) {
        statsQuery = statsQuery.in('patente_normalizada', patentes)
      } else {
        return {
          totalTurnos: 0, vehiculosUnicos: 0, conductoresUnicos: 0,
          kilometrajeTotal: 0, kilometrajePromedio: 0,
          turnosFinalizados: 0, turnosPocaKm: 0, turnosEnCurso: 0,
          conGnc: 0, conLavado: 0, conNafta: 0,
        }
      }
    }
    const { data: rawData, error } = await statsQuery

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
   * Trigger sync - Invoca la Edge Function para sincronizar datos
   */
  async triggerSync(startDate?: string, endDate?: string): Promise<{ success: boolean; error?: string; turnos?: number }> {
    this.clearCache()

    try {
      // Invocar la Edge Function de sincronización
      const { data, error } = await supabase.functions.invoke('sync-wialon-bitacora', {
        body: {
          daysBack: 3,
          ...(startDate && endDate ? { startDate, endDate } : {}),
        },
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        turnos: data?.turnosGenerados || 0,
      }
    } catch {
      // Si la Edge Function no está disponible, solo limpiar caché
      return { success: true }
    }
  },

  clearCache(): void {
    bitacoraCache.clear()
    statsCache.clear()
  },
}
