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
      `api_keys?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=id,name,permissions,expires_at`
    );
    const data = await res.json();
    if (!data.length) return null;

    // Vencimiento. expires_at en NULL significa "no vence": es el caso de las
    // keys creadas a mano desde la app (chatbot MCP, integraciones propias).
    // Solo caducan las de self-service, que se emiten con una ventana corta.
    if (data[0].expires_at && new Date(data[0].expires_at) <= new Date()) {
      return null;
    }

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
 * true si la key existe y esta activa, pero ya paso su vencimiento.
 *
 * Solo se consulta en el camino de error, para poder decirle al consumidor que
 * renueve en vez de dejarlo adivinando por que le dan 401. No agrega ninguna
 * consulta al camino feliz.
 */
async function estaVencida(apiKey) {
  try {
    const res = await supabaseRequest(
      `api_keys?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=expires_at`
    );
    const data = await res.json();
    return Boolean(
      data.length && data[0].expires_at && new Date(data[0].expires_at) <= new Date()
    );
  } catch {
    return false;
  }
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
      // Solo en el camino de error se hace esta consulta extra, para poder
      // decirle al consumidor que renueve en vez de dejarlo adivinando.
      if (await estaVencida(apiKey)) {
        return res.status(401).json({
          error: 'expired',
          message: 'La API key vencio. Pedí una nueva en GET /api/v1/keys con tu usuario y contraseña.',
        });
      }
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
