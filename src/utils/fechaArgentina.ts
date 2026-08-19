// src/utils/fechaArgentina.ts
/**
 * Helpers de fecha/hora para datos que ya vienen expresados en hora Argentina
 * (ART, UTC-3): columnas *_gmt3, periodo_inicio/periodo_fin, hora_inicio, etc.
 *
 * QUE PROBLEMA RESUELVEN
 * Postgres devuelve un `timestamp without time zone` como "2026-08-12T09:46:53",
 * es decir SIN offset. `new Date(...)` sobre un string sin offset lo interpreta
 * en la zona horaria DEL NAVEGADOR, asi que el mismo registro se ve con horas
 * distintas segun la maquina de cada operador (en UTC-4 se desfasa +1h, en
 * UTC-5 +2h, y solo coincide por casualidad si el equipo esta en UTC-3).
 *
 * La regla que aplican estos helpers:
 *   - String SIN offset  -> el valor YA esta en ART. Se lee con regex, sin
 *                           construir ningun Date: lo mostrado es identico a
 *                           lo que dice la base, corra donde corra el browser.
 *   - String CON offset  -> es un instante real (Z, +00:00, -03:00...). Se
 *                           convierte a ART con Intl, que respeta la zona.
 *
 * No usar `new Date(valor)` directo sobre estos campos: ese es exactamente el
 * bug que este modulo existe para evitar.
 */

export const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'

/** Offset fijo de Argentina. El pais no aplica horario de verano desde 2009. */
const OFFSET_ARGENTINA = '-03:00'

export interface PartesFechaHoraART {
  anio: string    // "2026"
  mes: string     // "08"
  dia: string     // "12"
  hora: string    // "09"
  minuto: string  // "46"
  segundo: string // "53"
}

const RE_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
const RE_TIENE_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i

const formateadorART = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE_ARGENTINA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** true si el string trae zona horaria explicita (Z / +00:00 / -03:00). */
function tieneOffset(s: string): boolean {
  return RE_TIENE_OFFSET.test(s)
}

/**
 * Descompone un timestamp en sus partes de calendario ART.
 * Devuelve null si el valor es vacio o no parseable.
 */
export function partesART(valor: string | null | undefined): PartesFechaHoraART | null {
  const s = (valor || '').trim()
  if (!s) return null

  if (tieneOffset(s)) {
    const d = new Date(s.replace(' ', 'T'))
    if (isNaN(d.getTime())) return null
    const p: Record<string, string> = {}
    for (const parte of formateadorART.formatToParts(d)) p[parte.type] = parte.value
    if (!p.year || !p.hour) return null
    // Algunos motores devuelven "24" para medianoche con hour12:false.
    const hora = p.hour === '24' ? '00' : p.hour
    return { anio: p.year, mes: p.month, dia: p.day, hora, minuto: p.minute, segundo: p.second }
  }

  const m = s.match(RE_FECHA_HORA)
  if (!m) return null
  return { anio: m[1], mes: m[2], dia: m[3], hora: m[4], minuto: m[5], segundo: m[6] || '00' }
}

/**
 * Convierte a Date para ordenar o restar. A los strings sin offset les asume
 * -03:00 (ART) en vez de dejar que el browser imponga su zona.
 */
export function toDateART(valor: string | null | undefined): Date | null {
  const s = (valor || '').trim()
  if (!s) return null
  const iso = tieneOffset(s) ? s.replace(' ', 'T') : `${s.replace(' ', 'T')}${OFFSET_ARGENTINA}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** Timestamp en ms para ordenar. Devuelve `fallback` si el valor no sirve. */
export function timestampART(valor: string | null | undefined, fallback = 0): number {
  return toDateART(valor)?.getTime() ?? fallback
}

/** "HH:MM:SS" en ART. */
export function formatHoraART(valor: string | null | undefined): string {
  const p = partesART(valor)
  return p ? `${p.hora}:${p.minuto}:${p.segundo}` : '-'
}

/** "DD/MM/YY" en ART. */
export function formatFechaART(valor: string | null | undefined): string {
  const p = partesART(valor)
  return p ? `${p.dia}/${p.mes}/${p.anio.slice(2)}` : '-'
}

/** "DD/MM/YY HH:MM:SS" en ART. */
export function formatFechaHoraART(valor: string | null | undefined): string {
  const p = partesART(valor)
  return p ? `${p.dia}/${p.mes}/${p.anio.slice(2)} ${p.hora}:${p.minuto}:${p.segundo}` : '-'
}

/** "DD/MM HH:MM:SS" en ART (sin anio). */
export function formatFechaHoraCortaART(valor: string | null | undefined): string {
  const p = partesART(valor)
  return p ? `${p.dia}/${p.mes} ${p.hora}:${p.minuto}:${p.segundo}` : '-'
}

/** "YYYY-MM-DD" en ART, util para agrupar por dia calendario. */
export function fechaISOART(valor: string | null | undefined): string | null {
  const p = partesART(valor)
  return p ? `${p.anio}-${p.mes}-${p.dia}` : null
}
