/**
 * Datasets automáticos: las tablas de pantallas que no están en el catálogo
 * (PANTALLAS_POR_TABLA_AUTO, generado; ver lib/tablasFueraMcp.js).
 *
 * Al arrancar el MCP lee sus columnas de la base (el esquema OpenAPI de PostgREST),
 * saca las sensibles y las suma a CATALOGO con `permiso: 'modulo'`: ninguna key las ve
 * por datos:read, solo las personas con su pantalla habilitada (y el módulo tildado en
 * "Módulos habilitados en el MCP"). Siguen siendo de solo lectura: pasan por
 * lib/datos.js como cualquier dataset.
 */

import { supabaseRequest } from './supabase.js';
import { CATALOGO } from './catalogoDatos.js';
import { PANTALLAS_POR_TABLA_AUTO } from './pantallasDatos.js';
import { PATRON_COLUMNAS_SENSIBLES } from './tablasFueraMcp.js';

/** Tipo del catálogo para un campo del esquema de PostgREST. */
function tipoDe(prop = {}) {
  const f = String(prop.format || '');
  if (f === 'uuid') return 'id';
  if (f.startsWith('timestamp') || f === 'date') return 'fecha';
  if (f === 'boolean' || prop.type === 'boolean') return 'booleano';
  if (f === 'json' || f === 'jsonb') return 'json';
  if (prop.type === 'integer' || prop.type === 'number') return 'numero';
  if (/^(smallint|integer|bigint|numeric|real|double precision)$/.test(f)) return 'numero';
  return 'texto';
}

/** Nombre visible de los menús y submenús, para el `modulo` del dataset. */
async function etiquetas(nombres) {
  if (!nombres.length) return new Map();
  const lista = encodeURIComponent(`(${nombres.map((n) => `"${n}"`).join(',')})`);
  const [menus, submenus] = await Promise.all([
    supabaseRequest(`menus?name=in.${lista}&select=name,label`).then((r) => r.json()),
    supabaseRequest(`submenus?name=in.${lista}&select=name,label`).then((r) => r.json()),
  ]);
  return new Map([...menus, ...submenus].map((m) => [m.name, m.label || m.name]));
}

/** Suma los datasets automáticos al catálogo. Si falla, el MCP sigue sin ellos. */
export async function cargarTablasAuto() {
  const tablas = Object.keys(PANTALLAS_POR_TABLA_AUTO).filter((t) => !Object.hasOwn(CATALOGO, t));
  if (!tablas.length) return [];
  try {
    const esquema = await (await supabaseRequest('')).json();
    const pantallaDe = (t) => PANTALLAS_POR_TABLA_AUTO[t][0];
    const nombres = [...new Set(tablas.map((t) => pantallaDe(t).submenu || pantallaDe(t).menu).filter(Boolean))];
    const nombreVisible = await etiquetas(nombres).catch(() => new Map());

    const cargadas = [];
    for (const tabla of tablas) {
      const props = esquema.definitions?.[tabla]?.properties;
      if (!props) continue;
      const columnas = {};
      for (const [col, prop] of Object.entries(props)) {
        if (!PATRON_COLUMNAS_SENSIBLES.test(col.toLowerCase())) columnas[col] = tipoDe(prop);
      }
      if (!Object.keys(columnas).length) continue;
      const p = pantallaDe(tabla);
      const clave = p.submenu || p.menu;
      CATALOGO[tabla] = {
        modulo: nombreVisible.get(clave) || clave || 'Otros',
        permiso: 'modulo',
        descripcion: `Tabla ${tabla} de la pantalla ${p.ruta} (agregada sola, sin columnas sensibles).`,
        columnas,
      };
      cargadas.push(tabla);
    }
    return cargadas;
  } catch (error) {
    console.error('[MCP] No se pudieron cargar los datasets automáticos:', error.message);
    return [];
  }
}
