// src/modules/reportes/kpis-v2/indicadoresModulosService.ts
// Números de las pestañas "Indicadores por módulo" que no salen de las tablas
// precalculadas del dashboard: licencias, deuda, estado de la flota, multas,
// excesos de km y siniestros. Consultas livianas (solo las columnas que se
// cuentan) y en paralelo. Los rangos de fechas son los del período elegido
// y el anterior.
import { supabase } from '../../../lib/supabase'
import { FILTRO_SIN_INTERNOS } from '../../../utils/conductorUtils'
import { lunesDeSemana, sumarDias } from './kpisV2Types'
import { formatPlata } from '../../../utils/format'
import { normalizarTexto } from '../../../utils/sedeMatch'
import { GUIAS_ACTIVOS, homologarGuia } from '../../leads/guias'
import { VEHICULO_ESTADO_LABELS } from '../../../types/vehiculo.types'
import { calcularLlenados, cargarHistorialFlota } from '../../asignaciones/historialFlota'
import type { Llenado } from '../../asignaciones/historialFlota'

type FiltroSede = <T>(q: T) => T

export interface Rango { desde: string; hasta: string }

export interface IndicadoresConductores {
  licenciasVencidas: number
  licenciasPorVencer: number
  activosConDeuda: number
  deudaActivos: number
}

export interface IndicadoresVehiculos {
  total: number
  enUso: number
  disponibles: number
  tallerMecanico: number
  chapaPintura: number
  pkgOff: number
  retenidos: number
  corporativos: number
  robo: number
  destruccion: number
}

export interface PeriodoMultas {
  cantidad: number
  monto: number
  conductores: number
  kmExcedidos: number
  montoExcesos: number
  conductoresConExceso: number
}

export interface Ranking { nombre: string; cantidad: number; detalle: string }

export interface IndicadoresMultas {
  actual: PeriodoMultas
  anterior: PeriodoMultas
  /** Conductores con más multas en el período actual. */
  topMultas: Ranking[]
  /** Conductores con más km excedidos en el período actual. */
  topExcesos: Ranking[]
}

const TOP = 5

function nombrePropio(t: string): string {
  return t.toLocaleLowerCase('es-AR').replace(/(^|\s)\S/g, l => l.toLocaleUpperCase('es-AR'))
}

export interface IndicadoresSiniestros {
  actual: { total: number; robos: number; culpaConductor: number }
  anterior: { total: number; robos: number; culpaConductor: number }
}

const PAGINA = 1000

export async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = (data || []) as T[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

/** Corre una consulta por lote de ids (de a `tamano`) en paralelo y junta las filas. */
async function porLotes<T>(ids: string[], consulta: (lote: string[]) => Promise<T[]>, tamano = 100): Promise<T[]> {
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += tamano) lotes.push(ids.slice(i, i + tamano))
  return (await Promise.all(lotes.map(consulta))).flat()
}

function fecha(v: string | null | undefined): string | null {
  return v ? String(v).slice(0, 10) : null
}

/** Día (YYYY-MM-DD) en hora Argentina de un timestamp. */
function fechaART(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function enRango(f: string | null, r: Rango): boolean {
  return f !== null && f >= r.desde && f <= r.hasta
}

/** Importe de multa a número (mismo criterio que el módulo Multas). */
function aNumero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  let t = String(v).replace(/[^\d,.-]/g, '')
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma > punto) t = t.replace(/\./g, '').replace(',', '.')
  else if (punto !== -1 && coma !== -1) t = t.replace(/,/g, '')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

// ───────────── Filtro por guía (agente de ventas) ─────────────

export const SIN_GUIA = 'Sin guía'

/** Guía de un conductor tal como se muestra en el filtro (homologado). */
export function etiquetaGuia(guia: string | null | undefined): string {
  return homologarGuia(guia) ?? SIN_GUIA
}

/** Conductores de un guía: por id y por nombre (las multas se relacionan por nombre). */
export interface FiltroGuia {
  guia: string
  ids: Set<string>
  nombres: Set<string>
}

export interface GuiasConductores {
  /** Guías que se ofrecen en el filtro (solo los activos). */
  opciones: string[]
  conductores: { id: string; guia: string; nombre: string }[]
}

export async function cargarGuiasConductores(filtroSede: FiltroSede): Promise<GuiasConductores> {
  const filas = await leerTodo<{ id: string; nombres: string | null; apellidos: string | null; guia: string | null }>(
    (a, b) => filtroSede((supabase.from('conductores') as any)
      .select('id, nombres, apellidos, guia').not(...FILTRO_SIN_INTERNOS))
      .range(a, b),
  )
  const conductores = filas.map(c => ({
    id: c.id,
    guia: etiquetaGuia(c.guia),
    nombre: `${c.nombres || ''} ${c.apellidos || ''}`,
  }))
  // Solo los guías activos (Ali, Carla y Eunice), aunque haya conductores con otros
  return { opciones: [...GUIAS_ACTIVOS], conductores }
}

export function armarFiltroGuia(datos: GuiasConductores, guia: string): FiltroGuia {
  const ids = new Set<string>()
  const nombres = new Set<string>()
  for (const c of datos.conductores) {
    if (c.guia !== guia) continue
    ids.add(c.id)
    nombres.add(normalizarTexto(c.nombre))
  }
  return { guia, ids, nombres }
}

/** Multas: el conductor viene como texto; se compara en cualquier orden de palabras. */
export function claveNombre(nombre: string | null | undefined): string {
  return normalizarTexto(nombre).split(' ').filter(Boolean).sort().join(' ')
}

function nombresComoClaves(filtro: FiltroGuia): Set<string> {
  return new Set([...filtro.nombres].map(claveNombre))
}

export interface MovimientoConductor { f: string; id: string; m: string | null }

/** Altas y bajas una por una (para contarlas solo de los conductores de un guía). */
export interface AltasBajasGuia {
  altas: MovimientoConductor[]
  bajas: MovimientoConductor[]
}

export async function cargarAltasBajasGuia(
  filtroSede: FiltroSede,
  sedeId: string | null,
  filtro: FiltroGuia,
  desde: string,
  hasta: string,
): Promise<AltasBajasGuia> {
  const [altas, bajas] = await Promise.all([
    leerTodo<{ fecha: string; conductor_id: string }>(
      (a, b) => (supabase.rpc as any)('kpi_altas_conductores', { p_sede_id: sedeId, p_desde: desde, p_hasta: hasta })
        .range(a, b),
    ),
    leerTodo<{ fecha: string; conductor_id: string | null; motivo: string | null }>(
      (a, b) => filtroSede((supabase.from('kpi_bajas' as any) as any)
        .select('fecha, conductor_id, motivo')
        .gte('fecha', desde)
        .lte('fecha', hasta))
        .range(a, b),
    ),
  ])
  return {
    altas: altas
      .filter(x => filtro.ids.has(x.conductor_id))
      .map(x => ({ f: String(x.fecha).slice(0, 10), id: x.conductor_id, m: null })),
    bajas: bajas
      .filter(x => x.conductor_id && filtro.ids.has(x.conductor_id))
      .map(x => ({ f: String(x.fecha).slice(0, 10), id: x.conductor_id as string, m: x.motivo })),
  }
}

// ───────────── Conductores ─────────────

export async function cargarConductores(filtroSede: FiltroSede, hoy: string, filtro: FiltroGuia | null = null): Promise<IndicadoresConductores> {
  const conductores = await leerTodo<{ id: string; apellidos: string | null; licencia_vencimiento: string | null; conductores_estados: { codigo: string | null } | null }>(
    (a, b) => filtroSede((supabase.from('conductores') as any)
      .select('id, apellidos, licencia_vencimiento, conductores_estados(codigo)'))
      .range(a, b),
  )
  const activos = conductores.filter(c =>
    String(c.conductores_estados?.codigo || '').toUpperCase() === 'ACTIVO'
    && !String(c.apellidos || '').toUpperCase().includes('INTERNO')
    && (!filtro || filtro.ids.has(c.id)))
  const en30 = sumarDias(hoy, 30)
  let licenciasVencidas = 0
  let licenciasPorVencer = 0
  for (const c of activos) {
    const v = fecha(c.licencia_vencimiento)
    if (!v) continue
    if (v < hoy) licenciasVencidas++
    else if (v <= en30) licenciasPorVencer++
  }

  const idsActivos = new Set(activos.map(c => c.id))
  const saldos = await leerTodo<{ conductor_id: string; saldo_actual: number | null }>(
    (a, b) => (supabase.from('saldos_conductores') as any).select('conductor_id, saldo_actual').lt('saldo_actual', 0).range(a, b),
  )
  let activosConDeuda = 0
  let deudaActivos = 0
  for (const s of saldos) {
    if (!idsActivos.has(s.conductor_id)) continue
    activosConDeuda++
    deudaActivos += Math.abs(Number(s.saldo_actual) || 0)
  }
  return { licenciasVencidas, licenciasPorVencer, activosConDeuda, deudaActivos }
}

// ───────────── Vehículos (misma clasificación que el módulo Vehículos) ─────────────

const EXCLUIDOS_DEL_TOTAL = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']
const TALLER_MECANICO = ['TALLER_AXIS', 'TALLER_ALLIANCE', 'TALLER_KALZALO', 'TALLER_BASE_VALIENTE', 'TALLER_MJ', 'TALLER_AUTODOC', 'INSTALACION_GNC']
const CHAPA_PINTURA = ['TALLER_CHAPA_PINTURA', 'TALLER_CP_PAINT_CARS', 'TALLER_CP_ANDRADA']

export async function cargarVehiculos(filtroSede: FiltroSede): Promise<IndicadoresVehiculos> {
  const vehiculos = await leerTodo<{ vehiculos_estados: { codigo: string | null } | null }>(
    (a, b) => filtroSede((supabase.from('vehiculos') as any)
      .select('vehiculos_estados(codigo)')
      .is('deleted_at', null))
      .range(a, b),
  )
  const r: IndicadoresVehiculos = {
    total: 0, enUso: 0, disponibles: 0, tallerMecanico: 0, chapaPintura: 0,
    pkgOff: 0, retenidos: 0, corporativos: 0, robo: 0, destruccion: 0,
  }
  for (const v of vehiculos) {
    const c = String(v.vehiculos_estados?.codigo || '')
    if (!EXCLUIDOS_DEL_TOTAL.includes(c)) r.total++
    if (c === 'EN_USO') r.enUso++
    else if (c === 'PKG_ON_BASE') r.disponibles++
    else if (TALLER_MECANICO.includes(c)) r.tallerMecanico++
    else if (CHAPA_PINTURA.includes(c)) r.chapaPintura++
    else if (c === 'PKG_OFF_BASE' || c === 'PKG_OFF_FRANCIA') r.pkgOff++
    else if (c === 'RETENIDO_COMISARIA') r.retenidos++
    else if (c === 'CORPORATIVO') r.corporativos++
    else if (c === 'ROBO') r.robo++
    else if (c === 'DESTRUCCION_TOTAL') r.destruccion++
  }
  return r
}

// ───────────── Vehículos por llenar (hoy) ─────────────
// Autos con al menos un turno sin conductor, por agente responsable de llenarlos
// (vehiculos.guia_responsable). Mismo criterio que Estado de Flota / Agentes: los
// autos con asignación activa (D y N en turno, o el conductor a cargo) y los PKG ON
// sin asignación (2 turnos libres cada uno).

export interface PorLlenarAgente {
  vehiculos: number
  turnosD: number
  turnosN: number
}

export interface VehiculosPorLlenar {
  /** Por agente responsable; 'Sin responsable' para los que no tienen */
  porAgente: Map<string, PorLlenarAgente>
  total: PorLlenarAgente
}

const SIN_RESPONSABLE = 'Sin responsable'
const INACTIVOS = ['cancelado', 'completado', 'finalizado']

export async function cargarVehiculosPorLlenar(filtroSede: FiltroSede): Promise<VehiculosPorLlenar> {
  const [asignaciones, vehiculos] = await Promise.all([
    leerTodo<{
      vehiculo_id: string | null
      horario: string | null
      vehiculos: { guia_responsable: string | null } | null
      asignaciones_conductores: { horario: string | null; estado: string | null; conductor_id: string | null }[] | null
    }>(
      (a, b) => filtroSede((supabase.from('asignaciones') as any)
        .select('vehiculo_id, horario, vehiculos(guia_responsable), asignaciones_conductores(horario, estado, conductor_id)')
        .in('estado', ['activo', 'activa']))
        .range(a, b),
    ),
    leerTodo<{ id: string; guia_responsable: string | null; vehiculos_estados: { codigo: string | null } | null }>(
      (a, b) => filtroSede((supabase.from('vehiculos') as any)
        .select('id, guia_responsable, vehiculos_estados(codigo)')
        .is('deleted_at', null))
        .range(a, b),
    ),
  ])

  const porAgente = new Map<string, PorLlenarAgente>()
  const total: PorLlenarAgente = { vehiculos: 0, turnosD: 0, turnosN: 0 }
  const sumar = (guia: string | null | undefined, d: number, n: number) => {
    if (d + n === 0) return
    const clave = guia || SIN_RESPONSABLE
    const x = porAgente.get(clave) ?? { vehiculos: 0, turnosD: 0, turnosN: 0 }
    x.vehiculos++
    x.turnosD += d
    x.turnosN += n
    porAgente.set(clave, x)
    total.vehiculos++
    total.turnosD += d
    total.turnosN += n
  }

  const conAsignacion = new Set<string>()
  for (const a of asignaciones) {
    if (a.vehiculo_id) conAsignacion.add(a.vehiculo_id)
    const activos = (a.asignaciones_conductores || []).filter(ac => ac.conductor_id && !INACTIVOS.includes(ac.estado || ''))
    const tiene = (h: string) => activos.some(ac => (ac.horario || '').toLowerCase() === h)
    if (a.horario === 'turno') {
      sumar(a.vehiculos?.guia_responsable, tiene('diurno') ? 0 : 1, tiene('nocturno') ? 0 : 1)
    } else if (activos.length === 0) {
      // A cargo sin conductor: el auto entero libre (1 D + 1 N, como en Asignaciones)
      sumar(a.vehiculos?.guia_responsable, 1, 1)
    }
  }
  for (const v of vehiculos) {
    if (v.vehiculos_estados?.codigo === 'PKG_ON_BASE' && !conAsignacion.has(v.id)) sumar(v.guia_responsable, 1, 1)
  }
  return { porAgente, total }
}

// ───────────── Días para llenar un turno ─────────────
// Cada vez que entra un conductor a un auto: cuántos días estuvo libre ese turno, desde
// la salida anterior o desde que el auto volvió a estar disponible (los días en taller
// no cuentan). Ver asignaciones/historialFlota.ts. Se mira hasta 180 días antes del
// período para encontrar desde cuándo estaba libre.

export type { Llenado }

const DIAS_ANTES_LLENADO = 180

export async function cargarLlenados(filtroSede: FiltroSede, desde: string): Promise<Llenado[]> {
  const h = await cargarHistorialFlota(filtroSede, `${sumarDias(desde, -DIAS_ANTES_LLENADO)}T00:00:00-03:00`)
  return calcularLlenados(h)
}

// ───────────── Turnos disponibles que se generaron ─────────────
// Por bajas: el último turno de cada conductor dado de baja en el período. Si manejaba
// en turno libera 1 turno (diurno o nocturno); si tenía el auto todo el día, el auto
// queda libre = 2 turnos (1 D + 1 N, mismo criterio que Asignaciones). No cuenta si
// esa asignación había terminado más de 30 días antes de la baja (ya estaba libre).
// Por vehículos nuevos: autos dados de alta en el sistema en el período = 2 turnos c/u.
// Se excluyen los de prueba (patente PRB…) y los eliminados.

export interface PeriodoTurnos {
  porBajas: number
  bajasDiurno: number
  bajasNocturno: number
  bajasACargo: number
  vehiculosNuevos: number
  /** Vehículos que volvieron a estar operativos (taller, robo, PKG OFF... -> PKG ON / En uso). */
  vehiculosReincorporados: number
  /** 2 turnos por cada vehículo nuevo o que volvió a operar. */
  porVehiculosNuevos: number
  /** De esos vehículos, cuántos ya recibieron asignación después de habilitarse. */
  nuevosYaAsignados: number
}

/** Un vehículo que habilitó turnos: nuevo o que volvió a operar. */
export interface VehiculoHabilitado {
  fecha: string
  vehiculoId: string
  patente: string
  /** 'Nuevo' o 'Volvió de <estado anterior>'. */
  motivo: string
  esNuevo: boolean
  yaAsignado: boolean
}

export interface IndicadoresTurnos {
  actual: PeriodoTurnos
  anterior: PeriodoTurnos
  /** Vehículos que habilitaron turnos en ambos períodos (el detalle filtra por fecha). */
  habilitados: VehiculoHabilitado[]
  /** false si falta correr sql/kpi_vehiculos_reincorporados.sql (solo cuenta los nuevos). */
  conReincorporados: boolean
}

/** Etiqueta legible de un estado guardado como código (TALLER_AXIS) o descripción. */
function etiquetaEstado(estado: string | null | undefined): string {
  const t = (estado || '').trim()
  if (!t) return 'otro estado'
  return VEHICULO_ESTADO_LABELS[t.toUpperCase()] ?? t
}

const DIAS_TOLERANCIA_BAJA = 30

export async function cargarTurnosGenerados(
  filtroSede: FiltroSede,
  actual: Rango,
  anterior: Rango,
  filtro: FiltroGuia | null = null,
  sedeId: string | null = null,
): Promise<IndicadoresTurnos> {
  const desde = anterior.desde < actual.desde ? anterior.desde : actual.desde
  // Vehículos que volvieron a operar (si la función todavía no existe, se sigue sin ellos)
  const reincorporadosPromesa = (async () => {
    try {
      return await leerTodo<{ fecha: string; vehiculo_id: string; patente: string | null; estado_anterior: string | null }>(
        (a, b) => (supabase.rpc as any)('kpi_vehiculos_reincorporados', { p_sede_id: sedeId, p_desde: desde, p_hasta: actual.hasta })
          .range(a, b),
      )
    } catch (err) {
      console.warn('[DashboardGeneral] Sin vehículos reincorporados (falta sql/kpi_vehiculos_reincorporados.sql?)', err)
      return null
    }
  })()
  const [bajasTodas, vehiculos, reincorporados] = await Promise.all([
    leerTodo<{ fecha: string; conductor_id: string | null }>(
      (a, b) => filtroSede((supabase.from('kpi_bajas' as any) as any)
        .select('fecha, conductor_id')
        .gte('fecha', desde)
        .lte('fecha', actual.hasta))
        .range(a, b),
    ),
    leerTodo<{ id: string; patente: string | null; created_at: string | null }>(
      (a, b) => filtroSede((supabase.from('vehiculos') as any)
        .select('id, patente, created_at')
        .is('deleted_at', null)
        .gte('created_at', `${desde}T00:00:00-03:00`)
        .lte('created_at', `${actual.hasta}T23:59:59-03:00`))
        .range(a, b),
    ),
    reincorporadosPromesa,
  ])

  // Con guía elegido: solo las bajas de sus conductores (los autos nuevos no dependen del guía)
  const bajas = filtro ? bajasTodas.filter(b => b.conductor_id && filtro.ids.has(b.conductor_id)) : bajasTodas

  // Asignaciones de los conductores dados de baja
  type FilaAc = { conductor_id: string; horario: string | null; fecha_inicio: string | null; fecha_fin: string | null; asignaciones: { horario: string | null } | null }
  const ids = [...new Set(bajas.map(b => b.conductor_id).filter((x): x is string => !!x))]
  // Vehículos que habilitaron turnos: nuevos (alta en el período) y los que volvieron a operar
  const nuevos = vehiculos.filter(v => !/^PRB/i.test(String(v.patente || '').trim()))
  const idsNuevos = new Set(nuevos.map(v => v.id))
  const habilitados: Omit<VehiculoHabilitado, 'yaAsignado'>[] = [
    ...nuevos.flatMap(v => {
      const f = fechaART(v.created_at)
      return f ? [{ fecha: f, vehiculoId: v.id, patente: v.patente || '', motivo: 'Nuevo', esNuevo: true }] : []
    }),
    ...(reincorporados ?? [])
      // Un auto nuevo que pasa a PKG ON el mismo período ya cuenta como nuevo
      .filter(x => !idsNuevos.has(x.vehiculo_id))
      .map(x => ({
        fecha: String(x.fecha).slice(0, 10),
        vehiculoId: x.vehiculo_id,
        patente: x.patente || '',
        motivo: `Volvió de ${etiquetaEstado(x.estado_anterior)}`,
        esNuevo: false,
      })),
  ]

  // En paralelo: asignaciones de los conductores dados de baja (qué turno liberaron) y
  // de los vehículos habilitados (¿ya recibieron asignación después de habilitarse?)
  const idsHabilitados = [...new Set(habilitados.map(h => h.vehiculoId))]
  const [filasAc, filasAsig] = await Promise.all([
    porLotes(ids, lote => leerTodo<FilaAc>(
      (a, b) => (supabase.from('asignaciones_conductores') as any)
        .select('conductor_id, horario, fecha_inicio, fecha_fin, asignaciones!inner(horario)')
        .in('conductor_id', lote)
        .range(a, b),
    )),
    porLotes(idsHabilitados, lote => leerTodo<{ vehiculo_id: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string | null }>(
      (a, b) => (supabase.from('asignaciones') as any)
        .select('vehiculo_id, fecha_inicio, fecha_fin, estado')
        .in('vehiculo_id', lote)
        .not('fecha_inicio', 'is', null)
        .range(a, b),
    )),
  ])
  const porConductor = new Map<string, FilaAc[]>()
  for (const f of filasAc) {
    const lista = porConductor.get(f.conductor_id) ?? []
    lista.push(f)
    porConductor.set(f.conductor_id, lista)
  }
  const iniciosPorVehiculo = new Map<string, string[]>()
  for (const f of filasAsig) {
    const dia = fechaART(f.fecha_inicio)
    if (!dia) continue
    const lista = iniciosPorVehiculo.get(f.vehiculo_id) ?? []
    lista.push(dia)
    iniciosPorVehiculo.set(f.vehiculo_id, lista)
  }
  // Un auto que vuelve (de taller, robo, etc.) solo habilita turnos si vuelve VACÍO: si
  // seguía con una asignación vigente (sus conductores lo esperan), no se liberó nada.
  // Vigente = empezó antes del día de la vuelta y no terminó antes de ese día.
  const asignacionesPorVehiculo = new Map<string, { ini: string; fin: string | null }[]>()
  for (const f of filasAsig) {
    if (/^(cancel|program|pendient)/i.test(String(f.estado || ''))) continue
    const ini = fechaART(f.fecha_inicio)
    if (!ini) continue
    const lista = asignacionesPorVehiculo.get(f.vehiculo_id) ?? []
    lista.push({ ini, fin: fechaART(f.fecha_fin) })
    asignacionesPorVehiculo.set(f.vehiculo_id, lista)
  }
  const volvioOcupado = (h: Omit<VehiculoHabilitado, 'yaAsignado'>) =>
    !h.esNuevo && (asignacionesPorVehiculo.get(h.vehiculoId) ?? [])
      .some(a => a.ini < h.fecha && (!a.fin || a.fin >= h.fecha))

  const conAsignacion: VehiculoHabilitado[] = habilitados.filter(h => !volvioOcupado(h)).map(h => ({
    ...h,
    yaAsignado: (iniciosPorVehiculo.get(h.vehiculoId) ?? []).some(d => d >= h.fecha),
  }))

  const calcular = (r: Rango): PeriodoTurnos => {
    const t: PeriodoTurnos = {
      porBajas: 0, bajasDiurno: 0, bajasNocturno: 0, bajasACargo: 0,
      vehiculosNuevos: 0, vehiculosReincorporados: 0, porVehiculosNuevos: 0, nuevosYaAsignados: 0,
    }
    const vistos = new Set<string>()
    for (const b of bajas) {
      if (!b.conductor_id || !enRango(fecha(b.fecha), r) || vistos.has(b.conductor_id)) continue
      vistos.add(b.conductor_id)
      const tope = sumarDias(b.fecha, 1)
      const ultima = (porConductor.get(b.conductor_id) ?? [])
        .filter(f => (fecha(f.fecha_inicio) ?? '') <= tope)
        .sort((x, y) => String(y.fecha_inicio).localeCompare(String(x.fecha_inicio)))[0]
      if (!ultima) continue
      const fin = fecha(ultima.fecha_fin)
      if (fin && fin < sumarDias(b.fecha, -DIAS_TOLERANCIA_BAJA)) continue
      const horarioAuto = String(ultima.asignaciones?.horario || '').toLowerCase()
      const turno = String(ultima.horario || '').toLowerCase()
      if (horarioAuto === 'turno') {
        t.porBajas++
        if (turno === 'nocturno') t.bajasNocturno++
        else t.bajasDiurno++
      } else {
        t.porBajas += 2
        t.bajasACargo++
      }
    }
    for (const h of conAsignacion) {
      if (!enRango(h.fecha, r)) continue
      if (h.esNuevo) t.vehiculosNuevos++
      else t.vehiculosReincorporados++
      t.porVehiculosNuevos += 2
      if (h.yaAsignado) t.nuevosYaAsignados++
    }
    return t
  }
  return {
    actual: calcular(actual),
    anterior: calcular(anterior),
    habilitados: conAsignacion.sort((x, y) => y.fecha.localeCompare(x.fecha) || x.patente.localeCompare(y.patente)),
    conReincorporados: reincorporados !== null,
  }
}

// ───────────── Multas y excesos de km ─────────────

export async function cargarMultas(
  filtroSede: FiltroSede,
  actual: Rango,
  anterior: Rango,
  filtro: FiltroGuia | null = null,
): Promise<IndicadoresMultas> {
  const desde = anterior.desde < actual.desde ? anterior.desde : actual.desde
  const [multasTodas, excesosTodos] = await Promise.all([
    // Por FECHA DE CARGA (created_at), como el módulo Multas: las multas llegan semanas
    // después de la infracción, así que por fecha de infracción la semana en curso
    // siempre daba 0. Así se ven las que entraron en el período.
    leerTodo<{ created_at: string | null; importe: unknown; conductor_responsable: string | null }>(
      (a, b) => filtroSede((supabase.from('multas_historico') as any)
        .select('created_at, importe, conductor_responsable')
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .gte('created_at', `${desde}T00:00:00-03:00`)
        .lte('created_at', `${actual.hasta}T23:59:59-03:00`))
        .range(a, b),
    ),
    leerTodo<{
      conductor_id: string | null
      km_exceso: number | null
      monto_total: number | null
      periodos_facturacion: { semana: number; anio: number } | null
      conductores: { nombres: string | null; apellidos: string | null } | null
    }>(
      // Solo los cargados desde el inicio del período anterior (se cargan al facturar la
      // semana, después de que empieza): antes se traía todo el historial.
      (a, b) => filtroSede((supabase.from('excesos_kilometraje') as any)
        .select('conductor_id, km_exceso, monto_total, periodos_facturacion:periodo_id(semana, anio), conductores:conductor_id(nombres, apellidos)')
        .gte('created_at', `${desde}T00:00:00-03:00`))
        .range(a, b),
    ),
  ])

  // Con guía elegido: multas por nombre del conductor, excesos por id
  const clavesGuia = filtro ? nombresComoClaves(filtro) : null
  const multas = clavesGuia ? multasTodas.filter(x => clavesGuia.has(claveNombre(x.conductor_responsable))) : multasTodas
  const excesos = filtro ? excesosTodos.filter(x => x.conductor_id && filtro.ids.has(x.conductor_id)) : excesosTodos

  const multasDe = (r: Rango) => multas.filter(x => enRango(fechaART(x.created_at), r))
  // Exceso de km: cuenta en la semana facturada (por el lunes de esa semana)
  const excesosDe = (r: Rango) => excesos.filter(x => {
    const p = x.periodos_facturacion
    return p ? enRango(lunesDeSemana(p.semana, p.anio), r) : false
  })

  const resumen = (r: Rango): PeriodoMultas => {
    const m = multasDe(r)
    const e = excesosDe(r)
    return {
      cantidad: m.length,
      monto: m.reduce((s, x) => s + aNumero(x.importe), 0),
      conductores: new Set(m.map(x => (x.conductor_responsable || '').trim().toUpperCase()).filter(Boolean)).size,
      kmExcedidos: e.reduce((s, x) => s + (Number(x.km_exceso) || 0), 0),
      montoExcesos: e.reduce((s, x) => s + (Number(x.monto_total) || 0), 0),
      conductoresConExceso: new Set(e.map(x => x.conductor_id).filter(Boolean)).size,
    }
  }
  const porConductorMultas = new Map<string, { cantidad: number; monto: number }>()
  for (const x of multasDe(actual)) {
    const nombre = (x.conductor_responsable || '').trim()
    if (!nombre) continue
    const clave = nombre.toUpperCase()
    const v = porConductorMultas.get(clave) ?? { cantidad: 0, monto: 0 }
    v.cantidad++
    v.monto += aNumero(x.importe)
    porConductorMultas.set(clave, v)
  }
  const topMultas = [...porConductorMultas]
    .sort((a, b) => b[1].cantidad - a[1].cantidad || b[1].monto - a[1].monto)
    .slice(0, TOP)
    .map(([nombre, v]) => ({ nombre: nombrePropio(nombre), cantidad: v.cantidad, detalle: formatPlata(v.monto) }))

  const porConductorKm = new Map<string, { nombre: string; km: number; monto: number }>()
  for (const x of excesosDe(actual)) {
    if (!x.conductor_id) continue
    const nombre = `${x.conductores?.nombres || ''} ${x.conductores?.apellidos || ''}`.trim() || 'Sin nombre'
    const v = porConductorKm.get(x.conductor_id) ?? { nombre: nombrePropio(nombre), km: 0, monto: 0 }
    v.km += Number(x.km_exceso) || 0
    v.monto += Number(x.monto_total) || 0
    porConductorKm.set(x.conductor_id, v)
  }
  const topExcesos = [...porConductorKm.values()]
    .sort((a, b) => b.km - a.km)
    .slice(0, TOP)
    .map(v => ({ nombre: v.nombre, cantidad: Math.round(v.km), detalle: formatPlata(v.monto) }))

  return { actual: resumen(actual), anterior: resumen(anterior), topMultas, topExcesos }
}

// ───────────── Siniestros ─────────────

export async function cargarSiniestros(filtroSede: FiltroSede, actual: Rango, anterior: Rango): Promise<IndicadoresSiniestros> {
  const desde = anterior.desde < actual.desde ? anterior.desde : actual.desde
  const filas = await leerTodo<{ fecha_siniestro: string | null; categoria_nombre: string | null; responsable: string | null }>(
    (a, b) => filtroSede((supabase.from('v_siniestros_completos' as any) as any)
      .select('fecha_siniestro, categoria_nombre, responsable')
      .gte('fecha_siniestro', desde)
      .lte('fecha_siniestro', actual.hasta))
      .range(a, b),
  )
  const resumen = (r: Rango) => {
    const s = filas.filter(x => enRango(fecha(x.fecha_siniestro), r))
    return {
      total: s.length,
      robos: s.filter(x => /^robo/i.test((x.categoria_nombre || '').trim())).length,
      culpaConductor: s.filter(x => x.responsable === 'conductor').length,
    }
  }
  return { actual: resumen(actual), anterior: resumen(anterior) }
}
