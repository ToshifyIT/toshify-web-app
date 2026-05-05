import { supabase } from '../lib/supabase'
import type { AlertaMantenimiento, AlertaEstado } from '../modules/vehiculos/alertas-mantenimiento/types/alertas.types'

const SELECT = `
  id, geotab_fault_id, geotab_device_id, vehiculo_id, patente,
  fecha_evento, severidad, diagnostic_code, diagnostic_name, failure_mode,
  controller, count, lampara_red, lampara_amber, lampara_malfunction, lampara_protect,
  fault_description, effect_on_component, recommendation, source_address,
  estado, dismiss_user, dismiss_at, conductor_id, conductor_name, sede_id,
  created_at, updated_at, synced_at,
  vehiculo:vehiculos(marca, modelo, gnc)
`

export async function fetchAlertas(sedeId?: string | null): Promise<AlertaMantenimiento[]> {
  let q = supabase.from('geotab_fault_data').select(SELECT).order('fecha_evento', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as AlertaMantenimiento[]
}

export async function marcarAtendida(faultId: string, userName: string): Promise<void> {
  const { error } = await supabase
    .from('geotab_fault_data')
    .update({
      estado: 'atendida' satisfies AlertaEstado,
      dismiss_user: userName,
      dismiss_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', faultId)
  if (error) throw error
}

export async function descartarAlerta(faultId: string, userName: string): Promise<void> {
  const { error } = await supabase
    .from('geotab_fault_data')
    .update({
      estado: 'descartada' satisfies AlertaEstado,
      dismiss_user: userName,
      dismiss_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', faultId)
  if (error) throw error
}

export async function reactivarAlerta(faultId: string): Promise<void> {
  const { error } = await supabase
    .from('geotab_fault_data')
    .update({
      estado: 'activa' satisfies AlertaEstado,
      dismiss_user: null,
      dismiss_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', faultId)
  if (error) throw error
}
