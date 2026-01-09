// src/modules/integraciones/cabify/hooks/useCabifyData.ts
/**
 * Custom hook para manejo de datos de Cabify
 * Principio: Single Responsibility - Solo manejo de datos y fetch
 * Principio: Dependency Inversion - Depende de abstracciones (servicios)
 *
 * Incluye suscripción Realtime para actualización automática
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Swal from 'sweetalert2'
import { cabifyService } from '../../../../services/cabifyService'
import { cabifyHistoricalService } from '../../../../services/cabifyHistoricalService'
import { asignacionesService, type AsignacionActiva } from '../../../../services/asignacionesService'
import { supabase } from '../../../../lib/supabase'
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
  // FUNCIONES DE CARGA (definidas antes de los efectos)
  // =====================================================

  // Referencia para evitar múltiples recargas simultáneas
  const isReloadingRef = useRef(false)

  const loadAsignaciones = useCallback(async (driverData: CabifyDriver[]): Promise<void> => {
    const dnis = extractValidDNIs(driverData)

    if (dnis.length === 0) {
      setAsignaciones(new Map())
      return
    }

    const asignacionesMap = await asignacionesService.getAsignacionesByDNIs(dnis)
    setAsignaciones(asignacionesMap)
  }, [])

  const executeDataLoad = useCallback(async (week: WeekOption, showLoading: boolean): Promise<void> => {
    // Solo mostrar loading y vaciar datos si no es actualización silenciosa
    if (showLoading) {
      setQueryState((prev) => ({ ...prev, loading: true, error: null }))
      setDrivers([])
      setLoadingProgress(INITIAL_LOADING_PROGRESS)
    }

    // Obtener datos históricos
    const { drivers: driverData, stats } = await cabifyHistoricalService.getDriversData(
      week.startDate,
      week.endDate,
      {
        onProgress: showLoading ? (current, total, message) => {
          setLoadingProgress({ current, total, message })
        } : undefined,
      }
    )

    // Si es la semana actual (weeksAgo === 0) y no hay datos, cargar semana anterior silenciosamente
    // Solo hacer esto en carga inicial, no en actualizaciones silenciosas
    if (showLoading && driverData.length === 0 && week.weeksAgo === 0) {
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
    if (showLoading) {
      setLoadingProgress(INITIAL_LOADING_PROGRESS)
    }

    // Cargar asignaciones
    await loadAsignaciones(driverData)

    // Finalizar carga exitosa
    setQueryState((prev) => ({
      ...prev,
      loading: false,
      lastUpdate: new Date(),
      error: null,
    }))
  }, [loadAsignaciones])

  // Carga con loading visible (para carga inicial o cambio de semana)
  const loadData = useCallback(async () => {
    // Early return: No hay semana seleccionada
    if (!selectedWeek) {
      return
    }

    try {
      await executeDataLoad(selectedWeek, true)
    } catch (error) {
      handleLoadError(error)
    }
  }, [selectedWeek, executeDataLoad])

  // Carga silenciosa para tiempo real (sin parpadeo)
  const loadDataSilent = useCallback(async () => {
    if (!selectedWeek) {
      return
    }

    try {
      await executeDataLoad(selectedWeek, false)
    } catch (error) {
      // En modo silencioso, no mostrar popup de error
      console.error('Error en actualización silenciosa:', error)
    }
  }, [selectedWeek, executeDataLoad])

  // =====================================================
  // EFECTOS DE CARGA DE DATOS
  // =====================================================

  useEffect(() => {
    if (selectedWeek) {
      loadData()
    }
  }, [selectedWeek])

  // =====================================================
  // SUSCRIPCIÓN REALTIME
  // =====================================================

  useEffect(() => {
    if (!selectedWeek) return

    // Suscribirse a cambios en cabify_historico
    const channel = supabase
      .channel('cabify_historico_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'cabify_historico',
        },
        (payload) => {
          // Verificar si el cambio corresponde al período seleccionado
          const newRecord = payload.new as { fecha_inicio?: string } | undefined
          const oldRecord = payload.old as { fecha_inicio?: string } | undefined
          const recordDate = newRecord?.fecha_inicio || oldRecord?.fecha_inicio

          if (recordDate && selectedWeek) {
            const recordTime = new Date(recordDate).getTime()
            const startTime = new Date(selectedWeek.startDate).getTime()
            const endTime = new Date(selectedWeek.endDate).getTime()

            // Si el registro está dentro del período seleccionado, recargar SIN parpadeo
            if (recordTime >= startTime && recordTime <= endTime) {
              // Evitar múltiples recargas simultáneas
              if (!isReloadingRef.current) {
                isReloadingRef.current = true
                console.log('📡 Realtime: Cambio detectado, actualizando datos silenciosamente...')

                // Pequeño delay para agrupar múltiples cambios
                setTimeout(() => {
                  loadDataSilent().finally(() => {
                    isReloadingRef.current = false
                  })
                }, 500)
              }
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Realtime: Suscripción activa a cabify_historico')
        }
      })

    // Cleanup: desuscribirse al desmontar o cambiar semana
    return () => {
      console.log('📡 Realtime: Desuscribiendo...')
      supabase.removeChannel(channel)
    }
  }, [selectedWeek, loadDataSilent])

  // Auto-refresh con intervalo como fallback (cada 5 minutos)
  const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutos
  useEffect(() => {
    if (!selectedWeek) return

    // Solo auto-refresh si es la semana actual (weeksAgo === 0)
    if (selectedWeek.weeksAgo !== 0) return

    const intervalId = setInterval(() => {
      if (!isReloadingRef.current) {
        console.log('⏰ Auto-refresh: Actualizando datos de Cabify...')
        loadDataSilent()
      }
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [selectedWeek, loadDataSilent])

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
