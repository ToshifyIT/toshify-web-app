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

/** Semana elegida en el selector ('YYYY-MM-DD', lunes a domingo, hora Argentina). */
export interface RangoSemana {
  desde: string
  hasta: string
}

/**
 * Fila de la tabla: resumen de 30 días (ralentí, nivel, telemetría) + métricas de
 * la semana elegida + estado del vehículo y conductores a cargo hoy.
 *
 * Por semana:
 *  - km_semana: geotab_bitacora (km por turno), exacto.
 *  - llenados / litros cargados: geotab_fillups, exacto.
 *  - consumo / rendimiento: suma de los tramos entre cargas (combustible usado y km
 *    desde la carga anterior que Geotab guarda en cada llenado). Aproximado: el
 *    tramo se imputa a la semana en que se hizo la carga.
 */
export interface FuelRow extends FuelSummary {
  km_semana: number | null
  llenados_semana: number
  litros_cargados_semana: number
  consumo_semana: number | null
  km_tramos_semana: number            // km de los tramos con km y litros (para el rendimiento)
  litros_tramos_semana: number        // litros de esos mismos tramos
  rendimiento_semana: number | null
  estado_vehiculo: string | null
  estado_vehiculo_codigo: string | null
  a_cargo: string[]
}

export interface CombustibleStats {
  combustibleSemana: number     // litros consumidos en la semana (tramos entre cargas)
  distanciaSemana: number       // km recorridos en la semana
  rendimientoSemana: number     // km/L de la semana (km de tramos / litros de tramos)
  ralentiTotal: number          // litros en ralentí, últimos 30 días
  ralentiPct: number            // % del consumo de 30 días
  llenadosSemana: number        // cargas detectadas en la semana
  litrosCargadosSemana: number  // litros cargados en la semana
  vehiculosTotal: number        // filas consideradas
}

/** Conductor que tenía el vehículo al momento de una carga. */
export interface ConductorEnCarga {
  nombre: string
  fuente: 'gps' | 'asignacion' | 'compartido' | 'geotab' | 'sin_dato'
}
