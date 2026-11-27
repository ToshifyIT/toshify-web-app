/**
 * Login por persona (OAuth 2.1) para el conector de Claude.
 *
 * El MCP hace de servidor de autorización y de recurso, como pide la especificación de
 * autorización de MCP:
 *   GET  /.well-known/oauth-protected-resource   dónde pedir permiso para usar /mcp
 *   GET  /.well-known/oauth-authorization-server cómo pedirlo (endpoints y métodos)
 *   POST /oauth/register   Claude se registra solo como cliente (registro dinámico)
 *   GET  /oauth/authorize  pantalla de login con la cuenta de Toshibase (Google o correo)
 *   POST /oauth/authorize  la pantalla confirma la sesión de Supabase -> código de un uso
 *   POST /oauth/token      código (con PKCE) o renovación -> permiso de acceso
 *
 * La persona inicia sesión contra el mismo Supabase Auth que Toshibase, así que usa la
 * misma cuenta. Solo entran perfiles activos. El permiso de acceso dura 1 hora y se
 * renueva solo (30 días); en cada pedido se vuelve a verificar que la persona siga activa
 * y qué pantallas ve (lib/accesoUsuario.js), así que desactivarla o sacarle una pantalla
 * en Toshibase rige enseguida.
 *
 * Códigos y tokens se guardan como hash (sql/mcp_oauth.sql).
 */

import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { supabaseRequest } from './supabase.js';
import { perfilActivo, permisosDeUsuario } from './accesoUsuario.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCOPE = 'toshify';
const SEGUNDOS_ACCESO = 60 * 60;
const SEGUNDOS_RENOVACION = 30 * 24 * 60 * 60;
const SEGUNDOS_CODIGO = 5 * 60;
const PREFIJO_ACCESO = 'tsh_at_';
const PREFIJO_RENOVACION = 'tsh_rt_';

/**
 * Adónde puede volver el login: Claude (web y escritorio) y clientes locales (Claude
 * Code, inspector de MCP). Se pueden sumar hosts con MCP_OAUTH_REDIRECT_HOSTS
 * (separados por coma). Evita que otra aplicación use este login para llevarse un token.
 */
const HOSTS_REDIRECT = ['claude.ai', 'claude.com',
  ...String(process.env.MCP_OAUTH_REDIRECT_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean)];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const aleatorio = (prefijo = '') => prefijo + randomBytes(32).toString('base64url');

/** URL pública del MCP (detrás del proxy). MCP_PUBLIC_URL manda si está definida. */
export function urlBase(req) {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Header que le indica a Claude dónde iniciar el login cuando /mcp responde 401. */
export function headerLogin(req, error) {
  const extra = error ? `, error="${error}"` : '';
  return `Bearer resource_metadata="${urlBase(req)}/.well-known/oauth-protected-resource"${extra}`;
}

function redirectPermitido(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:') return false;
  return HOSTS_REDIRECT.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

function errorOAuth(res, status, error, descripcion) {
  res.set('Cache-Control', 'no-store');
  return res.status(status).json({ error, error_description: descripcion });
}

async function filas(path, opciones) {
  return (await supabaseRequest(path, opciones)).json();
}

async function cliente(clientId) {
  if (!clientId || typeof clientId !== 'string') return null;
  const [c] = await filas(`mcp_oauth_clientes?client_id=eq.${encodeURIComponent(clientId)}&select=client_id,client_name,redirect_uris`);
  return c || null;
}

/** Valida los parámetros de /oauth/authorize. Devuelve { cliente } o { error }. */
async function validarPedido(p) {
  if (p.response_type !== 'code') return { error: 'response_type tiene que ser "code".' };
  if (!p.code_challenge || p.code_challenge_method !== 'S256') return { error: 'Falta PKCE (code_challenge con método S256).' };
  const c = await cliente(p.client_id);
  if (!c) return { error: 'La aplicación no está registrada. Quitá el conector y volvé a agregarlo.' };
  if (!p.redirect_uri || !c.redirect_uris.includes(p.redirect_uri)) return { error: 'La dirección de retorno no coincide con la registrada.' };
  return { cliente: c };
}

/** Usuario de Supabase Auth a partir del token de sesión que manda la pantalla de login. */
async function usuarioDeSesion(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email } : null;
}

async function emitirTokens({ clientId, userId, email, scope }) {
  const acceso = aleatorio(PREFIJO_ACCESO);
  const renovacion = aleatorio(PREFIJO_RENOVACION);
  const ahora = Date.now();
  await supabaseRequest('mcp_oauth_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([
      { token_hash: sha256(acceso), tipo: 'access', client_id: clientId, user_id: userId, user_email: email, scope,
        expires_at: new Date(ahora + SEGUNDOS_ACCESO * 1000).toISOString() },
      { token_hash: sha256(renovacion), tipo: 'refresh', client_id: clientId, user_id: userId, user_email: email, scope,
        expires_at: new Date(ahora + SEGUNDOS_RENOVACION * 1000).toISOString() },
    ]),
  });
  return {
    access_token: acceso,
    token_type: 'Bearer',
    expires_in: SEGUNDOS_ACCESO,
    refresh_token: renovacion,
    scope,
  };
}

// ---------------------------------------------------------------------------
// Validación del permiso de acceso en /mcp
// ---------------------------------------------------------------------------

export function esTokenOAuth(token) {
  return typeof token === 'string' && token.startsWith(PREFIJO_ACCESO);
}

/**
 * Datos de acceso para un token OAuth junto con la API key del conector (la de la URL),
 * con la misma forma que una API key ({ id, name, permissions }) más `usuario`. null si
 * el token no sirve o la persona ya no tiene acceso.
 */
export async function validarTokenOAuth(token, keyData) {
  if (!esTokenOAuth(token)) return null;
  try {
    const ahora = new Date().toISOString();
    const [t] = await filas(
      `mcp_oauth_tokens?token_hash=eq.${sha256(token)}&tipo=eq.access&revocado_at=is.null` +
      `&expires_at=gt.${encodeURIComponent(ahora)}&select=user_id,client_id`
    );
    if (!t) return null;
    // Lo que ve la persona: los módulos de la key del conector que su usuario también tiene
    const acceso = await permisosDeUsuario(t.user_id, keyData?.permisosKey || []);
    if (!acceso) return null;
    return {
      id: keyData?.id ?? null,
      name: `usuario:${acceso.usuario.email}${keyData ? ` (key ${keyData.name})` : ''}`,
      permissions: acceso.permisos,
      usuario: acceso.usuario,
    };
  } catch (error) {
    console.error('[MCP OAuth] Error validando token:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pantalla de login
// ---------------------------------------------------------------------------

const escaparHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** JSON seguro dentro de <script>: sin </script> ni caracteres que lo corten. */
const jsonEnScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function paginaError(mensaje) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Toshify MCP</title><style>body{font-family:system-ui,sans-serif;background:#f9fafb;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.c{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;max-width:420px}h1{font-size:18px;margin:0 0 8px}p{color:#4b5563;font-size:14px;line-height:1.5}</style></head>
<body><div class="c"><h1>No se pudo iniciar sesión</h1><p>${escaparHtml(mensaje)}</p></div></body></html>`;
}

function paginaLogin({ pedido, cliente: c }) {
  const config = { supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, pedido };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Toshify · Conectar con Claude</title>
<style>
  :root { --rojo:#ff0033; --texto:#111827; --gris:#4b5563; --borde:#e5e7eb; --fondo:#f9fafb; --tarjeta:#fff; }
  @media (prefers-color-scheme: dark) { :root { --texto:#f3f4f6; --gris:#9ca3af; --borde:#374151; --fondo:#111827; --tarjeta:#1f2937; } }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--fondo); color: var(--texto);
    display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 16px; }
  .c { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 12px; padding: 28px; width: 100%; max-width: 400px; }
  h1 { font-size: 20px; margin: 0 0 6px; } h1 span { color: var(--rojo); }
  p { color: var(--gris); font-size: 14px; line-height: 1.5; margin: 0 0 18px; }
  label { display: block; font-size: 12px; font-weight: 600; color: var(--gris); margin: 12px 0 4px; }
  input { width: 100%; padding: 10px 12px; border: 1px solid var(--borde); border-radius: 8px; font-size: 14px;
    background: var(--fondo); color: var(--texto); }
  button { width: 100%; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 14px; }
  .primario { background: var(--rojo); color: #fff; border: none; }
  .secundario { background: transparent; color: var(--texto); border: 1px solid var(--borde); }
  button:disabled { opacity: .6; cursor: wait; }
  .sep { text-align: center; color: var(--gris); font-size: 12px; margin: 16px 0 2px; }
  .error { color: #dc2626; font-size: 13px; margin-top: 12px; min-height: 18px; }
  .oculto { display: none; }
</style>
</head>
<body>
<div class="c">
  <h1><span>Toshify</span> · Conectar con Claude</h1>
  <p>${escaparHtml(c.client_name || 'Claude')} quiere consultar datos de Toshify con tu cuenta.
     Vas a ver solo la información de las pantallas que tenés habilitadas en el sistema, y solo para leer.</p>

  <div id="login">
    <button id="google" class="secundario" type="button">Ingresar con Google</button>
    <div class="sep">o con tu correo</div>
    <form id="form">
      <label for="email">Correo</label>
      <input id="email" type="email" autocomplete="username" required>
      <label for="clave">Contraseña</label>
      <input id="clave" type="password" autocomplete="current-password" required>
      <button id="entrar" class="primario" type="submit">Ingresar</button>
    </form>
  </div>

  <div id="confirmar" class="oculto">
    <p>Sesión iniciada como <strong id="quien"></strong>.</p>
    <button id="permitir" class="primario" type="button">Permitir acceso de solo lectura</button>
    <button id="otra" class="secundario" type="button">Usar otra cuenta</button>
  </div>

  <div id="error" class="error"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.76.1/dist/umd/supabase.js"></script>
<script>
(function () {
  var CONFIG = ${jsonEnScript(config)};
  var sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storageKey: 'toshify-mcp-login' }
  });
  var $ = function (id) { return document.getElementById(id); };
  var mostrarError = function (t) { $('error').textContent = t || ''; };

  function mostrarSesion(session) {
    if (!session) { $('login').classList.remove('oculto'); $('confirmar').classList.add('oculto'); return; }
    $('quien').textContent = session.user.email;
    $('login').classList.add('oculto');
    $('confirmar').classList.remove('oculto');
  }

  sb.auth.getSession().then(function (r) { mostrarSesion(r.data.session); });

  $('google').onclick = function () {
    mostrarError('');
    // Vuelve a esta misma pantalla (con los mismos parámetros) ya logueado
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
      .then(function (r) { if (r.error) mostrarError('No se pudo ingresar con Google.'); });
  };

  $('form').onsubmit = function (e) {
    e.preventDefault();
    mostrarError('');
    $('entrar').disabled = true;
    sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('clave').value })
      .then(function (r) {
        $('entrar').disabled = false;
        if (r.error) { mostrarError('Correo o contraseña incorrectos.'); return; }
        mostrarSesion(r.data.session);
      });
  };

  $('otra').onclick = function () {
    sb.auth.signOut({ scope: 'local' }).then(function () { mostrarSesion(null); });
  };

  $('permitir').onclick = function () {
    mostrarError('');
    $('permitir').disabled = true;
    sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      if (!session) { $('permitir').disabled = false; mostrarSesion(null); return; }
      return fetch('/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido: CONFIG.pedido, supabase_token: session.access_token })
      }).then(function (res) { return res.json(); }).then(function (data) {
        if (!data.redirect) { $('permitir').disabled = false; mostrarError(data.error || 'No se pudo completar el acceso.'); return; }
        // La sesión del navegador ya no hace falta: el acceso de Claude es aparte
        return sb.auth.signOut({ scope: 'local' }).then(function () { window.location.href = data.redirect; });
      });
    }).catch(function () { $('permitir').disabled = false; mostrarError('No se pudo completar el acceso.'); });
  };
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const router = express.Router();

/** Registro y token: límites propios, por IP. */
const limiteOAuth = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', error_description: 'Demasiados intentos. Esperá un minuto.' },
});

function metadataRecurso(req, res) {
  const base = urlBase(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [SCOPE],
    resource_name: 'Toshify',
  });
}
router.get('/.well-known/oauth-protected-resource', metadataRecurso);
router.get('/.well-known/oauth-protected-resource/mcp', metadataRecurso);

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = urlBase(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  });
});

router.post('/oauth/register', limiteOAuth, express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.map(String) : [];
    if (redirectUris.length === 0 || redirectUris.length > 10) {
      return errorOAuth(res, 400, 'invalid_redirect_uri', 'Hace falta entre 1 y 10 redirect_uris.');
    }
    const invalida = redirectUris.find((u) => !redirectPermitido(u));
    if (invalida) return errorOAuth(res, 400, 'invalid_redirect_uri', `Dirección de retorno no permitida: ${invalida}`);

    const clientId = aleatorio('tsh_cl_');
    const nombre = String(req.body?.client_name || 'Claude').slice(0, 100);
    await supabaseRequest('mcp_oauth_clientes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: clientId, client_name: nombre, redirect_uris: redirectUris }),
    });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: nombre,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    });
  } catch (error) {
    console.error('[MCP OAuth] Error registrando cliente:', error.message);
    return errorOAuth(res, 500, 'server_error', 'No se pudo registrar la aplicación.');
  }
});

router.get('/oauth/authorize', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const p = req.query;
    // Vuelta del login con Google (Supabase agrega ?code=): la pantalla lo procesa sola
    const pedido = {
      response_type: p.response_type, client_id: p.client_id, redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge, code_challenge_method: p.code_challenge_method,
      state: p.state, scope: p.scope, resource: p.resource,
    };
    const v = await validarPedido(pedido);
    if (v.error) return res.status(400).send(paginaError(v.error));
    if (!ANON_KEY) return res.status(500).send(paginaError('Falta configurar VITE_SUPABASE_ANON_KEY en el servidor del MCP.'));
    return res.send(paginaLogin({ pedido, cliente: v.cliente }));
  } catch (error) {
    console.error('[MCP OAuth] Error en authorize:', error.message);
    return res.status(500).send(paginaError('Error interno. Probá de nuevo en unos minutos.'));
  }
});

router.post('/oauth/authorize', limiteOAuth, express.json({ limit: '20kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const pedido = req.body?.pedido || {};
    const v = await validarPedido(pedido);
    if (v.error) return res.status(400).json({ error: v.error });

    const usuario = await usuarioDeSesion(String(req.body?.supabase_token || ''));
    if (!usuario) return res.status(401).json({ error: 'La sesión venció. Volvé a ingresar.' });
    const perfil = await perfilActivo(usuario.id);
    if (!perfil) return res.status(403).json({ error: 'Tu usuario no está activo en Toshibase.' });

    const codigo = aleatorio();
    await supabaseRequest('mcp_oauth_codigos', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        codigo_hash: sha256(codigo),
        client_id: pedido.client_id,
        user_id: usuario.id,
        user_email: perfil.email || usuario.email,
        redirect_uri: pedido.redirect_uri,
        code_challenge: pedido.code_challenge,
        scope: SCOPE,
        expires_at: new Date(Date.now() + SEGUNDOS_CODIGO * 1000).toISOString(),
      }),
    });

    const destino = new URL(pedido.redirect_uri);
    destino.searchParams.set('code', codigo);
    if (pedido.state) destino.searchParams.set('state', pedido.state);
    console.log(`[MCP OAuth] Acceso autorizado: ${perfil.email || usuario.email} (${v.cliente.client_name})`);
    return res.json({ redirect: destino.toString() });
  } catch (error) {
    console.error('[MCP OAuth] Error confirmando authorize:', error.message);
    return res.status(500).json({ error: 'Error interno. Probá de nuevo.' });
  }
});

router.post('/oauth/token', limiteOAuth, express.urlencoded({ extended: false, limit: '20kb' }), express.json({ limit: '20kb' }), async (req, res) => {
  const b = req.body || {};
  try {
    const c = await cliente(b.client_id);
    if (!c) return errorOAuth(res, 401, 'invalid_client', 'Cliente desconocido.');

    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.code_verifier) return errorOAuth(res, 400, 'invalid_request', 'Faltan code o code_verifier.');
      // Marca el código como usado en el mismo paso: un segundo intento no encuentra nada
      const ahora = new Date().toISOString();
      const [cod] = await filas(
        `mcp_oauth_codigos?codigo_hash=eq.${sha256(String(b.code))}&usado_at=is.null&expires_at=gt.${encodeURIComponent(ahora)}`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ usado_at: ahora }) }
      );
      if (!cod || cod.client_id !== c.client_id) return errorOAuth(res, 400, 'invalid_grant', 'Código inválido, vencido o ya usado.');
      if (b.redirect_uri && b.redirect_uri !== cod.redirect_uri) return errorOAuth(res, 400, 'invalid_grant', 'redirect_uri no coincide.');
      const desafio = createHash('sha256').update(String(b.code_verifier)).digest('base64url');
      if (desafio !== cod.code_challenge) return errorOAuth(res, 400, 'invalid_grant', 'PKCE inválido.');
      if (!(await perfilActivo(cod.user_id))) return errorOAuth(res, 400, 'invalid_grant', 'Usuario inactivo.');

      res.set('Cache-Control', 'no-store');
      return res.json(await emitirTokens({ clientId: c.client_id, userId: cod.user_id, email: cod.user_email, scope: cod.scope || SCOPE }));
    }

    if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token) return errorOAuth(res, 400, 'invalid_request', 'Falta refresh_token.');
      // Rotación: el permiso de renovación usado se revoca y se emite uno nuevo
      const ahora = new Date().toISOString();
      const [t] = await filas(
        `mcp_oauth_tokens?token_hash=eq.${sha256(String(b.refresh_token))}&tipo=eq.refresh&revocado_at=is.null` +
        `&expires_at=gt.${encodeURIComponent(ahora)}&client_id=eq.${encodeURIComponent(c.client_id)}`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ revocado_at: ahora }) }
      );
      if (!t) return errorOAuth(res, 400, 'invalid_grant', 'Permiso de renovación inválido o vencido.');
      if (!(await perfilActivo(t.user_id))) return errorOAuth(res, 400, 'invalid_grant', 'Usuario inactivo.');

      res.set('Cache-Control', 'no-store');
      return res.json(await emitirTokens({ clientId: c.client_id, userId: t.user_id, email: t.user_email, scope: t.scope || SCOPE }));
    }

    return errorOAuth(res, 400, 'unsupported_grant_type', 'grant_type no soportado.');
  } catch (error) {
    console.error('[MCP OAuth] Error en token:', error.message);
    return errorOAuth(res, 500, 'server_error', 'Error interno.');
  }
});

export default router;
