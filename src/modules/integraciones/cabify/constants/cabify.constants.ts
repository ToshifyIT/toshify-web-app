// src/modules/integraciones/cabify/constants/cabify.constants.ts
/**
 * Constantes del módulo Cabify
 * Principio: Single Responsibility - Solo constantes
 * Principio: Open/Closed - Fácil de extender sin modificar
 */

import type { AccordionState, SourceMessagesMap } from '../types/cabify.types'

// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================

export const WEEKS_TO_LOAD = 12
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

// =====================================================
// THRESHOLDS DE RATING
// =====================================================

export const SCORE_THRESHOLDS = {
  HIGH: 4.5,
  MEDIUM: 4.0,
} as const

export const ACCEPTANCE_RATE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 60,
} as const

export const OCCUPATION_RATE_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 50,
} as const

// =====================================================
// COLORES PARA GRÁFICOS
// =====================================================

export const CHART_COLORS = {
  MEJORES: [
    '#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0',
    '#D1FAE5', '#ECFDF5', '#059669', '#10B981', '#34D399'
  ],
  PEORES: [
    '#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FECACA',
    '#FEE2E2', '#FEF2F2', '#DC2626', '#EF4444', '#F87171'
  ],
  MODALIDAD: {
    CARGO: '#F59E0B',
    TURNO: '#3B82F6',
  },
} as const

// =====================================================
// ESTADO INICIAL
// =====================================================

export const INITIAL_ACCORDION_STATE: AccordionState = {
  mejores: true,
  peores: true,
  estadisticas: true,
} as const

export const INITIAL_LOADING_PROGRESS = {
  current: 0,
  total: 0,
  message: '',
} as const

// =====================================================
// MENSAJES
// =====================================================

export const createSourceMessages = (
  driverCount: number,
  weekLabel: string
): SourceMessagesMap => ({
  historical: {
    icon: 'success',
    title: 'Datos desde historial',
    html: `${driverCount} conductores cargados<br><small>Semana: ${weekLabel}</small>`,
    timer: 2000,
  },
  api: {
    icon: 'info',
    title: 'Datos desde API Cabify',
    html: `${driverCount} conductores cargados<br><small>Semana: ${weekLabel}</small>`,
    timer: 3000,
  },
  hybrid: {
    icon: 'success',
    title: 'Datos combinados',
    html: `${driverCount} conductores cargados<br><small>Semana: ${weekLabel}</small>`,
    timer: 3000,
  },
})

export const DATA_SOURCE_LABELS: Record<string, string> = {
  historical: 'Datos desde historial:',
  api: 'Datos desde API Cabify:',
  hybrid: 'Datos combinados:',
} as const

// =====================================================
// TEXTOS UI
// =====================================================

export const UI_TEXT = {
  TITLE: 'Conductores Cabify',
  SUBTITLE: 'Gestión de conductores y estadísticas de la plataforma Cabify',
  SYNC_STATUS: 'Sincronización automática activa',
  SYNC_INTERVAL: 'Datos actualizados cada 5 minutos',
  LOADING: 'Cargando...',
  REFRESH: 'Actualizar',
  RETRY: 'Reintentar',
  NO_DRIVERS: 'No hay conductores',
  SELECT_WEEK: 'Selecciona una semana y haz clic en Actualizar para cargar datos',
  SEARCH_PLACEHOLDER: 'Buscar conductor por nombre, email, DNI, patente...',
  ERROR_TITLE: 'Error al cargar conductores',
  NO_ASSIGNMENT: 'No hay conductores con asignación activa',
} as const

export const STATS_LABELS = {
  ACTIVE_DRIVERS: 'Conductores Activos',
  TOTAL_REVENUE: 'Total Recaudado',
  AVG_REVENUE: 'Promedio por Conductor',
  TOTAL_TRIPS: 'Total Viajes',
  AVG_TRIPS: 'Promedio Viajes/Conductor',
  MODALIDAD_DISTRIBUTION: 'Distribución por Modalidad',
} as const
