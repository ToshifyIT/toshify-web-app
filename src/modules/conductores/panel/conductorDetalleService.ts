// Loader de detalle por conductor para el modal "Ver detalle" del Panel de Conductores.
// Reusa la misma logica de atribucion y de estado de pago que el portal Mi Espacio,
// pero devuelve datos crudos para renderizar en tablas densas.

import { supabase } from '../../../lib/supabase'
import { parseImporte } from './conductoresPanelService'

export interface MultaDetalle {
  id: string
  fecha: string | null
  infraccion: string | null
  patente: string | null
  estado: 'sinFacturar' | 'impaga' | 'pagada'
  monto: number
}

export interface FacturacionSemana {
  id: string
  semana: number
  anio: number
  fechaInicio: string | null
  fechaFin: string | null
  patente: string | null
  modalidad: string | null
  turnosCobrados: number
  turnosBase: number
  proforma: number
  pagado: number
  saldo: number
  cobertura: number                       // 0..100
  estado: 'cubierto' | 'pendiente' | 'favor'
}

function norm(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}
function primera(s: string | null | undefined): string {
  return norm(s).split(/\s+/).filter(Boolean)[0] || ''
}

// Multas atribuidas al conductor (por nombre, como el portal) + estado de pago (por penalidad).
export async function cargarMultasConductor(cond: { id: string; nombres: string | null; apellidos: string | null }): Promise<MultaDetalle[]> {
  const primerNombre = primera(cond.nombres)
  const primerApellido = primera(cond.apellidos)
  if (!primerNombre || !primerApellido) return []

  const [{ data: multasRaw }, penRes, factRes, pagosRes] = await Promise.all([
    supabase
      .from('multas_historico')
      .select('id, infraccion, patente, fecha_infraccion, importe, conductor_responsable')
      .ilike('conductor_responsable', `%${primerApellido}%`)
      .is('deleted_at', null)
      .is('desestimada_at', null)
      .order('fecha_infraccion', { ascending: false })
      .limit(500),
    (supabase.from('penalidades' as any) as any)
      .select('semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(multa_id)')
      .eq('conductor_id', cond.id)
      .not('incidencias.multa_id', 'is', null),
    supabase.from('facturacion_conductores').select('total_a_pagar, periodos_facturacion!inner(semana, anio)').eq('conductor_id', cond.id),
    (supabase.from('control_saldos') as any).select('semana, anio, tipo_movimiento, monto_movimiento').eq('conductor_id', cond.id),
  ])

  // Cobertura por semana: proforma - aportes <= 0 => cubierta.
  const tiposAporte = new Set(['pago_cabify', 'pago_manual', 'pago', 'pago_cuota'])
  const prof: Record<string, number> = {}
  for (const f of (factRes.data || []) as Array<any>) {
    const per = f.periodos_facturacion
    if (!per?.semana || !per?.anio) continue
    prof[`${per.semana}-${per.anio}`] = (prof[`${per.semana}-${per.anio}`] || 0) + parseImporte(f.total_a_pagar)
  }
  const apor: Record<string, number> = {}
  for (const p of (pagosRes.data || []) as Array<any>) {
    if (!tiposAporte.has(p.tipo_movimiento)) continue
    apor[`${p.semana}-${p.anio}`] = (apor[`${p.semana}-${p.anio}`] || 0) + Number(p.monto_movimiento || 0)
  }
  const cubierta = (k: string) => (prof[k] || 0) > 0 && (prof[k] || 0) - (apor[k] || 0) <= 1

  // Estado por multa: facturada (penalidad aplicada) en semana cubierta = pagada;
  // facturada en semana no cubierta (o fraccionada) = impaga; sin penalidad = sin facturar.
  const penPorMulta = new Map<string, { fraccionado: boolean; k: string }>()
  for (const row of (penRes.data || []) as Array<any>) {
    const mid = row.incidencias?.multa_id
    if (mid == null || row.aplicado !== true || row.rechazado === true) continue
    penPorMulta.set(String(mid), { fraccionado: row.fraccionado === true, k: `${row.semana_aplicacion ?? 0}-${row.anio_aplicacion ?? 0}` })
  }

  const filtradas = ((multasRaw || []) as Array<any>).filter(m => {
    const cr = m.conductor_responsable || ''
    if (cr.includes(',')) return false
    const c = norm(cr)
    return c.includes(primerNombre) && c.includes(primerApellido)
  })

  // Facturada = la multa tiene una incidencia (mismo criterio que el modulo de Multas).
  let facturadaSet = new Set<string>()
  if (filtradas.length > 0) {
    const { data: inc } = await supabase
      .from('incidencias')
      .select('multa_id')
      .in('multa_id', filtradas.map(m => m.id))
      .not('multa_id', 'is', null)
    facturadaSet = new Set(((inc || []) as Array<any>).map(i => String(i.multa_id)))
  }

  return filtradas.map((m): MultaDetalle => {
    const id = String(m.id)
    let estado: MultaDetalle['estado']
    if (!facturadaSet.has(id)) {
      estado = 'sinFacturar'
    } else {
      const pen = penPorMulta.get(id)
      estado = (pen && !pen.fraccionado && cubierta(pen.k)) ? 'pagada' : 'impaga'
    }
    return {
      id,
      fecha: m.fecha_infraccion,
      infraccion: m.infraccion,
      patente: m.patente,
      estado,
      // IMPORTE COMPLETO (nominal), igual que el modulo de Multas y la tabla del panel.
      monto: parseImporte(m.importe),
    }
  })
}

export interface ConceptoDetalle {
  nombre: string
  total: number
  esDescuento: boolean
}
export interface SemanaDetalle {
  conceptos: ConceptoDetalle[]
  grupoFlota: string | null
  gnc: boolean | null
}

// Detalle de una semana de facturación: conceptos (cargos/descuentos) + datos del vehículo.
export async function cargarDetalleSemana(facturaId: string, patente: string | null): Promise<SemanaDetalle> {
  const [{ data: det }, vehRes] = await Promise.all([
    supabase
      .from('facturacion_detalle')
      .select('concepto_codigo, concepto_descripcion, total, es_descuento')
      .eq('facturacion_id', facturaId)
      .order('es_descuento'),
    patente
      ? supabase.from('vehiculos').select('grupo_flota, gnc').eq('patente', patente).limit(1)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const conceptos: ConceptoDetalle[] = ((det || []) as Array<any>)
    .filter(d => d.concepto_codigo !== 'SALDO' && Number(d.total || 0) !== 0)
    .map(d => ({
      nombre: d.concepto_descripcion || d.concepto_codigo || 'Concepto',
      total: Number(d.total || 0),
      esDescuento: d.es_descuento === true,
    }))

  const veh = (vehRes.data && vehRes.data.length > 0) ? (vehRes.data[0] as any) : null
  return { conceptos, grupoFlota: veh?.grupo_flota ?? null, gnc: veh?.gnc ?? null }
}

export interface ResumenExtra {
  gananciaCabify: number   // ganancia Cabify de la ultima semana facturada
}

// Ganancia Cabify de la ultima semana (misma fuente que el portal). El saldo actual
// NO sale de aca: se calcula del historial (saldo de la ultima semana facturada).
export async function cargarResumenExtra(
  cond: { id: string; nombres: string | null; apellidos: string | null; dni: string | null },
  rangoUltimaSemana: { inicio: string; fin: string } | null,
): Promise<ResumenExtra> {
  const primerNombre = primera(cond.nombres)
  const primerApellido = primera(cond.apellidos)

  const { data: cabifyData } = (cond.dni || (primerNombre && primerApellido))
    ? await supabase
        .from('cabify_historico')
        .select('fecha_inicio, ganancia_total')
        .or(`dni.eq.${cond.dni || '___'},and(nombre.ilike.%${primerNombre}%,apellido.ilike.%${primerApellido}%)`)
    : { data: [] as any[] }

  let gananciaCabify = 0
  if (rangoUltimaSemana) {
    for (const row of (cabifyData || []) as Array<any>) {
      const dia = String(row.fecha_inicio || '').slice(0, 10)
      if (dia >= rangoUltimaSemana.inicio && dia <= rangoUltimaSemana.fin) {
        gananciaCabify += Number(row.ganancia_total || 0)
      }
    }
  }
  return { gananciaCabify }
}

// Facturacion por semana del conductor (desde S11/2026, igual que el portal).
export async function cargarFacturacionConductor(conductorId: string): Promise<FacturacionSemana[]> {
  const [{ data: facts }, { data: pagos }] = await Promise.all([
    supabase
      .from('facturacion_conductores')
      .select('id, total_a_pagar, vehiculo_patente, tipo_alquiler, turnos_base, turnos_cobrados, periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin)')
      .eq('conductor_id', conductorId),
    (supabase.from('control_saldos') as any)
      .select('semana, anio, tipo_movimiento, monto_movimiento')
      .eq('conductor_id', conductorId),
  ])

  const tiposAporte = ['pago_cabify', 'pago_manual', 'pago', 'pago_cuota']
  const pagadoPorSemana: Record<string, number> = {}
  for (const p of (pagos || []) as Array<any>) {
    if (!tiposAporte.includes(p.tipo_movimiento)) continue
    const key = `${p.semana}-${p.anio}`
    pagadoPorSemana[key] = (pagadoPorSemana[key] || 0) + Number(p.monto_movimiento || 0)
  }

  const ANIO_MIN = 2026, SEMANA_MIN = 11
  const TOLERANCIA = 1
  const rows: FacturacionSemana[] = []
  for (const f of (facts || []) as Array<any>) {
    const per = f.periodos_facturacion
    const semana = per?.semana, anio = per?.anio
    if (!semana || !anio) continue
    if (!(anio > ANIO_MIN || (anio === ANIO_MIN && semana >= SEMANA_MIN))) continue
    const proforma = parseImporte(f.total_a_pagar)
    const pagado = pagadoPorSemana[`${semana}-${anio}`] || 0
    const saldo = proforma - pagado
    const cobertura = proforma > 0 ? Math.min(100, (pagado / proforma) * 100) : (pagado > 0 ? 100 : 0)
    const estado: FacturacionSemana['estado'] = saldo > TOLERANCIA ? 'pendiente' : (saldo < -TOLERANCIA ? 'favor' : 'cubierto')
    rows.push({
      id: String(f.id),
      semana, anio,
      fechaInicio: per?.fecha_inicio ?? null,
      fechaFin: per?.fecha_fin ?? null,
      patente: f.vehiculo_patente ?? null,
      modalidad: f.tipo_alquiler ?? null,
      turnosCobrados: Number(f.turnos_cobrados || 0),
      turnosBase: Number(f.turnos_base || 0),
      proforma, pagado, saldo, cobertura, estado,
    })
  }
  return rows.sort((a, b) => b.anio - a.anio || b.semana - a.semana)
}
