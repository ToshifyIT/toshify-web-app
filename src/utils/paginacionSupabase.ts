// src/utils/paginacionSupabase.ts
//
// Traer TODAS las filas de una consulta de Supabase, por páginas.
// Usado por Leads y Distribución en mapa.

/**
 * Supabase corta cada respuesta en "Max rows" (1000 por defecto) SIN avisar:
 * con más filas, la consulta devuelve sólo las primeras y no da error. Se usa en
 * las tablas que ya pasan ese número (leads, conductores).
 *
 * `pedir(desde, hasta, contar)` arma la consulta con `.range(desde, hasta)` y,
 * si `contar`, con `{ count: 'exact' }` en el select. La consulta tiene que
 * tener un orden estable (con desempate por id) para no saltear ni repetir.
 *
 * La primera página trae el total; el resto se pide en paralelo usando como
 * paso lo que el servidor devolvió de verdad (si su tope es menor que PAGINA,
 * no se pierde nada). Si el total no viniera, se sigue página a página hasta
 * una vacía. Se deduplica por id por si entra un registro mientras se pagina.
 */
const PAGINA = 1000
const MAX_FILAS = 100000 // freno de seguridad

export interface RespuestaPagina<T> {
  data: T[] | null
  error: { message?: string } | null
  count?: number | null
}

export async function traerTodasLasPaginas<T extends { id: string }>(
  pedir: (desde: number, hasta: number, contar: boolean) => PromiseLike<RespuestaPagina<T>>
): Promise<{ data: T[]; error: RespuestaPagina<T>['error'] }> {
  const primera = await pedir(0, PAGINA - 1, true)
  if (primera.error) return { data: [], error: primera.error }

  const filas: T[] = [...(primera.data || [])]
  const paso = filas.length

  if (paso > 0 && primera.count != null) {
    // Con total: el resto de las páginas en paralelo.
    const total = Math.min(primera.count, MAX_FILAS)
    const desdes: number[] = []
    for (let d = paso; d < total; d += paso) desdes.push(d)
    const resto = await Promise.all(desdes.map((d) => pedir(d, d + paso - 1, false)))
    for (const r of resto) {
      if (r.error) return { data: [], error: r.error }
      filas.push(...(r.data || []))
    }
  } else if (paso > 0) {
    // Sin total: página a página hasta que una venga vacía.
    let desde = paso
    while (desde < MAX_FILAS) {
      const r = await pedir(desde, desde + PAGINA - 1, false)
      if (r.error) return { data: [], error: r.error }
      const data = r.data || []
      if (data.length === 0) break
      filas.push(...data)
      desde += data.length
    }
  }

  const vistos = new Set<string>()
  return {
    data: filas.filter((f) => (vistos.has(f.id) ? false : (vistos.add(f.id), true))),
    error: null,
  }
}
