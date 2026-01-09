// src/types/cabify.types.ts

/**
 * Tipos para la integración con Cabify API
 */

// Datos del conductor desde Cabify API
export interface CabifyDriver {
  conductor: string // Nombre completo
  email: string
  dni: string
  patente: string
  viajesFinalizados: number
  tasaAceptacion: number
  horasConectadas: number
  horasConectadasFormato?: string
  porcentajeOcupado: number
  score: number
  gananciaPorHora: number
  cobroEfectivo: number
  cobroApp: number
  peajes: number
  gananciaTotal: number
  permisoEfectivo: string
}

// Datos enriquecidos con información de la BD
export interface CabifyDriverEnriched extends CabifyDriver {
  // Datos del conductor desde BD
  conductor_id?: string
  numero_licencia?: string
  telefono_contacto?: string

  // Datos del vehículo desde BD
  vehiculo_id?: string
  vehiculo?: string
  marca?: string
  modelo?: string

  // Datos de asignación desde BD
  modalidad?: 'Turno' | 'A cargo' | 'Sin asignación'
  estado_asignacion?: string
  fecha_inicio_asignacion?: string

  // Cálculos de alquiler
  montoAlquiler: number
  saldoFaltante: number
  cubreAlquiler: boolean
}

// Configuración de Cabify
export interface CabifyConfig {
  username: string
  password: string
  clientId: string
  clientSecret: string
  companyId: string
  authUrl: string
  graphqlUrl: string
}

// Respuesta de autenticación OAuth
export interface CabifyAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

// Período de consulta
export type CabifyPeriod = 'semana' | 'ayer' | 'semana_actual' | 'custom'

// Rango de fechas personalizado
export interface CabifyDateRange {
  startDate: string // ISO string
  endDate: string // ISO string
  label?: string // Etiqueta para mostrar (ej: "Semana 48 - 2024")
}

// Estado de la consulta
export interface CabifyQueryState {
  loading: boolean
  error: string | null
  lastUpdate: Date | null
  period: CabifyPeriod
}

// Métricas agregadas del dashboard
export interface CabifyMetrics {
  totalEarnings: number
  totalDrivers: number
  totalTrips: number
  totalHours: number
  driversCompliant: number
  driversNonCompliant: number
  percentageCompliant: number
  percentageNonCompliant: number
}

// Información del vehículo (Asset)
export interface CabifyAsset {
  id: string
  make?: string // Marca
  model?: string // Modelo
  regPlate?: string // Patente
  year?: number
  color?: string
}

// Preferencia del conductor
export interface CabifyPreference {
  name: string
  enabled: boolean
}

// Estadísticas del conductor
export interface CabifyDriverStats {
  accepted: number // Viajes aceptados
  missed: number // Viajes perdidos
  offered: number // Viajes ofrecidos
  assigned: number // Segundos asignados (en viaje)
  available: number // Segundos disponibles (esperando viaje)
  connected?: number // Segundos conectados totales
  assignedJourneys?: number // Cantidad de viajes asignados
  dropOffs?: number // Viajes finalizados
  rejected?: number // Viajes rechazados
  score?: number // Puntuación
  assignedDistance?: number
  availableDistance?: number
  connectionDistance?: number
}

// Breakdown de ganancias del viaje
export interface CabifyEarningBreakdown {
  cash?: { amount: number; currency?: string }
  credit?: { amount: number; currency?: string }
  toll?: { amount: number; currency?: string }
}

// Totales de un viaje
export interface CabifyJourneyTotals {
  earningsTotal?: { amount: number; currency?: string }
  driverEarnings?: { amount: number; currency?: string }
  driverEarningBreakdown?: CabifyEarningBreakdown
  distance?: number
}

// Viaje (Journey)
export interface CabifyJourney {
  id: string
  assetId?: string
  driverId?: string
  finishReason?: string
  paymentMethod?: 'cash' | 'app' | string
  totals?: CabifyJourneyTotals
  startedAt?: string
  finishedAt?: string
}

// Balance
export interface CabifyBalance {
  id: string
  name: string
  currency: string
}

// Movimiento de balance
export interface CabifyBalanceMovement {
  id: string
  amount: number
  currency: string
  description?: string
  type?: string
  createdAt?: string
}
