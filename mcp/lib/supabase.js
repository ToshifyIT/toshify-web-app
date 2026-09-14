/**
 * Cliente HTTP minimo contra PostgREST de Supabase usando la service_role key.
 *
 * Extraido de mcp/server.js para poder reutilizarlo tanto desde las herramientas
 * MCP como desde la API REST publica (mcp/routes/*). El comportamiento es el
 * mismo que tenia la funcion original: no se cambio nada.
 *
 * OJO: la service_role key bypasea RLS. Toda ruta que use esto tiene que
 * restringir por si misma que tabla y que columnas expone.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase error (${res.status}): ${body}`);
  }

  return res;
}
