// src/modules/integraciones/uss/types/uss.types.ts
/**
 * Tipos para el módulo USS (Excesos de Velocidad)
 */

export interface ExcesoVelocidad {
  id: string
  patente: string
  patente_normalizada: string
  vehiculo_id: string | null
  fecha_evento: string
  fecha_fin_evento: string | null
  localizacion: string
  latitud: number | null
  longitud: number | null
  velocidad_maxima: number
  limite_velocidad: number
  exceso: number
  duracion_segundos: number
  conductor_wialon: string | null
  conductor_id: string | null
  wialon_unit_id: number | null
  ibutton: string | null
  periodo_inicio: string
  periodo_fin: string
  created_at: string
}

export interface ExcesoStats {
  totalExcesos: number
  vehiculosUnicos: number
  conductoresUnicos: number
  velocidadPromedio: number
  velocidadMaxima: number
  excesoPromedio: number
  duracionPromedio: number
}

export interface VehiculoRanking {
  patente: string
  vehiculo_id: string | null
  totalExcesos: number
  velocidadMaxima: number
  excesoPromedio: number
  duracionTotal: number
}

export interface ConductorRanking {
  conductor: string
  conductor_id: string | null
  totalExcesos: number
  velocidadMaxima: number
  vehiculosUnicos: number
}

export interface DateRange {
  startDate: string
  endDate: string
  label: string
}

export interface USSQueryState {
  loading: boolean
  error: string | null
  lastUpdate: Date | null
}

export interface SyncStatus {
  lastSync: string | null
  recordsSynced: number
  status: 'success' | 'error' | 'pending'
}
