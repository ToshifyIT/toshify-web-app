// src/modules/siniestros/components/companiasSeguro.ts
/**
 * Compañías de seguro más comunes en Argentina, para la compañía del tercero.
 * Se guarda el nombre tal cual figura acá, así los reportes agrupan bien.
 */
export const COMPANIAS_SEGURO = [
  'Allianz',
  'ATM Seguros',
  'Berkley',
  'Caja Seguros (La Caja)',
  'Cooperación Seguros',
  'El Norte',
  'Experta Seguros',
  'Federación Patronal',
  'Galicia Seguros',
  'HDI Seguros',
  'Integrity Seguros',
  'La Holando',
  'La Segunda',
  'Libra Seguros',
  'Mapfre',
  'Mercantil Andina',
  'Meridional Seguros',
  'Nación Seguros',
  'Orbis Seguros',
  'Provincia Seguros',
  'Prudencia Seguros',
  'Rivadavia Seguros',
  'Río Uruguay Seguros (RUS)',
  'San Cristóbal',
  'Sancor Seguros',
  'SMG Seguros',
  'Triunfo Seguros',
  'Zurich',
]

/** Opciones que no son una compañía */
export const SIN_SEGURO = 'Sin seguro'
export const NO_SABE = 'No informado'

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/seguros?/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Busca la compañía de la lista que corresponde a un texto cargado a mano
 * ("sancor" → "Sancor Seguros", "la caja" → "Caja Seguros (La Caja)").
 */
export function companiaDeLista(valor?: string | null): string | null {
  if (!valor?.trim()) return null
  const n = normalizar(valor)
  if (!n) return null
  for (const c of [...COMPANIAS_SEGURO, SIN_SEGURO, NO_SABE]) {
    const nc = normalizar(c)
    // Coincidencia exacta, o el nombre corto (sin paréntesis) dentro del texto
    const corto = normalizar(c.replace(/\(.*\)/, ''))
    const alias = (c.match(/\((.*)\)/)?.[1] || '')
    if (n === nc || n === corto || (alias && n === normalizar(alias))) return c
  }
  return null
}

/** Nombre para mostrar: el de la lista si coincide, si no el texto cargado. */
export function nombreCompaniaTercero(valor?: string | null): string {
  return companiaDeLista(valor) || valor?.trim() || ''
}
