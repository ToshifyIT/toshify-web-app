/**
 * Consultas de solo lectura sobre el catálogo de datos (lib/catalogoDatos.js).
 *
 * Lo usan las herramientas MCP listar_datos, describir_datos, consultar_datos,
 * contar_datos y consultar_reporte. Todo pasa por el catálogo: solo se puede leer un
 * dataset que esté ahí, que la key tenga permitido (datos:read o el `permiso` del
 * dataset) y solo sus columnas permitidas (más las de `columnasPorPermiso` si la key
 * tiene ese permiso); nunca select=*. Los permisos se reciben en cada llamada: un
 * dataset que la key no puede ver responde igual que uno inexistente.
 * Únicamente hace GET contra PostgREST: no hay forma de escribir desde acá. Los
 * reportes (RPC) también van por GET, que PostgREST ejecuta en una transacción de
 * solo lectura: aunque la función intentara escribir, la base lo rechaza.
 *
 * Los errores de la base no se devuelven al cliente (podrían mostrar detalles
 * internos): se loguean en el servidor y el cliente recibe un mensaje genérico.
 */

import { supabaseRequest } from './supabase.js';
import { CATALOGO } from './catalogoDatos.js';

export const LIMITE_DEFAULT = 50;
export const LIMITE_MAX = 200;
/** Filas que contar_datos recorre como máximo para agrupar o sumar. */
export const MAX_FILAS_AGRUPAR = 20000;
const LOTE_AGRUPAR = 5000;
/** Datasets por llamada en describir_datos. */
export const MAX_DESCRIBIR = 15;

export const OPERADORES = ['igual', 'distinto', 'mayor', 'mayor_igual', 'menor', 'menor_igual', 'contiene', 'en', 'es_nulo'];
const OP_POSTGREST = { igual: 'eq', distinto: 'neq', mayor: 'gt', mayor_igual: 'gte', menor: 'lt', menor_igual: 'lte' };
export const PERIODOS = ['dia', 'mes', 'anio'];

/**
 * Patentes de prueba (PRUEBA987, PRUB99999, PRB001…): no son autos reales. Se excluyen
 * solas de los datasets con patente salvo que se pida incluir_pruebas. Mismo criterio
 * que la pantalla de Vencimientos; PRU345 queda porque tiene formato de patente real.
 */
const PREFIJOS_PRUEBA = ['PRUEB', 'PRUB', 'PRB'];
const CAMPOS_PATENTE = ['patente', 'vehiculo_patente'];

/**
 * Reportes (funciones RPC) que se pueden consultar. Lista fija: cualquier otra
 * función queda afuera (kpi_guardar_forecast, kpi_recalcular, kpi_actualizar… escriben).
 */
export const REPORTES = {
  dashboard_directivo: {
    funcion: 'get_dashboard_directivo',
    permiso: 'datos:read',
    descripcion: 'Dashboard Directivo: conductores activos, en la calle y en espera, retención, motivos de caídas y de cierre, perfil de conversión, serie semanal y zonas.',
    parametros: ['p_desde', 'p_hasta', 'p_hoy', 'p_sede_id'],
  },
  dashboard_marketing: {
    funcion: 'get_dashboard_marketing',
    permiso: 'datos:read',
    descripcion: 'Dashboard de Marketing: leads por fuente y su conversión en el período.',
    parametros: ['p_desde', 'p_hasta', 'p_hoy', 'p_sede_id'],
  },
  dashboard_kpis: {
    funcion: 'get_dashboard_kpis_v2',
    permiso: 'administracion:read',
    descripcion: "Dashboard KPI's v2: flota, ocupación, operatividad, facturación y cobranza por semana, contra el forecast. Incluye facturación: requiere permiso de administración.",
    parametros: ['p_desde', 'p_hasta', 'p_sede_id'],
  },
};

/** Error con mensaje apto para mostrarle al usuario. */
export class ErrorDatos extends Error {}

/** Permiso que pide un dataset. */
function permisoDe(d) {
  return d.permiso || 'datos:read';
}

/**
 * Si se puede leer un dataset: una key por su permiso (datos:read o el del dataset) y
 * por tabla:<dataset> (módulos tildados en la key, cruzados con el usuario que inicia
 * sesión por el conector de Claude; ver lib/accesoUsuario.js).
 */
function puedeLeer(nombre, d, permisos = []) {
  return permisos.includes(permisoDe(d)) || permisos.includes(`tabla:${nombre}`);
}

/** true si los permisos dan acceso a algún dataset o reporte (registra las herramientas). */
export function tieneAccesoADatos(permisos = []) {
  return permisos.some((p) => p === 'datos:read' || p === 'administracion:read' ||
    p.startsWith('tabla:') || p.startsWith('reporte:'));
}

/** Datasets que puede leer una key o persona con estos permisos. */
function visibles(permisos = []) {
  return Object.entries(CATALOGO).filter(([nombre, d]) => puedeLeer(nombre, d, permisos));
}

/** Columnas del dataset para esta key: las base más las de sus permisos extra. */
function columnasDe(d, permisos = []) {
  const extra = Object.entries(d.columnasPorPermiso || {})
    .filter(([permiso]) => permisos.includes(permiso))
    .map(([, columnas]) => columnas);
  return Object.assign({}, d.columnas, ...extra);
}

export function listarDatasets(modulo, permisos) {
  return visibles(permisos)
    .filter(([, d]) => !modulo || d.modulo.toLowerCase() === String(modulo).toLowerCase())
    .map(([nombre, d]) => ({ dataset: nombre, modulo: d.modulo, descripcion: d.descripcion }));
}

export function modulos(permisos) {
  return [...new Set(visibles(permisos).map(([, d]) => d.modulo))];
}

/** Campos de uno o varios datasets (hasta MAX_DESCRIBIR por llamada). */
export function describirDatasets(nombres, permisos) {
  const lista = [...new Set((Array.isArray(nombres) ? nombres : [nombres]).filter(Boolean))];
  if (lista.length === 0) throw new ErrorDatos('Indicá al menos un dataset.');
  if (lista.length > MAX_DESCRIBIR) throw new ErrorDatos(`Máximo ${MAX_DESCRIBIR} datasets por llamada.`);
  return {
    datasets: lista.map((nombre) => {
      const d = dataset(nombre, permisos);
      const campos = { ...d.columnas };
      if (Object.hasOwn(campos, 'sede_id') && !Object.hasOwn(campos, 'sede_nombre')) {
        campos.sede_nombre = 'texto (se agrega solo en las respuestas)';
      }
      return { dataset: nombre, modulo: d.modulo, descripcion: d.descripcion, campos };
    }),
  };
}

/** Dataset con las columnas que esta key puede ver. */
function dataset(nombre, permisos = []) {
  const d = Object.hasOwn(CATALOGO, nombre) ? CATALOGO[nombre] : null;
  if (!d || !puedeLeer(nombre, d, permisos)) throw new ErrorDatos(`No existe el dataset "${nombre}". Usá listar_datos para ver los disponibles.`);
  return { modulo: d.modulo, descripcion: d.descripcion, columnas: columnasDe(d, permisos) };
}

function validarCampo(d, nombreDataset, campo) {
  if (!Object.hasOwn(d.columnas, campo)) {
    throw new ErrorDatos(`El campo "${campo}" no existe en "${nombreDataset}". Usá describir_datos para ver los campos.`);
  }
}

/** Valor escapado para un filtro simple de PostgREST. */
function valor(v) {
  return encodeURIComponent(String(v));
}

/** Valor dentro de in.(...) : entre comillas dobles y sin caracteres de control de la sintaxis. */
function valorLista(v) {
  return `"${String(v).replace(/["\\]/g, '')}"`;
}

/** Texto para contiene (ilike): sin los comodines ni separadores de PostgREST. */
function textoBusqueda(v) {
  return String(v).replace(/[,()*\\"%]/g, ' ').trim().slice(0, 100);
}

function armarFiltros(d, nombreDataset, filtros = []) {
  if (filtros.length > 15) throw new ErrorDatos('Máximo 15 filtros por consulta.');
  return filtros.map(({ campo, operador, valor: v }) => {
    validarCampo(d, nombreDataset, campo);
    if (!OPERADORES.includes(operador)) {
      throw new ErrorDatos(`Operador "${operador}" inválido. Usar: ${OPERADORES.join(', ')}.`);
    }
    if (operador === 'es_nulo') {
      const esNulo = v === undefined || v === true || String(v).toLowerCase() === 'true';
      return `${campo}=${esNulo ? 'is' : 'not.is'}.null`;
    }
    if (v === undefined || v === null || v === '') throw new ErrorDatos(`Falta el valor del filtro sobre "${campo}".`);
    if (operador === 'contiene') {
      const t = textoBusqueda(v);
      if (!t) throw new ErrorDatos(`El texto a buscar en "${campo}" está vacío.`);
      return `${campo}=ilike.${valor(`*${t}*`)}`;
    }
    if (operador === 'en') {
      const lista = Array.isArray(v) ? v : String(v).split(',');
      if (lista.length === 0 || lista.length > 100) throw new ErrorDatos('El filtro "en" acepta entre 1 y 100 valores.');
      return `${campo}=in.(${valor(lista.map(valorLista).join(','))})`;
    }
    return `${campo}=${OP_POSTGREST[operador]}.${valor(v)}`;
  });
}

/** Filtro que saca las patentes de prueba (deja las filas sin patente). */
function filtroPruebas(d, incluirPruebas) {
  if (incluirPruebas) return [];
  const campo = CAMPOS_PATENTE.find((c) => Object.hasOwn(d.columnas, c));
  if (!campo) return [];
  const condiciones = PREFIJOS_PRUEBA.map((p) => `${campo}.not.ilike.${p}*`).join(',');
  return [`or=(${campo}.is.null,and(${condiciones}))`];
}

async function pedir(path, opciones) {
  try {
    return await supabaseRequest(path, opciones);
  } catch (error) {
    console.error('[MCP datos]', path, error.message);
    if (String(error.message).includes('57014')) {
      throw new ErrorDatos('La consulta tardó demasiado. Acotá con filtros (por ejemplo un rango de fechas o una patente).');
    }
    throw new ErrorDatos('No se pudo consultar ese dato. Revisá los filtros (por ejemplo el formato de fecha AAAA-MM-DD o el tipo del valor).');
  }
}

function totalDe(res, filas) {
  return parseInt(res.headers.get('content-range')?.split('/')[1], 10) || filas;
}

// Nombres de las sedes, para agregar sede_nombre a las filas. Cambian muy poco.
let sedesCache = null;
let sedesVence = 0;

async function nombresDeSedes() {
  if (sedesCache && Date.now() < sedesVence) return sedesCache;
  const filas = await (await pedir('sedes?select=id,nombre')).json();
  sedesCache = new Map(filas.map((s) => [s.id, s.nombre]));
  sedesVence = Date.now() + 10 * 60 * 1000;
  return sedesCache;
}

/** Agrega sede_nombre a cada fila que trae sede_id (si el dataset no lo trae ya). */
async function agregarSedes(filas) {
  if (!filas.some((f) => f.sede_id && f.sede_nombre === undefined)) return filas;
  const sedes = await nombresDeSedes();
  return filas.map((f) => (f.sede_id && f.sede_nombre === undefined
    ? { ...f, sede_nombre: sedes.get(f.sede_id) ?? null }
    : f));
}

/** Listado paginado. */
export async function consultar({ dataset: nombre, campos, filtros, orden, descendente, limite, pagina, incluir_pruebas }, permisos) {
  const d = dataset(nombre, permisos);
  const seleccion = campos?.length ? campos : Object.keys(d.columnas);
  seleccion.forEach(c => validarCampo(d, nombre, c));
  if (orden) validarCampo(d, nombre, orden);

  const lim = Math.min(LIMITE_MAX, Math.max(1, Number(limite) || LIMITE_DEFAULT));
  const pag = Math.max(1, Number(pagina) || 1);
  const qs = [
    `select=${seleccion.join(',')}`,
    orden ? `order=${orden}.${descendente ? 'desc' : 'asc'}.nullslast` : null,
    `offset=${(pag - 1) * lim}`,
    `limit=${lim}`,
    ...armarFiltros(d, nombre, filtros),
    ...filtroPruebas(d, incluir_pruebas),
  ].filter(Boolean).join('&');

  const res = await pedir(`${nombre}?${qs}`, { headers: { Prefer: 'count=exact' } });
  const filas = await agregarSedes(await res.json());
  const total = totalDe(res, filas.length);
  return { dataset: nombre, total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim), filas };
}

function claveGrupo(v, tipo, periodo) {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (tipo === 'fecha' && periodo) {
    const s = String(v);
    return periodo === 'anio' ? s.slice(0, 4) : periodo === 'mes' ? s.slice(0, 7) : s.slice(0, 10);
  }
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Redondeo a 2 decimales para sumas y promedios de importes. */
function redondear(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Total de registros, o cantidad por valor de un campo (opcionalmente por día/mes/año si
 * es fecha). Con `sumar` (un campo numérico) también devuelve la suma y el promedio, en
 * total o por grupo.
 */
export async function contar({ dataset: nombre, filtros, agrupar_por, periodo, sumar, incluir_pruebas }, permisos) {
  const d = dataset(nombre, permisos);
  const condiciones = [...armarFiltros(d, nombre, filtros), ...filtroPruebas(d, incluir_pruebas)];

  if (sumar) {
    validarCampo(d, nombre, sumar);
    if (d.columnas[sumar] !== 'numero') {
      throw new ErrorDatos(`"${sumar}" no es un campo numérico: no se puede sumar.${nombre === 'multas_historico' ? ' Para importes de multas usá v_multas_historico (importe_numero).' : ''}`);
    }
  }

  if (!agrupar_por && !sumar) {
    const qs = [`select=${Object.keys(d.columnas)[0]}`, 'limit=1', ...condiciones].join('&');
    const res = await pedir(`${nombre}?${qs}`, { headers: { Prefer: 'count=exact' } });
    return { dataset: nombre, total: totalDe(res, 0) };
  }

  let tipo = null;
  if (agrupar_por) {
    validarCampo(d, nombre, agrupar_por);
    tipo = d.columnas[agrupar_por];
    if (periodo && !PERIODOS.includes(periodo)) throw new ErrorDatos(`Periodo inválido. Usar: ${PERIODOS.join(', ')}.`);
    if (periodo && tipo !== 'fecha') throw new ErrorDatos(`"${agrupar_por}" no es una fecha: no se puede agrupar por ${periodo}.`);
  }
  const seleccion = [...new Set([agrupar_por, sumar].filter(Boolean))].join(',');

  // Primero el total (rápido) para cortar antes de recorrer una tabla enorme
  const resTotal = await pedir(`${nombre}?${[`select=${seleccion}`, 'limit=1', ...condiciones].join('&')}`, { headers: { Prefer: 'count=exact' } });
  const total = totalDe(resTotal, 0);
  if (total > MAX_FILAS_AGRUPAR) {
    throw new ErrorDatos(`Hay ${total} registros y para agrupar o sumar el máximo es ${MAX_FILAS_AGRUPAR}. Acotá con filtros (por ejemplo un rango de fechas).`);
  }

  // Lotes ordenados por id (índice) para que la paginación sea estable y rápida
  const orden = Object.hasOwn(d.columnas, 'id') ? 'id' : (agrupar_por || sumar);
  const grupos = new Map();
  for (let offset = 0; offset < total; offset += LOTE_AGRUPAR) {
    const qs = [`select=${seleccion}`, `order=${orden}.asc`, `offset=${offset}`, `limit=${LOTE_AGRUPAR}`, ...condiciones].join('&');
    const filas = await (await pedir(`${nombre}?${qs}`)).json();
    if (filas.length === 0) break;
    for (const f of filas) {
      const k = agrupar_por ? claveGrupo(f[agrupar_por], tipo, periodo) : '(total)';
      const g = grupos.get(k) || { cantidad: 0, suma: 0, conValor: 0 };
      g.cantidad += 1;
      if (sumar && f[sumar] !== null && f[sumar] !== undefined && f[sumar] !== '') {
        const n = Number(f[sumar]);
        if (Number.isFinite(n)) { g.suma += n; g.conValor += 1; }
      }
      grupos.set(k, g);
    }
  }

  const armar = (g) => (sumar
    ? { cantidad: g.cantidad, suma: redondear(g.suma), promedio: g.conValor ? redondear(g.suma / g.conValor) : null, con_valor: g.conValor }
    : { cantidad: g.cantidad });

  if (!agrupar_por) {
    return { dataset: nombre, total, sumado: sumar, ...armar(grupos.get('(total)') || { cantidad: 0, suma: 0, conValor: 0 }) };
  }

  const resultado = [...grupos].map(([valor, g]) => ({ valor, ...armar(g) }))
    .sort((a, b) => (sumar ? b.suma - a.suma : 0) || b.cantidad - a.cantidad || a.valor.localeCompare(b.valor));
  return { dataset: nombre, total, agrupado_por: agrupar_por, periodo: periodo || null, sumado: sumar || null, grupos: resultado.slice(0, 500) };
}

/** Reportes que puede consultar una key con estos permisos. */
export function reportesVisibles(permisos = []) {
  return Object.entries(REPORTES)
    .filter(([nombre, r]) => permisos.includes(r.permiso) || permisos.includes(`reporte:${nombre}`))
    .map(([nombre, r]) => ({ reporte: nombre, descripcion: r.descripcion, parametros: r.parametros }));
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ejecuta un reporte de la lista fija, por GET (transacción de solo lectura). */
export async function consultarReporte({ reporte, desde, hasta, hoy, sede_id }, permisos = []) {
  const r = Object.hasOwn(REPORTES, reporte) ? REPORTES[reporte] : null;
  if (!r || !(permisos.includes(r.permiso) || permisos.includes(`reporte:${reporte}`))) {
    throw new ErrorDatos(`No existe el reporte "${reporte}". Disponibles: ${reportesVisibles(permisos).map((x) => x.reporte).join(', ') || 'ninguno'}.`);
  }
  for (const [nombre, v] of [['desde', desde], ['hasta', hasta], ['hoy', hoy]]) {
    if (v && !FECHA.test(v)) throw new ErrorDatos(`"${nombre}" tiene que ser una fecha AAAA-MM-DD.`);
  }
  if (sede_id && !UUID.test(sede_id)) throw new ErrorDatos('"sede_id" tiene que ser un id de sede (ver el dataset sedes).');

  const valores = { p_desde: desde, p_hasta: hasta, p_hoy: hoy, p_sede_id: sede_id };
  const qs = r.parametros
    .filter((p) => valores[p])
    .map((p) => `${p}=${valor(valores[p])}`)
    .join('&');
  const res = await pedir(`rpc/${r.funcion}${qs ? `?${qs}` : ''}`);
  return { reporte, parametros: { desde, hasta, hoy, sede_id }, datos: await res.json() };
}
