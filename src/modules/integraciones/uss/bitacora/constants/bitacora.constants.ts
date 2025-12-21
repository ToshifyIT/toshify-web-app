// src/modules/integraciones/uss/bitacora/constants/bitacora.constants.ts
/**
 * Constantes para el módulo de Bitácora Wialon
 */

export const BITACORA_CONSTANTS = {
  // Thresholds
  POCO_KM_THRESHOLD: 100,

  // Paginación
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],

  // Estados y sus colores
  ESTADOS: {
    'Turno Finalizado': {
      label: 'Turno Finalizado',
      color: '#22C55E',
      bgColor: '#DCFCE7',
    },
    'Poco Km': {
      label: 'Poco Km',
      color: '#F59E0B',
      bgColor: '#FEF3C7',
    },
    'En Curso': {
      label: 'En Curso',
      color: '#3B82F6',
      bgColor: '#DBEAFE',
    },
    Pendiente: {
      label: 'Pendiente',
      color: '#6B7280',
      bgColor: '#F3F4F6',
    },
  },

  // Columnas de la tabla
  TABLE_COLUMNS: [
    { key: 'fecha_turno', label: 'Fecha', sortable: true },
    { key: 'patente', label: 'Patente', sortable: true },
    { key: 'ibutton', label: 'iButton', sortable: false },
    { key: 'conductor_wialon', label: 'Conductor', sortable: true },
    { key: 'hora_inicio', label: 'Hora Inicio', sortable: true },
    { key: 'hora_cierre', label: 'Hora Cierre', sortable: true },
    { key: 'kilometraje', label: 'Km', sortable: true },
    { key: 'gnc_cargado', label: 'GNC', sortable: false },
    { key: 'lavado_realizado', label: 'Lavado', sortable: false },
    { key: 'nafta_cargada', label: 'Nafta', sortable: false },
    { key: 'estado', label: 'Estado', sortable: true },
  ],

  // Rangos de fecha predefinidos
  DATE_RANGES: [
    { value: 'today', label: 'Hoy' },
    { value: 'yesterday', label: 'Ayer' },
    { value: 'week', label: 'Esta semana' },
    { value: 'month', label: 'Este mes' },
    { value: 'custom', label: 'Personalizado' },
  ],
} as const

export type EstadoKey = keyof typeof BITACORA_CONSTANTS.ESTADOS
