import { supabase } from '../../lib/supabase';

/** Resultado de POST /api/bcra/consultar/:id (server-bcra.js). */
export type EstadoConsultaBcra =
  | 'ok'
  | 'invalido'
  | 'reintentar'
  | 'limite'
  | 'en_curso'
  | 'ya_consultado'
  | 'sin_documento';

/**
 * Pide al servidor que consulte el lead en el BCRA ahora, sin esperar la vuelta de
 * 5 minutos. El servidor solo lo consulta si está pendiente (lead nuevo, o el trigger
 * lo dejó pendiente al cambiar el DNI o el CUIT). Si algo falla devuelve null y el
 * lead lo toma la vuelta automática, así que el error no se le muestra al usuario.
 */
export async function pedirConsultaBcra(leadId: string): Promise<EstadoConsultaBcra | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`/api/bcra/consultar/${leadId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { estado?: EstadoConsultaBcra };
    return body.estado ?? null;
  } catch (error) {
    console.error('Consulta BCRA al instante falló:', error);
    return null;
  }
}

/** Si el guardado deja el lead con DNI o CUIT nuevo o cambiado (o corrige el nombre). */
export function cambioDatosBcra(
  campos: Record<string, unknown>,
  anterior: { dni?: string | null; cuit?: string | null; nombre_completo?: string | null } | null,
): boolean {
  const valor = (v: unknown) => String(v ?? '').trim();
  const tieneDocumento = valor(campos.dni) !== '' || valor(campos.cuit) !== '';
  if (!tieneDocumento) return false;
  if (!anterior) return true;
  return (
    valor(campos.dni) !== valor(anterior.dni) ||
    valor(campos.cuit) !== valor(anterior.cuit) ||
    valor(campos.nombre_completo) !== valor(anterior.nombre_completo)
  );
}
