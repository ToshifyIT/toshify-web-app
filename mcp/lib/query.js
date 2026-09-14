/**
 * Helpers compartidos por los routers de la API REST publica.
 *
 * Centraliza paginacion, validaciones y el armado del querystring de PostgREST
 * para no repetir la misma logica en cada recurso.
 *
 * NOTA: mcp/routes/leads.js todavia tiene sus propias copias de estos helpers.
 * Se dejo asi a proposito para no tocar codigo que ya esta en produccion; migrarlo
 * es una limpieza pendiente, no un requisito.
 */

import { supabaseRequest } from './supabase.js';

export const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RE_FECHA = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;

export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 100;

/** Tamano de cada lote interno al exportar con limit=all. */
export const LOTE_EXPORT = 1000;

/**
 * Techo duro del export completo. No es una restriccion de negocio: es lo que
 * evita que una sola request deje sin memoria al contenedor, que ademas sirve
 * el MCP del chatbot. Si un recurso lo supera, el consumidor tiene que filtrar.
 */
export const MAX_EXPORT = 50000;

/** true si el consumidor pidio el dataset completo (?limit=all). */
export function pidioTodo(query) {
  return String(query.limit ?? '').toLowerCase() === 'all';
}

export function parsearPaginacion(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(query.limit, 10) || LIMIT_DEFAULT));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Saca los caracteres con significado en la sintaxis `or=(campo.ilike.*valor*)`
 * de PostgREST. Sin esto, una coma o un parentesis en el input rompen el filtro.
 */
export function limpiarBusqueda(texto) {
  return String(texto).replace(/[,.()*\\"%]/g, ' ').trim().slice(0, 100);
}

/** Filtro de igualdad exacta, con el valor escapado. */
export function eq(campo, valor) {
  return `${campo}=eq.${encodeURIComponent(String(valor))}`;
}

/**
 * Filtro de fecha con validacion. Empuja a `errores` si el formato no sirve.
 * op: 'gte' | 'lte'
 */
export function fecha(campo, op, valor, errores, nombreParam) {
  if (!RE_FECHA.test(String(valor))) {
    errores.push(`${nombreParam} debe ser una fecha ISO (YYYY-MM-DD)`);
    return null;
  }
  return `${campo}=${op}.${encodeURIComponent(String(valor))}`;
}

/** Busqueda ilike sobre varias columnas. */
export function buscarEn(campos, texto) {
  const s = limpiarBusqueda(texto);
  if (!s) return null;
  const e = encodeURIComponent(s);
  return `or=(${campos.map((c) => `${c}.ilike.*${e}*`).join(',')})`;
}

/**
 * Ejecuta un listado paginado contra PostgREST y devuelve el envelope estandar.
 * `filtros` es un array de strings ya armados (los nulls se descartan).
 */
export async function listar({ tabla, select, orden, filtros = [], page, limit, offset }) {
  const qs = [
    `select=${select}`,
    orden ? `order=${orden}` : null,
    `offset=${offset}`,
    `limit=${limit}`,
    ...filtros,
  ].filter(Boolean).join('&');

  const res = await supabaseRequest(`${tabla}?${qs}`, {
    headers: { Prefer: 'count=exact' },
  });

  const data = await res.json();
  const total = parseInt(res.headers.get('content-range')?.split('/')[1], 10) || data.length;

  return {
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

/** Un registro por id. Devuelve null si no existe. */
export async function obtener({ tabla, select, id, filtros = [] }) {
  const qs = [`select=${select}`, `id=eq.${id}`, ...filtros, 'limit=1']
    .filter(Boolean).join('&');
  const res = await supabaseRequest(`${tabla}?${qs}`);
  const data = await res.json();
  return data.length ? data[0] : null;
}


/**
 * Cuenta las filas que matchean sin traerlas (limit=1 + count=exact).
 * Se usa para validar el techo ANTES de empezar a escribir la respuesta.
 */
async function contar({ tabla, filtros = [] }) {
  const qs = ['select=id', ...filtros, 'limit=1'].filter(Boolean).join('&');
  const res = await supabaseRequest(`${tabla}?${qs}`, { headers: { Prefer: 'count=exact' } });
  return parseInt(res.headers.get('content-range')?.split('/')[1], 10) || 0;
}

/**
 * Export completo (?limit=all).
 *
 * Trae de a LOTE_EXPORT registros y los va escribiendo en el response a medida
 * que llegan, en vez de armar el array entero en memoria. Asi el consumo de RAM
 * es constante sin importar si son 800 o 50.000 filas: es lo que permite servir
 * el dataset completo sin poner en riesgo al contenedor.
 *
 * Devuelve el mismo envelope que el listado paginado, con limit: "all".
 *
 * OJO: una vez que empezo a escribir ya no se puede cambiar el status HTTP. Por
 * eso el techo se valida ANTES (con contar()), y un error de un lote intermedio
 * se reporta como campo "error" dentro del JSON, no como 500.
 */
export async function exportarTodo({ res, tabla, select, orden, filtros = [], transform }) {
  const total = await contar({ tabla, filtros });

  if (total > MAX_EXPORT) {
    const err = new Error(`El resultado tiene ${total} registros y el maximo por export es ${MAX_EXPORT}. Acotá con filtros (por ejemplo desde/hasta) o paginá con page y limit.`);
    err.codigo = 'too_many_rows';
    throw err;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Total-Count', String(total));
  res.write('{"data":[');

  let enviados = 0;
  let fallo = null;

  try {
    for (let offset = 0; offset < total; offset += LOTE_EXPORT) {
      const qs = [
        `select=${select}`,
        orden ? `order=${orden}` : null,
        `offset=${offset}`,
        `limit=${LOTE_EXPORT}`,
        ...filtros,
      ].filter(Boolean).join('&');

      const r = await supabaseRequest(`${tabla}?${qs}`);
      const lote = await r.json();
      if (!lote.length) break;

      for (const fila of lote) {
        const salida = transform ? transform(fila) : fila;
        res.write((enviados ? ',' : '') + JSON.stringify(salida));
        enviados += 1;
      }
    }
  } catch (error) {
    fallo = error.message;
  }

  const cola = {
    page: 1,
    limit: 'all',
    total,
    total_pages: 1,
    devueltos: enviados,
  };
  if (fallo) cola.error = 'El export se interrumpió: la respuesta está incompleta';

  res.write(`],"pagination":${JSON.stringify(cola)}}`);
  res.end();

  return { total, enviados, fallo };
}
