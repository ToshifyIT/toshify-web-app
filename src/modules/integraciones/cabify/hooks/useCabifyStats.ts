// src/modules/integraciones/cabify/hooks/useCabifyStats.ts
/**
 * Custom hook para cálculo de estadísticas de Cabify
 * Principio: Single Responsibility - Solo cálculos estadísticos
 */

import { useMemo } from 'react'
import type { AsignacionActiva } from '../../../../services/asignacionesService'
import type {
  CabifyDriver,
  DriverStatistics,
  TopDriversResult,
  ChartDataPoint,
} from '../types/cabify.types'
import {
  calculateDriverStatistics,
  calculateTopDrivers,
  transformToChartData,
} from '../utils/cabify.utils'

// =====================================================
// TIPOS DEL HOOK
// =====================================================

interface UseCabifyStatsReturn {
  readonly estadisticas: DriverStatistics
  readonly topMejores: readonly CabifyDriver[]
  readonly topPeores: readonly CabifyDriver[]
  readonly chartDataMejores: readonly ChartDataPoint[]
  readonly chartDataPeores: readonly ChartDataPoint[]
}

// =====================================================
// HOOK PRINCIPAL
// =====================================================

export function useCabifyStats(
  drivers: readonly CabifyDriver[],
  asignaciones: Map<string, AsignacionActiva>
): UseCabifyStatsReturn {
  // Calcular Top 10
  const { topMejores, topPeores } = useMemo<TopDriversResult>(
    () => calculateTopDrivers(drivers, asignaciones),
    [drivers, asignaciones]
  )

  // Calcular estadísticas
  const estadisticas = useMemo<DriverStatistics>(
    () => calculateDriverStatistics(drivers, asignaciones),
    [drivers, asignaciones]
  )

  // Transformar datos para gráficos
  const chartDataMejores = useMemo<ChartDataPoint[]>(
    () => transformToChartData(topMejores),
    [topMejores]
  )

  const chartDataPeores = useMemo<ChartDataPoint[]>(
    () => transformToChartData(topPeores),
    [topPeores]
  )

  return {
    estadisticas,
    topMejores,
    topPeores,
    chartDataMejores,
    chartDataPeores,
  }
}
