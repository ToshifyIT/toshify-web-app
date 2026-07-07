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
  // Montos con IMPORTE COMPLETO (nominal), igual que el modulo de Multas.
  montoTotalMultas: number   // todas las multas
  montoFacturado: number     // facturadas (tiene incidencia) = enviadas a facturacion
  montoSinFacturar: number   // activas (sin incidencia)
  // Estados de pago (subdivision de las facturadas). Facturadas = impagas + pagadas.
  //  - sinFacturar: sin incidencia (todavia no se mando a facturacion)
  //  - impagas: facturada pero su semana NO quedo cubierta (o sin penalidad aplicada)
  //  - pagadas: facturada en una semana cubierta al 100% (pagada de verdad)
  sinFacturar: number
  impagas: number
  pagadas: number
  montoImpaga: number
  montoPagado: number
  montoPendiente: number     // = montoSinFacturar + montoImpaga (todo lo no pagado)
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
      .select('id, patente, importe, conductor_responsable')
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

  // 4b. Incidencias: set de multa_id que YA se mandaron a facturacion (mismo criterio
  // que el modulo de Multas para "Enviadas a facturacion").
  const incidencias = await fetchAll<{ multa_id: number | string | null }>((from, to) =>
    supabase.from('incidencias').select('multa_id').not('multa_id', 'is', null).range(from, to)
  )
  const facturadaSet = new Set<string>(incidencias.map(i => String(i.multa_id)))

  // 5. Facturacion por semana (proforma) y aportes (control_saldos) por conductor,
  // para determinar que semanas quedaron CUBIERTAS (proforma - aportes <= 0).
  const facturacion = await fetchAll<{
    conductor_id: string | null
    total_a_pagar: unknown
    periodos_facturacion: { semana: number | null; anio: number | null } | null
  }>((from, to) =>
    supabase
      .from('facturacion_conductores')
      .select('conductor_id, total_a_pagar, periodos_facturacion!inner(semana, anio)')
      .range(from, to)
  )
  const aportes = await fetchAll<{ conductor_id: string | null; semana: number | null; anio: number | null; tipo_movimiento: string | null; monto_movimiento: unknown }>((from, to) =>
    supabase
      .from('control_saldos')
      .select('conductor_id, semana, anio, tipo_movimiento, monto_movimiento')
      .range(from, to)
  )
  const tiposAporte = new Set(['pago_cabify', 'pago_manual', 'pago', 'pago_cuota'])
  const proformaPorSem = new Map<string, number>()   // conductor|sem-anio -> proforma
  for (const f of facturacion) {
    const per = f.periodos_facturacion
    if (!f.conductor_id || !per?.semana || !per?.anio) continue
    const k = `${f.conductor_id}|${per.semana}-${per.anio}`
    proformaPorSem.set(k, (proformaPorSem.get(k) || 0) + parseImporte(f.total_a_pagar))
  }
  const aportePorSem = new Map<string, number>()
  for (const a of aportes) {
    if (!a.conductor_id || !tiposAporte.has(a.tipo_movimiento || '')) continue
    const k = `${a.conductor_id}|${a.semana}-${a.anio}`
    aportePorSem.set(k, (aportePorSem.get(k) || 0) + Number(a.monto_movimiento || 0))
  }
  // Semana cubierta = proforma - aportes <= 1 (tolerancia de centavos), con proforma > 0.
  const semanaCubierta = (conductorId: string, sem: number, anio: number): boolean => {
    const k = `${conductorId}|${sem}-${anio}`
    const prof = proformaPorSem.get(k) || 0
    if (prof <= 0) return false
    return prof - (aportePorSem.get(k) || 0) <= 1
  }

  // Mapa (conductor_id|multa_id) -> penalidad (facturada). Guarda la aplicacion mas reciente.
  interface PenInfo { fraccionado: boolean; sem: number; anio: number }
  const penPorMulta = new Map<string, PenInfo>()
  for (const p of penalidades) {
    const mid = p.incidencias?.multa_id
    if (mid == null || !p.conductor_id) continue
    // Solo cuenta como facturada si esta aplicada y no rechazada.
    if (p.aplicado !== true || p.rechazado === true) continue
    const key = `${p.conductor_id}|${mid}`
    const sem = p.semana_aplicacion ?? 0
    const anio = p.anio_aplicacion ?? 0
    const prev = penPorMulta.get(key)
    if (!prev || anio > prev.anio || (anio === prev.anio && sem > prev.sem)) {
      penPorMulta.set(key, { fraccionado: p.fraccionado === true, sem, anio })
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
    let sinFacturar = 0, impagas = 0, pagadas = 0
    let montoSinFacturar = 0, montoImpaga = 0, montoPagado = 0
    let montoTotalMultas = 0
    for (const m of ms) {
      // IMPORTE COMPLETO (nominal), igual que el modulo de Multas.
      const imp = parseImporte(m.importe)
      montoTotalMultas += imp
      if (!facturadaSet.has(String(m.id))) {
        // Sin incidencia => todavia no se mando a facturacion.
        sinFacturar++; montoSinFacturar += imp
      } else {
        // Facturada (tiene incidencia). Se subdivide en pagada/impaga por cobertura.
        const pen = penPorMulta.get(`${c.id}|${m.id}`)
        if (pen && !pen.fraccionado && semanaCubierta(c.id, pen.sem, pen.anio)) {
          pagadas++; montoPagado += imp
        } else {
          impagas++; montoImpaga += imp
        }
      }
    }
    const montoFacturado = montoImpaga + montoPagado
    const montoPendiente = montoSinFacturar + montoImpaga
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
      montoFacturado,
      montoSinFacturar,
      sinFacturar,
      impagas,
      pagadas,
      montoImpaga,
      montoPagado,
      montoPendiente,
    }
  })

  return rows
}
