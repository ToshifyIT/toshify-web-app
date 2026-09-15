/**
 * Obtencion de la API key por parte del consumidor externo.
 *
 *   GET /api/v1/keys  -> devuelve la API key del que llama, generandola si es
 *                        la primera vez
 *
 * Entrada: usuario y contrasena por HTTP Basic (tabla api_users). NO x-api-key:
 * la key es justamente lo que se obtiene aca.
 *
 * Por que GET y no POST: desde el lado del consumidor esto OBTIENE su key. Y es
 * idempotente de verdad: la primera llamada la genera, y todas las siguientes
 * devuelven exactamente la misma. Llamarlo dos veces no produce dos keys ni
 * invalida la que ya esta en uso, asi que se comporta como cualquier GET —
 * repetible, sin efectos acumulativos y seguro de reintentar.
 *
 * Las credenciales viajan en el header Authorization, nunca en la URL: un query
 * string queda escrito en los logs del proxy y en el historial del navegador.
 *
 * La key generada es SIEMPRE de solo lectura, con los permisos fijos de
 * PERMISOS_SELF_SERVICE. El consumidor no elige su alcance.
 *
 * Es el unico endpoint de la API publica que pide contrasena: tiene su propio
 * rate limit, mucho mas estricto que el de lectura de datos.
 */

import express from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { supabaseRequest } from '../lib/supabase.js';
import { requireApiUser, PERMISOS_SELF_SERVICE, MINUTOS_VIGENCIA } from '../lib/apiUsers.js';
import { registrarRequest } from '../lib/audit.js';

const router = express.Router();

/**
 * 10 por minuto por IP. De sobra para un uso legitimo (se obtiene la key una
 * vez y se guarda) y hace inviable probar contrasenas por fuerza bruta.
 */
const limiteAuth = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Demasiados intentos. Esperá un minuto.' },
});

router.get('/keys', limiteAuth, requireApiUser(), async (req, res) => {
  const auditar = (status, filas) => registrarRequest({
    apiKeyData: { id: null, name: `self-service:${req.apiUser.username}` },
    req, status, filas,
  });

  try {
    // 1) Si ya tiene una key activa, se devuelve esa. Es lo que hace que
    //    llamar al endpoint N veces sea equivalente a llamarlo una.
    // Solo se reutiliza una key que todavia este vigente. Si venció, se emite
    // una nueva: por eso el endpoint sigue siendo idempotente DENTRO de la
    // ventana de vigencia, que es la semantica que buscamos.
    const ahora = new Date().toISOString();
    const existentes = await supabaseRequest(
      `api_keys?api_user_id=eq.${req.apiUser.id}&is_active=eq.true` +
      `&expires_at=gt.${encodeURIComponent(ahora)}` +
      '&select=api_key,permissions,last_used_at,created_at,expires_at&order=created_at.desc&limit=1'
    ).then((r) => r.json());

    if (existentes.length) {
      auditar(200, 1);
      return res.json({ data: armarRespuesta(req.apiUser.username, existentes[0], false) });
    }

    // 2) No hay ninguna vigente (primera vez, o la anterior vencio): se emite.
    // Antes se desactivan las viejas para que no se acumulen filas muertas.
    await supabaseRequest(
      `api_keys?api_user_id=eq.${req.apiUser.id}&is_active=eq.true`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: false }) }
    ).catch(() => {});

    const apiKey = randomBytes(32).toString('hex');
    const vence = new Date(Date.now() + MINUTOS_VIGENCIA * 60 * 1000).toISOString();

    const creada = await supabaseRequest('api_keys', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: req.apiUser.username,
        api_key: apiKey,
        permissions: PERMISOS_SELF_SERVICE,
        api_user_id: req.apiUser.id,
        is_active: true,
        expires_at: vence,
      }),
    }).then((r) => r.json());

    auditar(200, 1);
    return res.json({
      data: armarRespuesta(req.apiUser.username, {
        api_key: apiKey,
        permissions: PERMISOS_SELF_SERVICE,
        created_at: creada[0]?.created_at,
        expires_at: vence,
        last_used_at: null,
      }, true),
    });
  } catch (error) {
    console.error('[API/keys] Error:', error.message);
    auditar(500, 0);
    return res.status(500).json({ error: 'internal_error', message: 'Error obteniendo la API key' });
  }
});

function armarRespuesta(usuario, k, recienGenerada) {
  const restanMs = new Date(k.expires_at).getTime() - Date.now();
  return {
    usuario,
    api_key: k.api_key,
    permisos: k.permissions,
    solo_lectura: true,
    generada_ahora: recienGenerada,
    creada: k.created_at,
    vence: k.expires_at,
    vigencia_minutos: MINUTOS_VIGENCIA,
    minutos_restantes: Math.max(0, Math.round(restanMs / 60000)),
    ultimo_uso: k.last_used_at,
    uso: 'Enviá esta key en el header x-api-key en cada request a /api/v1/*',
    renovacion: 'Cuando venza, volvé a llamar a este mismo endpoint para obtener una nueva.',
  };
}

export default router;
