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
  estado: 'pendiente' | 'enProceso' | 'pagada'
  monto: number                    // monto efectivo (penalidad si pagada/proceso; importe con/sin descuento si pendiente)
  importe: number                  // importe original de la multa
  importeDescuento: number         // importe con descuento (0 si no tiene)
  fechaVencDescuento: string | null
  descuentoVigente: boolean        // hay descuento y su vencimiento es posterior a hoy
  usaDescuento: boolean            // el monto pendiente se calcula con el importe con descuento
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
  saldoAnterior: number                   // arrastre de semanas previas (ya incluido en proforma)
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

  const [{ data: multasRaw }, penRes, perRes] = await Promise.all([
    supabase
      .from('multas_historico')
      .select('id, infraccion, patente, fecha_infraccion, importe, importe_descuento, fecha_vencimiento_descuento, conductor_responsable')
      .ilike('conductor_responsable', `%${primerApellido}%`)
      .is('deleted_at', null)
      .is('desestimada_at', null)
      .order('fecha_infraccion', { ascending: false })
      .limit(500),
    (supabase.from('penalidades' as any) as any)
      .select('monto, semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(multa_id)')
      .eq('conductor_id', cond.id)
      .not('incidencias.multa_id', 'is', null),
    supabase.from('periodos_facturacion').select('semana, anio').eq('estado', 'cerrado'),
  ])

  // Estado por multa (misma logica que Mi Espacio / modulo de Multas):
  //  fraccionada = penalidad fraccionada; pagada = no fraccionada, aplicada, en periodo cerrado.
  const cerradas = new Set<string>(((perRes.data || []) as Array<{ semana: number; anio: number }>).map(p => `${p.semana}-${p.anio}`))
  const estadoPorMulta = new Map<string, { estado: 'pagada' | 'fraccionada'; monto: number }>()
  for (const row of (penRes.data || []) as Array<any>) {
    const mid = row.incidencias?.multa_id
    if (mid == null) continue
    const monto = parseImporte(row.monto)
    if (row.fraccionado === true) {
      estadoPorMulta.set(String(mid), { estado: 'fraccionada', monto })
    } else if (row.aplicado === true && row.rechazado !== true && cerradas.has(`${row.semana_aplicacion}-${row.anio_aplicacion}`)) {
      const prev = estadoPorMulta.get(String(mid))
      if (!prev || prev.estado !== 'fraccionada') estadoPorMulta.set(String(mid), { estado: 'pagada', monto })
    }
  }

  const hoyStr = new Date().toISOString().slice(0, 10)

  const filtradas = ((multasRaw || []) as Array<any>).filter(m => {
    const cr = m.conductor_responsable || ''
    if (cr.includes(',')) return false
    const c = norm(cr)
    return c.includes(primerNombre) && c.includes(primerApellido)
  })

  const detalle = filtradas.map((m): MultaDetalle => {
    const est = estadoPorMulta.get(String(m.id))
    const importe = parseImporte(m.importe)
    const importeDescuento = parseImporte(m.importe_descuento)
    const vencStr = m.fecha_vencimiento_descuento ? String(m.fecha_vencimiento_descuento).slice(0, 10) : ''
    const descuentoVigente = importeDescuento > 0 && vencStr > hoyStr

    let estado: MultaDetalle['estado']
    let monto: number
    let usaDescuento = false
    if (est?.estado === 'pagada') {
      estado = 'pagada'; monto = est.monto
    } else if (est?.estado === 'fraccionada') {
      estado = 'enProceso'; monto = est.monto
    } else {
      estado = 'pendiente'
      usaDescuento = descuentoVigente
      monto = usaDescuento ? importeDescuento : importe
    }
    return {
      id: String(m.id),
      fecha: m.fecha_infraccion,
      infraccion: m.infraccion,
      patente: m.patente,
      estado,
      monto,
      importe,
      importeDescuento,
      fechaVencDescuento: m.fecha_vencimiento_descuento ? String(m.fecha_vencimiento_descuento).slice(0, 10) : null,
      descuentoVigente,
      usaDescuento,
    }
  })

  // Orden por fecha de infracción, de la más reciente a la más antigua.
  detalle.sort((a, b) => {
    const fa = a.fecha ? Date.parse(a.fecha) : 0
    const fb = b.fecha ? Date.parse(b.fecha) : 0
    return fb - fa
  })
  return detalle
}

export interface ConceptoDetalle {
  nombre: string
  total: number
  esDescuento: boolean
}
export interface PagoAporte {
  id: string
  tipo: string            // pago_cabify | pago_manual | pago | pago_cuota
  monto: number
  referencia: string | null
  fecha: string | null
}
export interface SemanaDetalle {
  conceptos: ConceptoDetalle[]
  grupoFlota: string | null
  gnc: boolean | null
  pagos: PagoAporte[]     // aportes de la semana (Cabify, manuales, etc.)
}

// Tipos de movimiento que cuentan como aporte del conductor (mismo criterio que el portal).
const TIPOS_APORTE = ['pago_cabify', 'pago_manual', 'pago', 'pago_cuota']

// Detalle de una semana de facturación: conceptos (cargos/descuentos) + datos del
// vehículo + aportes (pagos) de la semana desde el kardex (control_saldos).
export async function cargarDetalleSemana(
  facturaId: string,
  patente: string | null,
  conductorId: string,
  semana: number,
  anio: number,
): Promise<SemanaDetalle> {
  const [{ data: det }, vehRes, pagosRes] = await Promise.all([
    supabase
      .from('facturacion_detalle')
      .select('concepto_codigo, concepto_descripcion, total, es_descuento')
      .eq('facturacion_id', facturaId)
      .order('es_descuento'),
    patente
      ? supabase.from('vehiculos').select('grupo_flota, gnc').eq('patente', patente).limit(1)
      : Promise.resolve({ data: [] as any[] }),
    (supabase.from('control_saldos') as any)
      .select('id, tipo_movimiento, monto_movimiento, referencia, created_at')
      .eq('conductor_id', conductorId)
      .eq('semana', semana)
      .eq('anio', anio)
      .in('tipo_movimiento', TIPOS_APORTE)
      .order('created_at', { ascending: true }),
  ])

  const conceptos: ConceptoDetalle[] = ((det || []) as Array<any>)
    .filter(d => d.concepto_codigo !== 'SALDO' && Number(d.total || 0) !== 0)
    .map(d => ({
      nombre: d.concepto_descripcion || d.concepto_codigo || 'Concepto',
      total: Number(d.total || 0),
      esDescuento: d.es_descuento === true,
    }))

  const pagos: PagoAporte[] = ((pagosRes.data || []) as Array<any>).map(p => ({
    id: String(p.id),
    tipo: p.tipo_movimiento,
    monto: Number(p.monto_movimiento) || 0,
    referencia: p.referencia ?? null,
    fecha: p.created_at ?? null,
  }))

  const veh = (vehRes.data && vehRes.data.length > 0) ? (vehRes.data[0] as any) : null
  return { conceptos, grupoFlota: veh?.grupo_flota ?? null, gnc: veh?.gnc ?? null, pagos }
}

export interface ExcesoKmConductor {
  // Monto cobrado por exceso de KM por semana (clave = nro de semana ISO). Sale de
  // la incidencia (incidencias.km_exceso not null). Si una semana tiene exceso pero
  // NO tiene incidencia cargada, no aparece en el mapa (=> N/A en la tabla de Km).
  porSemana: Map<number, number>
  // Total de penalidades de exceso de KM en estado PENDIENTE (por aplicar): aún no
  // se aplicaron, por lo que todavía no entraron a facturación. Se suma a la deuda.
  pendienteTotal: number
}

export async function cargarExcesoKmConductor(conductorId: string): Promise<ExcesoKmConductor> {
  const [{ data: incs }, { data: pens }] = await Promise.all([
    (supabase.from('incidencias' as any) as any)
      .select('semana, monto, km_exceso')
      .eq('conductor_id', conductorId)
      .not('km_exceso', 'is', null),
    (supabase.from('penalidades' as any) as any)
      .select('monto, aplicado, rechazado, incidencias!inner(km_exceso, conductor_id)')
      .eq('incidencias.conductor_id', conductorId)
      .not('incidencias.km_exceso', 'is', null),
  ])

  const porSemana = new Map<number, number>()
  for (const r of (incs || []) as Array<{ semana: number | null; monto: unknown }>) {
    if (r.semana == null) continue
    porSemana.set(r.semana, (porSemana.get(r.semana) || 0) + parseImporte(r.monto))
  }

  // Pendiente = penalidad de exceso KM no aplicada y no rechazada (estado "Por Aplicar").
  let pendienteTotal = 0
  for (const p of (pens || []) as Array<{ monto: unknown; aplicado: boolean | null; rechazado: boolean | null }>) {
    if (p.aplicado !== true && p.rechazado !== true) pendienteTotal += parseImporte(p.monto)
  }

  return { porSemana, pendienteTotal }
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
      .select('id, total_a_pagar, saldo_anterior, vehiculo_patente, tipo_alquiler, turnos_base, turnos_cobrados, periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin)')
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
    const saldoAnterior = parseImporte(f.saldo_anterior)
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
      proforma, pagado, saldo, saldoAnterior, cobertura, estado,
    })
  }
  return rows.sort((a, b) => b.anio - a.anio || b.semana - a.semana)
}
