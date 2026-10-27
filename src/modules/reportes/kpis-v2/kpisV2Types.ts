// src/modules/reportes/kpis-v2/kpisV2Types.ts
// Tipos y lógica pura del Dashboard KPI v2 (sin React ni Supabase).
//
// La base devuelve una fila por día (get_dashboard_kpis_v2). Acá se agrupan en
// semanas (lunes a domingo) o en meses calendario:
// - Tasas (ocupación, operatividad): suma de los días / suma de los días, o sea
//   cada día pesa lo mismo. Una semana partida entre dos meses aporta a cada mes
//   solo sus días.
// - Montos (facturado, cobrado): la base ya reparte cada semana de facturación
//   en partes iguales entre sus 7 días; acá se suman los días del período.
// - Objetivo (forecast semanal): se reparte igual que lo real y SOLO sobre los
//   días que tienen dato real, para comparar lo mismo contra lo mismo.
import { getWeek, getWeekYear } from 'date-fns'

// ───────────── Datos crudos ─────────────

export type OrigenDia = 'foto' | 'estimado' | 'vivo' | null

export interface DiaRaw {
  f: string
  o: OrigenDia
  tf: number | null
  eu: number | null
  tt: number | null
  tc: number | null
  vi: number
  fn: number | null
  ac: number | null
  co: number | null
  /** Cobrado por Cabify (el resto de co es pago manual). */
  cc?: number | null
  /** Composición del facturado: alquiler, garantía, Toshipass, descuentos. */
  fa?: number | null
  fg?: number | null
  ft?: number | null
  fd?: number | null
  /** Conductores manejando al cierre del día · altas (primer turno) · bajas. */
  cd?: number | null
  al?: number
  ba?: number
  pe: 'abierto' | 'cerrado' | null
}

export interface BajaRaw {
  f: string
  m: string | null
}

export interface ForecastRaw {
  semana_inicio: string
  flota: number | null
  ocupacion: number | null
  operatividad: number | null
  facturacion: number | null
  cobranza: number | null
  actualizado_por?: string | null
  updated_at?: string | null
}

export interface KpisV2Raw {
  hoy: string
  desde: string
  hasta: string
  generado_en: string
  /** Última vez que la tarea horaria recalculó los datos. */
  calculado_en?: string | null
  dias: DiaRaw[]
  forecast: ForecastRaw[]
  bajas?: BajaRaw[]
}

// ───────────── Fechas (YYYY-MM-DD, sin zona horaria) ─────────────

const DIA_MS = 86_400_000

function toUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function sumarDias(iso: string, dias: number): string {
  return fromUtc(toUtc(iso) + dias * DIA_MS)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((toUtc(hasta) - toUtc(desde)) / DIA_MS)
}

/** Lunes de la semana de la fecha. */
export function lunesDe(iso: string): string {
  const dow = new Date(toUtc(iso)).getUTCDay() // 0 = domingo
  return sumarDias(iso, -((dow + 6) % 7))
}

export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function finDeMes(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}

function fechaLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Número de semana con la misma convención que Facturación (semana de lunes a domingo). */
export function numeroSemana(iso: string): { semana: number; anio: number } {
  const d = fechaLocal(iso)
  return {
    semana: getWeek(d, { weekStartsOn: 1 }),
    anio: getWeekYear(d, { weekStartsOn: 1 }),
  }
}

/** "Sem 43-26" */
export function etiquetaSemana(lunes: string): string {
  const { semana, anio } = numeroSemana(lunes)
  return `Sem ${String(semana).padStart(2, '0')}-${String(anio).slice(2)}`
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "Oct 26" */
export function etiquetaMes(iso: string): string {
  const m = Number(iso.slice(5, 7))
  return `${MESES[m - 1]} ${iso.slice(2, 4)}`
}

/** "19/10" */
export function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// ───────────── Agrupación ─────────────

export type Granularidad = 'semana' | 'mes'

export interface Objetivo {
  flota: number | null
  ocupacion: number | null // 0-1
  operatividad: number | null // 0-1
  facturacion: number | null // ARS
  cobranza: number | null // 0-1
}

export interface Periodo {
  key: string
  label: string
  labelLargo: string
  inicio: string
  fin: string
  /** El período terminó (su último día es anterior a hoy). */
  completo: boolean
  /** Algún día del período es reconstruido, no foto. */
  estimado: boolean
  diasConFlota: number
  diasConFacturacion: number
  ocupacion: number | null
  ocupacionInicio: number | null
  ocupacionFin: number | null
  turnosOcupados: number
  turnosTotales: number
  operatividad: number | null
  flota: number | null
  flotaInicio: number | null
  enUso: number | null
  ingresados: number
  facturado: number | null
  aCobrar: number | null
  cobrado: number | null
  cobradoCabify: number | null
  cobradoManual: number | null
  cobranza: number | null
  /** Qué se facturó, por producto. otros = peajes, excesos de km, multas, etc. */
  composicion: Composicion | null
  /** Hay días con período de facturación todavía abierto (montos provisorios). */
  facturacionProvisoria: boolean
  objetivo: Objetivo
  /** Hay al menos un valor de forecast para el período. */
  tieneObjetivo: boolean
  /** El forecast cubre solo parte de los días del período (ese objetivo queda vacío). */
  objetivoIncompleto: boolean
  /** Solo para el período en curso: facturación proyectada al cierre. */
  proyeccion: Proyeccion | null
  conductores: Conductores
}

export interface Conductores {
  /** Manejando al empezar el período (cierre del día anterior). */
  inicio: number | null
  /** Manejando al cierre del período (o hoy). */
  fin: number | null
  altas: number
  bajas: number
  /** De todos los que manejaron en el período (inicio + altas), qué parte sigue: 1 − bajas / (inicio + altas). */
  retencion: number | null
  motivos: { motivo: string; cantidad: number }[]
}

export type Motivo = { motivo: string; cantidad: number }

/** "  consiguió otro TRABAJO " → "Consiguió otro trabajo" (para agrupar texto libre). */
export function normalizarMotivo(m: string | null): string {
  const t = (m ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return 'Sin motivo cargado'
  const l = t.toLocaleLowerCase('es-AR')
  return l.charAt(0).toLocaleUpperCase('es-AR') + l.slice(1)
}

/**
 * Temas de baja. El motivo se carga como texto libre; se clasifica por
 * palabras clave, en este orden (gana el primero que coincide).
 */
const TEMAS_BAJA: { tema: string; claves: RegExp }[] = [
  { tema: 'Salud o familia', claves: /salud|enferm|medic|internad|operaci|familia|embaraz|falleci|duelo|personal/ },
  { tema: 'Siniestro o robo', claves: /robo|robar|choque|chocó|choco|siniestro|accidente|incidente|denuncia/ },
  { tema: 'Consiguió otro trabajo', claves: /trabajo|empleo|laburo|otra empresa|otro auto|propio auto|auto propio/ },
  { tema: 'No le rinde', claves: /rentab|rinde|rendimiento|nafta|gnc|combustible|ganancia|gana poco|no le alcanza|no conviene|precio|tarifa|caro/ },
  { tema: 'Deuda', claves: /saldo|deuda|adeud|debe|mora|no pag|impag/ },
  { tema: 'Conducta o no responde', claves: /conflict|conducta|perfil|no responde|no contesta|abandon|incumpl|maltrato|desaparec/ },
  { tema: 'Se mudó', claves: /mud[oó]|mudanza|viaja|se va del pa|otra ciudad|otra provincia/ },
  { tema: 'Baja voluntaria', claves: /voluntari|renunci|decid|no quiere|no desea/ },
]

const TOP_TEMAS = 5

export function temaDeBaja(motivo: string | null): string {
  const t = (motivo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  if (!t) return 'Sin motivo cargado'
  const tema = TEMAS_BAJA.find(x => x.claves.test(t))
  return tema ? tema.tema : 'Otros'
}

/** Bajas por tema: los 5 temas más frecuentes y el resto en "Otros". */
export function resumenMotivos(bajas: BajaRaw[]): { motivo: string; cantidad: number }[] {
  const cuenta = new Map<string, number>()
  for (const b of bajas) {
    const tema = temaDeBaja(b.m)
    cuenta.set(tema, (cuenta.get(tema) ?? 0) + 1)
  }
  const ordenados = Array.from(cuenta, ([motivo, cantidad]) => ({ motivo, cantidad }))
    .filter(x => x.motivo !== 'Otros')
    .sort((a, b) => b.cantidad - a.cantidad || a.motivo.localeCompare(b.motivo))
  const top = ordenados.slice(0, TOP_TEMAS)
  const otros = (cuenta.get('Otros') ?? 0) + ordenados.slice(TOP_TEMAS).reduce((s, x) => s + x.cantidad, 0)
  return otros > 0 ? [...top, { motivo: 'Otros', cantidad: otros }] : top
}

function resumenConductores(
  inicio: string,
  fin: string,
  dias: DiaRaw[],
  cdPorFecha: Map<string, number | null | undefined>,
  bajasRaw: BajaRaw[],
): Conductores {
  const conCd = dias.filter(d => d.cd !== null && d.cd !== undefined)
  const previo = cdPorFecha.get(sumarDias(inicio, -1))
  const cdInicio = previo !== null && previo !== undefined ? previo : (conCd[0]?.cd ?? null)
  const cdFin = conCd[conCd.length - 1]?.cd ?? null
  const altas = dias.reduce((s, d) => s + (d.al ?? 0), 0)
  const bajas = dias.reduce((s, d) => s + (d.ba ?? 0), 0)
  return {
    inicio: cdInicio,
    fin: cdFin,
    altas,
    bajas,
    // Acumulativa en el período: sobre todos los que manejaron (los del inicio + los que entraron)
    retencion: cdInicio !== null && cdInicio + altas > 0
      ? Math.max(0, Math.min(1, 1 - bajas / (cdInicio + altas)))
      : null,
    motivos: resumenMotivos(bajasRaw.filter(b => b.f >= inicio && b.f <= fin)),
  }
}

export interface Composicion {
  alquiler: number
  garantia: number
  toshipass: number
  otros: number
  descuentos: number
}

export interface Proyeccion {
  /** Facturado de períodos cerrados + lo proyectado para el resto de los días. */
  total: number
  /** Parte proyectada (sin facturar todavía). */
  proyectado: number
  /** Objetivo de facturación del período completo (forecast), si hay. */
  objetivo: number | null
  /** Facturado neto promedio por turno ocupado por día que se usó. */
  tarifa: number
}

function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

function tieneFlota(d: DiaRaw): boolean {
  return d.tt !== null && d.tf !== null
}

function tieneFacturacion(d: DiaRaw): boolean {
  return d.fn !== null
}

function construirPeriodo(
  key: string,
  label: string,
  labelLargo: string,
  inicio: string,
  fin: string,
  dias: DiaRaw[],
  forecastPorLunes: Map<string, ForecastRaw>,
  hoy: string,
  tarifa: number | null,
): Omit<Periodo, 'conductores'> {
  const conFlota = dias.filter(tieneFlota)
  const conFact = dias.filter(tieneFacturacion)

  const turnosOcupados = conFlota.reduce((s, d) => s + (d.tc ?? 0), 0)
  const turnosTotales = conFlota.reduce((s, d) => s + (d.tt ?? 0), 0)
  const enUsoSum = conFlota.reduce((s, d) => s + (d.eu ?? 0), 0)
  const flotaSum = conFlota.reduce((s, d) => s + (d.tf ?? 0), 0)
  const primero = conFlota[0]
  const ultimo = conFlota[conFlota.length - 1]

  const facturado = conFact.length ? conFact.reduce((s, d) => s + (d.fn ?? 0), 0) : null
  const aCobrar = conFact.length ? conFact.reduce((s, d) => s + (d.ac ?? 0), 0) : null
  const cobrado = conFact.length ? conFact.reduce((s, d) => s + (d.co ?? 0), 0) : null
  const cobradoCabify = conFact.length ? conFact.reduce((s, d) => s + (d.cc ?? 0), 0) : null
  const sumar = (k: 'fa' | 'fg' | 'ft' | 'fd') => conFact.reduce((s, d) => s + (d[k] ?? 0), 0)
  let composicion: Composicion | null = null
  if (facturado !== null) {
    const alquiler = sumar('fa')
    const garantia = sumar('fg')
    const toshipass = sumar('ft')
    const descuentos = sumar('fd')
    composicion = {
      alquiler,
      garantia,
      toshipass,
      descuentos,
      otros: 0,
    }
  }

  // Objetivo: mismo reparto por día que lo real, sobre los mismos días. Sin
  // dato real no hay con qué comparar y el objetivo queda vacío.
  const fc = (d: string) => forecastPorLunes.get(lunesDe(d))
  const diasTasa = conFlota.map(d => d.f)
  const diasMonto = conFact.map(d => d.f)

  // Un objetivo solo vale si el forecast cubre TODOS los días que se comparan;
  // con cobertura parcial se compararía lo real de todo el período contra el
  // objetivo de una parte. En ese caso queda null y se marca como incompleto.
  let incompleto = false
  const valoresDe = (fechas: string[], campo: keyof Omit<ForecastRaw, 'semana_inicio' | 'actualizado_por' | 'updated_at'>) => {
    const vals = fechas
      .map(d => fc(d)?.[campo])
      .filter((v): v is number => v !== null && v !== undefined)
      .map(Number)
    if (vals.length > 0 && vals.length < fechas.length) {
      incompleto = true
      return null
    }
    return vals.length ? vals : null
  }

  const ocup = valoresDe(diasTasa, 'ocupacion')
  const oper = valoresDe(diasTasa, 'operatividad')
  const fact = valoresDe(diasMonto, 'facturacion')
  const cobr = valoresDe(diasMonto, 'cobranza')

  const flotaObj = ultimo ? fc(ultimo.f)?.flota : null

  const objetivo: Objetivo = {
    flota: flotaObj !== null && flotaObj !== undefined ? Number(flotaObj) : null,
    ocupacion: ocup ? promedio(ocup)! / 100 : null,
    operatividad: oper ? promedio(oper)! / 100 : null,
    facturacion: fact ? fact.reduce((s, v) => s + v / 7, 0) : null,
    cobranza: cobr ? promedio(cobr)! / 100 : null,
  }

  // Proyección de facturación (período en curso): regla de tres sobre los
  // turnos ocupados con la tarifa reciente; los días que faltan, con la
  // ocupación del último día con dato.
  let proyeccion: Proyeccion | null = null
  if (fin >= hoy && tarifa !== null && ultimo) {
    const porFecha = new Map(dias.map(d => [d.f, d]))
    let real = 0
    let proyectado = 0
    let objetivoCompleto = 0
    let diasConObjetivo = 0
    let diasTotales = 0
    for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
      diasTotales++
      const d = porFecha.get(f)
      // Solo cuenta como real lo de períodos cerrados: uno abierto está a medio calcular
      if (d && d.fn !== null && d.pe === 'cerrado') real += d.fn
      else {
        const tc = d && d.tc !== null ? d.tc : (ultimo.tc ?? 0)
        proyectado += tc * tarifa
      }
      const obj = fc(f)?.facturacion
      if (obj !== null && obj !== undefined) {
        objetivoCompleto += Number(obj) / 7
        diasConObjetivo++
      }
    }
    proyeccion = {
      total: real + proyectado,
      proyectado,
      objetivo: diasConObjetivo === diasTotales ? objetivoCompleto : null,
      tarifa,
    }
  }

  return {
    key,
    label,
    labelLargo,
    inicio,
    fin,
    completo: fin < hoy,
    estimado: dias.some(d => d.o === 'estimado'),
    diasConFlota: conFlota.length,
    diasConFacturacion: conFact.length,
    ocupacion: ratio(turnosOcupados, turnosTotales),
    ocupacionInicio: primero ? ratio(primero.tc ?? 0, primero.tt ?? 0) : null,
    ocupacionFin: ultimo ? ratio(ultimo.tc ?? 0, ultimo.tt ?? 0) : null,
    turnosOcupados,
    turnosTotales,
    operatividad: ratio(enUsoSum, flotaSum),
    flota: ultimo?.tf ?? null,
    flotaInicio: primero?.tf ?? null,
    enUso: ultimo?.eu ?? null,
    ingresados: dias.reduce((s, d) => s + (d.vi ?? 0), 0),
    facturado,
    aCobrar,
    cobrado,
    cobradoCabify,
    cobradoManual: cobrado !== null && cobradoCabify !== null ? Math.max(cobrado - cobradoCabify, 0) : null,
    composicion,
    cobranza: facturado !== null && cobrado !== null ? ratio(cobrado, facturado) : null,
    facturacionProvisoria: conFact.some(d => d.pe === 'abierto'),
    objetivo,
    tieneObjetivo: Object.values(objetivo).some(v => v !== null),
    objetivoIncompleto: incompleto,
    proyeccion,
  }
}

/** Agrupa los días en semanas o meses, del más viejo al más nuevo. */
/** Días que se usan para calcular la tarifa por turno ocupado. */
const DIAS_TARIFA = 28

/**
 * Facturado neto por turno ocupado por día, con los últimos 28 días que
 * tienen facturación y ocupación. null si no hay base para calcularla.
 */
export function tarifaPorTurno(dias: DiaRaw[]): number | null {
  const base = dias.filter(d => d.fn !== null && d.tc !== null && d.tc > 0).slice(-DIAS_TARIFA)
  const turnos = base.reduce((s, d) => s + (d.tc ?? 0), 0)
  const facturado = base.reduce((s, d) => s + (d.fn ?? 0), 0)
  return turnos > 0 && facturado > 0 ? facturado / turnos : null
}

export function agrupar(raw: KpisV2Raw, granularidad: Granularidad): Periodo[] {
  const forecastPorLunes = new Map(raw.forecast.map(f => [f.semana_inicio.slice(0, 10), f]))
  const tarifa = tarifaPorTurno(raw.dias)
  const cdPorFecha = new Map(raw.dias.map(d => [d.f, d.cd]))
  const bajasRaw = (raw.bajas ?? []).map(b => ({ f: b.f.slice(0, 10), m: b.m }))
  const grupos = new Map<string, DiaRaw[]>()
  for (const d of raw.dias) {
    // En la vista mensual no se arma un mes con los días previos al inicio
    if (granularidad === 'mes' && d.f < INICIO_DATOS) continue
    const key = granularidad === 'semana' ? lunesDe(d.f) : inicioDeMes(d.f)
    const lista = grupos.get(key)
    if (lista) lista.push(d)
    else grupos.set(key, [d])
  }

  return Array.from(grupos.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, dias]) => {
      if (granularidad === 'semana') {
        const fin = sumarDias(key, 6)
        const { semana, anio } = numeroSemana(key)
        return {
          ...construirPeriodo(
          key,
          etiquetaSemana(key),
          `Semana ${String(semana).padStart(2, '0')}-${String(anio).slice(2)} · ${fechaCorta(key)} al ${fechaCorta(fin)}`,
          key,
          fin,
          dias,
          forecastPorLunes,
          raw.hoy,
          tarifa,
          ),
          conductores: resumenConductores(key, fin, dias, cdPorFecha, bajasRaw),
        }
      }
      const fin = finDeMes(key)
      const m = Number(key.slice(5, 7))
      return {
        ...construirPeriodo(
        key,
        etiquetaMes(key),
        `${MESES_LARGO[m - 1]} ${key.slice(0, 4)}`,
        key,
        fin,
        dias,
        forecastPorLunes,
        raw.hoy,
        tarifa,
        ),
        conductores: resumenConductores(key, fin, dias, cdPorFecha, bajasRaw),
      }
    })
}

/** Período que se muestra arriba por defecto: el actual (semana o mes en curso). */
export function periodoPorDefecto(periodos: Periodo[]): Periodo | null {
  return periodos.length ? periodos[periodos.length - 1] : null
}

// ───────────── Rango que se pide a la base ─────────────

/** Desde cuándo hay datos para mostrar (el histórico se reconstruye desde acá). */
export const INICIO_DATOS = '2026-03-01'

/** 0 = todo desde INICIO_DATOS. */
export const RANGOS_SEMANA = [0, 8, 12, 26] as const
export const RANGOS_MES = [0, 3, 6] as const

export function rangoConsulta(granularidad: Granularidad, cantidad: number, hoy: string) {
  if (cantidad === 0) {
    // Mismo rango para semanal y mensual: cambiar de vista no vuelve a pedir datos
    return { desde: lunesDe(INICIO_DATOS), hasta: hoy }
  }
  if (granularidad === 'semana') {
    return { desde: sumarDias(lunesDe(hoy), -7 * (cantidad - 1)), hasta: hoy }
  }
  const [y, m] = hoy.slice(0, 7).split('-').map(Number)
  const inicio = new Date(Date.UTC(y, m - 1 - (cantidad - 1), 1))
  return { desde: fromUtc(inicio.getTime()), hasta: hoy }
}

/** Hoy en Argentina (la base corta los días en hora Argentina). */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// ───────────── Formatos ─────────────

const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export function fmtPct(v: number | null): string {
  return v === null ? '—' : `${nf1.format(v * 100)}%`
}

export function fmtInt(v: number | null): string {
  return v === null ? '—' : nf0.format(v)
}

export function fmtMoneda(v: number | null): string {
  return v === null ? '—' : `$ ${nf0.format(v)}`
}

/** "$ 23,4 M" */
export function fmtMonedaCorta(v: number | null): string {
  if (v === null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$ ${nf1.format(v / 1_000_000)} M`
  if (abs >= 1_000) return `$ ${nf0.format(v / 1_000)} mil`
  return `$ ${nf0.format(v)}`
}

export type Tono = 'bueno' | 'malo' | 'neutro'

export interface Diferencia {
  texto: string
  tono: Tono
}

/** Diferencia en puntos porcentuales: "+3,2 pts" (tasas en 0-1). */
export function difPuntos(real: number | null, ref: number | null): Diferencia | null {
  if (real === null || ref === null) return null
  const pts = (real - ref) * 100
  if (Math.abs(pts) < 0.05) return { texto: '0,0 pts', tono: 'neutro' }
  return { texto: `${pts > 0 ? '+' : '−'}${nf1.format(Math.abs(pts))} pts`, tono: pts > 0 ? 'bueno' : 'malo' }
}

/** Diferencia relativa: "+12,5%". */
export function difRelativa(real: number | null, ref: number | null): Diferencia | null {
  if (real === null || ref === null || ref === 0) return null
  const pct = ((real - ref) / Math.abs(ref)) * 100
  if (Math.abs(pct) < 0.05) return { texto: '0,0%', tono: 'neutro' }
  return { texto: `${pct > 0 ? '+' : '−'}${nf1.format(Math.abs(pct))}%`, tono: pct > 0 ? 'bueno' : 'malo' }
}

/** Diferencia absoluta en unidades: "+4". */
export function difUnidades(real: number | null, ref: number | null): Diferencia | null {
  if (real === null || ref === null) return null
  const dif = real - ref
  if (dif === 0) return { texto: '0', tono: 'neutro' }
  return { texto: `${dif > 0 ? '+' : '−'}${nf0.format(Math.abs(dif))}`, tono: dif > 0 ? 'bueno' : 'malo' }
}

/** Cumplimiento del objetivo: real / objetivo. */
export function cumplimiento(real: number | null, objetivo: number | null): number | null {
  return real === null || objetivo === null || objetivo === 0 ? null : real / objetivo
}

// ───────────── Forecast: lectura del archivo ─────────────

export interface ForecastFila {
  semana_inicio: string
  flota: number | null
  ocupacion: number | null
  operatividad: number | null
  facturacion: number | null
  cobranza: number | null
}

export type CampoForecast = 'flota' | 'ocupacion' | 'operatividad' | 'facturacion' | 'cobranza'

export interface ForecastParse {
  filas: ForecastFila[]
  /** Columnas de objetivo que trae el archivo (solo esas se guardan). */
  columnas: CampoForecast[]
  errores: string[]
}

const COLUMNAS: Record<keyof ForecastFila, string[]> = {
  semana_inicio: ['semana', 'semana inicio', 'semana_inicio', 'lunes', 'fecha', 'inicio', 'desde'],
  flota: ['flota', 'vehiculos', 'flota objetivo', 'total flota'],
  ocupacion: ['ocupacion', '% ocupacion', 'ocupacion %', 'tasa ocupacion'],
  operatividad: ['operatividad', '% operatividad', 'operatividad %', 'tasa operatividad'],
  facturacion: ['facturacion', 'facturado', 'facturacion semanal', 'facturacion objetivo'],
  cobranza: ['cobranza', '% cobranza', 'cobranza %', 'tasa cobranza', 'cobrabilidad'],
}

function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/** Acepta 1234,5 · 1.234,5 · 1,234.5 · $ 23.000.000 · 23000000. */
export function parseNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  let s = String(valor ?? '').replace(/[$%\s]/g, '').replace(/ARS/i, '')
  if (!s) return null
  const ultimoPunto = s.lastIndexOf('.')
  const ultimaComa = s.lastIndexOf(',')
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // El último separador es el decimal
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (ultimaComa >= 0) {
    const partes = s.split(',')
    // "0,125" es decimal; "23,000" es miles
    const esDecimal = partes.length === 2 && (partes[1].length !== 3 || /^-?0$/.test(partes[0]))
    s = esDecimal ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimoPunto >= 0) {
    const partes = s.split('.')
    const esDecimal = partes.length === 2 && (partes[1].length !== 3 || /^-?0$/.test(partes[0]))
    if (!esDecimal) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Porcentaje en 0-100. "90", "90%" y "0,9" son 90. */
export function parsePorcentaje(valor: unknown): number | null {
  const n = parseNumero(valor)
  if (n === null) return null
  // "1%" es 1; solo un número sin % entre 0 y 1 se toma como fracción (0,9 = 90)
  if (typeof valor === 'string' && valor.includes('%')) return n
  return n > 0 && n <= 1 ? Math.round(n * 10000) / 100 : n
}

/** Fecha de Excel (número de serie) a YYYY-MM-DD. */
function serialExcelAIso(n: number): string {
  return fromUtc(Date.UTC(1899, 11, 30) + Math.round(n) * DIA_MS)
}

/**
 * Lunes de la semana indicada. Acepta:
 * 2026-10-19 · 19/10/2026 · 43-26 · 43-2026 · Sem 43-26 · Semana 43 2026 · fecha de Excel.
 */
export function parseSemana(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return lunesDe(fromUtc(Date.UTC(valor.getFullYear(), valor.getMonth(), valor.getDate())))
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    return lunesDe(serialExcelAIso(valor))
  }
  const s = normalizar(valor)
  if (!s) return null

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return lunesDe(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`)

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    return lunesDe(`${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  }

  m = s.match(/^(?:sem(?:ana)?\.?\s*)?(\d{1,2})\s*[-/ ]\s*(\d{2}|\d{4})$/)
  if (m) {
    const semana = Number(m[1])
    const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
    if (semana < 1 || semana > 53) return null
    return lunesDeSemana(semana, anio)
  }
  return null
}

/** Lunes de la semana N del año, misma convención que numeroSemana. */
export function lunesDeSemana(semana: number, anio: number): string | null {
  // La semana 1 es la que contiene el 1 de enero (weekStartsOn: 1, como Facturación).
  const lunes1 = lunesDe(`${anio}-01-01`)
  const lunes = sumarDias(lunes1, (semana - 1) * 7)
  const check = numeroSemana(lunes)
  return check.semana === semana && check.anio === anio ? lunes : null
}

/** Convierte las filas leídas del archivo (primera fila = encabezados). */
export function parseForecast(filas: unknown[][]): ForecastParse {
  const errores: string[] = []
  const encabezadoIdx = filas.findIndex(f =>
    f.some(c => COLUMNAS.semana_inicio.includes(normalizar(c))),
  )
  if (encabezadoIdx < 0) {
    return { filas: [], columnas: [], errores: ['No se encontró la columna "Semana" en el encabezado.'] }
  }
  const encabezado = filas[encabezadoIdx].map(normalizar)
  const indice = {} as Record<keyof ForecastFila, number>
  for (const [campo, alias] of Object.entries(COLUMNAS) as [keyof ForecastFila, string[]][]) {
    indice[campo] = encabezado.findIndex(h => alias.includes(h))
  }
  // Si está la columna "Desde" (fecha del lunes, como en la plantilla), manda:
  // una semana tipeada como "5-27" Excel la puede convertir en fecha.
  const idxDesde = encabezado.findIndex(h => h === 'desde')
  if (idxDesde >= 0) indice.semana_inicio = idxDesde
  const metricas = (['flota', 'ocupacion', 'operatividad', 'facturacion', 'cobranza'] as const)
    .filter(c => indice[c] >= 0)
  if (!metricas.length) {
    errores.push('No se encontró ninguna columna de objetivo (Flota, Ocupación, Operatividad, Facturación, Cobranza).')
    return { filas: [], columnas: [], errores }
  }

  const porSemana = new Map<string, ForecastFila>()
  filas.slice(encabezadoIdx + 1).forEach((fila, i) => {
    const nroFila = encabezadoIdx + i + 2
    if (!fila || fila.every(c => String(c ?? '').trim() === '')) return
    const lunes = parseSemana(fila[indice.semana_inicio])
    if (!lunes) {
      errores.push(`Fila ${nroFila}: no se entiende la semana "${String(fila[indice.semana_inicio] ?? '')}".`)
      return
    }
    const leer = (campo: keyof ForecastFila, pct: boolean) =>
      indice[campo] >= 0 ? (pct ? parsePorcentaje : parseNumero)(fila[indice[campo]]) : null

    const f: ForecastFila = {
      semana_inicio: lunes,
      flota: leer('flota', false),
      ocupacion: leer('ocupacion', true),
      operatividad: leer('operatividad', true),
      facturacion: leer('facturacion', false),
      cobranza: leer('cobranza', true),
    }
    // Fila con la semana pero sin ningún valor: no se toca esa semana.
    if (metricas.every(c => f[c] === null)) return
    if (f.flota !== null) f.flota = Math.round(f.flota)
    for (const campo of ['ocupacion', 'operatividad'] as const) {
      const v = f[campo]
      if (v !== null && (v < 0 || v > 100)) {
        errores.push(`Fila ${nroFila}: ${campo === 'ocupacion' ? 'ocupación' : 'operatividad'} fuera de rango (${v}).`)
        f[campo] = null
      }
    }
    if (f.cobranza !== null && (f.cobranza < 0 || f.cobranza > 200)) {
      errores.push(`Fila ${nroFila}: cobranza fuera de rango (${f.cobranza}).`)
      f.cobranza = null
    }
    if (f.facturacion !== null && f.facturacion < 0) {
      errores.push(`Fila ${nroFila}: facturación negativa.`)
      f.facturacion = null
    }
    if (f.flota !== null && f.flota < 0) {
      errores.push(`Fila ${nroFila}: flota negativa.`)
      f.flota = null
    }
    if (porSemana.has(lunes)) errores.push(`Fila ${nroFila}: la semana ${etiquetaSemana(lunes)} está repetida; queda la última.`)
    porSemana.set(lunes, f)
  })

  return {
    filas: Array.from(porSemana.values()).sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1)),
    columnas: [...metricas],
    errores,
  }
}
