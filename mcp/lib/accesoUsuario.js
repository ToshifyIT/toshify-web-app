/**
 * Acceso de una persona (login OAuth) a los datos del MCP: las mismas tablas que ve en
 * Toshibase.
 *
 * Replica lo que hace la app (src/contexts/PermissionsContext.tsx + ProtectedRoute):
 *   - rol admin: ve todas las pantallas;
 *   - el resto: los menús y submenús con can_view de get_user_permissions (combina los
 *     permisos del rol con los de "Menú por usuario").
 * Una pantalla se puede abrir si cumple su menuName y su submenuName. Un dataset queda
 * visible si alguna de sus pantallas (lib/pantallasDatos.js, generado desde el código de
 * la app) se puede abrir.
 *
 * El resultado se expresa como una lista de permisos, igual que una API key, para que
 * lib/datos.js no distinga entre keys y personas:
 *   tabla:<dataset>     puede leer ese dataset
 *   reporte:<reporte>   puede consultar ese reporte
 *   administracion:read tiene la pantalla de Facturación (columnas de facturación de los KPI)
 *   leads:read          tiene el menú Leads (buscar_leads y obtener_lead)
 */

import { supabaseRequest } from './supabase.js';
import { PANTALLAS_POR_DATASET, PANTALLAS_POR_REPORTE } from './pantallasDatos.js';

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

function puedeAbrir(pantalla, { esAdmin, menus, submenus }) {
  if (esAdmin) return true;
  if (pantalla.admin) return false;
  if (pantalla.menu && !menus.has(pantalla.menu.toLowerCase())) return false;
  if (pantalla.submenu && !submenus.has(pantalla.submenu.toLowerCase())) return false;
  return Boolean(pantalla.menu || pantalla.submenu);
}

/**
 * Permisos de una persona para el MCP, o null si no tiene acceso (no existe o está
 * desactivada en Toshibase).
 */
export async function permisosDeUsuario(userId) {
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
    const acceso = { esAdmin, menus, submenus };
    const visible = (pantallas) => (pantallas || []).some((p) => puedeAbrir(p, acceso));

    const permisos = [];
    for (const [dataset, pantallas] of Object.entries(PANTALLAS_POR_DATASET)) {
      if (visible(pantallas)) permisos.push(`tabla:${dataset}`);
    }
    for (const [reporte, pantallas] of Object.entries(PANTALLAS_POR_REPORTE)) {
      if (visible(pantallas)) permisos.push(`reporte:${reporte}`);
    }
    if (esAdmin || submenus.has('facturacion')) permisos.push('administracion:read');
    if (esAdmin || menus.has('leads')) permisos.push('leads:read');

    valor = {
      usuario: { id: perfil.id, email: perfil.email, nombre: perfil.full_name, rol: perfil.roles?.name || null },
      permisos,
    };
  }

  cache.set(userId, { valor, vence: Date.now() + MINUTOS_CACHE * 60 * 1000 });
  return valor;
}
