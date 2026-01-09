// src/modules/integraciones/cabify/types/cabify.types.ts
/**
 * Tipos estrictos para el módulo Cabify
 * Principio: Single Responsibility - Solo definiciones de tipos
 */

// =====================================================
// TIPOS BASE
// =====================================================

export interface CabifyDriver {
  readonly id: string
  readonly companyName?: string
  readonly name?: string
  readonly surname?: string
  readonly email?: string
  readonly nationalIdNumber?: string
  readonly driverLicense?: string
  readonly mobileCc?: string
  readonly mobileNum?: string
  readonly vehiculo?: string
  readonly vehicleMake?: string
  readonly vehicleModel?: string
  readonly vehicleRegPlate?: string
  readonly score?: number
  readonly viajesFinalizados?: number
  readonly viajesRechazados?: number
  readonly viajesPerdidos?: number
  readonly tasaAceptacion?: number
  readonly horasConectadasFormato?: string
  readonly tasaOcupacion?: number
  readonly cobroEfectivo?: number | string
  readonly cobroApp?: number | string
  readonly peajes?: number | string
  readonly gananciaTotal?: number | string
  readonly gananciaPorHora?: number | string
  readonly permisoEfectivo?: string
  readonly disabled?: boolean
}

export interface WeekOption {
  readonly weeksAgo: number
  readonly label: string
  readonly startDate: string
  readonly endDate: string
}

// =====================================================
// TIPOS DE ESTADO
// =====================================================

export type DataSource = 'historical' | 'api' | 'hybrid'
export type ViewMode = 'list' | 'chart'
export type AccordionKey = 'mejores' | 'peores' | 'estadisticas'
export type RatingLevel = 'high' | 'medium' | 'low'

/**
 * Filtro de período para datos de Cabify
 * - 'semana': Semana seleccionada completa
 * - 'anterior': Día/semana anterior al seleccionado
 */
export type PeriodFilter = 'semana' | 'anterior'

export interface PeriodRange {
  readonly startDate: string
  readonly endDate: string
  readonly label: string
}

export interface AccordionState {
  readonly mejores: boolean
  readonly peores: boolean
  readonly estadisticas: boolean
}

export interface LoadingProgress {
  readonly current: number
  readonly total: number
  readonly message: string
}

// =====================================================
// TIPOS DE ESTADÍSTICAS
// =====================================================

export interface ModalidadDistribution {
  readonly name: string
  readonly value: number
  readonly color: string
}

export interface DriverStatistics {
  readonly totalRecaudado: number
  readonly promedioRecaudacion: number
  readonly totalViajes: number
  readonly promedioViajes: number
  readonly conductoresCargo: number
  readonly conductoresTurno: number
  readonly totalConductores: number
  readonly distribucionModalidad: readonly ModalidadDistribution[]
}

export interface TopDriversResult {
  readonly topMejores: readonly CabifyDriver[]
  readonly topPeores: readonly CabifyDriver[]
}

// =====================================================
// TIPOS DE GRÁFICOS
// =====================================================

export interface ChartDataPoint {
  readonly name: string
  readonly value: number
  readonly fullName: string
}

// =====================================================
// TIPOS DE MENSAJES
// =====================================================

export type SwalIcon = 'success' | 'error' | 'warning' | 'info' | 'question'

export interface SourceMessage {
  readonly icon: SwalIcon
  readonly title: string
  readonly html: string
  readonly timer: number
}

export type SourceMessagesMap = Record<DataSource, SourceMessage>

// =====================================================
// TIPOS DE COMPONENTES
// =====================================================

export interface StatCardProps {
  readonly value: string | number
  readonly label: string
  readonly highlighted?: boolean
}

export interface TopDriverItemProps {
  readonly driver: CabifyDriver
  readonly rank: number
  readonly type: 'mejores' | 'peores'
  readonly patente: string
  readonly modalidad: string | null
}

export interface AccordionCardProps {
  readonly title: string
  readonly type: AccordionKey
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly children: React.ReactNode
}
