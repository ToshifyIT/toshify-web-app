// src/modules/reportes/directivo/directivoTypes.ts
// Forma del JSON que devuelve get_dashboard_directivo (sql/dashboard_directivo.sql)
// y helpers puros para presentarlo (período, variaciones y lecturas).
import { getWeek, getWeekYear } from 'date-fns'


export interface RetencionHito {
  semanas: number
  base: number
  retenidos: number
}

export interface MetricasPeriodo {
  desde: string
  hasta: string
  altas: number
  reactivaciones: number
  bajas: number
  bajas_estimadas: number
  activos_inicio: number
  activos_fin: number
  permanencia_mediana_semanas: number | null
  leads: number
  aceptan_oferta: number
  convertidos: number
  con_primer_turno: number
  cerrados_sin_conversion: number
  conductores_nuevos: number
  nuevos_con_lead: number
  dias_a_la_calle_mediana: number | null
  dias_a_la_calle_p90: number | null
  dias_lead_a_conversion_mediana: number | null
  dias_conversion_a_turno_mediana: number | null
  nuevos_con_desglose: number
  dias_captacion_suma: number
  dias_entrega_suma: number
  /** Personas con programación/asignación cancelada en el período que nunca salieron a la calle */
  caidas: number
  retencion: RetencionHito[]
}

export interface SemanaSerie {
  semana: string // lunes 'YYYY-MM-DD'
  altas: number
  altas_estimadas: number
  reactivaciones: number
  bajas: number
  bajas_estimadas: number
  activos_fin: number
  leads: number
  nuevos_en_la_calle: number
}

export interface ZonaFila {
  zona: string
  leads: number
  leads_con_turno: number
  nuevos_en_la_calle: number
  activos_hoy: number
}

export interface PerfilRetencion {
  dimension: string
  valor: string
  base: number
  retenidos: number
}

export interface PerfilConversion {
  dimension: string
  valor: string
  leads: number
  con_turno: number
}

export interface DirectivoRaw {
  hoy: string
  desde: string
  hasta: string
  generado_en: string
  hoy_snapshot: {
    conductores_activos: number
    conductores_en_la_calle: number
    conductores_en_espera: number
    antiguedad_mediana_semanas: number | null
    total_flota: number
    en_uso: number
    turnos_totales: number
    turnos_disponibles: number
    ocupacion: number | null
    operatividad: number | null
  }
  periodo: {
    actual: MetricasPeriodo
    anterior: MetricasPeriodo
  }
  motivos_cierre: { motivo: string; cantidad: number }[]
  motivos_caidas: { motivo: string; cantidad: number }[]
  serie_semanal: SemanaSerie[]
  zonas: ZonaFila[]
  perfil_retencion: PerfilRetencion[]
  perfil_conversion: PerfilConversion[]
}

export type TonoLectura = 'positivo' | 'atencion'

export interface Lectura {
  tono: TonoLectura
  titulo: string
  detalle: string
}

// ───────────── Período ─────────────

export type PresetPeriodo =
  | 'semana_actual'
  | 'semana_anterior'
  | 'ultimas_4'
  | 'ultimas_12'
  | 'ultimas_26'
  | 'ultimas_52'
  | 'personalizado'

export const PRESETS: { id: PresetPeriodo; label: string }[] = [
  { id: 'semana_actual', label: 'Semana actual' },
  { id: 'semana_anterior', label: 'Semana anterior' },
  { id: 'ultimas_4', label: 'Últimas 4 semanas' },
  { id: 'ultimas_12', label: 'Últimas 12 semanas' },
  { id: 'ultimas_26', label: 'Últimas 26 semanas' },
  { id: 'ultimas_52', label: 'Últimas 52 semanas' },
  { id: 'personalizado', label: 'Personalizado' },
]

export const PRESET_DEFAULT: PresetPeriodo = 'ultimas_4'

/** Hoy en Argentina como 'YYYY-MM-DD'. */
export function hoyArgentina(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function diaNumero(d: string): number {
  const [y, m, dd] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, dd) / 86_400_000
}

export function sumarDias(d: string, dias: number): string {
  return new Date((diaNumero(d) + dias) * 86_400_000).toISOString().slice(0, 10)
}

/** Lunes de la semana de `d` (semanas lunes a domingo). */
export function lunesDe(d: string): string {
  const dow = new Date(diaNumero(d) * 86_400_000).getUTCDay() // 0 = domingo
  return sumarDias(d, -((dow + 6) % 7))
}

/**
 * Rango de un preset. Los presets "últimas N semanas" terminan el domingo de la
 * semana en curso (la base recorta a hoy): así el rango es estable toda la semana.
 */
export function rangoDePreset(preset: PresetPeriodo, hoy: string): { desde: string; hasta: string } {
  const lunes = lunesDe(hoy)
  const domingo = sumarDias(lunes, 6)
  switch (preset) {
    case 'semana_actual':
      return { desde: lunes, hasta: domingo }
    case 'semana_anterior':
      return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) }
    case 'ultimas_12':
      return { desde: sumarDias(lunes, -7 * 11), hasta: domingo }
    case 'ultimas_26':
      return { desde: sumarDias(lunes, -7 * 25), hasta: domingo }
    case 'ultimas_52':
      return { desde: sumarDias(lunes, -7 * 51), hasta: domingo }
    case 'ultimas_4':
    case 'personalizado':
    default:
      return { desde: sumarDias(lunes, -7 * 3), hasta: domingo }
  }
}

export function fechaCorta(d: string): string {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'YYYY-MM-DD' -> 'jul 2025' */
export function mesAnio(d: string): string {
  const [y, m] = d.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

// Numeración de semanas: la misma que Facturación (date-fns getWeek, semana de
// lunes a domingo; la semana 1 es la que contiene el 1 de enero).
const OPC_SEMANA = { weekStartsOn: 1 as const }

/** 'YYYY-MM-DD' -> { numero: 40, anio: 2026 } (año de la semana, no del día) */
export function numeroSemana(d: string): { numero: number; anio: number } {
  const fecha = new Date(`${d}T12:00:00`)
  return { numero: getWeek(fecha, OPC_SEMANA), anio: getWeekYear(fecha, OPC_SEMANA) }
}

/** 'YYYY-MM-DD' -> 'Semana 40-26' */
export function etiquetaSemana(d: string): string {
  const { numero, anio } = numeroSemana(d)
  return `Semana ${numero}-${String(anio).slice(-2)}`
}

/** Rango -> 'Semana 40-26' o 'Semana 37-26 a 40-26' */
export function etiquetaRangoSemanas(desde: string, hasta: string): string {
  const a = numeroSemana(desde)
  const b = numeroSemana(hasta)
  if (a.numero === b.numero && a.anio === b.anio) return etiquetaSemana(desde)
  const fin = a.anio === b.anio ? `${b.numero}-${String(b.anio).slice(-2)}` : etiquetaSemana(hasta).replace('Semana ', '')
  return `${etiquetaSemana(desde)} a ${fin}`
}

/** Eje del gráfico: 'S40' */
export function semanaLabel(lunes: string): string {
  return `S${numeroSemana(lunes).numero}`
}

// ───────────── Formatos y variaciones ─────────────

/** Entero con separador de miles; '—' si el dato falta (ej.: SQL desactualizado). */
export const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat('es-AR').format(n) : '—'

export const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v * 100)}%`

export const ratio = (a: number, b: number): number | null => (b > 0 ? Math.min(a / b, 1) : null)

export function tasaRetencion(h: RetencionHito | undefined): number | null {
  return h && h.base > 0 ? h.retenidos / h.base : null
}

// ───────────── Camino a la calle ─────────────

export interface CaminoCalle {
  /** Mediana de días de lead a primer turno, redondeada */
  total: number
  /** Días de captación y documentación (lead → conductor); captacion + entrega = total */
  captacion: number
  entrega: number
  /** Proporción del tiempo total que se va en captación (0 a 1) */
  shareCaptacion: number
}

/**
 * Total = mediana (robusta ante casos extremos). Las etapas reparten ese total
 * según la proporción del tiempo total de cada una en la misma población, así
 * captación + entrega = total siempre. Null si no hay datos para repartir.
 */
export function caminoALaCalle(m: MetricasPeriodo): CaminoCalle | null {
  if (typeof m.dias_a_la_calle_mediana !== 'number') return null
  const total = Math.round(m.dias_a_la_calle_mediana)
  const cap = Number(m.dias_captacion_suma) || 0
  const ent = Number(m.dias_entrega_suma) || 0
  const suma = cap + ent
  if (!m.nuevos_con_desglose) return null
  // Todos salieron el mismo día que se convirtieron: todo el tiempo es captación
  if (suma <= 0) return { total, captacion: total, entrega: 0, shareCaptacion: 1 }
  const shareCaptacion = cap / suma
  const captacion = Math.round(total * shareCaptacion)
  return { total, captacion, entrega: total - captacion, shareCaptacion }
}

export const fmtDias = (v: number | null | undefined) =>
  typeof v !== 'number' || !Number.isFinite(v) ? '—' : `${fmtInt(Math.round(v))} ${Math.round(v) === 1 ? 'día' : 'días'}`

export interface Variacion {
  texto: string
  tono: 'bueno' | 'malo' | 'neutro'
}

/**
 * Variación contra el período anterior.
 * tipo 'pp': diferencia en puntos porcentuales (valores 0..1).
 * tipo 'dias' | 'semanas' | 'num': diferencia absoluta.
 */
export function variacion(
  actual: number | null,
  anterior: number | null,
  tipo: 'pp' | 'dias' | 'semanas' | 'num',
  mejorSiSube: boolean,
): Variacion | null {
  if (typeof actual !== 'number' || typeof anterior !== 'number' || !Number.isFinite(actual) || !Number.isFinite(anterior)) return null
  const diff = tipo === 'pp' ? (actual - anterior) * 100 : actual - anterior
  const redondeo = Math.round(diff * 10) / 10
  if (Math.abs(redondeo) < 0.05) return { texto: '= igual que el período anterior', tono: 'neutro' }
  const unidad = tipo === 'pp' ? ' pp' : tipo === 'dias' ? ' días' : tipo === 'semanas' ? ' sem.' : ''
  const valor = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(redondeo))
  const sube = redondeo > 0
  return {
    texto: `${sube ? '▲' : '▼'} ${valor}${unidad} vs período anterior`,
    tono: sube === mejorSiSube ? 'bueno' : 'malo',
  }
}

// ───────────── Perfil ─────────────

export const MUESTRA_MINIMA = 10

export interface PerfilFila {
  valor: string
  base: number
  retencion: number | null
  leads: number
  conversion: number | null
}

export const DIMENSIONES_PERFIL = ['Zona', 'Turno', 'Fuente del lead', 'Pauta / campaña', 'Edad']

const normalizarTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Fuentes de lead que no se analizan (volumen marginal). Se comparan sin tildes ni mayúsculas. */
export const FUENTES_EXCLUIDAS = ['Referido', 'Tiktok', 'Página Web', 'Instagram', 'Facebook']
/** Fuentes que ya no se usan: se muestran atenuadas solo como referencia (hoy la herramienta es Sellium). */
export const FUENTES_HISTORICAS = ['Intercom']

const esFuenteExcluida = (v: string) => FUENTES_EXCLUIDAS.some(x => normalizarTexto(x) === normalizarTexto(v))
const esFuenteHistorica = (v: string) => FUENTES_HISTORICAS.some(x => normalizarTexto(x) === normalizarTexto(v))
const esSinDato = (v: string) => /^sin (dato|lead)$/i.test(v.trim())

export type TipoFilaPerfil = 'normal' | 'historica' | 'sin_dato'

export interface PerfilFilaVista extends PerfilFila {
  tipo: TipoFilaPerfil
}

/**
 * Filas de una dimensión del perfil, listas para mostrar:
 * - En "Fuente del lead" se ocultan las fuentes excluidas y las históricas quedan marcadas.
 * - "Sin dato" / "Sin lead" e históricas van al final y no se comparan contra el promedio.
 */
export function perfilPorDimension(d: DirectivoRaw, dimension: string): PerfilFilaVista[] {
  const filas = new Map<string, PerfilFila>()
  for (const r of d.perfil_retencion.filter(x => x.dimension === dimension)) {
    filas.set(r.valor, { valor: r.valor, base: r.base, retencion: r.base > 0 ? r.retenidos / r.base : null, leads: 0, conversion: null })
  }
  for (const c of d.perfil_conversion.filter(x => x.dimension === dimension)) {
    const f = filas.get(c.valor) ?? { valor: c.valor, base: 0, retencion: null, leads: 0, conversion: null }
    f.leads = c.leads
    f.conversion = c.leads > 0 ? Math.min(c.con_turno / c.leads, 1) : null
    filas.set(c.valor, f)
  }
  const esFuente = dimension === 'Fuente del lead'
  const orden: Record<TipoFilaPerfil, number> = { normal: 0, historica: 1, sin_dato: 2 }
  return [...filas.values()]
    .filter(f => !(esFuente && esFuenteExcluida(f.valor)))
    .map((f): PerfilFilaVista => ({
      ...f,
      tipo: esSinDato(f.valor) ? 'sin_dato' : esFuente && esFuenteHistorica(f.valor) ? 'historica' : 'normal',
    }))
    .sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.base - a.base || b.leads - a.leads)
}

/** Ventanas del perfil (mismas que la función SQL): hito de 12 semanas y alta de leads en los últimos 365 días. */
export function ventanasPerfil(hoy: string) {
  return {
    conductoresDesde: sumarDias(hoy, -365 - 84 + 1),
    conductoresHasta: sumarDias(hoy, -84),
    leadsDesde: sumarDias(hoy, -364),
    leadsHasta: hoy,
  }
}

/** Totales del perfil (todas las filas, incluidas las fuentes que no se muestran). */
export function totalesPerfil(d: DirectivoRaw) {
  const ret = d.perfil_retencion.filter(x => x.dimension === 'Zona')
  const conv = d.perfil_conversion.filter(x => x.dimension === 'Zona')
  const base = ret.reduce((a, x) => a + x.base, 0)
  const retenidos = ret.reduce((a, x) => a + x.retenidos, 0)
  const leads = conv.reduce((a, x) => a + x.leads, 0)
  const conTurno = conv.reduce((a, x) => a + x.con_turno, 0)
  return {
    base,
    retencion: base > 0 ? retenidos / base : null,
    leads,
    conversion: leads > 0 ? Math.min(conTurno / leads, 1) : null,
  }
}

/** Retención a 12 semanas promedio de toda la base del perfil (últimos 12 meses). */
export function retencionPromedioPerfil(d: DirectivoRaw): number | null {
  const filas = d.perfil_retencion.filter(x => x.dimension === 'Zona')
  const base = filas.reduce((a, x) => a + x.base, 0)
  const ret = filas.reduce((a, x) => a + x.retenidos, 0)
  return base > 0 ? ret / base : null
}

// ───────────── Lecturas por reglas ─────────────

const fmtPct0 = (v: number) => `${Math.round(v * 100)}%`

/**
 * Lecturas accionables calculadas solo con los datos del JSON.
 * Se usan tal cual si no hay análisis con IA, y como respaldo si la IA falla.
 */
export function generarLecturas(d: DirectivoRaw): Lectura[] {
  const out: Lectura[] = []
  const a = d.periodo.actual

  // 1. Mayor fuga del embudo
  const etapas = [
    { de: 'Leads creados', a: 'Aceptan oferta', n0: a.leads, n1: a.aceptan_oferta,
      accion: 'Revisar la propuesta y la velocidad del primer contacto.' },
    { de: 'Aceptan oferta', a: 'Convertidos a conductor', n0: a.aceptan_oferta, n1: a.convertidos,
      accion: 'Revisar documentación pendiente y validación de requisitos.' },
    { de: 'Convertidos a conductor', a: 'Salieron a la calle', n0: a.convertidos, n1: a.con_primer_turno,
      accion: 'Revisar con Logística la programación de entregas de vehículos.' },
  ].filter(e => e.n0 > 0)
  if (etapas.length > 0) {
    const peor = etapas.reduce((x, y) => (Math.min(y.n1 / y.n0, 1) < Math.min(x.n1 / x.n0, 1) ? y : x))
    out.push({
      tono: 'atencion',
      titulo: `La mayor fuga del embudo está entre "${peor.de}" y "${peor.a}"`,
      detalle: `Solo avanza el ${fmtPct0(Math.min(peor.n1 / peor.n0, 1))} (${fmtInt(peor.n1)} de ${fmtInt(peor.n0)}). ${peor.accion}`,
    })
  }

  // 2. Perfil: segmento que más retiene (muestra suficiente y diferencia clara)
  const promedio = retencionPromedioPerfil(d)
  if (promedio !== null) {
    let mejor: { dim: string; fila: PerfilFila } | null = null
    for (const dim of DIMENSIONES_PERFIL) {
      for (const f of perfilPorDimension(d, dim)) {
        if (f.tipo !== 'normal' || f.base < 15 || f.retencion === null) continue
        if (f.retencion - promedio >= 0.1 && (!mejor || (f.retencion > (mejor.fila.retencion ?? 0)))) {
          mejor = { dim, fila: f }
        }
      }
    }
    if (mejor && mejor.fila.retencion !== null) {
      out.push({
        tono: 'positivo',
        titulo: `${mejor.dim} "${mejor.fila.valor}": los conductores que más duran`,
        detalle: `Retienen el ${fmtPct0(mejor.fila.retencion)} a 12 semanas contra ${fmtPct0(promedio)} del promedio (n=${fmtInt(mejor.fila.base)}). Conviene priorizarlo en la búsqueda de leads y la pauta.`,
      })
    }
  }

  // 3. Tramo más lento hasta salir a la calle
  const camino = caminoALaCalle(a)
  if (camino && camino.total > 0) {
    const lentaEsEntrega = camino.entrega > camino.captacion
    out.push({
      tono: 'atencion',
      titulo: `La etapa más lenta para salir a la calle es ${lentaEsEntrega ? 'la entrega del vehículo' : 'la captación y documentación'}`,
      detalle: `De ${fmtDias(camino.total)} en total, ${fmtDias(lentaEsEntrega ? camino.entrega : camino.captacion)} se van en esa etapa (${fmtPct0(lentaEsEntrega ? 1 - camino.shareCaptacion : camino.shareCaptacion)} del tiempo).`,
    })
  }

  // 4. Capacidad ociosa
  if (d.hoy_snapshot.turnos_disponibles > 0) {
    out.push({
      tono: 'atencion',
      titulo: `${fmtInt(d.hoy_snapshot.turnos_disponibles)} turnos libres en la flota hoy`,
      detalle: 'Es capacidad que ya existe y todavía no genera ingresos. Priorizar la asignación de leads listos para arrancar.',
    })
  }

  // 5. Crecimiento neto del período
  const neto = a.altas + a.reactivaciones - a.bajas
  out.push(neto >= 0
    ? {
        tono: 'positivo',
        titulo: `Crecimiento neto de +${fmtInt(neto)} conductores en el período`,
        detalle: `Ingresaron ${fmtInt(a.altas + a.reactivaciones)} (altas y reactivaciones) y se dieron de baja ${fmtInt(a.bajas)}.`,
      }
    : {
        tono: 'atencion',
        titulo: `En el período se fueron más conductores de los que ingresaron (${fmtInt(neto)})`,
        detalle: `Ingresaron ${fmtInt(a.altas + a.reactivaciones)} y se dieron de baja ${fmtInt(a.bajas)}. Revisar los motivos de baja en el módulo Conductores.`,
      })

  return out.slice(0, 4)
}
