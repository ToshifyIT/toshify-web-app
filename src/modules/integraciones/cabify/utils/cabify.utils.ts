// src/modules/integraciones/cabify/utils/cabify.utils.ts
/**
 * Funciones utilitarias para el módulo Cabify
 * Principio: Single Responsibility - Funciones puras y reutilizables
 * Principio: Nombres descriptivos
 */

import type { AsignacionActiva } from '../../../../services/asignacionesService'
import type {
  CabifyDriver,
  RatingLevel,
  ChartDataPoint,
  DriverStatistics,
  TopDriversResult,
  ModalidadDistribution,
} from '../types/cabify.types'
import { SCORE_THRESHOLDS, CHART_COLORS } from '../constants/cabify.constants'

// =====================================================
// FORMATEO DE VALORES
// =====================================================

/**
 * Formatea un valor numérico como moneda argentina
 * @param value - Valor a formatear (puede ser string o number)
 * @returns String formateado con separadores de miles y 2 decimales
 */
export function formatCurrency(value: number | string | undefined): string {
  const numericValue = parseNumericValue(value)
  return numericValue.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Parsea un valor que puede ser string o number a number
 * @param value - Valor a parsear
 * @returns Valor numérico (0 si no es válido)
 */
export function parseNumericValue(value: number | string | undefined): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return value

  const parsed = parseFloat(value)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Obtiene el nombre completo del conductor
 * @param driver - Objeto conductor
 * @returns Nombre completo o 'N/A'
 */
export function getDriverFullName(driver: CabifyDriver): string {
  const fullName = `${driver.name || ''} ${driver.surname || ''}`.trim()
  return fullName || 'N/A'
}

/**
 * Obtiene el primer nombre del conductor (para gráficos)
 * @param driver - Objeto conductor
 * @returns Primer nombre o 'N/A'
 */
export function getDriverFirstName(driver: CabifyDriver): string {
  const fullName = getDriverFullName(driver)
  return fullName.split(' ')[0] || 'N/A'
}

// =====================================================
// CLASIFICACIÓN DE RATINGS
// =====================================================

/**
 * Determina el nivel de clasificación de un score
 * @param score - Score del conductor
 * @returns 'high' | 'medium' | 'low'
 */
export function getScoreLevel(score: number | undefined): RatingLevel {
  if (!score) return 'low'
  if (score >= SCORE_THRESHOLDS.HIGH) return 'high'
  if (score >= SCORE_THRESHOLDS.MEDIUM) return 'medium'
  return 'low'
}

/**
 * Determina el nivel de clasificación de una tasa
 * @param rate - Tasa a clasificar
 * @param highThreshold - Umbral para 'high'
 * @param mediumThreshold - Umbral para 'medium'
 * @returns 'high' | 'medium' | 'low'
 */
export function getRateLevel(
  rate: number | undefined,
  highThreshold: number,
  mediumThreshold: number
): RatingLevel {
  if (!rate) return 'low'
  if (rate >= highThreshold) return 'high'
  if (rate >= mediumThreshold) return 'medium'
  return 'low'
}

// =====================================================
// OBTENCIÓN DE PATENTES
// =====================================================

/**
 * Obtiene la patente del conductor (prioriza la del sistema)
 * @param driver - Objeto conductor
 * @param asignaciones - Mapa de asignaciones
 * @returns Patente o '-'
 */
export function getDriverPatente(
  driver: CabifyDriver,
  asignaciones: Map<string, AsignacionActiva>
): string {
  // Early return: Priorizar patente del sistema
  const asignacion = driver.nationalIdNumber
    ? asignaciones.get(driver.nationalIdNumber)
    : null

  if (asignacion?.patente) {
    return asignacion.patente
  }

  // Fallback: Usar patente de Cabify (primera si hay múltiples)
  if (!driver.vehicleRegPlate) return '-'

  const patentes = driver.vehicleRegPlate.split('/')
  return patentes[0].trim() || '-'
}

// =====================================================
// FILTRADO DE CONDUCTORES
// =====================================================

/**
 * Filtra conductores que tienen asignación activa
 * @param drivers - Lista de conductores
 * @param asignaciones - Mapa de asignaciones
 * @returns Conductores con asignación
 */
export function filterDriversWithAssignment(
  drivers: readonly CabifyDriver[],
  asignaciones: Map<string, AsignacionActiva>
): CabifyDriver[] {
  return drivers.filter((driver) => {
    if (!driver.nationalIdNumber) return false
    return asignaciones.has(driver.nationalIdNumber)
  })
}

/**
 * Extrae DNIs válidos de una lista de conductores
 * @param drivers - Lista de conductores
 * @returns Array de DNIs no vacíos
 */
export function extractValidDNIs(drivers: readonly CabifyDriver[]): string[] {
  return drivers
    .map((d) => d.nationalIdNumber)
    .filter((dni): dni is string => Boolean(dni && dni.trim().length > 0))
}

// =====================================================
// CÁLCULOS DE ESTADÍSTICAS
// =====================================================

/**
 * Calcula estadísticas de conductores con asignación
 * @param drivers - Lista de conductores
 * @param asignaciones - Mapa de asignaciones
 * @returns Objeto con estadísticas calculadas
 */
export function calculateDriverStatistics(
  drivers: readonly CabifyDriver[],
  asignaciones: Map<string, AsignacionActiva>
): DriverStatistics {
  // Usar TODOS los conductores de Cabify (no filtrar por asignación)
  const allDrivers = [...drivers]

  // Early return: Sin conductores
  if (allDrivers.length === 0) {
    return createEmptyStatistics()
  }

  const ganancias = allDrivers.map((d) => parseNumericValue(d.gananciaTotal))
  const totalRecaudado = ganancias.reduce((sum, g) => sum + g, 0)
  const promedioRecaudacion = totalRecaudado / allDrivers.length

  const viajes = allDrivers.map((d) => d.viajesFinalizados || 0)
  const totalViajes = viajes.reduce((sum, v) => sum + v, 0)
  const promedioViajes = totalViajes / allDrivers.length

  const { conductoresCargo, conductoresTurno, conductoresSinAsignacion } = countDriversByModalidad(
    allDrivers,
    asignaciones
  )

  return {
    totalRecaudado,
    promedioRecaudacion,
    totalViajes,
    promedioViajes,
    conductoresCargo,
    conductoresTurno,
    totalConductores: allDrivers.length,
    distribucionModalidad: createModalidadDistribution(conductoresCargo, conductoresTurno, conductoresSinAsignacion),
  }
}

/**
 * Crea objeto de estadísticas vacío
 */
function createEmptyStatistics(): DriverStatistics {
  return {
    totalRecaudado: 0,
    promedioRecaudacion: 0,
    totalViajes: 0,
    promedioViajes: 0,
    conductoresCargo: 0,
    conductoresTurno: 0,
    totalConductores: 0,
    distribucionModalidad: [],
  }
}

/**
 * Cuenta conductores por modalidad
 */
function countDriversByModalidad(
  drivers: CabifyDriver[],
  asignaciones: Map<string, AsignacionActiva>
): { conductoresCargo: number; conductoresTurno: number; conductoresSinAsignacion: number } {
  let conductoresCargo = 0
  let conductoresTurno = 0
  let conductoresSinAsignacion = 0

  for (const driver of drivers) {
    const asig = driver.nationalIdNumber
      ? asignaciones.get(driver.nationalIdNumber)
      : null

    if (asig?.horario === 'CARGO') conductoresCargo++
    else if (asig?.horario === 'TURNO') conductoresTurno++
    else conductoresSinAsignacion++
  }

  return { conductoresCargo, conductoresTurno, conductoresSinAsignacion }
}

/**
 * Crea distribución de modalidad para gráficos
 */
function createModalidadDistribution(
  cargo: number,
  turno: number,
  sinAsignacion: number = 0
): ModalidadDistribution[] {
  const distribution: ModalidadDistribution[] = []

  if (cargo > 0) {
    distribution.push({ name: 'A Cargo', value: cargo, color: CHART_COLORS.MODALIDAD.CARGO })
  }
  if (turno > 0) {
    distribution.push({ name: 'Turno', value: turno, color: CHART_COLORS.MODALIDAD.TURNO })
  }
  if (sinAsignacion > 0) {
    distribution.push({ name: 'Sin asignación', value: sinAsignacion, color: '#9CA3AF' })
  }

  return distribution
}

// =====================================================
// CÁLCULO DE TOP 10
// =====================================================

/**
 * Calcula los top 10 mejores y peores conductores
 * @param drivers - Lista de conductores
 * @param asignaciones - Mapa de asignaciones
 * @returns Objeto con top mejores y peores
 */
export function calculateTopDrivers(
  drivers: readonly CabifyDriver[],
  _asignaciones: Map<string, AsignacionActiva>
): TopDriversResult {
  // Usar TODOS los conductores de Cabify (no filtrar por asignación)
  // El cruce con asignaciones es solo para mostrar info adicional

  // Filtrar solo conductores con al menos 1 viaje para rankings
  const conductoresConViajes = drivers.filter(
    (driver) => (driver.viajesFinalizados || 0) > 0
  )

  const ordenados = [...conductoresConViajes].sort((a, b) => {
    const gananciasA = parseNumericValue(a.gananciaTotal)
    const gananciasB = parseNumericValue(b.gananciaTotal)
    return gananciasB - gananciasA // Mayor a menor
  })

  return {
    topMejores: ordenados.slice(0, 10),
    topPeores: ordenados.slice(-10).reverse(),
  }
}

/**
 * Transforma conductores a datos para gráfico
 * @param drivers - Lista de conductores
 * @returns Array de puntos de datos para gráfico
 */
export function transformToChartData(drivers: readonly CabifyDriver[]): ChartDataPoint[] {
  return drivers.map((driver) => ({
    name: getDriverFirstName(driver),
    value: parseNumericValue(driver.gananciaTotal),
    fullName: getDriverFullName(driver),
  }))
}

// =====================================================
// MENSAJES DE CARGA
// =====================================================

/**
 * Construye mensaje de progreso de carga
 * @param current - Progreso actual
 * @param total - Total
 * @param message - Mensaje adicional
 * @returns Mensaje formateado
 */
export function buildLoadingMessage(
  current: number,
  total: number,
  message: string
): string {
  if (total === 0) {
    return 'Cargando conductores desde Cabify...'
  }
  return `${message} (${current}/${total})`
}
