// src/modules/integraciones/uss/hooks/useUSSData.ts
/**
 * Hook principal para datos de USS (Excesos de Velocidad)
 * Con soporte para tiempo real
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'
import { ussService } from '../../../../services/ussService'
import type {
  ExcesoVelocidad,
  ExcesoStats,
  VehiculoRanking,
  ConductorRanking,
  USSQueryState,
  DateRange,
} from '../types/uss.types'
import { getDateRangeForPeriod } from '../utils/uss.utils'

// Intervalo de auto-refresh en ms (30 segundos)
const AUTO_REFRESH_INTERVAL = 30000

interface UseUSSDataOptions {
  autoLoad?: boolean
  defaultPeriod?: 'today' | 'yesterday' | 'week' | 'month'
}

interface UseUSSDataReturn {
  // Estado
  excesos: ExcesoVelocidad[]
  stats: ExcesoStats | null
  vehiculosRanking: VehiculoRanking[]
  conductoresRanking: ConductorRanking[]
  queryState: USSQueryState
  totalCount: number

  // Filtros
  dateRange: DateRange
  setDateRange: (range: DateRange) => void
  patenteFilter: string
  setPatenteFilter: (value: string) => void
  conductorFilter: string
  setConductorFilter: (value: string) => void
  minExcesoFilter: number
  setMinExcesoFilter: (value: number) => void

  // Paginación
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (size: number) => void

  // Acciones
  refresh: () => Promise<void>
  loadMore: () => Promise<void>

  // Realtime
  isRealtime: boolean
}

const DEFAULT_PAGE_SIZE = 50

export function useUSSData(options: UseUSSDataOptions = {}): UseUSSDataReturn {
  const { autoLoad = true, defaultPeriod = 'week' } = options

  // Estado de datos
  const [excesos, setExcesos] = useState<ExcesoVelocidad[]>([])
  const [stats, setStats] = useState<ExcesoStats | null>(null)
  const [vehiculosRanking, setVehiculosRanking] = useState<VehiculoRanking[]>([])
  const [conductoresRanking, setConductoresRanking] = useState<ConductorRanking[]>([])
  const [totalCount, setTotalCount] = useState(0)

  // Estado de UI
  const [queryState, setQueryState] = useState<USSQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
  })

  // Filtros
  const defaultRange = getDateRangeForPeriod(defaultPeriod)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: defaultRange.start,
    endDate: defaultRange.end,
    label: defaultPeriod === 'week' ? 'Última semana' : defaultPeriod,
  })
  const [patenteFilter, setPatenteFilter] = useState('')
  const [conductorFilter, setConductorFilter] = useState('')
  const [minExcesoFilter, setMinExcesoFilter] = useState(0)

  // Paginación
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Función interna de carga (con opción de mostrar loading o no)
  const fetchData = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setQueryState((prev) => ({ ...prev, loading: true, error: null }))
    }

    try {
      // Cargar excesos con filtros y paginación
      const { data, count } = await ussService.getExcesos(
        dateRange.startDate,
        dateRange.endDate,
        {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          patente: patenteFilter || undefined,
          conductor: conductorFilter || undefined,
          minExceso: minExcesoFilter || undefined,
        }
      )

      setExcesos(data)
      setTotalCount(count)

      // Cargar estadísticas
      const statsData = await ussService.getStats(dateRange.startDate, dateRange.endDate)
      setStats(statsData)

      // Cargar rankings
      const [vehiculos, conductores] = await Promise.all([
        ussService.getVehiculosRanking(dateRange.startDate, dateRange.endDate, 10),
        ussService.getConductoresRanking(dateRange.startDate, dateRange.endDate, 10),
      ])

      setVehiculosRanking(vehiculos)
      setConductoresRanking(conductores)

      setQueryState({
        loading: false,
        error: null,
        lastUpdate: new Date(),
      })
    } catch (error) {
      // Solo mostrar error si era una carga con loading visible
      if (showLoading) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
        setQueryState({
          loading: false,
          error: errorMessage,
          lastUpdate: null,
        })
      } else {
        // En actualizaciones silenciosas, solo actualizar lastUpdate
        setQueryState((prev) => ({ ...prev, lastUpdate: new Date() }))
      }
    }
  }, [dateRange, page, pageSize, patenteFilter, conductorFilter, minExcesoFilter])

  // Cargar datos con loading visible (para carga inicial y cambios de filtros)
  const loadData = useCallback(() => fetchData(true), [fetchData])

  // Cargar datos silenciosamente (para tiempo real, sin parpadeo)
  const loadDataSilent = useCallback(() => fetchData(false), [fetchData])

  // Cargar más datos
  const loadMore = useCallback(async () => {
    if (queryState.loading) return

    const nextPage = page + 1
    const { data } = await ussService.getExcesos(
      dateRange.startDate,
      dateRange.endDate,
      {
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
        patente: patenteFilter || undefined,
        conductor: conductorFilter || undefined,
        minExceso: minExcesoFilter || undefined,
      }
    )

    setExcesos((prev) => [...prev, ...data])
    setPage(nextPage)
  }, [dateRange, page, pageSize, patenteFilter, conductorFilter, minExcesoFilter, queryState.loading])

  // Efecto para carga inicial y cuando cambian filtros
  useEffect(() => {
    if (autoLoad) {
      loadData()
    }
  }, [loadData, autoLoad])

  // Reset page cuando cambian filtros
  useEffect(() => {
    setPage(1)
  }, [dateRange, patenteFilter, conductorFilter, minExcesoFilter])

  // Determinar si estamos en modo realtime (Hoy o Última semana)
  const isRealtime = dateRange.label === 'Hoy' || dateRange.label === 'Última semana'

  // Auto-refresh: Suscripción a Supabase Realtime para cambios en uss_excesos_velocidad
  useEffect(() => {
    if (!isRealtime) return

    const channel = supabase
      .channel('uss_excesos_velocidad_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'uss_excesos_velocidad',
        },
        () => {
          // Cuando hay cambios en la tabla, recargar datos SIN parpadeo
          loadDataSilent()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isRealtime, loadDataSilent])

  // Auto-refresh con intervalo como fallback (cada 30 segundos cuando vemos datos recientes)
  useEffect(() => {
    if (!isRealtime) return

    const intervalId = setInterval(() => {
      loadDataSilent()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [isRealtime, loadDataSilent])

  return {
    excesos,
    stats,
    vehiculosRanking,
    conductoresRanking,
    queryState,
    totalCount,
    dateRange,
    setDateRange,
    patenteFilter,
    setPatenteFilter,
    conductorFilter,
    setConductorFilter,
    minExcesoFilter,
    setMinExcesoFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    refresh: loadData,
    loadMore,
    isRealtime,
  }
}
