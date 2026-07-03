import { supabase } from '../lib/supabase'
import type { AlertaMantenimiento, AlertaEstado } from '../modules/vehiculos/alertas-mantenimiento/types/alertas.types'

// Select liviano para el listado: solo lo que usan la tabla y las stats.
// Los campos pesados (fault_description, recommendation, lámparas, etc.)
// se cargan on-demand con fetchAlertaDetalle al abrir el drawer.
const SELECT_LISTA = `
  id, patente, vehiculo_id, fecha_evento, severidad, diagnostic_name,
  count, estado, dismiss_at, sede_id,
  vehiculo:vehiculos(marca, modelo, gnc, kilometraje_actual)
`

const SELECT_DETALLE = `
  id, geotab_fault_id, geotab_device_id, vehiculo_id, patente,
  fecha_evento, severidad, diagnostic_code, diagnostic_name, failure_mode,
  controller, count, lampara_red, lampara_amber, lampara_malfunction, lampara_protect,
  fault_description, effect_on_component, recommendation, source_address,
  estado, dismiss_user, dismiss_at, conductor_id, conductor_name, sede_id,
  created_at, updated_at, synced_at,
  vehiculo:vehiculos(marca, modelo, gnc, kilometraje_actual)
`

/**
 * Trae una página del listado de alertas (select liviano).
 * `from`/`to` son índices inclusive estilo .range() de PostgREST.
 * Orden estable (fecha desc + id) para que la paginación no duplique/saltee filas.
 */
export async function fetchAlertasPage(
  sedeId: string | null | undefined,
  from: number,
  to: number,
): Promise<AlertaMantenimiento[]> {
  let q = supabase
    .from('geotab_fault_data')
    .select(SELECT_LISTA)
    .order('fecha_evento', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to)
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as AlertaMantenimiento[]
}

/** Trae una alerta completa (para el drawer de detalle). */
export async function fetchAlertaDetalle(id: string): Promise<AlertaMantenimiento> {
  const { data, error } = await supabase
    .from('geotab_fault_data')
    .select(SELECT_DETALLE)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as AlertaMantenimiento
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
