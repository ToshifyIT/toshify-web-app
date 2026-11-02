// src/modules/integraciones/uss/constants/uss.constants.ts
/**
 * Constantes para el módulo USS
 */

import type { DateRange } from '../types/uss.types'

import { haceDiasART, hoyART } from '../../../../utils/fechaArgentina'
// Rangos de fechas predefinidos
export const DATE_RANGES: DateRange[] = [
  {
    label: 'Hoy',
    startDate: hoyART(),
    endDate: hoyART(),
  },
  {
    label: 'Ayer',
    startDate: haceDiasART(1),
    endDate: haceDiasART(1),
  },
  {
    label: 'Última semana',
    startDate: haceDiasART(7),
    endDate: hoyART(),
  },
  {
    label: 'Últimos 30 días',
    startDate: haceDiasART(30),
    endDate: hoyART(),
  },
]

// Umbrales de severidad de excesos
export const SEVERITY_THRESHOLDS = {
  LOW: 10,      // 0-10 km/h sobre el límite
  MEDIUM: 20,   // 10-20 km/h sobre el límite
  HIGH: 30,     // 20-30 km/h sobre el límite
  CRITICAL: 40, // 30+ km/h sobre el límite
} as const

// Colores por severidad
export const SEVERITY_COLORS = {
  LOW: '#FCD34D',      // Amarillo
  MEDIUM: '#FB923C',   // Naranja
  HIGH: '#F87171',     // Rojo claro
  CRITICAL: '#ff0033', // Rojo oscuro
} as const

// Límites de paginación
export const PAGE_SIZES = [25, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 50

// Columnas de la tabla de excesos
export const EXCESOS_TABLE_COLUMNS = [
  { key: 'fecha_evento', label: 'Fecha/Hora', sortable: true },
  { key: 'patente', label: 'Patente', sortable: true },
  { key: 'conductor_wialon', label: 'Conductor', sortable: true },
  { key: 'velocidad_maxima', label: 'Velocidad', sortable: true },
  { key: 'limite_velocidad', label: 'Límite', sortable: true },
  { key: 'exceso', label: 'Exceso', sortable: true },
  { key: 'duracion_segundos', label: 'Duración', sortable: true },
  { key: 'localizacion', label: 'Ubicación', sortable: false },
] as const

// Mensajes de estado
export const STATUS_MESSAGES = {
  loading: 'Cargando datos de excesos...',
  empty: 'No se encontraron excesos en el período seleccionado',
  error: 'Error al cargar los datos',
  success: 'Datos cargados correctamente',
} as const
