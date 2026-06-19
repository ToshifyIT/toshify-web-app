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
  gps_origen?: 'USS' | 'GEOTAB' // proveedor GPS de origen
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

    // Resolver patentes de sede una sola vez (compartido por ambas queries)
    let patentesSede: string[] | null = null
    if (options?.sedeId) {
      patentesSede = await getPatentesPorSede(options.sedeId)
      if (!patentesSede) {
        return { data: [], count: 0 }
      }
    }

    // dia siguiente a endDate (para filtrar timestamp de geotab con < limite exclusivo)
    const endDateNext = (() => {
      const d = new Date(endDate + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      return d.toISOString().slice(0, 10)
    })()

    // Builder de query reutilizable para wialon_bitacora y geotab_bitacora.
    // GEOTAB se filtra por fecha_hora_fin_gmt3 (fecha de FIN en hora AR real): un turno
    // pertenece a la semana donde TERMINA. USS sigue filtrando por fecha_turno (no tiene gmt3).
    const buildQuery = (tabla: 'wialon_bitacora' | 'geotab_bitacora') => {
      let q = supabase
        .from(tabla)
        .select('*', { count: 'exact' })

      if (tabla === 'geotab_bitacora') {
        q = q
          .gte('fecha_hora_fin_gmt3', startDate)
          .lt('fecha_hora_fin_gmt3', endDateNext)
          .order('fecha_hora_fin_gmt3', { ascending: false })
      } else {
        q = q
          .gte('fecha_turno', startDate)
          .lte('fecha_turno', endDate)
          .order('fecha_turno', { ascending: false })
          .order('hora_inicio', { ascending: false })
      }

      if (patentesSede) {
        q = q.in('patente_normalizada', patentesSede)
      }

      if (options?.patente) {
        const term = options.patente.replace(/[\s\-.]/g, '').toUpperCase()
        q = q.or(
          `patente.ilike.%${options.patente}%,patente_normalizada.ilike.%${term}%,conductor_wialon.ilike.%${options.patente}%,ibutton.ilike.%${options.patente}%`
        )
      }
      if (options?.conductor) {
        q = q.ilike('conductor_wialon', `%${options.conductor}%`)
      }
      if (options?.estado) {
        q = q.eq('estado', options.estado)
      }
      if (options?.offset !== undefined && options?.limit !== undefined) {
        q = q.range(options.offset, options.offset + options.limit - 1)
      } else if (options?.limit) {
        q = q.limit(options.limit)
      }
      return q
    }

    // Ejecutar queries en paralelo: USS (wialon_bitacora) + GEOTAB (geotab_bitacora)
    // + asignaciones (para resolver modalidad/turno por patente en filas GEOTAB, que
    //   no traen vehiculo_modalidad/horario desde el sync de Geotab).
    const [wialonRes, geotabRes, asigRes] = await Promise.all([
      buildQuery('wialon_bitacora'),
      buildQuery('geotab_bitacora'),
      supabase
        .from('asignaciones_conductores')
        .select('horario, estado, fecha_inicio, fecha_fin, conductores(nombres, apellidos), asignaciones!inner(horario, estado, vehiculos!inner(patente))')
        .in('estado', ['asignado', 'activo', 'activa', 'completado', 'completada', 'finalizado', 'finalizada', 'cancelado', 'cancelada']),
    ])

    if (wialonRes.error) {
      throw new Error(`Error obteniendo bitácora (USS): ${wialonRes.error.message}`)
    }
    // geotab_bitacora puede fallar si la tabla aún no está propagada en algún ambiente; no romper la pantalla
    if (geotabRes.error) {
      console.warn('[wialonBitacoraService] geotab_bitacora query falló:', geotabRes.error.message)
    }

    // Cruces desde asignaciones_conductores para completar modalidad/turno en filas GEOTAB:
    //   - modalidad del vehiculo (por PATENTE): asignaciones.horario 'todo_dia' -> 'a_cargo', sino 'turno'.
    //   - turno del conductor (por PATENTE + CONDUCTOR + FECHA del turno): se cruza contra la
    //     asignacion que estuvo VIGENTE en la fecha del turno (aunque hoy este completada/cancelada),
    //     respetando el historial. asignaciones_conductores.horario = 'diurno' | 'nocturno' | 'todo_dia'.
    // patente -> lista de asignaciones (modalidad del vehiculo) con su vigencia
    type ModVig = { modalidad: string; ini: number; fin: number }
    const modsPorPatente = new Map<string, ModVig[]>()
    // patente|conductor -> lista de asignaciones (turno del conductor) con su vigencia
    type AsigVig = { horario: string; ini: number; fin: number }
    const asigsPorPatenteConductor = new Map<string, AsigVig[]>()
    const normNombre = (s: string) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim()
    for (const ac of (asigRes.data || []) as any[]) {
      const pat = ac?.asignaciones?.vehiculos?.patente
      if (!pat) continue
      const norm = pat.replace(/[\s\-.]/g, '').toUpperCase()
      const ini = ac.fecha_inicio ? new Date(ac.fecha_inicio).getTime() : 0
      const fin = ac.fecha_fin ? new Date(ac.fecha_fin).getTime() : Number.POSITIVE_INFINITY
      // modalidad del vehiculo (por patente + fecha)
      const modAsig = (ac.asignaciones?.horario || '').toLowerCase()
      const mods = modsPorPatente.get(norm) || []
      mods.push({ modalidad: modAsig === 'todo_dia' ? 'a_cargo' : 'turno', ini, fin })
      modsPorPatente.set(norm, mods)
      // turno del conductor (por patente + conductor + fecha)
      const c = ac.conductores
      const nombre = c ? normNombre(`${c.nombres || ''} ${c.apellidos || ''}`) : ''
      if (!nombre) continue
      const key = `${norm}|${nombre}`
      const arr = asigsPorPatenteConductor.get(key) || []
      arr.push({ horario: (ac.horario || 'todo_dia').toLowerCase(), ini, fin })
      asigsPorPatenteConductor.set(key, arr)
    }
    const vigenteEn = <T extends { ini: number; fin: number }>(arr: T[] | undefined, fechaTurno: string): T | undefined => {
      if (!arr || !arr.length) return undefined
      const t = new Date(fechaTurno + 'T12:00:00').getTime()
      return arr.find(a => t >= a.ini && t <= a.fin) || arr[0]
    }
    // Modalidad del vehiculo vigente en la fecha del turno.
    const resolverModalidadGeotab = (patNorm: string, fechaTurno: string): string | undefined =>
      vigenteEn(modsPorPatente.get(patNorm), fechaTurno)?.modalidad
    // Turno del conductor vigente en la fecha del turno (aunque la asignacion este completada).
    const resolverHorarioGeotab = (patNorm: string, nombre: string, fechaTurno: string): string | undefined =>
      vigenteEn(asigsPorPatenteConductor.get(`${patNorm}|${nombre}`), fechaTurno)?.horario

    const mapRow = (row: WialonBitacoraRow, origen: 'USS' | 'GEOTAB'): BitacoraRegistroTransformado => {
      // Map DB columns to display fields
      let tipoTurno: string | null = null
      let turnoIndicador: string | null = null

      // Geotab no trae modalidad ni horario: resolverlos desde asignaciones.
      //   modalidad -> por patente | horario (turno del conductor) -> por patente + conductor
      //   + fecha del turno (toma la asignacion vigente en esa fecha, aunque hoy este completada).
      const esGeotab = origen === 'GEOTAB'
      const modGeo = esGeotab ? resolverModalidadGeotab(row.patente_normalizada, row.fecha_turno) : undefined
      const nombreCond = normNombre(row.conductor_wialon || '')
      const horGeo = esGeotab && nombreCond
        ? resolverHorarioGeotab(row.patente_normalizada, nombreCond, row.fecha_turno)
        : undefined

      if (row.vehiculo_modalidad) {
        tipoTurno = row.vehiculo_modalidad === 'a_cargo' ? 'a_cargo' : row.vehiculo_modalidad
      } else if (modGeo) {
        tipoTurno = modGeo
      }
      const horarioEfectivo = (row.horario && row.horario !== 'todo_dia') ? row.horario : (horGeo ?? row.horario)
      if (horarioEfectivo) {
        turnoIndicador = horarioEfectivo === 'diurno' ? 'diurno' : horarioEfectivo === 'nocturno' ? 'nocturno' : 'todo_dia'
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
        gps_origen: origen,
      }
    }

    // Combinar filas de ambas fuentes
    const registrosWialon = ((wialonRes.data || []) as WialonBitacoraRow[]).map(r => mapRow(r, 'USS'))
    const registrosGeotab = ((geotabRes.data || []) as WialonBitacoraRow[]).map(r => mapRow(r, 'GEOTAB'))
    const registros: BitacoraRegistroTransformado[] = [...registrosWialon, ...registrosGeotab]

    // Orden por defecto: fecha+hora de INICIO real (periodo_inicio) descendente.
    // Usa el timestamp real, asi los turnos que cruzan medianoche quedan en su
    // posicion cronologica correcta (no descolocados por fecha_turno).
    registros.sort((a, b) => {
      const ta = a.periodo_inicio ? new Date(a.periodo_inicio).getTime() : 0
      const tb = b.periodo_inicio ? new Date(b.periodo_inicio).getTime() : 0
      if (ta !== tb) return tb - ta
      // Desempate por fecha_turno + hora si faltara periodo_inicio
      if (a.fecha_turno !== b.fecha_turno) return a.fecha_turno < b.fecha_turno ? 1 : -1
      return (a.hora_inicio || '') < (b.hora_inicio || '') ? 1 : -1
    })

    // No consolidar: el sync ya entrega 1 fila por marcación.
    // Re-consolidar acá unía marcaciones distintas del mismo conductor en el mismo día.
    bitacoraCache.set(cacheKey, registros)
    return { data: registros, count: registros.length }
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
