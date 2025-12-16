// src/modules/integraciones/uss/hooks/useUSSData.ts
/**
 * Hook principal para datos de USS (Excesos de Velocidad)
 */

import { useState, useEffect, useCallback } from 'react'
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

  // Función principal de carga
  const loadData = useCallback(async () => {
    setQueryState((prev) => ({ ...prev, loading: true, error: null }))

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
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      setQueryState({
        loading: false,
        error: errorMessage,
        lastUpdate: null,
      })
    }
  }, [dateRange, page, pageSize, patenteFilter, conductorFilter, minExcesoFilter])

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
  }
}
