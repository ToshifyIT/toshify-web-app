// Servicio de datos del sub-modulo "Panel de Conductores" (dentro de Conductores).
//
// Arma un acumulado por conductor: estado (activo/inactivo), si tiene asignacion
// vigente, y sus multas atribuidas (cantidad, vehiculos, monto total, pagadas,
// pendientes, monto pagado y monto pendiente).
//
// VINCULO MULTA -> CONDUCTOR: se replica EXACTAMENTE el criterio del portal
// "Mi Espacio" (PortalPage): una multa se atribuye a un conductor si su
// conductor_responsable contiene el primer nombre Y el primer apellido del
// conductor, y no es un responsable compartido (con coma). Cobertura ~45%:
// las multas sin responsable cargado no se atribuyen a nadie.
//
// ESTADO DE PAGO: derivado de penalidades (keyed por conductor_id) -> incidencias.multa_id,
// igual que el portal. pagada = penalidad aplicada en periodo cerrado (o fraccionada).
// El resto de las multas atribuidas se consideran pendientes con su importe original.

import { supabase } from '../../../lib/supabase'

export interface ConductorPanelRow {
  id: string
  nombre: string
  nombres: string | null
  apellidos: string | null
  dni: string | null
  estadoCodigo: string | null
  activo: boolean
  tieneAsignacion: boolean
  vehiculoAsignado: string | null   // patente del auto asignado ahora mismo
  cantidadMultas: number
  vehiculos: string[]        // patentes distintas de sus multas
  montoTotalMultas: number
  multasPagadas: number
  multasPendientes: number
  montoPagado: number
  montoPendiente: number
}

// Parsea importes que en la BD vienen en DOS formatos mezclados:
//  - plano/US:   "$ 284400.00", "135525.00"  (punto = decimal)
//  - argentino:  "$161.498,30", "$142.498,50" (punto = miles, coma = decimal)
// Detecta el separador decimal como el ULTIMO ("," o ".") que aparece; el resto
// se tratan como separadores de miles.
export function parseImporte(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  let s = String(v).replace(/[^0-9.,-]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // Decimal = coma (formato argentino): quitar puntos de miles, coma -> punto.
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Decimal = punto (formato plano): quitar comas de miles.
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// Monto de una multa: el importe CON descuento por pago temprano cuando existe
// (es lo que realmente paga el conductor y lo que muestra el portal Mi Espacio),
// cayendo al importe pleno cuando no hay descuento.
export function montoDeMulta(importe: unknown, importeDescuento: unknown): number {
  const desc = parseImporte(importeDescuento)
  return desc > 0 ? desc : parseImporte(importe)
}

function normalize(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

function primeraPalabra(s: string | null | undefined): string {
  const parts = normalize(s).split(/\s+/).filter(Boolean)
  return parts[0] || ''
}

// Trae todas las filas de una consulta paginando de a 1000 (limite de PostgREST).
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000
  let from = 0
  const out: T[] = []
  // Evita bucles infinitos ante un error inesperado.
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

interface RawConductor {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  conductores_estados: { codigo: string | null } | null
}

interface RawMulta {
  id: number | string
  patente: string | null
  importe: unknown
  importe_descuento: unknown
  conductor_responsable: string | null
}

interface RawPenalidad {
  conductor_id: string | null
  monto: unknown
  semana_aplicacion: number | null
  anio_aplicacion: number | null
  aplicado: boolean | null
  rechazado: boolean | null
  fraccionado: boolean | null
  incidencias: { multa_id: number | null } | null
}

/**
 * Carga y agrega el panel de conductores.
 * @param sedeId  si se pasa, filtra conductores por sede.
 */
export async function cargarPanelConductores(sedeId?: string | null): Promise<ConductorPanelRow[]> {
  // 1. Conductores (con estado y dni).
  const conductores = await fetchAll<RawConductor>((from, to) => {
    let q = supabase
      .from('conductores')
      .select('id, nombres, apellidos, numero_dni, conductores_estados(codigo)')
      .range(from, to)
    if (sedeId) q = q.eq('sede_id', sedeId)
    return q
  })

  // 2. Asignacion ACTUAL (auto asignado ahora mismo). Mismo criterio que
  // ConductoresModule: fila de asignaciones_conductores en estado asignado/activo,
  // cuya asignacion esta activo/activa, y con vehiculo. Filtra por sede.
  const asignacionesCond = await fetchAll<{
    conductor_id: string | null
    estado: string | null
    asignaciones: { estado: string | null; sede_id: string | null; vehiculos: { patente: string | null } | null } | null
  }>((from, to) =>
    supabase
      .from('asignaciones_conductores')
      .select('conductor_id, estado, asignaciones(estado, sede_id, vehiculos(patente))')
      .not('conductor_id', 'is', null)
      .range(from, to)
  )
  const vehiculoPorConductor = new Map<string, string>()
  for (const ac of asignacionesCond) {
    const a = ac.asignaciones
    if (!a || !['activo', 'activa'].includes(a.estado || '')) continue
    if (!['asignado', 'activo'].includes(ac.estado || '')) continue
    if (sedeId && a.sede_id !== sedeId) continue
    if (!ac.conductor_id || !a.vehiculos?.patente) continue
    if (!vehiculoPorConductor.has(ac.conductor_id)) {
      vehiculoPorConductor.set(ac.conductor_id, a.vehiculos.patente)
    }
  }

  // 3. Multas activas con responsable cargado (no borradas, no desestimadas).
  const multas = await fetchAll<RawMulta>((from, to) =>
    supabase
      .from('multas_historico')
      .select('id, patente, importe, importe_descuento, conductor_responsable')
      .is('deleted_at', null)
      .is('desestimada_at', null)
      .not('conductor_responsable', 'is', null)
      .range(from, to)
  )

  // 4. Penalidades -> estado de pago por (conductor_id, multa_id).
  const penalidades = await fetchAll<RawPenalidad>((from, to) =>
    supabase
      .from('penalidades')
      .select('conductor_id, monto, semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(multa_id)')
      .not('incidencias.multa_id', 'is', null)
      .range(from, to)
  )

  // 5. Periodos cerrados (para clasificar pagada).
  const periodos = await fetchAll<{ semana: number; anio: number }>((from, to) =>
    supabase
      .from('periodos_facturacion')
      .select('semana, anio')
      .eq('estado', 'cerrado')
      .range(from, to)
  )
  const cerradas = new Set<string>(periodos.map(p => `${p.semana}-${p.anio}`))

  // Mapa (conductor_id + '|' + multa_id) -> monto facturado (pagada/fraccionada).
  const pagadaMonto = new Map<string, number>()
  for (const p of penalidades) {
    const mid = p.incidencias?.multa_id
    if (mid == null || !p.conductor_id) continue
    const key = `${p.conductor_id}|${mid}`
    const monto = parseImporte(p.monto)
    const sem = p.semana_aplicacion ?? 0
    const anio = p.anio_aplicacion ?? 0
    const esPagada = p.fraccionado === true ||
      (p.aplicado === true && p.rechazado !== true && cerradas.has(`${sem}-${anio}`))
    if (esPagada) {
      // Conserva el mayor monto facturado si hay varias penalidades para la misma multa.
      pagadaMonto.set(key, Math.max(pagadaMonto.get(key) || 0, monto))
    }
  }

  // Pre-normaliza conductores para el match de nombre.
  const conductoresNorm = conductores.map(c => ({
    ...c,
    _pn: primeraPalabra(c.nombres),
    _pa: primeraPalabra(c.apellidos),
  }))

  // Atribucion de multas por nombre (mismo criterio que el portal).
  const multasPorConductor = new Map<string, RawMulta[]>()
  for (const m of multas) {
    const cr = m.conductor_responsable || ''
    if (cr.includes(',')) continue // responsable compartido: no se atribuye
    const crn = normalize(cr)
    for (const c of conductoresNorm) {
      if (c._pn && c._pa && crn.includes(c._pn) && crn.includes(c._pa)) {
        const arr = multasPorConductor.get(c.id) || []
        arr.push(m)
        multasPorConductor.set(c.id, arr)
        break // una multa se atribuye a un solo conductor
      }
    }
  }

  // Ensambla filas.
  const rows: ConductorPanelRow[] = conductoresNorm.map(c => {
    const ms = multasPorConductor.get(c.id) || []
    const patentes = [...new Set(ms.map(m => m.patente).filter((x): x is string => !!x))]
    let multasPagadas = 0
    let multasPendientes = 0
    let montoPagado = 0
    let montoPendiente = 0
    let montoTotalMultas = 0
    for (const m of ms) {
      const imp = montoDeMulta(m.importe, m.importe_descuento)
      montoTotalMultas += imp
      // El estado de pago se detecta por penalidad, pero el MONTO es el de la multa
      // (con descuento), no el facturado. Asi montoPagado + montoPendiente == montoTotalMultas.
      const esPagada = pagadaMonto.has(`${c.id}|${m.id}`)
      if (esPagada) {
        multasPagadas++
        montoPagado += imp
      } else {
        multasPendientes++
        montoPendiente += imp
      }
    }
    const estadoCodigo = c.conductores_estados?.codigo?.toLowerCase() || null
    const vehiculoAsignado = vehiculoPorConductor.get(c.id) || null
    return {
      id: c.id,
      nombre: `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
      nombres: c.nombres,
      apellidos: c.apellidos,
      dni: c.numero_dni,
      estadoCodigo,
      activo: estadoCodigo === 'activo',
      tieneAsignacion: !!vehiculoAsignado,
      vehiculoAsignado,
      cantidadMultas: ms.length,
      vehiculos: patentes,
      montoTotalMultas,
      multasPagadas,
      multasPendientes,
      montoPagado,
      montoPendiente,
    }
  })

  return rows
}
