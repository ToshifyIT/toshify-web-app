// Tipos para el módulo Control de Combustible

/**
 * Resumen agregado por vehículo (1 fila por device + período).
 * Alimentado por sync-geotab-fuel-summary.ts desde Geotab FuelAndEnergyUsed + Trip + FillUp.
 */
export interface FuelSummary {
  id: string
  vehiculo_id: string | null
  patente: string
  geotab_device_id: string
  periodo_dias: number
  fecha_desde: string
  fecha_hasta: string
  distancia_km: number
  combustible_litros: number
  ralenti_litros: number
  ralenti_pct: number
  rendimiento_km_litro: number
  energia_kwh: number
  llenados_count: number
  tiene_telemetria: boolean
  nivel_actual_pct: number | null      // último % del tanque reportado
  nivel_actual_fecha: string | null    // timestamp de esa lectura
  sede_id: string | null
  synced_at: string
  vehiculo?: {
    marca?: string | null
    modelo?: string | null
    gnc?: boolean | null
  } | null
}

/**
 * Llenado detectado por Geotab (FillUp).
 * Alimentado por sync-geotab-fuel-summary.ts desde Geotab FillUp.
 */
export interface FuelFillup {
  id: string
  geotab_fillup_id: string
  vehiculo_id: string | null
  patente: string | null
  geotab_device_id: string
  conductor_id: string | null
  conductor_name: string | null
  fecha_evento: string
  volume_litros: number | null
  derived_volume_litros: number | null
  tank_nivel_min_pct: number | null
  tank_nivel_max_pct: number | null
  subida_pct: number | null
  total_fuel_used_previo: number | null
  odometro_metros: number | null
  distance_previo_km: number | null
  cost: number | null
  currency_code: string | null
  product_type: string | null
  confidence: string | null
  location_lat: number | null
  location_lng: number | null
  location_direccion: string | null
  tank_capacity_litros: number | null
  sede_id: string | null
  synced_at: string
}

export interface CombustibleStats {
  combustibleTotal: number      // litros consumidos por toda la flota
  distanciaTotal: number         // km recorridos por la flota
  rendimientoPromedio: number   // km/L promedio entre vehículos con data
  ralentiTotal: number          // litros perdidos en ralentí
  ralentiPct: number            // % del total
  llenadosTotal: number         // cantidad de FillUps detectados
  vehiculosConData: number      // cuántos autos tienen telemetría
  vehiculosTotal: number        // total en la tabla
}
