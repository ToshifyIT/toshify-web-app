// src/utils/semanaISO.ts
/**
 * Numero de semana UNICO para todo Toshify (ITCODE-429).
 *
 * Regla: semana ISO 8601, igual que los periodos de facturacion en la base.
 *   - La semana va de LUNES a DOMINGO.
 *   - La semana 1 es la que contiene el primer jueves del ano (o sea, el 4 de enero).
 *   - El "ano de la semana" puede no coincidir con el ano calendario en los bordes:
 *     el lunes 28/12/2026 es la semana 53 de 2026, y el 01/01/2027 tambien.
 *
 * No calcular semanas a mano en los modulos ni usar date-fns getWeek(): sin
 * firstWeekContainsDate: 4 da otro numero en los anos que no empiezan en jueves.
 */

export interface SemanaISO {
  semana: number
  anio: number
}

const DIA_MS = 86_400_000

/** Normaliza la entrada a {y, m, d} de calendario. String = fecha calendario; Date = sus componentes locales. */
function partes(fecha: string | Date): { y: number; m: number; d: number } | null {
  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return null
    return { y: fecha.getFullYear(), m: fecha.getMonth() + 1, d: fecha.getDate() }
  }
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''))
  if (!r) return null
  return { y: Number(r[1]), m: Number(r[2]), d: Number(r[3]) }
}

/** Semana ISO y ano ISO de una fecha ("YYYY-MM-DD" o Date). */
export function semanaISO(fecha: string | Date): SemanaISO {
  const p = partes(fecha)
  if (!p) return { semana: 0, anio: 0 }
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d))
  const diaSemana = t.getUTCDay() || 7 // lunes = 1 ... domingo = 7
  t.setUTCDate(t.getUTCDate() + 4 - diaSemana) // jueves de esa semana
  const anio = t.getUTCFullYear()
  const inicioAnio = Date.UTC(anio, 0, 1)
  const semana = Math.ceil(((t.getTime() - inicioAnio) / DIA_MS + 1) / 7)
  return { semana, anio }
}

/** Solo el numero de semana ISO (0 si la fecha no es valida). */
export function numeroSemana(fecha: string | Date): number {
  return semanaISO(fecha).semana
}

/** Lunes y domingo ("YYYY-MM-DD") de una semana ISO. */
export function rangoSemanaISO(semana: number, anio: number): { inicio: string; fin: string } {
  // El 4 de enero siempre cae en la semana 1
  const cuatroEnero = new Date(Date.UTC(anio, 0, 4))
  const lunesSemana1 = cuatroEnero.getTime() - ((cuatroEnero.getUTCDay() || 7) - 1) * DIA_MS
  const inicio = new Date(lunesSemana1 + (semana - 1) * 7 * DIA_MS)
  const fin = new Date(inicio.getTime() + 6 * DIA_MS)
  return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) }
}

/** Lunes y domingo como Date locales (a las 00:00 y 23:59:59.999), para codigo que usa Date. */
export function rangoSemanaISOFechas(semana: number, anio: number): { inicio: Date; fin: Date } {
  const { inicio, fin } = rangoSemanaISO(semana, anio)
  const [a, b, c] = inicio.split('-').map(Number)
  const [x, y, z] = fin.split('-').map(Number)
  return { inicio: new Date(a, b - 1, c, 0, 0, 0, 0), fin: new Date(x, y - 1, z, 23, 59, 59, 999) }
}

/** Cantidad de semanas ISO del ano (52 o 53). */
export function semanasDelAnio(anio: number): number {
  return semanaISO(`${anio}-12-28`).semana
}

/**
 * Suma (o resta) N semanas a una semana ISO. Respeta los anos de 53 semanas
 * (2026 tiene semana 53): no usar "si pasa de 52 vuelve a 1".
 */
export function sumarSemanasISO(semana: number, anio: number, n: number): SemanaISO {
  const { inicio } = rangoSemanaISO(semana, anio)
  const [y, m, d] = inicio.split('-').map(Number)
  const lunes = new Date(Date.UTC(y, m - 1, d + n * 7))
  return semanaISO(lunes.toISOString().slice(0, 10))
}

/** Lista de semanas desde (semana, anio) desplazada `desde` hasta `hasta` semanas (inclusive). */
export function semanasAlrededor(semana: number, anio: number, desde: number, hasta: number): SemanaISO[] {
  const out: SemanaISO[] = []
  for (let i = desde; i <= hasta; i++) out.push(sumarSemanasISO(semana, anio, i))
  return out
}
