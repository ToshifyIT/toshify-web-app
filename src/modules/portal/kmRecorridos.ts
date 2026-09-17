// Cálculo de KM RECORRIDOS por semana para el portal "Mi Espacio".
//
// COPIA ACOTADA de la lógica de Control de Exceso de KM
// (src/modules/integraciones/uss/control-exceso-km/hooks/useExcesoKmData.ts),
// restringida a UN conductor. Decisión de producto: el portal debe mostrar
// EXACTAMENTE lo mismo que el módulo interno. Si se ajusta la lógica allá,
// hay que replicar el ajuste acá (se decidió NO compartir un util para no
// tocar el módulo interno).
//
// Reglas replicadas del módulo:
//  1. Fuentes: uss_historico + geotab_historico (geotab NO tiene conductor_raw).
//  2. Conductor efectivo por trip: huérfano hereda del vecino más cercano;
//     multi-conductor (raw "A, B") se asigna al vecino single más cercano.
//     Siempre dentro de la misma patente y el mismo origen GPS.
//  3. Semana ISO lunes-domingo con corte en hora Argentina (-03:00).
//  4. Solo cuentan km de patentes ASIGNADAS al conductor esa semana
//     (asignación vigente y con estados válidos). Semana sin asignación => no suma.
//  5. Modalidad/límite POR SEMANA según la asignación vigente que empezó última.

import type { supabase as SupabaseClientType } from '../../lib/supabase'

const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'
// Corte fijo del portal: km recorridos se muestran desde junio 2026
// (el 1/6 es lunes, arranque exacto de la semana ISO 23).
const DESDE = '2026-06-01'

type GpsOrigen = 'USS' | 'GEOTAB'

// Desglose diario dentro de una semana. Se arma con los MISMOS trips que suman
// al total semanal (misma atribución de conductor y mismo filtro de patente),
// así la suma de los días es exactamente el km de la semana.
export interface KmDiaConductor {
  fecha: string            // yyyy-MM-dd (hora Argentina)
  km: number
  viajes: number
}

export interface KmSemanaConductor {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  km: number
  limite: number
  excedido: number
  modalidad: string
  horario: string | null   // diurno / nocturno / todo_dia de la asignación de esa semana
  // Lunes -> domingo. En la semana en curso corta en el día de hoy (no lista
  // días futuros). Los días sin viajes van con km 0.
  dias: KmDiaConductor[]
}

interface TripRow {
  id: number
  patente: string | null
  conductor: string | null
  conductor_raw: string | null
  fecha_hora_inicio_gmt3: string
  fecha_hora_fin_gmt3: string | null
  kilometraje: string | null
}

interface TripEnriched extends TripRow {
  patenteNorm: string
  condEf: string | null
  inicioMs: number
  finMs: number
  kmNum: number
  gpsOrigen: GpsOrigen
}

interface WeekInfo {
  semana: number
  anio: number
  inicio: string
  fin: string
  key: string
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Igual que el módulo: semana ISO lunes-domingo a partir de un 'yyyy-MM-dd'.
function getISOWeekInfo(dateStr: string): WeekInfo {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const dow = date.getDay() === 0 ? 7 : date.getDay()

  const monday = new Date(date)
  monday.setDate(date.getDate() - (dow - 1))

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const target = new Date(date)
  target.setDate(date.getDate() + 4 - (date.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const semana = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const anio = target.getFullYear()

  return {
    semana,
    anio,
    inicio: toLocalDateString(monday),
    fin: toLocalDateString(sunday),
    key: `${anio}-${String(semana).padStart(2, '0')}`,
  }
}

function normalizarPatente(p: string | null | undefined): string {
  return (p || '').replace(/[\s-]/g, '').toUpperCase()
}

function parseRawConductores(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => {
    const dash = s.indexOf('-')
    return (dash >= 0 ? s.slice(dash + 1) : s).trim().toUpperCase()
  }).filter(n => n.length > 0)
}

function normName(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Fecha 'yyyy-MM-dd' en hora Argentina de un instante.
function fechaART(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
}

// Patrón ilike tolerante a formato: en las tablas GPS la patente aparece
// con y sin espacios ("AG834UG" / "AG 834 UG"). El filtro server-side es solo
// para no bajar la flota entera; el filtro autoritativo es client-side por
// patente normalizada.
function patronPatente(norm: string): string {
  const m = norm.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/) || norm.match(/^([A-Z]{3})(\d{3})$/)
  return m ? `%${m.slice(1).join('%')}%` : `%${norm}%`
}

interface AsignacionParsed {
  horario: string | null
  modalidad: string | null
  patenteNorm: string
  iniMs: number
  finMs: number
}

export interface KmConductorResult {
  semanas: KmSemanaConductor[]
  // Modalidad de referencia para la previsión de cobro (asignación vigente hoy
  // o, si no hay, la última conocida).
  modalidadActual: string
}


// Trae y normaliza los viajes (ambas fuentes GPS) de un conjunto de patentes.
// Lo usan TANTO el calculo por conductor (modal / portal) COMO el calculo masivo
// del panel, para que los numeros no puedan separarse entre pantallas.
// El filtro server-side por patente es tolerante al formato (ilike) y se agrupa
// de a LOTE_PATENTES por consulta; el filtro autoritativo es client-side por
// patente normalizada, igual que el modulo interno.
const LOTE_PATENTES = 20

async function fetchTripsDePatentes(
  supabase: typeof SupabaseClientType,
  patentes: Set<string>,
  desdeISO: string,
  hastaISO?: string,
): Promise<TripEnriched[]> {
  const lista = [...patentes].filter(Boolean)
  if (lista.length === 0) return []

  const PAGE = 1000
  const trips: TripEnriched[] = []
  // Dedupe GLOBAL por (tabla, id): una patente puede matchear el patrón ilike
  // de otra en un lote distinto, y sin esto el mismo viaje se contaria dos veces.
  const vistos = new Set<string>()

  const fetchTabla = async (
    tabla: 'uss_historico' | 'geotab_historico',
    cols: string,
    patrones: string[],
    origen: GpsOrigen,
  ): Promise<void> => {
    const orFiltro = patrones.map(pt => `patente.ilike.${pt}`).join(',')
    const byId = new Map<number, TripRow>()
    for (let offset = 0; ; offset += PAGE) {
      let q = supabase.from(tabla).select(cols).or(orFiltro).gte('fecha_hora_inicio_gmt3', desdeISO)
      if (hastaISO) q = q.lte('fecha_hora_inicio_gmt3', hastaISO)
      const { data: page, error } = await q
        .order('fecha_hora_inicio_gmt3', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (page || []) as unknown as TripRow[]
      for (const r of batch) byId.set(r.id, { ...r, conductor_raw: r.conductor_raw ?? null })
      if (batch.length < PAGE) break
    }
    for (const r of byId.values()) {
      const clave = `${tabla}:${r.id}`
      if (vistos.has(clave)) continue
      const pn = normalizarPatente(r.patente)
      if (!patentes.has(pn)) continue // filtro autoritativo client-side
      vistos.add(clave)
      const km = parseFloat(String(r.kilometraje || '0').replace(/[^\d.]/g, '')) || 0
      const inicioMs = new Date(`${r.fecha_hora_inicio_gmt3.replace(' ', 'T')}-03:00`).getTime()
      const finMs = r.fecha_hora_fin_gmt3
        ? new Date(`${r.fecha_hora_fin_gmt3.replace(' ', 'T')}-03:00`).getTime()
        : inicioMs
      trips.push({ ...r, patenteNorm: pn, condEf: null, inicioMs, finMs, kmNum: Math.round(km * 100) / 100, gpsOrigen: origen })
    }
  }

  for (let i = 0; i < lista.length; i += LOTE_PATENTES) {
    const patrones = lista.slice(i, i + LOTE_PATENTES).map(patronPatente)
    await Promise.all([
      fetchTabla('uss_historico', 'id, patente, conductor, conductor_raw, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje', patrones, 'USS'),
      fetchTabla('geotab_historico', 'id, patente, conductor, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje', patrones, 'GEOTAB'),
    ])
  }

  // Orden (origen, patente, inicio): requisito de la resolucion de vecinos.
  trips.sort((a, b) => {
    if (a.gpsOrigen !== b.gpsOrigen) return a.gpsOrigen < b.gpsOrigen ? -1 : 1
    if (a.patenteNorm !== b.patenteNorm) return a.patenteNorm.localeCompare(b.patenteNorm)
    return a.inicioMs - b.inicioMs
  })
  return trips
}

// Conductor efectivo de cada trip. Compartido por el calculo por conductor
// (modal y portal) y por el calculo masivo del panel: es EL MISMO codigo.
//
// CAMBIO DE REGLA (2026-09-16, pedido de operaciones):
// Un viaje SIN conductor identificado ya NO hereda el conductor del viaje
// vecino mas cercano: queda sin dueño y sus km no se le suman a nadie.
// Motivo: en autos de turno la herencia cargaba al ultimo conductor conocido
// viajes que no eran suyos (caso AH168GJ: 7 viajes de la mañana colgados del
// turno nocturno). Si el GPS no sabe quien manejaba, el sistema tampoco lo
// inventa. El caso multi-conductor SI se sigue repartiendo: ahi hay nombres.
//
// OJO: el modulo Control de Exceso de KM tiene su propia copia de esta logica
// y conserva la herencia. Sus km pueden ser mayores que los de estas pantallas.
function asignarConductorEfectivo(tripsArr: TripEnriched[]): void {

  // Conductor efectivo, acotado a misma patente y mismo origen GPS.
  for (let i = 0; i < tripsArr.length; i++) {
    const t = tripsArr[i]
    const cs = parseRawConductores(t.conductor_raw)
    const titular = (t.conductor || '').trim().toUpperCase() || null

    // Viaje sin ningun nombre: no se le atribuye a nadie.
    if (!titular && cs.length === 0) {
      t.condEf = null
      continue
    }

    if (cs.length >= 2) {
      const bestGap = new Map<string, number>()
      for (let j = i - 1; j >= 0; j--) {
        if (tripsArr[j].gpsOrigen !== t.gpsOrigen || tripsArr[j].patenteNorm !== t.patenteNorm) break
        const vr = parseRawConductores(tripsArr[j].conductor_raw)
        if (vr.length !== 1) continue
        if (!cs.includes(vr[0])) continue
        const g = t.inicioMs - tripsArr[j].finMs
        const p = bestGap.get(vr[0])
        if (p === undefined || g < p) bestGap.set(vr[0], g)
        break
      }
      for (let j = i + 1; j < tripsArr.length; j++) {
        if (tripsArr[j].gpsOrigen !== t.gpsOrigen || tripsArr[j].patenteNorm !== t.patenteNorm) break
        const vr = parseRawConductores(tripsArr[j].conductor_raw)
        if (vr.length !== 1) continue
        if (!cs.includes(vr[0])) continue
        const g = tripsArr[j].inicioMs - t.finMs
        const p = bestGap.get(vr[0])
        if (p === undefined || g < p) bestGap.set(vr[0], g)
        break
      }
      let receptor: string | null = null
      if (bestGap.size === 0) {
        receptor = titular
      } else if (bestGap.size === cs.length) {
        let m = Infinity
        for (const [n, g] of bestGap.entries()) if (g < m) { m = g; receptor = n }
      } else {
        const huer = cs.filter(c => !bestGap.has(c))
        receptor = huer.length === 1 ? huer[0] : titular
      }
      t.condEf = receptor
      continue
    }

    t.condEf = titular
  }

}

// Predicado "este trip es de este conductor", con el mismo fallback por
// inclusion que usa el modulo interno (USS suele truncar o cambiar el formato).
function matcherConductor(nombres: string | null, apellidos: string | null): (condEf: string | null) => boolean {
  const full = normName(`${nombres || ''} ${apellidos || ''}`)
  const fullRev = normName(`${apellidos || ''} ${nombres || ''}`)
  return (condEf: string | null): boolean => {
    if (!condEf) return false
    const n = normName(condEf)
    if (!n) return false
    if (n === full || n === fullRev) return true
    return n.includes(full) || full.includes(n) || n.includes(fullRev) || fullRev.includes(n)
  }
}

export async function calcularKmSemanasConductor(
  supabase: typeof SupabaseClientType,
  cond: { id: string; nombres: string; apellidos: string },
): Promise<KmConductorResult> {
  // 1) Límites configurables (mismos defaults que Control Exceso KM)
  let limiteTurno = 1800
  let limiteACargo = 3600
  const { data: limiteParams } = await supabase
    .from('parametros_sistema')
    .select('clave, valor')
    .in('clave', ['limite_km_semanal_turno', 'limite_km_semanal_a_cargo'])
  for (const p of (limiteParams || []) as { clave: string; valor: string }[]) {
    const v = parseFloat(p.valor)
    if (!isNaN(v) && v > 0) {
      if (p.clave === 'limite_km_semanal_turno') limiteTurno = v
      if (p.clave === 'limite_km_semanal_a_cargo') limiteACargo = v
    }
  }

  // 2) Asignaciones del conductor con vigencia + patente (mismas reglas de
  //    validez que el módulo: ac no cancelada, padre activa/finalizada).
  const { data: acRows } = await (supabase
    .from('asignaciones_conductores')
    .select('horario, estado, fecha_inicio, fecha_fin, asignaciones(modalidad, estado, vehiculos(patente))')
    .eq('conductor_id', cond.id) as any)
  type VehJoin = { patente: string | null }
  type AsigJoin = { modalidad: string | null; estado: string | null; vehiculos: VehJoin | VehJoin[] | null }
  const asigDe = (r: any): AsigJoin | null =>
    Array.isArray(r.asignaciones) ? (r.asignaciones[0] ?? null) : (r.asignaciones ?? null)
  const patenteDe = (a: AsigJoin | null): string | null => {
    if (!a) return null
    const v = Array.isArray(a.vehiculos) ? (a.vehiculos[0] ?? null) : (a.vehiculos ?? null)
    return v?.patente ?? null
  }
  const acEstadoOk = (e: string | null) => e == null || ['asignado', 'completado', 'activo', 'activa'].includes(e)
  const asigEstadoOk = (e: string | null) => e == null || ['activa', 'activo', 'finalizada', 'finalizado'].includes(e)
  const acParsed: AsignacionParsed[] = ((acRows || []) as any[])
    .filter(r => acEstadoOk(r.estado) && asigEstadoOk(asigDe(r)?.estado ?? null) && r.fecha_inicio)
    .map(r => ({
      horario: r.horario,
      modalidad: asigDe(r)?.modalidad ?? null,
      patenteNorm: normalizarPatente(patenteDe(asigDe(r))),
      iniMs: new Date(r.fecha_inicio as string).getTime(),
      finMs: r.fecha_fin ? new Date(r.fecha_fin).getTime() : Number.POSITIVE_INFINITY,
    }))

  // Modalidad de referencia (para la previsión de cobro): vigente hoy, si no la última.
  const nowMs = Date.now()
  let modalidadActual = 'turno'
  const vigHoy = acParsed.filter(r => r.iniMs <= nowMs && r.finMs >= nowMs).sort((a, b) => b.iniMs - a.iniMs)
  if (vigHoy[0]?.modalidad) {
    modalidadActual = vigHoy[0].modalidad
  } else {
    const ultima = [...acParsed].sort((a, b) => b.iniMs - a.iniMs)[0]
    if (ultima?.modalidad) modalidadActual = ultima.modalidad
  }

  // 3) Semanas desde junio 2026 hasta hoy (ART): para cada una, asignación
  //    elegida (última que empezó vigente esa semana) y patentes propias.
  const desdeMs = new Date(`${DESDE}T00:00:00-03:00`).getTime()
  const porSemanaAsign = new Map<string, { info: WeekInfo; modalidad: string | null; horario: string | null; patentes: Set<string> }>()
  for (let cursorMs = desdeMs; cursorMs <= nowMs; cursorMs += 7 * 86400000) {
    const wi = getISOWeekInfo(fechaART(cursorMs))
    const lunesMs = new Date(`${wi.inicio}T00:00:00-03:00`).getTime()
    const domingoMs = new Date(`${wi.fin}T23:59:59-03:00`).getTime()
    const vigentes = acParsed.filter(r => r.iniMs <= domingoMs && r.finMs >= lunesMs)
    if (vigentes.length === 0) continue
    vigentes.sort((a, b) => b.iniMs - a.iniMs)
    const pats = new Set<string>()
    for (const v of vigentes) { if (v.patenteNorm) pats.add(v.patenteNorm) }
    porSemanaAsign.set(wi.key, { info: wi, modalidad: vigentes[0].modalidad, horario: vigentes[0].horario, patentes: pats })
  }

  // Patentes a consultar: todas las que tuvo asignadas en la ventana.
  const patentes = new Set<string>()
  for (const r of acParsed) {
    if (r.patenteNorm && r.iniMs <= nowMs && r.finMs >= desdeMs) patentes.add(r.patenteNorm)
  }
  if (patentes.size === 0 || porSemanaAsign.size === 0) {
    return { semanas: [], modalidadActual }
  }

  // 4) Trips de las patentes del conductor desde 1 día ANTES del corte
  //    (contexto para la lógica de vecino más cercano), ambas fuentes.
  const desdeExt = (() => {
    const d = new Date(`${DESDE}T00:00:00-03:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10) + 'T00:00:00'
  })()
  const tripsArr = await fetchTripsDePatentes(supabase, patentes, desdeExt)

  // 5) Conductor efectivo (huérfano hereda, multi al vecino más cercano).
  asignarConductorEfectivo(tripsArr)

  // 6) Filtrar trips del conductor (condEf vs nombre, con fallback por inclusión).
  const esDelConductor = matcherConductor(cond.nombres, cond.apellidos)

  // 7) Acumular km por semana ISO (ART), solo patente propia de esa semana.
  //    En la misma pasada se acumula el desglose por DIA con los mismos trips,
  //    para que la suma de los días coincida siempre con el total de la semana.
  const kmPorSemana = new Map<string, number>()
  const kmPorDia = new Map<string, { km: number; viajes: number }>()  // clave: `${semanaKey}|${yyyy-MM-dd}`
  for (const t of tripsArr) {
    if (!esDelConductor(t.condEf)) continue
    const dia = fechaART(t.inicioMs)
    const wi = getISOWeekInfo(dia)
    const asign = porSemanaAsign.get(wi.key)
    if (!asign) continue // semana sin asignación válida => no suma (regla del módulo)
    if (!asign.patentes.has(t.patenteNorm)) continue // patente ajena esa semana => no suma
    kmPorSemana.set(wi.key, Math.round(((kmPorSemana.get(wi.key) || 0) + t.kmNum) * 100) / 100)
    const dk = `${wi.key}|${dia}`
    const prev = kmPorDia.get(dk) || { km: 0, viajes: 0 }
    kmPorDia.set(dk, { km: Math.round((prev.km + t.kmNum) * 100) / 100, viajes: prev.viajes + 1 })
  }

  // Días de una semana: lunes -> domingo, cortando en hoy si la semana está en
  // curso. Los días sin viajes se listan igual, con 0.
  const hoyART = fechaART(nowMs)
  const diasDeSemana = (info: WeekInfo): KmDiaConductor[] => {
    const out: KmDiaConductor[] = []
    const [y, m, d] = info.inicio.split('-').map(Number)
    for (let i = 0; i < 7; i++) {
      const cur = new Date(y, m - 1, d + i, 12, 0, 0)
      const fecha = toLocalDateString(cur)
      if (fecha > info.fin) break
      if (fecha > hoyART) break
      const v = kmPorDia.get(`${info.key}|${fecha}`)
      out.push({ fecha, km: v ? Math.round(v.km) : 0, viajes: v ? v.viajes : 0 })
    }
    return out
  }

  const semanas: KmSemanaConductor[] = [...kmPorSemana.entries()]
    .map(([key, km]) => {
      const asign = porSemanaAsign.get(key)!
      const modalidad = asign.modalidad || 'turno'
      const limite = modalidad === 'a_cargo' ? limiteACargo : limiteTurno
      const kmRed = Math.round(km)
      return {
        semana: asign.info.semana,
        anio: asign.info.anio,
        fecha_inicio: asign.info.inicio,
        fecha_fin: asign.info.fin,
        km: kmRed,
        limite,
        excedido: Math.max(0, kmRed - limite),
        modalidad,
        horario: asign.horario ?? null,
        dias: diasDeSemana(asign.info),
      }
    })
    .sort((a, b) => (b.anio - a.anio) || (b.semana - a.semana))

  return { semanas, modalidadActual }
}


// =====================================================
// CALCULO MASIVO: km de UNA semana para MUCHOS conductores
// =====================================================
// Lo usa la tabla del Panel de Conductores (columna "KM Geo"). Comparte con
// calcularKmSemanasConductor el fetch de trips, la atribucion de conductor y el
// matcher de nombre, asi que el numero que muestra la tabla es el mismo que el
// de la pestaña "Km recorridos" del modal.
//
// Diferencia deliberada: aca la ventana de trips es la semana +/- MARGEN_DIAS en
// lugar de "desde junio". La atribucion de un trip huerfano mira a su vecino mas
// cercano de la misma patente, que en la practica esta a horas, no a dias; el
// margen cubre ese caso sin traer meses de viajes en cada carga del panel.
const MARGEN_DIAS = 3

export async function calcularKmSemanaConductores(
  supabase: typeof SupabaseClientType,
  conductores: readonly { id: string; nombres: string | null; apellidos: string | null }[],
  semana: { inicio: string; fin: string },   // lunes y domingo 'yyyy-MM-dd'
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (conductores.length === 0) return out

  const lunesMs = new Date(`${semana.inicio}T00:00:00-03:00`).getTime()
  const domingoMs = new Date(`${semana.fin}T23:59:59-03:00`).getTime()

  // 1) Asignaciones vigentes en la semana. Se pide con margen y se filtra en JS
  //    con la MISMA comparacion que el calculo por conductor.
  const desdeFiltro = new Date(lunesMs - MARGEN_DIAS * 86400000).toISOString().slice(0, 10)
  const hastaFiltro = new Date(domingoMs + MARGEN_DIAS * 86400000).toISOString().slice(0, 10)
  const { data: acRows } = await (supabase
    .from('asignaciones_conductores')
    .select('conductor_id, horario, estado, fecha_inicio, fecha_fin, asignaciones(modalidad, estado, vehiculos(patente))')
    .lte('fecha_inicio', `${hastaFiltro}T23:59:59`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${desdeFiltro}`) as any)

  type VehJoin = { patente: string | null }
  type AsigJoin = { modalidad: string | null; estado: string | null; vehiculos: VehJoin | VehJoin[] | null }
  const asigDe = (r: any): AsigJoin | null =>
    Array.isArray(r.asignaciones) ? (r.asignaciones[0] ?? null) : (r.asignaciones ?? null)
  const patenteDe = (a: AsigJoin | null): string | null => {
    if (!a) return null
    const v = Array.isArray(a.vehiculos) ? (a.vehiculos[0] ?? null) : (a.vehiculos ?? null)
    return v?.patente ?? null
  }
  const acEstadoOk = (e: string | null) => e == null || ['asignado', 'completado', 'activo', 'activa'].includes(e)
  const asigEstadoOk = (e: string | null) => e == null || ['activa', 'activo', 'finalizada', 'finalizado'].includes(e)

  const patentesPorConductor = new Map<string, Set<string>>()
  const todasLasPatentes = new Set<string>()
  for (const r of ((acRows || []) as any[])) {
    if (!r.conductor_id || !r.fecha_inicio) continue
    if (!acEstadoOk(r.estado) || !asigEstadoOk(asigDe(r)?.estado ?? null)) continue
    const iniMs = new Date(r.fecha_inicio as string).getTime()
    const finMs = r.fecha_fin ? new Date(r.fecha_fin).getTime() : Number.POSITIVE_INFINITY
    if (!(iniMs <= domingoMs && finMs >= lunesMs)) continue   // misma regla que el modal
    const pn = normalizarPatente(patenteDe(asigDe(r)))
    if (!pn) continue
    const set = patentesPorConductor.get(r.conductor_id) || new Set<string>()
    set.add(pn)
    patentesPorConductor.set(r.conductor_id, set)
    todasLasPatentes.add(pn)
  }
  if (todasLasPatentes.size === 0) return out

  // 2) Trips de TODAS esas patentes en una sola pasada, y atribucion compartida.
  const desdeISO = new Date(lunesMs - MARGEN_DIAS * 86400000).toISOString().slice(0, 10) + 'T00:00:00'
  const hastaISO = new Date(domingoMs + MARGEN_DIAS * 86400000).toISOString().slice(0, 10) + 'T23:59:59'
  const trips = await fetchTripsDePatentes(supabase, todasLasPatentes, desdeISO, hastaISO)
  asignarConductorEfectivo(trips)

  // 3) Acumulado por conductor, con el mismo redondeo que el calculo por semana.
  const porPatente = new Map<string, TripEnriched[]>()
  for (const t of trips) {
    const arr = porPatente.get(t.patenteNorm) || []
    arr.push(t)
    porPatente.set(t.patenteNorm, arr)
  }
  for (const c of conductores) {
    const pats = patentesPorConductor.get(c.id)
    if (!pats || pats.size === 0) continue
    const esDelConductor = matcherConductor(c.nombres, c.apellidos)
    let km = 0
    let hubo = false
    for (const pn of pats) {
      for (const t of (porPatente.get(pn) || [])) {
        const dia = fechaART(t.inicioMs)
        if (dia < semana.inicio || dia > semana.fin) continue
        if (!esDelConductor(t.condEf)) continue
        km = Math.round((km + t.kmNum) * 100) / 100
        hubo = true
      }
    }
    if (hubo) out.set(c.id, Math.round(km))
  }

  return out
}
