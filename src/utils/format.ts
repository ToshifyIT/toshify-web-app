// src/utils/format.ts
/**
 * Formatos de pantalla UNICOS para toda la app (fecha, fecha y hora, plata).
 * Antes cada modulo tenia su propio formatDate / formatMoney con resultados
 * distintos (y algunos corrian la fecha un dia por la zona horaria).
 *
 * Fechas: un "YYYY-MM-DD" es una fecha de calendario y se muestra tal cual;
 * un timestamp se muestra en hora Argentina (ver utils/fechaArgentina.ts).
 */
import { partesART } from './fechaArgentina'

type Fecha = string | null | undefined

const RE_SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** "DD/MM/YYYY". Vacio o invalido -> "-". */
export function formatFecha(valor: Fecha): string {
  if (!valor) return '-'
  const v = String(valor).trim()
  const solo = RE_SOLO_FECHA.exec(v)
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`
  const p = partesART(v)
  return p ? `${p.dia}/${p.mes}/${p.anio}` : '-'
}

/**
 * "DD/MM/YYYY HH:MM:SS" en hora Argentina (formato unico de las tablas).
 * Si el dato es solo fecha ("YYYY-MM-DD") devuelve "DD/MM/YYYY".
 * `{ segundos: false }` -> "DD/MM/YYYY HH:MM" (para lugares chicos).
 * Vacio o invalido -> "-".
 */
export function formatFechaHora(valor: Fecha, opciones: { segundos?: boolean } = {}): string {
  if (!valor) return '-'
  const v = String(valor).trim()
  if (RE_SOLO_FECHA.test(v)) return formatFecha(v)
  const p = partesART(v)
  if (!p) return '-'
  const hora = opciones.segundos === false ? `${p.hora}:${p.minuto}` : `${p.hora}:${p.minuto}:${p.segundo || '00'}`
  return `${p.dia}/${p.mes}/${p.anio} ${hora}`
}

/** Solo la hora "HH:MM:SS" (o "HH:MM" con `{ segundos: false }`) en hora Argentina. */
export function formatHora(valor: Fecha, opciones: { segundos?: boolean } = {}): string {
  if (!valor) return '-'
  const p = partesART(String(valor).trim())
  if (!p) return '-'
  return opciones.segundos === false ? `${p.hora}:${p.minuto}` : `${p.hora}:${p.minuto}:${p.segundo || '00'}`
}

export interface OpcionesPlata {
  /** Cantidad de decimales (por defecto 0). */
  decimales?: number
  /** Si es true, el 0 se muestra como "-" (comportamiento historico de varias tablas). */
  ceroComoGuion?: boolean
}

/** Pesos argentinos: "$ 12.345". Vacio o no numerico -> "-". */
export function formatPlata(valor: number | string | null | undefined, opciones: OpcionesPlata = {}): string {
  const { decimales = 0, ceroComoGuion = false } = opciones
  if (valor === null || valor === undefined || valor === '') return '-'
  // String: "1.234,5" (formato AR) o "1234.5" (como viene de la base)
  const txt = String(valor).trim()
  const n = typeof valor === 'number' ? valor : Number(txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : txt)
  if (!Number.isFinite(n)) return '-'
  if (n === 0 && ceroComoGuion) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n)
}

/**
 * Plata en la moneda que corresponde: pesos -> "$ 12.345", dolares -> "US$ 12.345,67".
 * Usar solo donde el dato viene en otra moneda (banco, facturas en USD); el resto es formatPlata.
 */
export function formatMoneda(
  valor: number | string | null | undefined,
  moneda: string | null | undefined = 'ARS',
  opciones: OpcionesPlata = {},
): string {
  const cod = (moneda || 'ARS').toUpperCase()
  if (cod === 'ARS') return formatPlata(valor, opciones)
  const { decimales = 2, ceroComoGuion = false } = opciones
  if (valor === null || valor === undefined || valor === '') return '-'
  const txt = String(valor).trim()
  const n = typeof valor === 'number' ? valor : Number(txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : txt)
  if (!Number.isFinite(n)) return '-'
  if (n === 0 && ceroComoGuion) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: cod,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n)
}

/** Numero con formato AR: 1234.5 -> "1.234,5". Para km, litros, cantidades. */
export function formatNumero(valor: number | string | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || valor === '') return '-'
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n)) return '-'
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n)
}
