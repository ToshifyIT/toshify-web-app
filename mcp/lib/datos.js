/**
 * Consultas de solo lectura sobre el catálogo de datos (lib/catalogoDatos.js).
 *
 * Lo usan las herramientas MCP listar_datos, describir_datos, consultar_datos y
 * contar_datos (permiso datos:read). Todo pasa por el catálogo: solo se puede
 * leer un dataset que esté ahí y solo sus columnas permitidas; nunca select=*.
 * Únicamente hace GET contra PostgREST: no hay forma de escribir desde acá.
 *
 * Los errores de la base no se devuelven al cliente (podrían mostrar detalles
 * internos): se loguean en el servidor y el cliente recibe un mensaje genérico.
 */

import { supabaseRequest } from './supabase.js';
import { CATALOGO } from './catalogoDatos.js';

export const LIMITE_DEFAULT = 50;
export const LIMITE_MAX = 200;
/** Filas que contar_datos recorre como máximo para agrupar. */
export const MAX_FILAS_AGRUPAR = 20000;
const LOTE_AGRUPAR = 5000;

export const OPERADORES = ['igual', 'distinto', 'mayor', 'mayor_igual', 'menor', 'menor_igual', 'contiene', 'en', 'es_nulo'];
const OP_POSTGREST = { igual: 'eq', distinto: 'neq', mayor: 'gt', mayor_igual: 'gte', menor: 'lt', menor_igual: 'lte' };
export const PERIODOS = ['dia', 'mes', 'anio'];

/** Error con mensaje apto para mostrarle al usuario. */
export class ErrorDatos extends Error {}

export function listarDatasets(modulo) {
  return Object.entries(CATALOGO)
    .filter(([, d]) => !modulo || d.modulo.toLowerCase() === String(modulo).toLowerCase())
    .map(([nombre, d]) => ({ dataset: nombre, modulo: d.modulo, descripcion: d.descripcion }));
}

export function modulos() {
  return [...new Set(Object.values(CATALOGO).map(d => d.modulo))];
}

export function describirDataset(nombre) {
  const d = dataset(nombre);
  return { dataset: nombre, modulo: d.modulo, descripcion: d.descripcion, campos: d.columnas };
}

function dataset(nombre) {
  const d = CATALOGO[nombre];
  if (!d) throw new ErrorDatos(`No existe el dataset "${nombre}". Usá listar_datos para ver los disponibles.`);
  return d;
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

/** Listado paginado. */
export async function consultar({ dataset: nombre, campos, filtros, orden, descendente, limite, pagina }) {
  const d = dataset(nombre);
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
  ].filter(Boolean).join('&');

  const res = await pedir(`${nombre}?${qs}`, { headers: { Prefer: 'count=exact' } });
  const filas = await res.json();
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

/** Total de registros, o cantidad por valor de un campo (opcionalmente por día/mes/año si es fecha). */
export async function contar({ dataset: nombre, filtros, agrupar_por, periodo }) {
  const d = dataset(nombre);
  const condiciones = armarFiltros(d, nombre, filtros);

  if (!agrupar_por) {
    const qs = [`select=${Object.keys(d.columnas)[0]}`, 'limit=1', ...condiciones].join('&');
    const res = await pedir(`${nombre}?${qs}`, { headers: { Prefer: 'count=exact' } });
    return { dataset: nombre, total: totalDe(res, 0) };
  }

  validarCampo(d, nombre, agrupar_por);
  const tipo = d.columnas[agrupar_por];
  if (periodo && !PERIODOS.includes(periodo)) throw new ErrorDatos(`Periodo inválido. Usar: ${PERIODOS.join(', ')}.`);
  if (periodo && tipo !== 'fecha') throw new ErrorDatos(`"${agrupar_por}" no es una fecha: no se puede agrupar por ${periodo}.`);

  // Primero el total (rápido) para cortar antes de recorrer una tabla enorme
  const resTotal = await pedir(`${nombre}?${[`select=${agrupar_por}`, 'limit=1', ...condiciones].join('&')}`, { headers: { Prefer: 'count=exact' } });
  const total = totalDe(resTotal, 0);
  if (total > MAX_FILAS_AGRUPAR) {
    throw new ErrorDatos(`Hay ${total} registros y para agrupar el máximo es ${MAX_FILAS_AGRUPAR}. Acotá con filtros (por ejemplo un rango de fechas).`);
  }

  // Lotes ordenados por id (índice) para que la paginación sea estable y rápida
  const orden = Object.hasOwn(d.columnas, 'id') ? 'id' : agrupar_por;
  const grupos = new Map();
  for (let offset = 0; offset < total; offset += LOTE_AGRUPAR) {
    const qs = [`select=${agrupar_por}`, `order=${orden}.asc`, `offset=${offset}`, `limit=${LOTE_AGRUPAR}`, ...condiciones].join('&');
    const filas = await (await pedir(`${nombre}?${qs}`)).json();
    if (filas.length === 0) break;
    for (const f of filas) {
      const k = claveGrupo(f[agrupar_por], tipo, periodo);
      grupos.set(k, (grupos.get(k) || 0) + 1);
    }
  }
  const resultado = [...grupos].map(([valor, cantidad]) => ({ valor, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.valor.localeCompare(b.valor));
  return { dataset: nombre, total, agrupado_por: agrupar_por, periodo: periodo || null, grupos: resultado.slice(0, 500) };
}
