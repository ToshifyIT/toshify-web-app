// src/modules/integraciones/uss/hooks/useUSSData.ts
/**
 * Hook principal para datos de USS (Excesos de Velocidad)
 * Con soporte para tiempo real
 */

import { useState, useEffect, useCallback, useRef } from 'react'
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
// Debounce para realtime (500ms para agrupar múltiples eventos)
const REALTIME_DEBOUNCE_MS = 500

interface UseUSSDataOptions {
  autoLoad?: boolean
  defaultPeriod?: 'today' | 'yesterday' | 'week' | 'month'
  sedeId?: string | null
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

  // Filtro de rango de velocidad
  setVelocidadRange: (min: number | undefined, max: number | undefined) => void

  // Acciones
  refresh: () => Promise<void>

  // Realtime
  isRealtime: boolean
}

export function useUSSData(options: UseUSSDataOptions = {}): UseUSSDataReturn {
  const { autoLoad = true, defaultPeriod = 'week', sedeId } = options

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
    label: defaultPeriod === 'week' ? 'Última semana' : defaultPeriod === 'yesterday' ? 'Ayer' : defaultPeriod === 'today' ? 'Hoy' : defaultPeriod === 'month' ? 'Últimos 30 días' : defaultPeriod,
  })
  // Filtro de rango de velocidad (servidor)
  const [velocidadMin, setVelocidadMin] = useState<number | undefined>(undefined)
  const [velocidadMax, setVelocidadMax] = useState<number | undefined>(undefined)

  const setVelocidadRange = useCallback((min: number | undefined, max: number | undefined) => {
    setVelocidadMin(min)
    setVelocidadMax(max)
  }, [])

  // Carga todos los excesos del rango (sin paginación servidor)
  // El DataTable maneja paginación, filtros y sorting del lado del cliente
  const fetchExcesos = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setQueryState((prev) => ({ ...prev, loading: true, error: null }))
    }

    try {
      const { data, count } = await ussService.getExcesos(
        dateRange.startDate,
        dateRange.endDate,
        {
          sedeId,
          velocidadMin,
          velocidadMax,
        }
      )

      setExcesos(data)
      setTotalCount(count)

      setQueryState({
        loading: false,
        error: null,
        lastUpdate: new Date(),
      })
    } catch (error) {
      if (showLoading) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
        setQueryState({ loading: false, error: errorMessage, lastUpdate: null })
      } else {
        setQueryState((prev) => ({ ...prev, lastUpdate: new Date() }))
      }
    }
  }, [dateRange, sedeId, velocidadMin, velocidadMax])

  // Carga stats y rankings - solo se ejecuta al cambiar dateRange o sedeId
  const fetchStatsAndRankings = useCallback(async () => {
    try {
      const [statsData, vehiculos, conductores] = await Promise.all([
        ussService.getStats(dateRange.startDate, dateRange.endDate, sedeId),
        ussService.getVehiculosRanking(dateRange.startDate, dateRange.endDate, 10, sedeId),
        ussService.getConductoresRanking(dateRange.startDate, dateRange.endDate, 10, sedeId),
      ])

      setStats(statsData)
      setVehiculosRanking(vehiculos)
      setConductoresRanking(conductores)
    } catch {
      // Stats/rankings son secundarios, no bloquean la UI
    }
  }, [dateRange, sedeId])

  // Cargar datos con loading visible
  const loadData = useCallback(() => fetchExcesos(true), [fetchExcesos])

  // Cargar datos silenciosamente (para tiempo real, sin parpadeo)
  const loadDataSilent = useCallback(() => fetchExcesos(false), [fetchExcesos])

  // Efecto para carga de excesos
  useEffect(() => {
    if (autoLoad) {
      loadData()
    }
  }, [loadData, autoLoad])

  // Efecto para carga de stats y rankings (solo cuando cambia dateRange o sedeId)
  useEffect(() => {
    if (autoLoad) {
      fetchStatsAndRankings()
    }
  }, [fetchStatsAndRankings, autoLoad])

  // Determinar si estamos en modo realtime (Hoy o Última semana)
  const isRealtime = dateRange.label === 'Hoy' || dateRange.label === 'Última semana'

  // Ref para debouncing de realtime
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReloadingRef = useRef(false)

  // Auto-refresh: Suscripción a Supabase Realtime para cambios en uss_excesos_velocidad
  useEffect(() => {
    if (!isRealtime) return

    const onChange = () => {
      // Debounce: agrupar múltiples eventos en una sola recarga
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      if (!isReloadingRef.current) {
        realtimeDebounceRef.current = setTimeout(() => {
          isReloadingRef.current = true
          loadDataSilent().finally(() => {
            isReloadingRef.current = false
          })
        }, REALTIME_DEBOUNCE_MS)
      }
    }

    const channelUss = supabase
      .channel('uss_excesos_velocidad_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uss_excesos_velocidad' }, onChange)
      .subscribe()

    const channelGeotab = supabase
      .channel('geotab_excesos_velocidad_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geotab_excesos_velocidad' }, onChange)
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      supabase.removeChannel(channelUss)
      supabase.removeChannel(channelGeotab)
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
    setVelocidadRange,
    refresh: loadData,
    isRealtime,
  }
}
