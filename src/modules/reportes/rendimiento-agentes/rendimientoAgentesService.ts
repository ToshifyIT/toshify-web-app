// src/modules/reportes/rendimiento-agentes/rendimientoAgentesService.ts
//
// Rendimiento de agentes (Reportes > Rendimiento de agentes): una fila por agente de
// ventas con los mismos números que el Dashboard General, para compararlos lado a lado.
// Sin bonos ni montos (todavía no hay esquema de comisiones definido).
//
// Dos tipos de indicadores, como se acordó en la reunión del 04/11:
//  - Rendimiento individual: sale del guía del CONDUCTOR (conductores.guia = quién lo
//    onboardeó): altas, bajas, neto, multas, licencias, conductores activos.
//  - Orden de la flota: sale del RESPONSABLE DEL AUTO (vehiculos.guia_responsable):
//    turnos llenados y días para llenar, autos a cargo, turnos libres y ocupación.
// Los números de período se calculan para el período elegido y el anterior.
import { supabase } from '../../../lib/supabase'
import { GUIAS_ACTIVOS } from '../../leads/guias'
import {
  cargarLlenados, cargarVehiculosPorLlenar, claveNombre, etiquetaGuia, leerTodo,
} from '../kpis-v2/indicadoresModulosService'

type FiltroSede = <T>(q: T) => T

export interface Rango { desde: string; hasta: string }

/** Fila de agentes que no son Ali, Carla ni Eunice (Manuel, Marina, sin guía, etc.). */
export const OTROS = 'Otros / sin agente'

/** Números que dependen del período (se calculan para el actual y el anterior). */
export interface PeriodoAgente {
  altas: number
  bajas: number
  turnosLlenados: number
  /** Promedio de días que estuvo libre cada turno antes de llenarse (null = ninguno). */
  diasParaLlenar: number | null
  multas: number
  conductoresConMultas: number
}

/** Números de hoy (no dependen del período). */
export interface HoyAgente {
  conductoresActivos: number
  licenciasVencidas: number
  autosACargo: number
  libresD: number
  libresN: number
  /** (turnos de sus autos - libres) / turnos de sus autos. null sin autos. */
  ocupacion: number | null
}

export interface FilaAgente {
  agente: string
  actual: PeriodoAgente
  anterior: PeriodoAgente
  hoy: HoyAgente
}

export interface RendimientoAgentes {
  filas: FilaAgente[]
  total: FilaAgente
  /** false si falta sql/kpi_altas_conductores.sql (altas en '—'). */
  conAltas: boolean
}

const AGENTES = [...GUIAS_ACTIVOS, OTROS]


function agenteDe(guia: string | null | undefined): string {
  const g = etiquetaGuia(guia)
  return (GUIAS_ACTIVOS as readonly string[]).includes(g) ? g : OTROS
}

function responsableDe(guia: string | null | undefined): string {
  return guia && (GUIAS_ACTIVOS as readonly string[]).includes(guia) ? guia : OTROS
}

function enRango(dia: string | null, r: Rango): boolean {
  return dia !== null && dia >= r.desde && dia <= r.hasta
}

/** Día (YYYY-MM-DD) en hora Argentina de un timestamp. */
function diaART(v: string | null | undefined): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

const periodoVacio = (): PeriodoAgente => ({
  altas: 0, bajas: 0, turnosLlenados: 0, diasParaLlenar: null, multas: 0, conductoresConMultas: 0,
})

export async function cargarRendimientoAgentes(
  filtroSede: FiltroSede,
  sedeId: string | null,
  actual: Rango,
  anterior: Rango,
  hoy: string,
): Promise<RendimientoAgentes> {
  const desde = anterior.desde < actual.desde ? anterior.desde : actual.desde

  const altasPromesa = (async () => {
    try {
      return await leerTodo<{ fecha: string; conductor_id: string }>(
        (a, b) => (supabase.rpc as any)('kpi_altas_conductores', { p_sede_id: sedeId, p_desde: desde, p_hasta: actual.hasta })
          .range(a, b),
      )
    } catch (err) {
      console.warn('[RendimientoAgentes] Sin altas por conductor (falta sql/kpi_altas_conductores.sql?)', err)
      return null
    }
  })()

  const [conductores, altas, bajas, multas, llenados, porLlenar, vehiculos] = await Promise.all([
    leerTodo<{
      id: string; nombres: string | null; apellidos: string | null; guia: string | null
      licencia_vencimiento: string | null; conductores_estados: { codigo: string | null } | null
    }>(
      (a, b) => filtroSede((supabase.from('conductores') as any)
        .select('id, nombres, apellidos, guia, licencia_vencimiento, conductores_estados(codigo)'))
        .range(a, b),
    ),
    altasPromesa,
    leerTodo<{ fecha: string; conductor_id: string | null }>(
      (a, b) => filtroSede((supabase.from('kpi_bajas' as any) as any)
        .select('fecha, conductor_id')
        .gte('fecha', desde)
        .lte('fecha', actual.hasta))
        .range(a, b),
    ),
    leerTodo<{ created_at: string | null; conductor_responsable: string | null }>(
      (a, b) => filtroSede((supabase.from('multas_historico') as any)
        .select('created_at, conductor_responsable')
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .gte('created_at', `${desde}T00:00:00-03:00`)
        .lte('created_at', `${actual.hasta}T23:59:59-03:00`))
        .range(a, b),
    ),
    cargarLlenados(filtroSede, desde),
    cargarVehiculosPorLlenar(filtroSede),
    leerTodo<{ guia_responsable: string | null; vehiculos_estados: { codigo: string | null } | null }>(
      (a, b) => filtroSede((supabase.from('vehiculos') as any)
        .select('guia_responsable, vehiculos_estados(codigo)')
        .is('deleted_at', null))
        .range(a, b),
    ),
  ])

  // Conductor -> agente (por quién lo onboardeó), y nombre -> agente para las multas
  const agentePorConductor = new Map<string, string>()
  const agentePorNombre = new Map<string, string>()
  for (const c of conductores) {
    if (String(c.apellidos || '').toUpperCase().includes('INTERNO')) continue
    const ag = agenteDe(c.guia)
    agentePorConductor.set(c.id, ag)
    agentePorNombre.set(claveNombre(`${c.nombres || ''} ${c.apellidos || ''}`), ag)
  }

  const filas = new Map<string, FilaAgente>(AGENTES.map(ag => [ag, {
    agente: ag,
    actual: periodoVacio(),
    anterior: periodoVacio(),
    hoy: { conductoresActivos: 0, licenciasVencidas: 0, autosACargo: 0, libresD: 0, libresN: 0, ocupacion: null },
  }]))
  const fila = (ag: string) => filas.get(ag) ?? filas.get(OTROS)!

  // Períodos: el actual y el anterior
  const periodos: [Rango, 'actual' | 'anterior'][] = [[actual, 'actual'], [anterior, 'anterior']]
  for (const [r, cual] of periodos) {
    for (const x of altas ?? []) {
      if (!enRango(String(x.fecha).slice(0, 10), r)) continue
      fila(agentePorConductor.get(x.conductor_id) ?? OTROS)[cual].altas++
    }
    for (const x of bajas) {
      if (!x.conductor_id || !enRango(String(x.fecha).slice(0, 10), r)) continue
      fila(agentePorConductor.get(x.conductor_id) ?? OTROS)[cual].bajas++
    }
    const conMultas = new Map<string, Set<string>>()
    for (const m of multas) {
      if (!enRango(diaART(m.created_at), r)) continue
      const clave = claveNombre(m.conductor_responsable)
      if (!clave) continue
      const ag = agentePorNombre.get(clave) ?? OTROS
      fila(ag)[cual].multas++
      const set = conMultas.get(ag) ?? new Set<string>()
      set.add(clave)
      conMultas.set(ag, set)
    }
    for (const [ag, set] of conMultas) fila(ag)[cual].conductoresConMultas = set.size
    // Turnos llenados: por responsable del auto
    const dias = new Map<string, number[]>()
    for (const l of llenados) {
      if (!enRango(l.dia, r)) continue
      const ag = responsableDe(l.guiaResponsable)
      fila(ag)[cual].turnosLlenados++
      const lista = dias.get(ag) ?? []
      lista.push(l.dias)
      dias.set(ag, lista)
    }
    for (const [ag, lista] of dias) fila(ag)[cual].diasParaLlenar = lista.reduce((s, d) => s + d, 0) / lista.length
  }

  // Hoy: conductores activos y licencias (por guía), autos y turnos libres (por responsable)
  for (const c of conductores) {
    if (String(c.conductores_estados?.codigo || '').toUpperCase() !== 'ACTIVO') continue
    const ag = agentePorConductor.get(c.id)
    if (!ag) continue
    fila(ag).hoy.conductoresActivos++
    const v = c.licencia_vencimiento ? String(c.licencia_vencimiento).slice(0, 10) : null
    if (v && v < hoy) fila(ag).hoy.licenciasVencidas++
  }
  for (const v of vehiculos) {
    const codigo = v.vehiculos_estados?.codigo
    if (codigo !== 'PKG_ON_BASE' && codigo !== 'EN_USO') continue
    fila(responsableDe(v.guia_responsable)).hoy.autosACargo++
  }
  for (const [guia, x] of porLlenar.porAgente) {
    const h = fila(responsableDe(guia)).hoy
    h.libresD += x.turnosD
    h.libresN += x.turnosN
  }

  const lista = AGENTES.map(ag => filas.get(ag)!)
  for (const f of lista) f.hoy.ocupacion = ocupacion(f.hoy)
  // "Otros" solo si tiene algo
  const conDatos = lista.filter(f => f.agente !== OTROS || tieneDatos(f))

  return { filas: conDatos, total: sumar(lista), conAltas: altas !== null }
}

function ocupacion(h: HoyAgente): number | null {
  const turnos = h.autosACargo * 2
  return turnos > 0 ? Math.max(0, (turnos - h.libresD - h.libresN) / turnos) : null
}

function tieneDatos(f: FilaAgente): boolean {
  const p = (x: PeriodoAgente) => x.altas + x.bajas + x.turnosLlenados + x.multas
  return p(f.actual) + p(f.anterior) + f.hoy.conductoresActivos + f.hoy.autosACargo > 0
}

function sumarPeriodo(lista: PeriodoAgente[], llenados: number[]): PeriodoAgente {
  const total = periodoVacio()
  let sumaDias = 0
  lista.forEach((p, i) => {
    total.altas += p.altas
    total.bajas += p.bajas
    total.turnosLlenados += p.turnosLlenados
    total.multas += p.multas
    total.conductoresConMultas += p.conductoresConMultas
    if (p.diasParaLlenar !== null) sumaDias += p.diasParaLlenar * llenados[i]
  })
  // Promedio ponderado por turnos llenados
  total.diasParaLlenar = total.turnosLlenados > 0 ? sumaDias / total.turnosLlenados : null
  return total
}

function sumar(lista: FilaAgente[]): FilaAgente {
  const hoy: HoyAgente = { conductoresActivos: 0, licenciasVencidas: 0, autosACargo: 0, libresD: 0, libresN: 0, ocupacion: null }
  for (const f of lista) {
    hoy.conductoresActivos += f.hoy.conductoresActivos
    hoy.licenciasVencidas += f.hoy.licenciasVencidas
    hoy.autosACargo += f.hoy.autosACargo
    hoy.libresD += f.hoy.libresD
    hoy.libresN += f.hoy.libresN
  }
  hoy.ocupacion = ocupacion(hoy)
  return {
    agente: 'Total',
    actual: sumarPeriodo(lista.map(f => f.actual), lista.map(f => f.actual.turnosLlenados)),
    anterior: sumarPeriodo(lista.map(f => f.anterior), lista.map(f => f.anterior.turnosLlenados)),
    hoy,
  }
}
