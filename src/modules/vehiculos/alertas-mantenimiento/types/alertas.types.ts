// Tipos para el modulo Alertas de Mantenimiento

export type AlertaSeveridad = 'Critical' | 'High' | 'Medium' | 'Low'
export type AlertaEstado = 'activa' | 'atendida' | 'descartada'

export interface AlertaMantenimiento {
  // Campos del select liviano del listado (siempre presentes)
  id: string
  vehiculo_id: string | null
  patente: string | null
  fecha_evento: string
  severidad: AlertaSeveridad
  diagnostic_name: string | null
  count: number
  estado: AlertaEstado
  dismiss_at: string | null
  sede_id: string | null
  // Campos pesados: solo llegan con fetchAlertaDetalle (drawer)
  geotab_fault_id?: string
  geotab_device_id?: string | null
  diagnostic_code?: string | null
  failure_mode?: string | null
  controller?: string | null
  lampara_red?: boolean
  lampara_amber?: boolean
  lampara_malfunction?: boolean
  lampara_protect?: boolean
  fault_description?: string | null
  effect_on_component?: string | null
  recommendation?: string | null
  source_address?: string | null
  dismiss_user?: string | null
  conductor_id?: string | null
  conductor_name?: string | null
  created_at?: string
  updated_at?: string
  synced_at?: string
  // Joinables (vehiculos)
  vehiculo?: {
    marca?: string | null
    modelo?: string | null
    gnc?: boolean | null
    kilometraje_actual?: number | null
  } | null
}

/**
 * Estado consolidado del vehículo según km recorridos vs próximo service.
 * Calculado en runtime, no se persiste.
 */
export type EstadoMantenimientoVehiculo =
  | 'al_dia'         // < 80% del intervalo
  | 'proximo'        // 80% - 100%
  | 'vencido'        // > 100%
  | 'manejo_riesgoso' // tiene faults críticos o muchos eventos
  | 'sin_datos'      // sin odómetro

export interface AlertasStats {
  vehiculosConAlerta: number
  criticas: number
  medias: number
  atendidasSemana: number
  kmFlotaAcumulados: number  // suma de kilometraje_actual de la flota
}

export interface AlertasFiltros {
  severidad?: AlertaSeveridad | null
  soloActivas?: boolean
  search?: string
}
