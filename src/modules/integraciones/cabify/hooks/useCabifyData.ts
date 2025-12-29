// src/modules/integraciones/cabify/hooks/useCabifyData.ts
/**
 * Custom hook para manejo de datos de Cabify
 * Principio: Single Responsibility - Solo manejo de datos y fetch
 * Principio: Dependency Inversion - Depende de abstracciones (servicios)
 */

import { useState, useEffect, useCallback } from 'react'
import Swal from 'sweetalert2'
import { cabifyService } from '../../../../services/cabifyService'
import { cabifyHistoricalService } from '../../../../services/cabifyHistoricalService'
import { asignacionesService, type AsignacionActiva } from '../../../../services/asignacionesService'
import type { CabifyQueryState } from '../../../../types/cabify.types'
import type {
  CabifyDriver,
  WeekOption,
  DataSource,
  LoadingProgress,
} from '../types/cabify.types'
import { extractValidDNIs } from '../utils/cabify.utils'
import {
  WEEKS_TO_LOAD,
  INITIAL_LOADING_PROGRESS,
} from '../constants/cabify.constants'

// =====================================================
// TIPOS DEL HOOK
// =====================================================

interface UseCabifyDataReturn {
  // Estado
  readonly drivers: CabifyDriver[]
  readonly queryState: CabifyQueryState
  readonly loadingProgress: LoadingProgress
  readonly dataSource: DataSource
  readonly asignaciones: Map<string, AsignacionActiva>
  readonly availableWeeks: WeekOption[]
  readonly selectedWeek: WeekOption | null

  // Acciones
  readonly setSelectedWeek: (week: WeekOption | null) => void
  readonly refreshData: () => Promise<void>
}

// =====================================================
// HOOK PRINCIPAL
// =====================================================

export function useCabifyData(): UseCabifyDataReturn {
  // Estado de datos
  const [drivers, setDrivers] = useState<CabifyDriver[]>([])
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())
  const [dataSource, setDataSource] = useState<DataSource>('historical')

  // Estado de UI
  const [queryState, setQueryState] = useState<CabifyQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
    period: 'custom',
  })
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>(INITIAL_LOADING_PROGRESS)

  // Estado de selección de semana
  const [availableWeeks, setAvailableWeeks] = useState<WeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null)

  // =====================================================
  // INICIALIZACIÓN
  // =====================================================

  useEffect(() => {
    initializeWeeks()
  }, [])

  const initializeWeeks = useCallback(() => {
    const weeks = cabifyService.getAvailableWeeks(WEEKS_TO_LOAD) as WeekOption[]
    setAvailableWeeks(weeks)

    if (weeks.length > 0) {
      setSelectedWeek(weeks[0])
    }
  }, [])

  // =====================================================
  // CARGA DE DATOS
  // =====================================================

  useEffect(() => {
    if (selectedWeek) {
      loadData()
    }
  }, [selectedWeek])

  const loadData = useCallback(async () => {
    // Early return: No hay semana seleccionada
    if (!selectedWeek) {
      return
    }

    try {
      await executeDataLoad(selectedWeek)
    } catch (error) {
      handleLoadError(error)
    }
  }, [selectedWeek])

  const executeDataLoad = async (week: WeekOption): Promise<void> => {
    // Inicializar estado de carga
    setQueryState((prev) => ({ ...prev, loading: true, error: null }))
    setDrivers([])
    setLoadingProgress(INITIAL_LOADING_PROGRESS)

    // Obtener datos históricos
    const { drivers: driverData, stats } = await cabifyHistoricalService.getDriversData(
      week.startDate,
      week.endDate,
      {
        onProgress: (current, total, message) => {
          setLoadingProgress({ current, total, message })
        },
      }
    )

    // Si es la semana actual (weeksAgo === 0) y no hay datos, cargar semana anterior silenciosamente
    if (driverData.length === 0 && week.weeksAgo === 0) {
      // Obtener semanas directamente del servicio (no del estado que puede estar desactualizado)
      const freshWeeks = cabifyService.getAvailableWeeks(WEEKS_TO_LOAD) as WeekOption[]

      if (freshWeeks.length > 1) {
        const previousWeek = freshWeeks[1] // Semana anterior

        // Cambiar a la semana anterior directamente (sin popup molesto)
        setSelectedWeek(previousWeek)
        return
      }
    }

    // Actualizar estado con datos
    setDrivers(driverData)
    setDataSource(stats.source)
    setLoadingProgress(INITIAL_LOADING_PROGRESS)

    // Cargar asignaciones
    await loadAsignaciones(driverData)

    // Finalizar carga exitosa
    setQueryState((prev) => ({
      ...prev,
      loading: false,
      lastUpdate: new Date(),
      error: null,
    }))

  }

  const loadAsignaciones = async (driverData: CabifyDriver[]): Promise<void> => {
    const dnis = extractValidDNIs(driverData)

    if (dnis.length === 0) {
      setAsignaciones(new Map())
      return
    }

    const asignacionesMap = await asignacionesService.getAsignacionesByDNIs(dnis)
    setAsignaciones(asignacionesMap)
  }

  // =====================================================
  // MANEJO DE ERRORES
  // =====================================================

  const handleLoadError = (error: unknown): void => {
    const errorMessage = extractErrorMessage(error)

    console.error('Error cargando conductores:', error)

    setQueryState((prev) => ({
      ...prev,
      loading: false,
      error: errorMessage,
    }))

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: errorMessage,
    })
  }

  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    return 'No se pudieron cargar los conductores'
  }

  // =====================================================
  // API PÚBLICA
  // =====================================================

  return {
    drivers,
    queryState,
    loadingProgress,
    dataSource,
    asignaciones,
    availableWeeks,
    selectedWeek,
    setSelectedWeek,
    refreshData: loadData,
  }
}
