// src/modules/reportes/control-gestores/controlGestoresService.ts
// Reportes > Control de gestores (pedido de Operaciones, 2026-11-05).
//
// Gestor = guía responsable del vehículo (vehiculos.guia_responsable). Para semanas
// pasadas se usa el gestor que tenía el auto en ese momento
// (vehiculos_guia_historial, sql/vehiculos_guia_historial.sql); antes de que
// arrancara el historial, el primer gestor registrado del auto.
//
// Definiciones acordadas con Operaciones:
//  - Autos que cuentan: los que están en Disponible, PKG ON o En uso en ese momento
//    (los demás no están operativos). El estado de semanas pasadas se reconstruye con
//    historial_vehiculos.
//  - Cada auto son 2 turnos (mañana y noche). Un auto a cargo con conductor cubre los 2.
//  - Ocupación = turnos con conductor / turnos disponibles. Meta 90 %.
//  - Pérdida por día = cada turno vacío por su precio de OCT-26, semanal / 7 sin IVA:
//    P021 diurno, P023 nocturno; un auto a cargo sin conductor, P022.
//  - Churn = bajas del período (kpi_bajas, las mismas de los KPIs) / conductores activos
//    el lunes. En la vista mensual, bajas / (activos el día 1 + altas del mes). Límite
//    5 % semanal; en la vista mensual, ese 5 % llevado a los días del mes (~20 %).
//  - Retención = de los conductores que arrancaron en un mes (alta = primer turno, como
//    kpi_altas_conductores), cuántos siguen sin baja N semanas después.
import { supabase } from '../../../lib/supabase'
import { lunesDe, sumarDias } from '../kpis-v2/kpisV2Types'

export const META_OCUPACION = 0.9
export const LIMITE_CHURN = 0.05
export const SEMANAS_HISTORIA = 8
export const MESES_HISTORIA = 6
export const SEMANAS_RETENCION = 8
/** Horizontes de la curva de retención (selector del gráfico), en días */
export const HORIZONTES_RETENCION = [30, 60, 90] as const
export type HorizonteRetencion = typeof HORIZONTES_RETENCION[number]
export const SIN_GESTOR = 'Sin capitán'
export const TOTAL = 'Total empresa'

const ESTADOS_OPERATIVOS = new Set(['DISPONIBLE', 'PKG_ON_BASE', 'EN_USO'])
const CONCEPTO_DIURNO = 'P021'
const CONCEPTO_NOCTURNO = 'P023'
const CONCEPTO_A_CARGO = 'P022'
const PAGINA = 1000
const DIA_MS = 86400000

export type FiltroSede = <T>(q: T) => T

/** Vista del tablero: una semana (lunes a domingo) o un mes calendario. */
export type Granularidad = 'semana' | 'mes'

// ───────────── Tipos de resultado ─────────────

export interface FotoGestor {
  gestor: string
  autos: number
  /** Autos con los dos turnos cubiertos */
  completos: number
  unTurno: number
  sinTurnos: number
  turnosDisp: number
  turnosCompl: number
  mananaCompl: number
  nocheCompl: number
  turnosVacios: number
  /** Pérdida por día ($, sin IVA) */
  perdida: number
}

export interface FotoFlota {
  /** Momento de la foto (ISO) */
  momento: string
  /** Una fila por gestor, de menor a mayor ocupación */
  porGestor: FotoGestor[]
  total: FotoGestor
}

export interface ChurnGestor {
  gestor: string
  activos: number
  altas: number
  bajas: number
  churn: number | null
}

export interface PeriodoHistoria {
  /** Primer día del período (lunes o día 1) */
  inicio: string
  ocupacion: Map<string, number | null>
  churn: Map<string, number | null>
}

export interface CurvaRetencion {
  gestor: string
  cohorte: number
  /** % que sigue en cada día de `dias` (null = todavía no pasó) */
  puntos: (number | null)[]
}

/** Curva de retención a un horizonte: la cohorte es el último mes que ya lo cumplió entero. */
export interface RetencionHorizonte {
  mes: string
  /** Días de cada punto: 0, 7, 14... y el horizonte al final */
  dias: number[]
  curvas: CurvaRetencion[]
}

export interface ControlGestores {
  periodo: { granularidad: Granularidad; inicio: string; fin: string; enCurso: boolean }
  foto: FotoFlota
  /** limite: el 5 % semanal llevado a la duración del período (en un mes, ~20 %) */
  churn: { porGestor: ChurnGestor[]; total: ChurnGestor; promedio: number | null; limite: number }
  historia: PeriodoHistoria[]
  retencion: Record<HorizonteRetencion, RetencionHorizonte>
  gestores: string[]
  precios: { diurno: number; nocturno: number; aCargo: number; conPrecio: boolean }
  hoy: string
}

// ───────────── Helpers ─────────────

async function leerTodo(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  const filas: any[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = (data || []) as any[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

/** Medianoche (hora argentina) de un día 'YYYY-MM-DD', en ms. */
function inicioDiaMs(dia: string): number {
  return Date.parse(`${dia}T00:00:00-03:00`)
}

const cancelada = (e: string | null | undefined) => /^cancel/i.test(e || '')
const sinEmpezar = (e: string | null | undefined) => /^(cancel|program|pendient)/i.test(e || '')
const activa = (e: string | null | undefined) => /^activ/i.test(e || '')

type Turno = 'D' | 'N' | 'C'
function turnoDe(horario: string | null | undefined): Turno {
  const h = (horario || '').toLowerCase()
  if (h === 'diurno' || h === 'd') return 'D'
  if (h === 'nocturno' || h === 'n') return 'N'
  return 'C'
}

/** Paso de un conductor por un auto. */
interface Estadia {
  conductorId: string
  vehiculoId: string
  turno: Turno
  ini: number
  fin: number
}

interface AsignacionAuto {
  vehiculoId: string
  aCargo: boolean
  ini: number
  fin: number
}

interface Vehiculo {
  id: string
  estado: string | null
  creado: number
  guiaActual: string | null
}

function filaVacia(gestor: string): FotoGestor {
  return {
    gestor, autos: 0, completos: 0, unTurno: 0, sinTurnos: 0, turnosDisp: 0,
    turnosCompl: 0, mananaCompl: 0, nocheCompl: 0, turnosVacios: 0, perdida: 0,
  }
}

export function ocupacion(f: Pick<FotoGestor, 'turnosCompl' | 'turnosDisp'>): number | null {
  return f.turnosDisp > 0 ? f.turnosCompl / f.turnosDisp : null
}

// ───────────── Carga ─────────────

export async function cargarControlGestores(
  filtroSede: FiltroSede,
  sedeId: string | null,
  granularidad: Granularidad,
  inicioPeriodo: string,
  hoy: string,
): Promise<ControlGestores> {
  const finPeriodo = finDe(granularidad, inicioPeriodo)
  const enCurso = finPeriodo >= hoy
  const ahora = Date.now()

  // Períodos del gráfico de evolución: 8 semanas o 6 meses, el elegido al final
  const periodosHistoria: string[] = []
  for (let i = (granularidad === 'semana' ? SEMANAS_HISTORIA : MESES_HISTORIA) - 1; i >= 0; i--) {
    periodosHistoria.push(granularidad === 'semana' ? sumarDias(inicioPeriodo, -7 * i) : sumarMeses(inicioPeriodo, -i))
  }

  // Ventana: la historia y la cohorte de retención
  const corteRetencion = enCurso ? hoy : finPeriodo
  // La cohorte más vieja es la del horizonte más largo
  const mesCohorteMin = mesCohorteDe(corteRetencion, Math.max(...HORIZONTES_RETENCION))
  const desdeDia = mesCohorteMin < periodosHistoria[0] ? mesCohorteMin : periodosHistoria[0]
  const desdeISO = new Date(inicioDiaMs(desdeDia) - 7 * DIA_MS).toISOString()

  const [vehiculosRaw, cambiosRaw, historialGuia, asignacionesRaw, conceptos, bajasRaw, altasRaw] = await Promise.all([
    leerTodo((a, b) => filtroSede(supabase
      .from('vehiculos')
      .select('id, created_at, guia_responsable, vehiculos_estados (codigo)')
      .is('deleted_at', null))
      .order('id')
      .range(a, b)),
    leerTodo((a, b) => supabase
      .from('historial_vehiculos')
      .select('vehiculo_id, estado_anterior, estado_nuevo, created_at')
      .eq('tipo_evento', 'cambio_estado')
      .gte('created_at', desdeISO)
      .order('created_at')
      .range(a, b)),
    leerTodo((a, b) => (supabase.from('vehiculos_guia_historial' as any) as any)
      .select('vehiculo_id, guia, desde, hasta')
      .order('desde')
      .range(a, b)).catch((err) => {
      console.error('[ControlGestores] Sin historial de gestor (falta sql/vehiculos_guia_historial.sql):', err)
      return [] as any[]
    }),
    leerTodo((a, b) => filtroSede(supabase
      .from('asignaciones')
      .select(`
        id, vehiculo_id, estado, horario, created_at, fecha_inicio, fecha_fin,
        asignaciones_conductores (conductor_id, horario, estado, fecha_inicio, fecha_fin, conductores (apellidos))
      `))
      .or(`estado.in.(activo,activa),fecha_fin.gte.${desdeISO}`)
      .order('id')
      .range(a, b)),
    supabase
      .from('conceptos_nomina')
      .select('codigo, precio_base, precio_semanal')
      .in('codigo', [CONCEPTO_DIURNO, CONCEPTO_NOCTURNO, CONCEPTO_A_CARGO]),
    leerTodo((a, b) => filtroSede((supabase.from('kpi_bajas' as any) as any)
      .select('fecha, conductor_id')
      .gte('fecha', desdeDia)
      .lte('fecha', hoy))
      .range(a, b)),
    leerTodo((a, b) => (supabase.rpc as any)('kpi_altas_conductores', { p_sede_id: sedeId, p_desde: desdeDia, p_hasta: hoy })
      .range(a, b)).catch((err) => {
      console.error('[ControlGestores] Sin altas (falta sql/kpi_altas_conductores.sql):', err)
      return [] as any[]
    }),
  ])

  // ── Precios por día (semanal / 7, sin IVA) ──
  const precioDia = new Map<string, number>()
  for (const c of ((conceptos.data || []) as any[])) {
    const semanal = Number(c.precio_semanal)
    const dia = Number.isFinite(semanal) && semanal > 0 ? semanal / 7 : Number(c.precio_base) || 0
    precioDia.set(c.codigo, dia)
  }
  const precios = {
    diurno: precioDia.get(CONCEPTO_DIURNO) ?? 0,
    nocturno: precioDia.get(CONCEPTO_NOCTURNO) ?? 0,
    aCargo: precioDia.get(CONCEPTO_A_CARGO) ?? 0,
    conPrecio: precioDia.size === 3,
  }

  // ── Vehículos y su estado en cada momento ──
  const vehiculos: Vehiculo[] = vehiculosRaw.map((v) => ({
    id: v.id,
    estado: (Array.isArray(v.vehiculos_estados) ? v.vehiculos_estados[0]?.codigo : v.vehiculos_estados?.codigo) ?? null,
    creado: v.created_at ? Date.parse(v.created_at) : 0,
    guiaActual: v.guia_responsable ?? null,
  }))
  const idsVehiculos = new Set(vehiculos.map((v) => v.id))
  const guiaActualPorAuto = new Map(vehiculos.map((v) => [v.id, v.guiaActual]))
  const cambiosPorAuto = new Map<string, { t: number; antes: string | null }[]>()
  for (const c of cambiosRaw) {
    if (!idsVehiculos.has(c.vehiculo_id)) continue
    const lista = cambiosPorAuto.get(c.vehiculo_id) ?? []
    lista.push({ t: Date.parse(c.created_at), antes: c.estado_anterior ?? null })
    cambiosPorAuto.set(c.vehiculo_id, lista)
  }
  /** Estado del auto en `t`: el "anterior" del primer cambio posterior, o el actual. */
  const estadoEn = (v: Vehiculo, t: number): string | null => {
    if (v.creado && v.creado > t) return null
    const primero = (cambiosPorAuto.get(v.id) ?? []).find((c) => c.t > t)
    return primero ? primero.antes : v.estado
  }

  // ── Gestor de cada auto en cada momento ──
  const guiaPorAuto = new Map<string, { guia: string; desde: number; hasta: number }[]>()
  for (const h of historialGuia) {
    const lista = guiaPorAuto.get(h.vehiculo_id) ?? []
    lista.push({ guia: h.guia, desde: Date.parse(h.desde), hasta: h.hasta ? Date.parse(h.hasta) : Infinity })
    guiaPorAuto.set(h.vehiculo_id, lista)
  }
  /** Misma regla que guia_vehiculo_en() en la base. */
  const gestorEn = (vehiculoId: string, t: number): string => {
    const lista = guiaPorAuto.get(vehiculoId)
    if (!lista || lista.length === 0) {
      return guiaActualPorAuto.get(vehiculoId) ?? SIN_GESTOR
    }
    const periodo = lista.find((p) => p.desde <= t && t < p.hasta)
    if (periodo) return periodo.guia
    if (t < lista[0].desde) return lista[0].guia
    return SIN_GESTOR
  }

  // ── Conductores en los autos ──
  const estadias: Estadia[] = []
  const asignacionesAuto: AsignacionAuto[] = []
  for (const a of asignacionesRaw) {
    if (!a.vehiculo_id || sinEmpezar(a.estado)) continue
    const iniA = Date.parse(a.fecha_inicio || a.created_at)
    const finA = activa(a.estado) ? Infinity : (a.fecha_fin ? Date.parse(a.fecha_fin) : Infinity)
    asignacionesAuto.push({ vehiculoId: a.vehiculo_id, aCargo: a.horario === 'todo_dia', ini: iniA, fin: finA })
    for (const ac of a.asignaciones_conductores || []) {
      if (!ac.conductor_id || !ac.fecha_inicio || cancelada(ac.estado)) continue
      if (/interno/i.test(ac.conductores?.apellidos || '')) continue
      const cerrada = ['completado', 'finalizado'].includes(String(ac.estado || '').toLowerCase()) || !activa(a.estado)
      const finTxt = ac.fecha_fin || (cerrada ? a.fecha_fin : null)
      estadias.push({
        conductorId: ac.conductor_id,
        vehiculoId: a.vehiculo_id,
        turno: a.horario === 'todo_dia' ? 'C' : turnoDe(ac.horario),
        ini: Date.parse(ac.fecha_inicio),
        fin: finTxt ? Date.parse(finTxt) : (cerrada ? Date.parse(ac.fecha_inicio) : Infinity),
      })
    }
  }
  const estadiasPorAuto = new Map<string, Estadia[]>()
  const estadiasPorConductor = new Map<string, Estadia[]>()
  for (const e of estadias) {
    estadiasPorAuto.set(e.vehiculoId, [...(estadiasPorAuto.get(e.vehiculoId) ?? []), e])
    estadiasPorConductor.set(e.conductorId, [...(estadiasPorConductor.get(e.conductorId) ?? []), e])
  }
  const asignacionesPorAuto = new Map<string, AsignacionAuto[]>()
  for (const a of asignacionesAuto) {
    asignacionesPorAuto.set(a.vehiculoId, [...(asignacionesPorAuto.get(a.vehiculoId) ?? []), a])
  }

  // ── Foto de la flota en un momento ──
  const fotoEn = (t: number): FotoFlota => {
    const filas = new Map<string, FotoGestor>()
    const total = filaVacia(TOTAL)
    for (const v of vehiculos) {
      const estado = estadoEn(v, t)
      if (!estado || !ESTADOS_OPERATIVOS.has(estado)) continue
      const gestor = gestorEn(v.id, t)
      const fila = filas.get(gestor) ?? filaVacia(gestor)
      filas.set(gestor, fila)
      const enElAuto = (estadiasPorAuto.get(v.id) ?? []).filter((e) => e.ini <= t && t < e.fin)
      const aCargo = enElAuto.some((e) => e.turno === 'C')
      const manana = aCargo || enElAuto.some((e) => e.turno === 'D')
      const noche = aCargo || enElAuto.some((e) => e.turno === 'N')
      const cubiertos = (manana ? 1 : 0) + (noche ? 1 : 0)
      // Auto vacío: a cargo si su asignación vigente (o la última) es a cargo
      let perdida = 0
      if (cubiertos === 0) {
        const asigs = (asignacionesPorAuto.get(v.id) ?? []).filter((a) => a.ini <= t)
        const vigente = asigs.find((a) => t < a.fin) ?? asigs.sort((x, y) => y.ini - x.ini)[0]
        perdida = vigente?.aCargo ? precios.aCargo : precios.diurno + precios.nocturno
      } else {
        perdida = (manana ? 0 : precios.diurno) + (noche ? 0 : precios.nocturno)
      }
      for (const f of [fila, total]) {
        f.autos++
        f.turnosDisp += 2
        f.turnosCompl += cubiertos
        f.mananaCompl += manana ? 1 : 0
        f.nocheCompl += noche ? 1 : 0
        f.turnosVacios += 2 - cubiertos
        f.perdida += perdida
        if (cubiertos === 2) f.completos++
        else if (cubiertos === 1) f.unTurno++
        else f.sinTurnos++
      }
    }
    const porGestor = [...filas.values()].sort((a, b) => (ocupacion(a) ?? 0) - (ocupacion(b) ?? 0))
    return { momento: new Date(t).toISOString(), porGestor, total }
  }

  /** Gestor del auto en el que estaba el conductor en `t` (o en su último auto antes de `t`). */
  const gestorDeConductor = (conductorId: string, t: number): string => {
    const lista = estadiasPorConductor.get(conductorId) ?? []
    const actual = lista.find((e) => e.ini <= t && t <= e.fin)
    if (actual) return gestorEn(actual.vehiculoId, t)
    const previas = lista.filter((e) => e.ini <= t).sort((a, b) => b.fin - a.fin)
    if (previas[0]) return gestorEn(previas[0].vehiculoId, Math.min(t, previas[0].fin))
    const posteriores = lista.filter((e) => e.ini > t).sort((a, b) => a.ini - b.ini)
    if (posteriores[0]) return gestorEn(posteriores[0].vehiculoId, posteriores[0].ini)
    return SIN_GESTOR
  }

  // Bajas y altas con su día
  const bajas = bajasRaw
    .filter((b) => b.conductor_id && b.fecha)
    .map((b) => ({ id: b.conductor_id as string, dia: String(b.fecha).slice(0, 10) }))
  const altas = altasRaw
    .filter((x) => x.conductor_id && x.fecha)
    .map((x) => ({ id: x.conductor_id as string, dia: String(x.fecha).slice(0, 10) }))
  const primeraBaja = new Map<string, string>()
  for (const b of bajas) {
    const previa = primeraBaja.get(b.id)
    if (!previa || b.dia < previa) primeraBaja.set(b.id, b.dia)
  }

  // ── Churn de un período: bajas del período / activos el primer día a las 00:00 ──
  const churnDe = (lunes: string, dom: string): { porGestor: Map<string, ChurnGestor>; total: ChurnGestor } => {
    const tLunes = inicioDiaMs(lunes)
    const porGestor = new Map<string, ChurnGestor>()
    const total: ChurnGestor = { gestor: TOTAL, activos: 0, altas: 0, bajas: 0, churn: null }
    const fila = (g: string) => {
      let f = porGestor.get(g)
      if (!f) porGestor.set(g, (f = { gestor: g, activos: 0, altas: 0, bajas: 0, churn: null }))
      return f
    }
    // Activos al empezar: conductores manejando a las 00:00 del primer día
    const activosLunes = new Map<string, string>()
    for (const e of estadias) {
      if (e.ini <= tLunes && tLunes < e.fin && !activosLunes.has(e.conductorId)) {
        activosLunes.set(e.conductorId, gestorEn(e.vehiculoId, tLunes))
      }
    }
    for (const g of activosLunes.values()) { fila(g).activos++; total.activos++ }
    for (const b of bajas) {
      if (b.dia < lunes || b.dia > dom) continue
      fila(gestorDeConductor(b.id, inicioDiaMs(b.dia) + DIA_MS - 1)).bajas++
      total.bajas++
    }
    for (const x of altas) {
      if (x.dia < lunes || x.dia > dom) continue
      fila(gestorDeConductor(x.id, inicioDiaMs(x.dia) + DIA_MS - 1)).altas++
      total.altas++
    }
    // Semana: bajas / activos el lunes (definición de Operaciones). Mes: bajas /
    // (activos el día 1 + altas del mes): en un mes muchos entran y se van dentro del
    // mismo mes, y sin sumarlos el churn de un gestor chico pasaba del 100 %.
    for (const f of [...porGestor.values(), total]) {
      const base = granularidad === 'semana' ? f.activos : f.activos + f.altas
      f.churn = base > 0 ? f.bajas / base : null
    }
    return { porGestor, total }
  }

  // ── Período elegido: foto al cierre (o de hoy, si está en curso) ──
  const cierre = (fin: string) => (fin >= hoy ? ahora : inicioDiaMs(sumarDias(fin, 1)) - 1)
  const foto = fotoEn(cierre(finPeriodo))
  const churnSemana = churnDe(inicioPeriodo, finPeriodo)

  // ── Evolución ──
  const historia: PeriodoHistoria[] = []
  for (const ini of periodosHistoria) {
    const fin = finDe(granularidad, ini)
    const f = fotoEn(cierre(fin))
    const c = churnDe(ini, fin < hoy ? fin : hoy)
    const ocup = new Map<string, number | null>([[TOTAL, ocupacion(f.total)]])
    for (const g of f.porGestor) ocup.set(g.gestor, ocupacion(g))
    const ch = new Map<string, number | null>([[TOTAL, c.total.churn]])
    for (const g of c.porGestor.values()) ch.set(g.gestor, g.churn)
    historia.push({ inicio: ini, ocupacion: ocup, churn: ch })
  }
  const churns = historia.map((h) => h.churn.get(TOTAL)).filter((x): x is number => x !== null && x !== undefined)
  const promedio = churns.length ? churns.reduce((s, x) => s + x, 0) / churns.length : null
  // El límite es semanal: en un mes se lleva a sus días (1 − 0,95^(días/7) ≈ 20 %)
  const diasPeriodo = Math.round((inicioDiaMs(finPeriodo) - inicioDiaMs(inicioPeriodo)) / DIA_MS) + 1
  const limite = granularidad === 'semana' ? LIMITE_CHURN : 1 - (1 - LIMITE_CHURN) ** (diasPeriodo / 7)

  // ── Retención: una curva por horizonte (30, 60, 90 días) ──
  const retencionDe = (horizonte: HorizonteRetencion): RetencionHorizonte => {
    const mes = mesCohorteDe(corteRetencion, horizonte)
    const finMes = sumarDias(`${sumarDias(mes, 32).slice(0, 7)}-01`, -1)
    const cohorte = altas.filter((x) => x.dia >= mes && x.dia <= finMes)
    const dias: number[] = []
    for (let d = 0; d < horizonte; d += 7) dias.push(d)
    dias.push(horizonte)
    const porGestor = new Map<string, { id: string; dia: string }[]>()
    for (const x of cohorte) {
      const g = gestorDeConductor(x.id, inicioDiaMs(x.dia) + DIA_MS - 1)
      porGestor.set(g, [...(porGestor.get(g) ?? []), x])
    }
    const curva = (gestor: string, lista: { id: string; dia: string }[]): CurvaRetencion => {
      const puntos = dias.map((d) => {
        // Toda la cohorte tiene que haber cumplido esos días (si no, el porcentaje
        // mezcla grupos distintos y salta)
        const cumplieron = lista.filter((x) => sumarDias(x.dia, d) <= hoy)
        if (cumplieron.length === 0 || cumplieron.length < lista.length) return null
        const siguen = cumplieron.filter((x) => {
          const baja = primeraBaja.get(x.id)
          return !baja || baja < x.dia || baja > sumarDias(x.dia, d)
        }).length
        return siguen / cumplieron.length
      })
      return { gestor, cohorte: lista.length, puntos }
    }
    const curvas = [...porGestor.entries()].map(([g, l]) => curva(g, l))
    curvas.push(curva(TOTAL, cohorte))
    return { mes, dias, curvas }
  }
  const retencion = Object.fromEntries(
    HORIZONTES_RETENCION.map((h) => [h, retencionDe(h)]),
  ) as Record<HorizonteRetencion, RetencionHorizonte>

  // ── Gestores (orden estable para colores) ──
  const nombres = new Set<string>()
  for (const g of foto.porGestor) nombres.add(g.gestor)
  for (const g of churnSemana.porGestor.keys()) nombres.add(g)
  for (const h of historia) for (const g of h.ocupacion.keys()) if (g !== TOTAL) nombres.add(g)
  const gestores = [...nombres].sort((a, b) => {
    if (a === SIN_GESTOR) return 1
    if (b === SIN_GESTOR) return -1
    return a.localeCompare(b, 'es')
  })

  const churnPorGestor = [...churnSemana.porGestor.values()].sort((a, b) => (b.churn ?? -1) - (a.churn ?? -1))

  return {
    periodo: { granularidad, inicio: inicioPeriodo, fin: finPeriodo, enCurso },
    foto,
    churn: { porGestor: churnPorGestor, total: churnSemana.total, promedio, limite },
    historia,
    retencion,
    gestores,
    precios,
    hoy,
  }
}

/**
 * Mes de la cohorte de retención: el último mes cuyos conductores ya cumplieron todos
 * `dias` días al `corte` (el que arrancó el último día del mes también).
 * Así la curva está completa y no mezcla grupos.
 */
export function mesCohorteDe(corte: string, dias: number = 7 * SEMANAS_RETENCION): string {
  let [y, m] = corte.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < 24; i++) {
    const ini = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
    const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    if (sumarDias(fin, dias) <= corte) return ini
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return `${corte.slice(0, 7)}-01`
}

/** Último día del período que empieza en `inicio`. */
export function finDe(granularidad: Granularidad, inicio: string): string {
  if (granularidad === 'semana') return sumarDias(inicio, 6)
  const [y, m] = inicio.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** Día 1 del mes `n` meses antes o después del mes de `inicio`. */
function sumarMeses(inicio: string, n: number): string {
  const [y, m] = inicio.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}

/** Meses elegibles (día 1), del más nuevo al más viejo. */
export function mesesElegibles(hoy: string, cantidad = 12): string[] {
  const out: string[] = []
  for (let i = 0; i < cantidad; i++) out.push(sumarMeses(`${hoy.slice(0, 7)}-01`, -i))
  return out
}

/** Semanas elegibles (lunes), de la más nueva a la más vieja. */
export function semanasElegibles(hoy: string, cantidad = 26): string[] {
  const out: string[] = []
  let lunes = lunesDe(hoy)
  for (let i = 0; i < cantidad; i++) {
    out.push(lunes)
    lunes = sumarDias(lunes, -7)
  }
  return out
}
