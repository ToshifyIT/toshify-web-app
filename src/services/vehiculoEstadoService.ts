import { supabase } from '../lib/supabase';

/**
 * Cambia el estado de un vehículo dejando el motivo en el historial de estados
 * (sql/vehiculos_estado_historial.sql: el trigger lo toma de motivo_cambio_estado).
 *
 * Si la columna todavía no existe (SQL sin correr), reintenta sin el motivo para
 * no frenar la operación.
 */
export async function actualizarEstadoVehiculo(
  vehiculoId: string,
  estadoId: string,
  motivo: string,
  extra: Record<string, unknown> = {},
): Promise<{ error: { message?: string } | null }> {
  const base = { estado_id: estadoId, ...extra };
  const tabla = () => supabase.from('vehiculos') as any;

  const { error } = await tabla()
    .update({ ...base, motivo_cambio_estado: motivo })
    .eq('id', vehiculoId);
  if (error && esFaltaColumnaMotivo(error)) {
    const { error: error2 } = await tabla().update(base).eq('id', vehiculoId);
    return { error: error2 };
  }
  return { error };
}

/** true si el error es porque la columna motivo_cambio_estado no existe todavía. */
export function esFaltaColumnaMotivo(error: { message?: string } | null): boolean {
  return !!error && /motivo_cambio_estado/.test(error.message || '');
}
