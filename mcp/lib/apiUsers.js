/**
 * Autenticacion de consumidores externos (self-service de API keys).
 *
 * Un tercero recibe UNA vez un usuario y contrasena, y con eso se crea y revoca
 * sus propias keys de solo lectura. Es un padron aparte de Supabase Auth: estos
 * usuarios NO tienen cuenta en la app, igual que los conductores del Portal.
 *
 * La contrasena se verifica DENTRO de Postgres (pgcrypto/bcrypt) via la RPC
 * api_user_login. El hash nunca llega hasta aca.
 *
 * Se usa HTTP Basic sobre HTTPS en vez de un token de sesion: son operaciones
 * poco frecuentes (crear o revocar una key), y evita inventar una capa de
 * sesiones propia, que es justamente donde suelen aparecer los agujeros.
 */

import { supabaseRequest } from './supabase.js';

/**
 * Permisos que recibe TODA key creada por self-service.
 *
 * Fijos y de solo lectura a proposito: el consumidor no elige su alcance, asi
 * que no puede autoescalarse. Si alguna vez hay que dar acceso parcial, esto
 * pasa a leerse de api_permissions, no del request.
 */
/**
 * Cuantos minutos vive una key de self-service.
 *
 * Solo aplica a estas: las keys creadas a mano desde la app quedan con
 * expires_at en NULL y no caducan nunca, para no cortar el chatbot MCP ni las
 * integraciones propias.
 */
export const MINUTOS_VIGENCIA = 30;

export const PERMISOS_SELF_SERVICE = [
  'leads:api',
  'vehiculos:api',
  'conductores:api',
  'asignaciones:api',
  'flota:api',
];

/** Valida usuario y contrasena contra la base. Devuelve el usuario o null. */
export async function verificarCredenciales(username, password) {
  if (!username || !password) return null;

  try {
    const res = await supabaseRequest('rpc/api_user_login', {
      method: 'POST',
      body: JSON.stringify({ p_username: username, p_password: password }),
    });
    const data = await res.json();
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch {
    return null;
  }
}

/** Parsea el header Authorization: Basic base64(user:pass). */
function leerBasic(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return null;
  try {
    const plano = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const corte = plano.indexOf(':');
    if (corte < 1) return null;
    return { username: plano.slice(0, corte), password: plano.slice(corte + 1) };
  } catch {
    return null;
  }
}

/**
 * Middleware: exige Basic auth de un api_user valido.
 * Deja el usuario en req.apiUser.
 */
export function requireApiUser() {
  return async (req, res, next) => {
    const cred = leerBasic(req);

    if (!cred) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Toshify API"');
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Falta autenticacion. Usá HTTP Basic con tu usuario y contraseña.',
      });
    }

    const usuario = await verificarCredenciales(cred.username, cred.password);

    if (!usuario) {
      // Mismo mensaje para usuario inexistente y contrasena incorrecta:
      // distinguirlos permitiria enumerar usuarios validos.
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Usuario o contraseña incorrectos',
      });
    }

    req.apiUser = usuario;
    next();
  };
}
