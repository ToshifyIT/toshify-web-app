import { supabase } from '../lib/supabase'
import type { FuelSummary, FuelFillup } from '../modules/vehiculos/control-combustible/types/combustible.types'

const SUMMARY_SELECT = `
  id, vehiculo_id, patente, geotab_device_id, periodo_dias,
  fecha_desde, fecha_hasta,
  distancia_km, combustible_litros, ralenti_litros, ralenti_pct,
  rendimiento_km_litro, energia_kwh, llenados_count, tiene_telemetria,
  nivel_actual_pct, nivel_actual_fecha,
  sede_id, synced_at,
  vehiculo:vehiculos(marca, modelo, gnc)
`

const FILLUP_SELECT = `
  id, geotab_fillup_id, vehiculo_id, patente, geotab_device_id,
  conductor_id, conductor_name, fecha_evento,
  volume_litros, derived_volume_litros,
  tank_nivel_min_pct, tank_nivel_max_pct, subida_pct,
  total_fuel_used_previo, odometro_metros, distance_previo_km,
  cost, currency_code, product_type, confidence,
  location_lat, location_lng, location_direccion, tank_capacity_litros,
  sede_id, synced_at
`

/**
 * Trae el resumen agregado por vehículo (último período).
 */
export async function fetchFuelSummary(sedeId?: string | null, periodoDias = 30): Promise<FuelSummary[]> {
  let q = supabase
    .from('geotab_fuel_summary')
    .select(SUMMARY_SELECT)
    .eq('periodo_dias', periodoDias)
    .order('combustible_litros', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as FuelSummary[]
}

/**
 * Trae los llenados detectados (FillUp) del vehículo o de toda la sede.
 */
export async function fetchFillups(opts: {
  sedeId?: string | null
  vehiculoId?: string | null
  desde?: Date
  hasta?: Date
}): Promise<FuelFillup[]> {
  let q = supabase
    .from('geotab_fillups')
    .select(FILLUP_SELECT)
    .order('fecha_evento', { ascending: false })
  if (opts.sedeId) q = q.eq('sede_id', opts.sedeId)
  if (opts.vehiculoId) q = q.eq('vehiculo_id', opts.vehiculoId)
  if (opts.desde) q = q.gte('fecha_evento', opts.desde.toISOString())
  if (opts.hasta) q = q.lte('fecha_evento', opts.hasta.toISOString())
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as FuelFillup[]
}
