#!/usr/bin/env node
/**
 * Genera mcp/lib/pantallasDatos.js: qué pantallas de Toshibase usan cada dataset del
 * catálogo del MCP y cada reporte.
 *
 * Con eso el MCP le da a cada persona (login OAuth) las mismas tablas que ve en el
 * sistema: un dataset queda visible si la persona puede entrar a ALGUNA pantalla que
 * lo consulta.
 *
 * Cómo arma la relación, sin listas a mano:
 *   1. Lee las rutas de src/pages/HomePage.tsx: path, menuName/submenuName del
 *      ProtectedRoute y el componente de la página.
 *   2. Desde el archivo de cada página sigue todos sus imports dentro de src/.
 *   3. Junta las tablas de .from('tabla') y las funciones de .rpc('funcion').
 * Lo que no consulta ninguna pantalla (tablas que llena o lee el backend) sale de
 * EXTRA_POR_DATASET, abajo, y queda listado en el resumen para revisarlo.
 *
 * Además lista como "datasets automáticos" las tablas de pantallas que no están en el
 * catálogo (ver lib/tablasFueraMcp.js): así un módulo nuevo trae sus datos solo.
 *
 * Uso (desde la raíz del repo):  node mcp/generadores/generarPantallasDatos.mjs
 * La imagen del MCP (Dockerfile.mcp) lo corre en cada publicación; a mano solo hace falta
 * para probar en local. --candidatas lista las tablas de pantallas fuera del catálogo.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(RAIZ, 'src');
const HOME = join(SRC, 'pages/HomePage.tsx');
const SALIDA = join(RAIZ, 'mcp/lib/pantallasDatos.js');

const { CATALOGO } = await import(join(RAIZ, 'mcp/lib/catalogoDatos.js'));
const { REPORTES } = await import(join(RAIZ, 'mcp/lib/datos.js'));
const { TABLAS_FUERA_MCP, PATRON_TABLAS_PROHIBIDAS } = await import(join(RAIZ, 'mcp/lib/tablasFueraMcp.js'));

/**
 * Datasets que ninguna pantalla consulta con .from() porque los lee el backend o una
 * función de la base. Se les asignan las pantallas de otro dataset (o de un reporte)
 * que muestra esa misma información. Revisar acá si una tabla aparece "sin pantalla".
 */
const EXTRA_POR_DATASET = {
  // Vistas de sql/mcp_vistas.sql: las mismas pantallas que su tabla de origen
  v_estado_flota_hoy: { comoDataset: 'vehiculos' },
  v_vencimientos_proximos: { comoDataset: 'vencimientos' },
  v_leads_semanales: { comoDataset: 'leads' },
  v_multas_historico: { comoDataset: 'multas_historico' },
  // Catálogos y vistas auxiliares: van con la tabla que describen
  conductores_licencias_tipos: { comoDataset: 'conductores' },
  bonos_referidos: { comoDataset: 'conductores' },
  vehiculos_tipos: { comoDataset: 'vehiculos' },
  combustibles_tipos: { comoDataset: 'vehiculos' },
  gps_tipos: { comoDataset: 'vehiculos' },
  horarios_conduccion: { comoDataset: 'asignaciones' },
  inventario_disponible_detallado: { comoDataset: 'inventario' },
  inventario_total_por_producto: { comoDataset: 'inventario' },
  v_herramientas_por_conductor: { comoDataset: 'inventario' },
  kpi_foto_tarjetas: { comoDataset: 'kpi_diario' },
  cabify_historico_bariloche: { comoDataset: 'cabify_historico' },
  conductores_semana_facturacion: { comoDataset: 'facturacion_conductores' },
  // Las pantallas los leen a través del backend (/api/2chat, /api/alegra) o con el
  // nombre de la tabla en una constante
  twochat_contactos: { comoRuta: ['/integraciones/2chat/contactos'] },
  twochat_llamadas: { comoRuta: ['/integraciones/2chat/llamadas'] },
  alegra_comprobantes: { comoRuta: ['/integraciones/alegra/44dreams', '/integraciones/alegra/grupocg'] },
  mediciones_rutas: { comoRuta: ['/leads', '/onboarding/programacion-v2', '/onboarding/distribucion-mapa-v2'] },
  vehiculos_notas: { comoRuta: ['/vehiculos'] },
  dashboard_insights: { comoReporte: 'dashboard_directivo' },
};

/**
 * Facturación (datasets con permiso administracion:read): solo la ven quienes tienen
 * la pantalla de Facturación (submenú facturacion), aunque otras pantallas (el panel
 * del conductor, por ejemplo) muestren parte de esos datos.
 */
const SUBMENU_FACTURACION = 'facturacion';

// ---------------------------------------------------------------------------

const texto = (f) => readFileSync(f, 'utf8');

/** Resuelve un import relativo de src a un archivo real (.ts, .tsx, index). */
function resolverImport(desde, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(desde), spec);
  const candidatos = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    join(base, 'index.ts'), join(base, 'index.tsx'), join(base, 'index.js')];
  return candidatos.find((c) => existsSync(c) && statSync(c).isFile() && /\.(t|j)sx?$/.test(c)) || null;
}

/** Imports estáticos y dinámicos de un archivo (sin los `import type`). */
function importsDe(archivo) {
  const s = texto(archivo);
  const specs = new Set();
  for (const m of s.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  for (const m of s.matchAll(/^\s*export\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  for (const m of s.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  for (const m of s.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  return [...specs].map((sp) => resolverImport(archivo, sp)).filter(Boolean);
}

/** Tablas y RPC que consulta un archivo. */
function consultasDe(archivo) {
  const s = texto(archivo);
  const tablas = [...s.matchAll(/\.from\(\s*['"`]([a-z_0-9]+)['"`]/g)].map((m) => m[1]);
  const rpcs = [...s.matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)].map((m) => m[1]);
  return { tablas, rpcs };
}

/** Todos los archivos alcanzables desde uno (sin pasar por HomePage). */
const cacheAlcance = new Map();
function alcanzables(inicio) {
  if (cacheAlcance.has(inicio)) return cacheAlcance.get(inicio);
  const vistos = new Set();
  const pila = [inicio];
  while (pila.length) {
    const f = pila.pop();
    if (vistos.has(f) || f === HOME) continue;
    vistos.add(f);
    pila.push(...importsDe(f));
  }
  cacheAlcance.set(inicio, vistos);
  return vistos;
}

// 1) Componentes de página: lazy(() => import('./x')) y imports estáticos de HomePage
const home = texto(HOME);
const archivoDeComponente = new Map();
for (const m of home.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
  archivoDeComponente.set(m[1], resolverImport(HOME, m[2]));
}
for (const m of home.matchAll(/^import\s+(?!type\b)(?:\{([^}]+)\}|(\w+))\s+from\s+['"](\.[^'"]+)['"]/gm)) {
  const archivo = resolverImport(HOME, m[3]);
  if (!archivo) continue;
  const nombres = m[1] ? m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()) : [m[2]];
  for (const n of nombres) if (n && !archivoDeComponente.has(n)) archivoDeComponente.set(n, archivo);
}

// 2) Rutas: <Route path="..." element={ ... } />
const rutas = [];
for (const m of home.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)) {
  const [, path, cuerpo] = m;
  if (/^<Navigate/.test(cuerpo.trim())) continue;
  let menu = cuerpo.match(/\bmenuName="([^"]+)"/)?.[1] || null;
  const submenu = cuerpo.match(/\bsubmenuName="([^"]+)"/)?.[1] || null;
  const admin = /requireAdmin/.test(cuerpo);
  // Ruta sin condición (<ProtectedRoute> solo pide login, como Guías): se toma el menú
  // de su sección (/seguimiento-conductores/guias -> seguimiento-conductores), que es
  // lo que la muestra en el menú lateral.
  if (!menu && !submenu && !admin) menu = path.split('/')[1] || null;
  const componentes = [...cuerpo.matchAll(/<([A-Z]\w*)/g)].map((x) => x[1])
    .filter((c) => !['ProtectedRoute', 'LazyPage', 'Navigate', 'Suspense'].includes(c));
  const archivos = componentes.map((c) => archivoDeComponente.get(c)).filter(Boolean);
  if (!archivos.length) continue;
  rutas.push({ path, menu, submenu, admin, archivos });
}

// 3) Por ruta: tablas y RPC alcanzables. La condición de acceso es la del ProtectedRoute.
const pantallasPorTabla = new Map();
const pantallasPorRpc = new Map();
const agregar = (mapa, clave, pantalla) => {
  const lista = mapa.get(clave) || [];
  if (!lista.some((p) => p.menu === pantalla.menu && p.submenu === pantalla.submenu && p.admin === pantalla.admin)) {
    lista.push(pantalla);
  }
  mapa.set(clave, lista);
};
for (const r of rutas) {
  const pantalla = { menu: r.menu, submenu: r.submenu, admin: r.admin, ruta: r.path };
  for (const inicio of r.archivos) {
    for (const f of alcanzables(inicio)) {
      const { tablas, rpcs } = consultasDe(f);
      tablas.forEach((t) => agregar(pantallasPorTabla, t, pantalla));
      rpcs.forEach((x) => agregar(pantallasPorRpc, x, pantalla));
    }
  }
}

// 4) Datasets del catálogo y reportes
const limpiar = (lista) => (lista || []).map(({ menu, submenu, admin, ruta }) => ({ menu, submenu, admin, ruta }));
const porDataset = {};
const sinPantalla = [];
for (const nombre of Object.keys(CATALOGO)) {
  const extra = EXTRA_POR_DATASET[nombre];
  let lista = pantallasPorTabla.get(nombre);
  if (!lista?.length && extra?.comoDataset) lista = pantallasPorTabla.get(extra.comoDataset);
  if (!lista?.length && extra?.comoReporte) lista = pantallasPorRpc.get(REPORTES[extra.comoReporte].funcion);
  if (!lista?.length && extra?.comoRuta) {
    lista = rutas.filter((r) => extra.comoRuta.includes(r.path))
      .map((r) => ({ menu: r.menu, submenu: r.submenu, admin: r.admin, ruta: r.path }));
  }
  if (CATALOGO[nombre].permiso === 'administracion:read') {
    lista = rutas.filter((r) => r.submenu === SUBMENU_FACTURACION)
      .map((r) => ({ menu: r.menu, submenu: r.submenu, admin: r.admin, ruta: r.path }));
  }
  if (lista?.length) porDataset[nombre] = limpiar(lista);
  else sinPantalla.push(nombre);
}
const porReporte = {};
for (const [nombre, r] of Object.entries(REPORTES)) {
  const lista = pantallasPorRpc.get(r.funcion);
  if (lista?.length) porReporte[nombre] = limpiar(lista);
  else sinPantalla.push(`reporte:${nombre}`);
}

// 4b) Datasets automáticos: tablas de pantallas que no están en el catálogo ni afuera a
// propósito. Las de pantallas solo para admin no entran (ninguna key ni persona sin rol
// admin las vería y el admin ya tiene el catálogo).
const enCatalogo = new Set(Object.keys(CATALOGO));
const fuera = new Set(TABLAS_FUERA_MCP);
const porTablaAuto = {};
const candidatas = [];
for (const [tabla, lista] of [...pantallasPorTabla.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (enCatalogo.has(tabla) || PATRON_TABLAS_PROHIBIDAS.test(tabla)) continue;
  const pantallas = limpiar(lista.filter((p) => !p.admin));
  if (!pantallas.length) continue;
  candidatas.push(tabla);
  if (!fuera.has(tabla)) porTablaAuto[tabla] = pantallas;
}
if (process.argv.includes('--candidatas')) {
  console.log(JSON.stringify(candidatas, null, 2));
  process.exit(0);
}

// 5) Archivo de salida
const fecha = new Date().toISOString().slice(0, 10);
const salida = `// mcp/lib/pantallasDatos.js
// GENERADO por mcp/generadores/generarPantallasDatos.mjs el ${fecha}: no editar a mano.
// Volver a generar cuando cambien las pantallas (src/pages/HomePage.tsx) o el catálogo.
//
// Para cada dataset del catálogo y cada reporte: las pantallas de Toshibase que lo
// consultan, con la condición de acceso de su ProtectedRoute (menuName y/o submenuName;
// admin = solo rol admin). Una persona ve el dataset si puede entrar a alguna.
// Sin pantalla (no los ve nadie por login; sí las keys con datos:read): ${sinPantalla.length ? sinPantalla.join(', ') : 'ninguno'}.

export const PANTALLAS_POR_DATASET = ${JSON.stringify(porDataset, null, 2)};

export const PANTALLAS_POR_REPORTE = ${JSON.stringify(porReporte, null, 2)};

export const SIN_PANTALLA = ${JSON.stringify(sinPantalla)};

// Datasets automáticos (ver lib/tablasFueraMcp.js): tablas de pantallas que no están en
// el catálogo. Sus columnas se leen de la base al arrancar el MCP (lib/tablasAuto.js).
export const PANTALLAS_POR_TABLA_AUTO = ${JSON.stringify(porTablaAuto, null, 2)};
`;
writeFileSync(SALIDA, salida);

console.log(`Rutas leídas: ${rutas.length}`);
console.log(`Datasets con pantalla: ${Object.keys(porDataset).length} de ${Object.keys(CATALOGO).length}`);
console.log(`Reportes con pantalla: ${Object.keys(porReporte).length} de ${Object.keys(REPORTES).length}`);
console.log(`Datasets automáticos (${Object.keys(porTablaAuto).length}): ${Object.keys(porTablaAuto).join(', ') || '-'}`);
console.log(`Sin pantalla (${sinPantalla.length}): ${sinPantalla.join(', ') || '-'}`);
console.log(`Escrito: ${relative(RAIZ, SALIDA)}`);
