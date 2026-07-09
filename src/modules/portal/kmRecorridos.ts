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
  //    Paginación con orden único + dedup por id, igual que el módulo.
  const desdeExt = (() => {
    const d = new Date(`${DESDE}T00:00:00-03:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10) + 'T00:00:00'
  })()
  const PAGE = 1000
  const fetchTabla = async (
    tabla: 'uss_historico' | 'geotab_historico',
    cols: string,
    patron: string,
  ): Promise<TripRow[]> => {
    const byId = new Map<number, TripRow>()
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error } = await supabase
        .from(tabla)
        .select(cols)
        .ilike('patente', patron)
        .gte('fecha_hora_inicio_gmt3', desdeExt)
        .order('fecha_hora_inicio_gmt3', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (page || []) as unknown as TripRow[]
      for (const r of batch) byId.set(r.id, { ...r, conductor_raw: r.conductor_raw ?? null })
      if (batch.length < PAGE) break
    }
    return [...byId.values()]
  }

  const tripsArr: TripEnriched[] = []
  for (const patNorm of patentes) {
    const patron = patronPatente(patNorm)
    const [ussRows, geotabRows] = await Promise.all([
      fetchTabla('uss_historico', 'id, patente, conductor, conductor_raw, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje', patron),
      fetchTabla('geotab_historico', 'id, patente, conductor, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje', patron),
    ])
    const enrich = (rows: TripRow[], origen: GpsOrigen) => {
      for (const r of rows) {
        const pn = normalizarPatente(r.patente)
        if (pn !== patNorm) continue // filtro autoritativo client-side
        const km = parseFloat(String(r.kilometraje || '0').replace(/[^\d.]/g, '')) || 0
        const inicioMs = new Date(`${r.fecha_hora_inicio_gmt3.replace(' ', 'T')}-03:00`).getTime()
        const finMs = r.fecha_hora_fin_gmt3
          ? new Date(`${r.fecha_hora_fin_gmt3.replace(' ', 'T')}-03:00`).getTime()
          : inicioMs
        tripsArr.push({ ...r, patenteNorm: pn, condEf: null, inicioMs, finMs, kmNum: Math.round(km * 100) / 100, gpsOrigen: origen })
      }
    }
    enrich(ussRows, 'USS')
    enrich(geotabRows, 'GEOTAB')
  }

  // Orden (origen, patente, inicio): requisito de la resolución de vecinos.
  tripsArr.sort((a, b) => {
    if (a.gpsOrigen !== b.gpsOrigen) return a.gpsOrigen < b.gpsOrigen ? -1 : 1
    if (a.patenteNorm !== b.patenteNorm) return a.patenteNorm.localeCompare(b.patenteNorm)
    return a.inicioMs - b.inicioMs
  })

  // 5) Conductor efectivo (huérfano hereda, multi al vecino más cercano) —
  //    idéntico al módulo, acotado a misma patente y mismo origen GPS.
  for (let i = 0; i < tripsArr.length; i++) {
    const t = tripsArr[i]
    const cs = parseRawConductores(t.conductor_raw)
    const titular = (t.conductor || '').trim().toUpperCase() || null

    if (!titular && cs.length === 0) {
      let prev: TripEnriched | null = null
      let next: TripEnriched | null = null
      for (let j = i - 1; j >= 0; j--) {
        if (tripsArr[j].gpsOrigen !== t.gpsOrigen || tripsArr[j].patenteNorm !== t.patenteNorm) break
        if ((tripsArr[j].conductor || '').trim()) { prev = tripsArr[j]; break }
      }
      for (let j = i + 1; j < tripsArr.length; j++) {
        if (tripsArr[j].gpsOrigen !== t.gpsOrigen || tripsArr[j].patenteNorm !== t.patenteNorm) break
        if ((tripsArr[j].conductor || '').trim()) { next = tripsArr[j]; break }
      }
      let chosen: TripEnriched | null = null
      if (prev && next) {
        const gp = t.inicioMs - prev.finMs
        const gn = next.inicioMs - t.finMs
        chosen = gp <= gn ? prev : next
      } else chosen = prev || next
      t.condEf = (chosen?.conductor || '').trim().toUpperCase() || null
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

  // 6) Filtrar trips del conductor (condEf vs nombre, con fallback por inclusión
  //    como hace el módulo: USS suele truncar/diferir formato).
  const full = normName(`${cond.nombres} ${cond.apellidos}`)
  const fullRev = normName(`${cond.apellidos} ${cond.nombres}`)
  const esDelConductor = (condEf: string | null): boolean => {
    if (!condEf) return false
    const n = normName(condEf)
    if (!n) return false
    if (n === full || n === fullRev) return true
    return n.includes(full) || full.includes(n) || n.includes(fullRev) || fullRev.includes(n)
  }

  // 7) Acumular km por semana ISO (ART), solo patente propia de esa semana.
  const kmPorSemana = new Map<string, number>()
  for (const t of tripsArr) {
    if (!esDelConductor(t.condEf)) continue
    const wi = getISOWeekInfo(fechaART(t.inicioMs))
    const asign = porSemanaAsign.get(wi.key)
    if (!asign) continue // semana sin asignación válida => no suma (regla del módulo)
    if (!asign.patentes.has(t.patenteNorm)) continue // patente ajena esa semana => no suma
    kmPorSemana.set(wi.key, Math.round(((kmPorSemana.get(wi.key) || 0) + t.kmNum) * 100) / 100)
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
      }
    })
    .sort((a, b) => (b.anio - a.anio) || (b.semana - a.semana))

  return { semanas, modalidadActual }
}
