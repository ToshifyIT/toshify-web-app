// src/modules/integraciones/uss/bitacora/types/bitacora.types.ts
/**
 * Tipos para el módulo de Bitácora Wialon
 */

export interface BitacoraRegistro {
  id: string
  patente: string
  patente_normalizada: string
  vehiculo_id: string | null
  ibutton: string | null
  conductor_wialon: string | null
  conductor_id: string | null
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  duracion_minutos: number | null
  kilometraje: number
  gnc_cargado: boolean
  lavado_realizado: boolean
  nafta_cargada: boolean
  estado: string
  observaciones: string | null
  wialon_unit_id: number | null
  wialon_report_id: number | null
  periodo_inicio: string | null
  periodo_fin: string | null
  created_at: string
  updated_at: string
  synced_at: string
}

export interface BitacoraStats {
  totalTurnos: number
  vehiculosUnicos: number
  conductoresUnicos: number
  kilometrajeTotal: number
  kilometrajePromedio: number
  turnosFinalizados: number
  turnosPocaKm: number
  turnosEnCurso: number
  conGnc: number
  conLavado: number
  conNafta: number
}

export interface BitacoraQueryOptions {
  limit?: number
  offset?: number
  patente?: string
  conductor?: string
  estado?: string
}

export interface BitacoraDateRange {
  startDate: string
  endDate: string
  label: string
}

export interface BitacoraQueryState {
  loading: boolean
  error: string | null
  lastUpdate: Date | null
}

export interface SyncStatus {
  lastSync: string | null
  totalRecords: number
  status: 'success' | 'failed' | 'running' | 'unknown'
}

export type EstadoTurno = 'Turno Finalizado' | 'Poco Km' | 'En Curso' | 'Pendiente'

export const ESTADOS_TURNO: EstadoTurno[] = [
  'Turno Finalizado',
  'Poco Km',
  'En Curso',
  'Pendiente',
]
