/**
 * Autenticacion por API key.
 *
 * Extraido de mcp/server.js sin cambios de comportamiento (validateApiKey y
 * hasPermission son identicas a las originales) y ampliado con un middleware
 * de Express para las rutas REST.
 *
 * Las keys viven en la tabla `api_keys` (RLS activo: solo service_role y
 * usuarios autenticados). Se administran desde la app en
 * Administracion > Integraciones.
 */

import { supabaseRequest } from './supabase.js';

/**
 * Busca una API key activa y devuelve sus datos, o null si no existe / esta
 * desactivada. Actualiza last_used_at en fire-and-forget.
 */
export async function validateApiKey(apiKey) {
  if (!apiKey) return null;

  try {
    const res = await supabaseRequest(
      `api_keys?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=id,name,permissions`
    );
    const data = await res.json();
    if (!data.length) return null;

    // Update last_used_at
    supabaseRequest(`api_keys?id=eq.${data[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {}); // fire and forget

    return data[0];
  } catch {
    return null;
  }
}

export function hasPermission(apiKeyData, permission) {
  if (!apiKeyData?.permissions) return false;
  return apiKeyData.permissions.includes(permission);
}

/**
 * Middleware de Express para las rutas REST.
 *
 * A diferencia de /sse, NO acepta la key por query param: los query strings
 * quedan escritos en los logs de acceso del proxy. Solo header x-api-key.
 *
 * Deja los datos de la key en req.apiKeyData para el log de auditoria.
 */
export function requireApiKey(permission) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Falta el header x-api-key',
      });
    }

    const apiKeyData = await validateApiKey(apiKey);

    if (!apiKeyData) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'API key invalida o inactiva',
      });
    }

    if (!hasPermission(apiKeyData, permission)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `La API key no tiene el permiso requerido: ${permission}`,
      });
    }

    req.apiKeyData = apiKeyData;
    next();
  };
}
