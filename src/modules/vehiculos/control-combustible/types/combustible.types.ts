// Tipos para el modulo Control de Combustible

export interface CargaCombustible {
  id: string
  geotab_transaction_id: string
  geotab_device_id: string | null
  vehiculo_id: string | null
  patente: string | null
  fecha_evento: string
  producto: string | null
  volumen_litros: number | null
  costo: number | null
  moneda: string | null
  estacion_nombre: string | null
  estacion_lat: number | null
  estacion_lng: number | null
  conductor_geotab_id: string | null
  conductor_id: string | null
  conductor_name: string | null
  odometro_metros: number | null
  km_por_litro: number | null
  alerta_consumo_anormal: boolean
  sede_id: string | null
  created_at: string
  updated_at: string
  synced_at: string
  vehiculo?: {
    marca?: string | null
    modelo?: string | null
  } | null
}

export interface CombustibleStats {
  litros: number
  gasto: number
  kmLPromedio: number
  cargas: number
  topConsumoNombre: string | null
  topConsumoVariacion: number | null
}
