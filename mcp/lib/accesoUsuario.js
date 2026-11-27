/**
 * Qué datos del MCP puede leer cada conexión.
 *
 * Una API key tilda módulos y submódulos del menú de Toshibase (permisos menu:<nombre> y
 * submenu:<nombre>, desde Integraciones > MCP). Hay dos usos:
 *
 *   - Claude (key con mcp:usuario): el administrador de Claude Teams agrega el conector
 *     con la URL que lleva la key y cada persona inicia sesión con su usuario de
 *     Toshibase. Ve un módulo solo si está tildado en la key Y su usuario lo tiene, como
 *     en la app (src/contexts/PermissionsContext.tsx + ProtectedRoute):
 *       - rol admin: todas las pantallas;
 *       - el resto: los menús y submenús con can_view de get_user_permissions (combina
 *         los permisos del rol con los de "Menú por usuario").
 *     Solo lectura: en este camino no hay herramientas que escriban.
 *   - Integraciones (key sola): ve los módulos tildados, además de lo que den sus
 *     permisos de siempre (datos:read, administracion:read, leads:*, *:api).
 *
 * Una pantalla se puede abrir si cumple su menuName y su submenuName. Un dataset queda
 * visible si alguna de sus pantallas (lib/pantallasDatos.js, generado desde el código de
 * la app) se puede abrir.
 *
 * El resultado se expresa como una lista de permisos para que lib/datos.js no distinga
 * entre keys y personas:
 *   tabla:<dataset>     puede leer ese dataset
 *   reporte:<reporte>   puede consultar ese reporte
 *   administracion:read tiene la pantalla de Facturación (columnas de facturación de los KPI)
 *   leads:read          tiene el menú Leads (buscar_leads y obtener_lead)
 */

import { supabaseRequest } from './supabase.js';
import { PANTALLAS_POR_DATASET, PANTALLAS_POR_REPORTE, PANTALLAS_POR_TABLA_AUTO } from './pantallasDatos.js';

/** Permiso de la key que pide iniciar sesión con un usuario de Toshibase (conector de Claude). */
export const PERMISO_REQUIERE_USUARIO = 'mcp:usuario';

/** Cuánto se recuerdan los permisos de una persona: un cambio en Toshibase rige en este tiempo. */
const MINUTOS_CACHE = 2;
const cache = new Map();

/** Perfil activo de Toshibase con su rol, o null si no existe o está desactivado. */
export async function perfilActivo(userId) {
  const res = await supabaseRequest(
    `user_profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,is_active,roles(name)`
  );
  const [perfil] = await res.json();
  if (!perfil || perfil.is_active === false) return null;
  return perfil;
}

/** true si la key es para el conector de Claude (exige usuario de Toshibase). */
export function requiereUsuario(permissions = []) {
  return permissions.includes(PERMISO_REQUIERE_USUARIO);
}

/** Módulos y submódulos tildados en una key. */
function modulosDeKey(permissions = []) {
  const menus = new Set();
  const submenus = new Set();
  for (const p of permissions) {
    const v = String(p).toLowerCase();
    if (v.startsWith('menu:')) menus.add(v.slice(5));
    else if (v.startsWith('submenu:')) submenus.add(v.slice(8));
  }
  return { menus, submenus };
}

/** Si la key tiene tildada la pantalla: su submódulo, o su módulo si no tiene submódulo. */
function tildadaEnKey(pantalla, modulos) {
  if (pantalla.submenu) return modulos.submenus.has(pantalla.submenu.toLowerCase());
  if (!pantalla.menu) return false;
  // Algunas rutas toman el nombre de su sección, que en el menú es un submódulo
  // (Guías: seguimiento-conductores)
  const menu = pantalla.menu.toLowerCase();
  return modulos.menus.has(menu) || modulos.submenus.has(menu);
}

function puedeAbrir(pantalla, { esAdmin, menus, submenus }) {
  if (esAdmin) return true;
  if (pantalla.admin) return false;
  if (pantalla.menu && !menus.has(pantalla.menu.toLowerCase())) return false;
  if (pantalla.submenu && !submenus.has(pantalla.submenu.toLowerCase())) return false;
  return Boolean(pantalla.menu || pantalla.submenu);
}

/** tabla: y reporte: de las pantallas que cumplen `puede`. Todos de lectura. */
function permisosPorPantallas(puede) {
  const visible = (pantallas) => (pantallas || []).some(puede);
  const permisos = [];
  for (const porDataset of [PANTALLAS_POR_DATASET, PANTALLAS_POR_TABLA_AUTO]) {
    for (const [dataset, pantallas] of Object.entries(porDataset)) {
      if (visible(pantallas)) permisos.push(`tabla:${dataset}`);
    }
  }
  for (const [reporte, pantallas] of Object.entries(PANTALLAS_POR_REPORTE)) {
    if (visible(pantallas)) permisos.push(`reporte:${reporte}`);
  }
  return permisos;
}

/**
 * Permisos de una key usada sola (integraciones): a los suyos se suman los de lectura de
 * los módulos tildados. Las pantallas solo para admin no cuentan.
 */
export function permisosDeKey(permissions = []) {
  const modulos = modulosDeKey(permissions);
  if (!modulos.menus.size && !modulos.submenus.size) return permissions;
  const extra = permisosPorPantallas((p) => !p.admin && tildadaEnKey(p, modulos));
  if (modulos.submenus.has('facturacion')) extra.push('administracion:read');
  return [...new Set([...permissions, ...extra])];
}

/** Rol y menús de una persona en Toshibase, o null si no existe o está desactivada. */
async function accesoDeUsuario(userId) {
  const enCache = cache.get(userId);
  if (enCache && Date.now() < enCache.vence) return enCache.valor;

  const perfil = await perfilActivo(userId);
  let valor = null;
  if (perfil) {
    const esAdmin = perfil.roles?.name === 'admin';
    const menus = new Set();
    const submenus = new Set();
    if (!esAdmin) {
      // Misma función que usa la app para armar el menú lateral
      const filas = await (await supabaseRequest(
        `rpc/get_user_permissions?p_user_id=${encodeURIComponent(userId)}`
      )).json();
      for (const f of filas) {
        if (!f.can_view || !f.menu_name) continue;
        (f.is_menu ? menus : submenus).add(String(f.menu_name).toLowerCase());
      }
    }
    valor = {
      usuario: { id: perfil.id, email: perfil.email, nombre: perfil.full_name, rol: perfil.roles?.name || null },
      esAdmin,
      menus,
      submenus,
    };
  }

  cache.set(userId, { valor, vence: Date.now() + MINUTOS_CACHE * 60 * 1000 });
  return valor;
}

/**
 * Permisos de una persona que entró por el conector de Claude con esta key: los módulos
 * tildados en la key que su usuario también tiene. null si la persona no tiene acceso
 * (no existe o está desactivada en Toshibase).
 */
export async function permisosDeUsuario(userId, permisosKey = []) {
  const acceso = await accesoDeUsuario(userId);
  if (!acceso) return null;
  const modulos = modulosDeKey(permisosKey);
  const permisos = permisosPorPantallas((p) => puedeAbrir(p, acceso) && tildadaEnKey(p, modulos));
  const tiene = (conjunto, nombre) => acceso.esAdmin || conjunto.has(nombre);
  if (tiene(acceso.submenus, 'facturacion') && modulos.submenus.has('facturacion')) permisos.push('administracion:read');
  if (tiene(acceso.menus, 'leads') && modulos.menus.has('leads')) permisos.push('leads:read');
  return { usuario: acceso.usuario, permisos };
}
