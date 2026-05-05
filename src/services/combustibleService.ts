import { supabase } from '../lib/supabase'
import type { CargaCombustible } from '../modules/vehiculos/control-combustible/types/combustible.types'

const SELECT = `
  id, geotab_transaction_id, geotab_device_id, vehiculo_id, patente,
  fecha_evento, producto, volumen_litros, costo, moneda,
  estacion_nombre, estacion_lat, estacion_lng,
  conductor_geotab_id, conductor_id, conductor_name,
  odometro_metros, km_por_litro, alerta_consumo_anormal, sede_id,
  created_at, updated_at, synced_at,
  vehiculo:vehiculos(marca, modelo)
`

export async function fetchCargas(
  sedeId?: string | null,
  desde?: Date,
  hasta?: Date
): Promise<CargaCombustible[]> {
  let q = supabase.from('geotab_fuel_transactions').select(SELECT).order('fecha_evento', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  if (desde) q = q.gte('fecha_evento', desde.toISOString())
  if (hasta) q = q.lte('fecha_evento', hasta.toISOString())
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as CargaCombustible[]
}
