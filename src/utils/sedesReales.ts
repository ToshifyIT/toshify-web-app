import { supabase } from '../lib/supabase';

/**
 * Ids de las sedes reales (activas y que no son solo_admin, o sea sin "Pruebas").
 * Es el mismo criterio que usa aplicarFiltroSede del SedeContext con "Todas las sedes",
 * para los servicios que reciben solo un sedeId (null = todas).
 * Se pide una vez por sesión de la página.
 */
let cache: Promise<string[]> | null = null;

export function idsSedesReales(): Promise<string[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await (supabase.from('sedes') as any).select('*').eq('activa', true);
      if (error) throw error;
      return ((data || []) as Array<{ id: string; solo_admin?: boolean | null }>)
        .filter((s) => !s.solo_admin)
        .map((s) => s.id);
    })();
    cache.catch(() => { cache = null; });
  }
  return cache;
}

/**
 * Filtro de sede para servicios que reciben un sedeId:
 * con sede elegida, esa sede; con "Todas" (null), solo las sedes reales.
 * `reales` sale de idsSedesReales() (se pide antes porque los builders son síncronos).
 */
export function filtrarSede<T>(query: T, sedeId: string | null | undefined, reales: string[] | null, campo = 'sede_id'): T {
  if (sedeId) return (query as any).eq(campo, sedeId);
  if (reales && reales.length > 0) return (query as any).in(campo, reales);
  return query;
}

/** Ids de sedes reales solo si hacen falta (sin sede elegida). Si falla, no filtra. */
export async function realesSiTodas(sedeId: string | null | undefined): Promise<string[] | null> {
  if (sedeId) return null;
  try {
    return await idsSedesReales();
  } catch (err) {
    console.error('No se pudieron leer las sedes reales:', err);
    return null;
  }
}
