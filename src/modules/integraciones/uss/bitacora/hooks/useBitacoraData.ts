// src/modules/integraciones/uss/bitacora/hooks/useBitacoraData.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../../../lib/supabase'
import {
  wialonBitacoraService,
  type BitacoraRegistroTransformado,
} from '../../../../../services/wialonBitacoraService'
import type {
  BitacoraStats,
  BitacoraDateRange,
  BitacoraQueryState,
} from '../types/bitacora.types'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'
import { normalizePatente } from '../../../../../utils/normalizeDocuments'

// Intervalo de auto-refresh en ms (30 segundos)
const AUTO_REFRESH_INTERVAL = 30000
// Debounce para realtime (500ms para agrupar múltiples eventos)
const REALTIME_DEBOUNCE_MS = 500

// Tipo para conductor asignado con su turno
interface ConductorTurno {
  conductor_nombre: string
  conductor_completo: string
  turno: string | null // diurno, nocturno, todo_dia
}

// Tipo para asignaciones activas con conductores
interface AsignacionActiva {
  patente: string
  patente_normalizada: string
  modalidad: string | null // TURNO, CARGO
  conductores: ConductorTurno[]
}

// Tramo de asignacion de un conductor (para resolver el TURNO por conductor + fecha).
// El turno NO se deriva de la patente USS sino de la asignacion vigente del conductor
// en la fecha de la marcacion (asignaciones_conductores.horario).
interface TramoConductor {
  conductor_id: string
  conductor_nombre: string // normalizado (lower) para match por nombre cuando falta conductor_id
  turno: string | null     // diurno | nocturno | todo_dia
  modalidad: string | null // turno | a_cargo
  fecha_inicio: string     // YYYY-MM-DD
  fecha_fin: string | null // YYYY-MM-DD o null (vigente)
}

// Helpers para fechas - Usando zona horaria Argentina
const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'

/**
 * Convierte una fecha a string YYYY-MM-DD en zona horaria Argentina
 */
function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
}

function getToday(): string {
  return toArgentinaDateString(new Date())
}

function getYesterday(): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return toArgentinaDateString(date)
}

function getStartOfWeek(): string {
  const date = new Date()
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return toArgentinaDateString(date)
}

function getStartOfMonth(): string {
  const date = new Date()
  date.setDate(1)
  return toArgentinaDateString(date)
}

/**
 * Resuelve la asignacion vigente DEL CONDUCTOR en la fecha de la marcacion.
 * Tanto la MODALIDAD (turno/a_cargo) como el TURNO (diurno/nocturno) dependen
 * SOLO del conductor — del tipo de asignacion que tuvo esa semana —, NO de la
 * patente/vehiculo que reporto USS.
 * - Cruza por conductor_id; si la marcacion no lo trae, cae a match por nombre.
 * - Elige el tramo cuyo rango [fecha_inicio, fecha_fin] contiene fecha_turno.
 * Devuelve el tramo vigente (o null si no hay asignacion del conductor esa fecha).
 */
function resolverTramoPorConductor(
  tramosPorConductor: Map<string, TramoConductor[]>,
  conductorId: string | null,
  conductorNombre: string | null,
  fechaTurno: string,
): TramoConductor | null {
  const fecha = (fechaTurno || '').slice(0, 10)
  if (!fecha) return null

  // 1) Candidatos por conductor_id
  let candidatos: TramoConductor[] | undefined = conductorId ? tramosPorConductor.get(conductorId) : undefined

  // 2) Fallback: si no hay conductor_id (marcacion USS sin link), match por nombre
  if ((!candidatos || candidatos.length === 0) && conductorNombre) {
    const nombre = conductorNombre.toLowerCase()
    candidatos = []
    for (const tramos of tramosPorConductor.values()) {
      for (const t of tramos) {
        if (t.conductor_nombre && (nombre.includes(t.conductor_nombre) || t.conductor_nombre.includes(nombre))) {
          candidatos.push(t)
        }
      }
    }
  }
  if (!candidatos || candidatos.length === 0) return null

  // 3) Tramo vigente en la fecha (fecha_inicio <= fecha <= fecha_fin|null)
  return candidatos.find(t =>
    t.fecha_inicio <= fecha && (t.fecha_fin === null || t.fecha_fin >= fecha)
  ) || null
}

/** Mapea el horario del conductor al indicador de TURNO mostrado.
 *  'todo_dia' (a_cargo) => null: a cargo NO tiene turno diurno/nocturno => "-". */
function turnoIndicadorDeTramo(turno: string | null): string | null {
  if (turno === 'diurno') return 'Diurno'
  if (turno === 'nocturno') return 'Nocturno'
  return null
}

export function useBitacoraData() {
  // Estado de fechas - Default a "Hoy" para datos en tiempo real
  const [dateRange, setDateRange] = useState<BitacoraDateRange>({
    startDate: getToday(),
    endDate: getToday(),
    label: 'Hoy',
  })

  // Estado de datos
  const [registros, setRegistros] = useState<BitacoraRegistroTransformado[]>([])
  const [stats, setStats] = useState<BitacoraStats | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())
  // Tramos de asignacion por conductor_id, para resolver el TURNO por conductor + fecha.
  const [tramosPorConductor, setTramosPorConductor] = useState<Map<string, TramoConductor[]>>(new Map())

  // Estado de paginación
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(BITACORA_CONSTANTS.DEFAULT_PAGE_SIZE)

  // Estado de filtros
  const [filterPatente, setFilterPatente] = useState('')
  const [filterConductor, setFilterConductor] = useState('')
  const [filterEstado, setFilterEstado] = useState('')

  // Estado de query
  const [queryState, setQueryState] = useState<BitacoraQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
  })

  // Cargar asignaciones activas con conductores y sus turnos
  // Usando queries separadas para evitar problemas con nested joins de Supabase
  const loadAsignaciones = useCallback(async () => {
    try {
      // Query 1: Obtener asignaciones activas con vehículos
      const { data: asignacionesData } = await (supabase
        .from('asignaciones')
        .select('id, vehiculo_id, horario, vehiculos!inner(patente)')
        .eq('estado', 'activa') as any)

      if (!asignacionesData || asignacionesData.length === 0) {
        setAsignaciones(new Map())
        return
      }

      // Query 2: Obtener TODOS los conductores de asignaciones activas
      const asignacionIds = asignacionesData.map((a: any) => a.id)
      const { data: conductoresData } = await (supabase
        .from('asignaciones_conductores')
        .select('asignacion_id, horario, conductor_id, conductores(nombres, apellidos)')
        .in('asignacion_id', asignacionIds) as any)

      // Agrupar conductores por asignacion_id
      const conductoresPorAsignacion = new Map<string, ConductorTurno[]>()
      for (const ac of (conductoresData || [])) {
        const conductor = ac.conductores
        if (conductor) {
          const asigId = ac.asignacion_id
          if (!conductoresPorAsignacion.has(asigId)) {
            conductoresPorAsignacion.set(asigId, [])
          }
          conductoresPorAsignacion.get(asigId)!.push({
            conductor_nombre: conductor.nombres,
            conductor_completo: `${conductor.nombres} ${conductor.apellidos}`,
            turno: ac.horario,
          })
        }
      }

      // Construir mapa de asignaciones
      const map = new Map<string, AsignacionActiva>()
      for (const asig of asignacionesData) {
        const vehiculo = asig.vehiculos
        if (vehiculo) {
          const patenteNorm = normalizePatente(vehiculo.patente)
          const conductores = conductoresPorAsignacion.get(asig.id) || []

          map.set(patenteNorm, {
            patente: vehiculo.patente,
            patente_normalizada: patenteNorm,
            modalidad: asig.horario,
            conductores,
          })
        }
      }
      setAsignaciones(map)

      // ===== TURNO por conductor + fecha =====
      // El turno NO depende de la patente USS sino de la asignacion vigente del
      // conductor en la fecha de la marcacion. Traemos TODOS los tramos (sin filtrar
      // por estado='activa') desde asignaciones_conductores con sus fechas y el
      // horario (turno) + la modalidad de la asignacion padre. Indexamos por conductor_id.
      const { data: tramosData } = await (supabase
        .from('asignaciones_conductores')
        .select('conductor_id, horario, fecha_inicio, fecha_fin, conductores(nombres, apellidos), asignaciones(modalidad)')
        .order('fecha_inicio', { ascending: false }) as any)

      const tramosMap = new Map<string, TramoConductor[]>()
      const toDateStr = (v: string | null) => (v ? String(v).slice(0, 10) : null)
      for (const t of (tramosData || [])) {
        if (!t.conductor_id) continue
        const cond = t.conductores
        const nombreCompleto = cond ? `${cond.nombres} ${cond.apellidos}` : ''
        const tramo: TramoConductor = {
          conductor_id: t.conductor_id,
          conductor_nombre: nombreCompleto.toLowerCase(),
          turno: t.horario ?? null,
          modalidad: t.asignaciones?.modalidad ?? null,
          fecha_inicio: toDateStr(t.fecha_inicio) || '0000-01-01',
          fecha_fin: toDateStr(t.fecha_fin),
        }
        if (!tramosMap.has(t.conductor_id)) tramosMap.set(t.conductor_id, [])
        tramosMap.get(t.conductor_id)!.push(tramo)
      }
      setTramosPorConductor(tramosMap)
    } catch {
      setAsignaciones(new Map())
      setTramosPorConductor(new Map())
    }
  }, [])

  // Cargar asignaciones al montar
  useEffect(() => {
    loadAsignaciones()
  }, [loadAsignaciones])

  // Función interna para cargar datos (con opción de mostrar loading o no)
  const fetchData = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setQueryState((prev) => ({ ...prev, loading: true, error: null }))
    }

    try {
      const offset = (page - 1) * pageSize

      const [bitacoraResult, statsResult] = await Promise.all([
        wialonBitacoraService.getBitacora(dateRange.startDate, dateRange.endDate, {
          limit: pageSize,
          offset,
          patente: filterPatente || undefined,
          conductor: filterConductor || undefined,
          estado: filterEstado || undefined,
        }),
        wialonBitacoraService.getStats(dateRange.startDate, dateRange.endDate),
      ])

      // Enriquecer registros.
      // MODALIDAD (tipo_turno) y TURNO (turno_indicador) dependen SOLO del CONDUCTOR:
      // se resuelven desde su asignacion vigente en la fecha de la marcacion
      // (por conductor_id, o por nombre si la marcacion no trae conductor_id),
      // NO desde la patente/vehiculo que reporto USS.
      // - modalidad: tramo.modalidad (turno | a_cargo)
      // - turno: diurno/nocturno; 'todo_dia' (a_cargo) => "-" (a cargo no tiene turno).
      // Si el conductor NO tiene asignacion esa fecha, se cae a lo que trajo el DB (compat).
      const registrosEnriquecidos = bitacoraResult.data.map((r) => {
        const tramo = resolverTramoPorConductor(
          tramosPorConductor,
          r.conductor_id,
          r.conductor_wialon,
          r.fecha_turno,
        )

        if (tramo) {
          return {
            ...r,
            tipo_turno: tramo.modalidad ?? r.tipo_turno ?? null,
            turno_indicador: turnoIndicadorDeTramo(tramo.turno),
          }
        }

        // Fallback (sin asignacion del conductor en esa fecha): conservar DB,
        // completando modalidad por patente si falta (compat. registros antiguos).
        const asignacionPorPatente = asignaciones.get(r.patente_normalizada)
        return {
          ...r,
          tipo_turno: r.tipo_turno ?? asignacionPorPatente?.modalidad ?? null,
          turno_indicador: r.turno_indicador ?? null,
        }
      })

      setRegistros(registrosEnriquecidos)
      setTotalCount(bitacoraResult.count)
      setStats(statsResult)
      setQueryState({
        loading: false,
        error: null,
        lastUpdate: new Date(),
      })
    } catch (error) {
      // Solo mostrar error si era una carga con loading visible
      if (showLoading) {
        setQueryState({
          loading: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
          lastUpdate: null,
        })
      } else {
        // En actualizaciones silenciosas, solo actualizar lastUpdate
        setQueryState((prev) => ({ ...prev, lastUpdate: new Date() }))
      }
    }
  }, [dateRange, page, pageSize, filterPatente, filterConductor, filterEstado, asignaciones, tramosPorConductor])

  // Cargar datos con loading visible (para carga inicial y cambios de filtros)
  const loadData = useCallback(() => fetchData(true), [fetchData])

  // Cargar datos silenciosamente (para tiempo real, sin parpadeo)
  const loadDataSilent = useCallback(() => fetchData(false), [fetchData])

  // Cargar datos automáticamente al montar
  useEffect(() => {
    loadAsignaciones().then(() => loadData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo al montar

  // Cargar datos cuando cambian los parámetros (excepto al montar)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (asignaciones.size > 0 || !queryState.loading) {
      loadData()
    }
  }, [loadData, asignaciones.size])

  // Refs para debouncing de realtime
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReloadingRef = useRef(false)

  // Auto-refresh: Suscripción a Supabase Realtime para cambios en wialon_bitacora
  useEffect(() => {
    // Solo auto-refresh si estamos viendo "Hoy"
    if (dateRange.label !== 'Hoy') return

    const channel = supabase
      .channel('wialon_bitacora_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wialon_bitacora',
        },
        () => {
          // Debounce: agrupar múltiples eventos en una sola recarga
          if (realtimeDebounceRef.current) {
            clearTimeout(realtimeDebounceRef.current)
          }

          if (!isReloadingRef.current) {
            realtimeDebounceRef.current = setTimeout(() => {
              isReloadingRef.current = true
              wialonBitacoraService.clearCache()
              loadDataSilent().finally(() => {
                isReloadingRef.current = false
              })
            }, REALTIME_DEBOUNCE_MS)
          }
        }
      )
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [dateRange.label, loadDataSilent])

  // Auto-refresh con intervalo como fallback (cada 30 segundos cuando vemos "Hoy")
  useEffect(() => {
    if (dateRange.label !== 'Hoy') return

    const intervalId = setInterval(() => {
      wialonBitacoraService.clearCache()
      loadDataSilent()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [dateRange.label, loadDataSilent])

  // Cambiar rango de fecha predefinido
  const setDateRangePreset = useCallback((preset: string) => {
    const today = getToday()

    switch (preset) {
      case 'today':
        setDateRange({ startDate: today, endDate: today, label: 'Hoy' })
        break
      case 'yesterday':
        const yesterday = getYesterday()
        setDateRange({ startDate: yesterday, endDate: yesterday, label: 'Ayer' })
        break
      case 'week':
        setDateRange({ startDate: getStartOfWeek(), endDate: today, label: 'Esta semana' })
        break
      case 'month':
        setDateRange({ startDate: getStartOfMonth(), endDate: today, label: 'Este mes' })
        break
    }
    setPage(1)
  }, [])

  // Cambiar rango de fecha personalizado
  const setCustomDateRange = useCallback((startDate: string, endDate: string, label?: string) => {
    setDateRange({ startDate, endDate, label: label || 'Personalizado' })
    setPage(1)
  }, [])

  // Actualizar checklist
  const updateChecklist = useCallback(
    async (
      id: string,
      field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
      value: boolean
    ) => {
      try {
        await wialonBitacoraService.updateChecklist(id, { [field]: value })

        setRegistros((prev) =>
          prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        )
      } catch (error) {
        throw error
      }
    },
    []
  )

  // Actualizar estado
  const updateEstado = useCallback(async (id: string, estado: string) => {
    try {
      await wialonBitacoraService.updateEstado(id, estado)
      setRegistros((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)))
    } catch (error) {
      throw error
    }
  }, [])

  // Refrescar datos
  const refresh = useCallback(() => {
    wialonBitacoraService.clearCache()
    loadAsignaciones()
    loadData()
  }, [loadData, loadAsignaciones])

  // Sincronizar - Solo recarga datos (uss_historico se sincroniza automáticamente)
  const triggerSync = useCallback(async () => {
    setQueryState((prev) => ({ ...prev, loading: true }))
    wialonBitacoraService.clearCache()
    await loadData()
    return { success: true }
  }, [loadData])

  return {
    // Datos
    registros,
    stats,
    totalCount,

    // Estado de query
    queryState,

    // Fechas
    dateRange,
    setDateRangePreset,
    setCustomDateRange,

    // Paginación
    page,
    setPage,
    pageSize,
    setPageSize,

    // Filtros
    filterPatente,
    setFilterPatente,
    filterConductor,
    setFilterConductor,
    filterEstado,
    setFilterEstado,

    // Acciones
    updateChecklist,
    updateEstado,
    refresh,
    triggerSync,
  }
}
