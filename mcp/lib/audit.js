/**
 * Log de auditoria de la API REST publica.
 *
 * Escribe en la tabla `api_request_log`. Es fire-and-forget y traga cualquier
 * error a proposito: si la tabla todavia no existe o Supabase esta caido, la
 * request del tercero NO debe fallar por el log.
 *
 * El SQL de la tabla esta en sql/api_request_log_table.sql.
 */

import { supabaseRequest } from './supabase.js';

export function registrarRequest({ apiKeyData, req, status, filas }) {
  try {
    supabaseRequest('api_request_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        api_key_id: apiKeyData?.id ?? null,
        api_key_name: apiKeyData?.name ?? null,
        endpoint: req.originalUrl?.split('?')[0] ?? req.path,
        query: req.query ?? {},
        status,
        filas: filas ?? null,
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
      }),
    }).catch(() => {});
  } catch {
    // nunca romper la request por el log
  }
}
