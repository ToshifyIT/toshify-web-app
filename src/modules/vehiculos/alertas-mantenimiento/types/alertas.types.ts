// Tipos para el modulo Alertas de Mantenimiento

export type AlertaSeveridad = 'Critical' | 'High' | 'Medium' | 'Low'
export type AlertaEstado = 'activa' | 'atendida' | 'descartada'

export interface AlertaMantenimiento {
  id: string
  geotab_fault_id: string
  geotab_device_id: string | null
  vehiculo_id: string | null
  patente: string | null
  fecha_evento: string
  severidad: AlertaSeveridad
  diagnostic_code: string | null
  diagnostic_name: string | null
  failure_mode: string | null
  controller: string | null
  count: number
  lampara_red: boolean
  lampara_amber: boolean
  lampara_malfunction: boolean
  lampara_protect: boolean
  fault_description: string | null
  effect_on_component: string | null
  recommendation: string | null
  source_address: string | null
  estado: AlertaEstado
  dismiss_user: string | null
  dismiss_at: string | null
  conductor_id: string | null
  conductor_name: string | null
  sede_id: string | null
  created_at: string
  updated_at: string
  synced_at: string
  // Joinables (vehiculos)
  vehiculo?: {
    marca?: string | null
    modelo?: string | null
    gnc?: boolean | null
  } | null
}

export interface AlertasStats {
  vehiculosConAlerta: number
  criticas: number
  medias: number
  atendidasSemana: number
}

export interface AlertasFiltros {
  severidad?: AlertaSeveridad | null
  soloActivas?: boolean
  search?: string
}
