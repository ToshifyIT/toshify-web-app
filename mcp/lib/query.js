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
