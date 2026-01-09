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
  const loadAsignaciones = useCallback(async () => {
    const { data } = await supabase
      .from('asignaciones')
      .select(`
        vehiculo_id,
        horario,
        vehiculos!inner(patente),
        asignaciones_conductores(
          horario,
          conductores(nombres, apellidos)
        )
      `)
      .eq('estado', 'activa') as {
      data: Array<{
        vehiculo_id: string
        horario: string | null
        vehiculos: { patente: string }
        asignaciones_conductores: Array<{
          horario: string | null
          conductores: { nombres: string; apellidos: string }
        }>
      }> | null
    }

    if (data) {
      const map = new Map<string, AsignacionActiva>()
      for (const row of data) {
        const vehiculo = row.vehiculos
        const asigConductores = row.asignaciones_conductores || []

        if (vehiculo) {
          const patenteNorm = vehiculo.patente.replace(/\s/g, '').toUpperCase()

          // Mapear conductores con sus turnos
          const conductores: ConductorTurno[] = asigConductores
            .filter(ac => ac.conductores)
            .map(ac => ({
              conductor_nombre: ac.conductores.nombres,
              conductor_completo: `${ac.conductores.nombres} ${ac.conductores.apellidos}`,
              turno: ac.horario, // diurno, nocturno, todo_dia
            }))

          map.set(patenteNorm, {
            patente: vehiculo.patente,
            patente_normalizada: patenteNorm,
            modalidad: row.horario, // TURNO, CARGO
            conductores,
          })
        }
      }
      setAsignaciones(map)
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

      // Cruzar con asignaciones - buscar conductor y su turno
      const registrosEnriquecidos = bitacoraResult.data.map((r) => {
        const asignacion = asignaciones.get(r.patente_normalizada)
        if (asignacion) {
          // Buscar el conductor que coincida por nombre (si existe conductor_wialon en el registro)
          const conductorWialon = r.conductor_wialon?.toLowerCase() || ''
          const conductorMatch = asignacion.conductores.find(c =>
            conductorWialon.includes(c.conductor_nombre.toLowerCase())
          )

          // Determinar el turno del conductor
          let turnoIndicador: string | null = null
          if (asignacion.modalidad === 'TURNO' && conductorMatch?.turno) {
            // Usar nombre completo: Diurno o Nocturno
            if (conductorMatch.turno === 'diurno') turnoIndicador = 'Diurno'
            else if (conductorMatch.turno === 'nocturno') turnoIndicador = 'Nocturno'
          }

          return {
            ...r,
            conductor_wialon: conductorMatch?.conductor_completo || r.conductor_wialon,
            tipo_turno: asignacion.modalidad, // TURNO o CARGO
            turno_indicador: turnoIndicador, // D, N, o null
          }
        }
        return { ...r, tipo_turno: null, turno_indicador: null }
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
  }, [dateRange, page, pageSize, filterPatente, filterConductor, filterEstado, asignaciones])

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
  const setCustomDateRange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate, label: 'Personalizado' })
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
        console.error('Error actualizando checklist:', error)
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
      console.error('Error actualizando estado:', error)
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
