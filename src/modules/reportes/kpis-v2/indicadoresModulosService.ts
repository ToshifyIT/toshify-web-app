// src/modules/reportes/kpis-v2/indicadoresModulosService.ts
// Números de las pestañas "Indicadores por módulo" que no salen de las tablas
// precalculadas del dashboard: licencias, deuda, estado de la flota, multas,
// excesos de km y siniestros. Consultas livianas (solo las columnas que se
// cuentan) y en paralelo. Los rangos de fechas son los del período elegido
// y el anterior.
import { supabase } from '../../../lib/supabase'
import { lunesDeSemana, sumarDias } from './kpisV2Types'

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

async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
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

function fecha(v: string | null | undefined): string | null {
  return v ? String(v).slice(0, 10) : null
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

// ───────────── Conductores ─────────────

export async function cargarConductores(filtroSede: FiltroSede, hoy: string): Promise<IndicadoresConductores> {
  const conductores = await leerTodo<{ id: string; apellidos: string | null; licencia_vencimiento: string | null; conductores_estados: { codigo: string | null } | null }>(
    (a, b) => filtroSede((supabase.from('conductores') as any)
      .select('id, apellidos, licencia_vencimiento, conductores_estados(codigo)'))
      .range(a, b),
  )
  const activos = conductores.filter(c =>
    String(c.conductores_estados?.codigo || '').toUpperCase() === 'ACTIVO'
    && !String(c.apellidos || '').toUpperCase().includes('INTERNO'))
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

// ───────────── Multas y excesos de km ─────────────

export async function cargarMultas(filtroSede: FiltroSede, actual: Rango, anterior: Rango): Promise<IndicadoresMultas> {
  const desde = anterior.desde < actual.desde ? anterior.desde : actual.desde
  const [multas, excesos] = await Promise.all([
    leerTodo<{ fecha_infraccion: string | null; importe: unknown; conductor_responsable: string | null }>(
      (a, b) => filtroSede((supabase.from('multas_historico') as any)
        .select('fecha_infraccion, importe, conductor_responsable')
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .gte('fecha_infraccion', desde)
        .lte('fecha_infraccion', `${actual.hasta}T23:59:59`))
        .range(a, b),
    ),
    leerTodo<{
      conductor_id: string | null
      km_exceso: number | null
      monto_total: number | null
      periodos_facturacion: { semana: number; anio: number } | null
      conductores: { nombres: string | null; apellidos: string | null } | null
    }>(
      (a, b) => filtroSede((supabase.from('excesos_kilometraje') as any)
        .select('conductor_id, km_exceso, monto_total, periodos_facturacion:periodo_id(semana, anio), conductores:conductor_id(nombres, apellidos)'))
        .range(a, b),
    ),
  ])

  const multasDe = (r: Rango) => multas.filter(x => enRango(fecha(x.fecha_infraccion), r))
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
    .map(([nombre, v]) => ({ nombre: nombrePropio(nombre), cantidad: v.cantidad, detalle: `$ ${Math.round(v.monto).toLocaleString('es-AR')}` }))

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
    .map(v => ({ nombre: v.nombre, cantidad: Math.round(v.km), detalle: `$ ${Math.round(v.monto).toLocaleString('es-AR')}` }))

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
