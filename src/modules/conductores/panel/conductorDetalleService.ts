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
  // Semana de pago:
  //  - pagada: semana en que se aplicó (cobró) la penalidad.
  //  - enProceso (fraccionada): cuotas con su semana y si ya fue cobrada (aplicado).
  semanaPago: string | null
  cuotas: Array<{ numero: number; semana: number; anio: number; aplicado: boolean; monto: number }> | null
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
      .select('id, infraccion, patente, fecha_infraccion, importe, importe_descuento, fecha_vencimiento_descuento, conductor_responsable, created_at')
      .ilike('conductor_responsable', `%${primerApellido}%`)
      .is('deleted_at', null)
      .is('desestimada_at', null)
      .order('fecha_infraccion', { ascending: false })
      .limit(500),
    (supabase.from('penalidades' as any) as any)
      .select('id, monto, semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(multa_id)')
      .eq('conductor_id', cond.id)
      .not('incidencias.multa_id', 'is', null),
    supabase.from('periodos_facturacion').select('semana, anio').eq('estado', 'cerrado'),
  ])

  // Estado por multa (misma logica que Mi Espacio / modulo de Multas):
  //  fraccionada = penalidad fraccionada; pagada = no fraccionada, aplicada, en periodo cerrado.
  //  Se guarda tambien el id de la penalidad (para traer las cuotas) y la semana de aplicacion.
  const cerradas = new Set<string>(((perRes.data || []) as Array<{ semana: number; anio: number }>).map(p => `${p.semana}-${p.anio}`))
  const estadoPorMulta = new Map<string, { estado: 'pagada' | 'fraccionada'; monto: number; penId: string | null; semana: number | null; anio: number | null }>()
  const fraccPenIds = new Set<string>()
  for (const row of (penRes.data || []) as Array<any>) {
    const mid = row.incidencias?.multa_id
    if (mid == null) continue
    const monto = parseImporte(row.monto)
    if (row.fraccionado === true) {
      estadoPorMulta.set(String(mid), { estado: 'fraccionada', monto, penId: row.id ?? null, semana: row.semana_aplicacion ?? null, anio: row.anio_aplicacion ?? null })
      if (row.id) fraccPenIds.add(String(row.id))
    } else if (row.aplicado === true && row.rechazado !== true && cerradas.has(`${row.semana_aplicacion}-${row.anio_aplicacion}`)) {
      const prev = estadoPorMulta.get(String(mid))
      if (!prev || prev.estado !== 'fraccionada') estadoPorMulta.set(String(mid), { estado: 'pagada', monto, penId: row.id ?? null, semana: row.semana_aplicacion ?? null, anio: row.anio_aplicacion ?? null })
    }
  }

  // Cuotas de las penalidades fraccionadas (una sola consulta). aplicado = cuota ya cobrada.
  const cuotasPorPen = new Map<string, Array<{ numero: number; semana: number; anio: number; aplicado: boolean; monto: number }>>()
  if (fraccPenIds.size > 0) {
    const { data: cuotasData } = await (supabase.from('penalidades_cuotas' as any) as any)
      .select('penalidad_id, numero_cuota, semana, anio, aplicado, monto_cuota')
      .in('penalidad_id', [...fraccPenIds])
      .order('numero_cuota', { ascending: true })
    for (const c of (cuotasData || []) as Array<any>) {
      const arr = cuotasPorPen.get(String(c.penalidad_id)) || []
      arr.push({ numero: Number(c.numero_cuota) || 0, semana: Number(c.semana) || 0, anio: Number(c.anio) || 0, aplicado: c.aplicado === true, monto: parseImporte(c.monto_cuota) })
      cuotasPorPen.set(String(c.penalidad_id), arr)
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
    let semanaPago: string | null = null
    let cuotas: MultaDetalle['cuotas'] = null
    const anioMulta = m.created_at ? new Date(m.created_at).getFullYear() : null
    if (est?.estado === 'pagada') {
      estado = 'pagada'; monto = est.monto
      semanaPago = est.semana != null ? `S${est.semana}/${est.anio ?? anioMulta ?? ''}` : null
    } else if (est?.estado === 'fraccionada') {
      estado = 'enProceso'; monto = est.monto
      cuotas = est.penId ? (cuotasPorPen.get(est.penId) || null) : null
    } else {
      // Pendiente: no se pagó, así que no hay semana de pago.
      estado = 'pendiente'
      usaDescuento = descuentoVigente
      monto = usaDescuento ? importeDescuento : importe
      semanaPago = null
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
      semanaPago,
      cuotas,
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

export interface ExcesoKmSemana {
  monto: number                 // monto cobrado por el exceso de esa semana
  // Semana(s) en que se cobró el exceso (cuotas si es fraccionado; la semana de
  // aplicación si es pago único). Vacío si la penalidad aún no se aplicó.
  semanasPago: Array<{ semana: number; anio: number; aplicado: boolean }>
}
export interface ExcesoKmConductor {
  // Por semana del exceso (clave = nro de semana ISO en que ocurrió el exceso).
  porSemana: Map<number, ExcesoKmSemana>
  // Total de penalidades de exceso de KM en estado PENDIENTE (por aplicar): aún no
  // se aplicaron, por lo que todavía no entraron a facturación. Se suma a la deuda.
  pendienteTotal: number
}

export async function cargarExcesoKmConductor(conductorId: string): Promise<ExcesoKmConductor> {
  const [{ data: incs }, { data: pens }] = await Promise.all([
    (supabase.from('incidencias' as any) as any)
      .select('id, semana, monto, km_exceso')
      .eq('conductor_id', conductorId)
      .not('km_exceso', 'is', null),
    (supabase.from('penalidades' as any) as any)
      .select('id, incidencia_id, monto, semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(km_exceso, conductor_id)')
      .eq('incidencias.conductor_id', conductorId)
      .not('incidencias.km_exceso', 'is', null),
  ])

  // Incidencia (exceso) por id -> semana del exceso + monto.
  const incById = new Map<string, { semana: number | null; monto: number }>()
  const porSemana = new Map<number, ExcesoKmSemana>()
  for (const i of (incs || []) as Array<{ id: unknown; semana: number | null; monto: unknown }>) {
    incById.set(String(i.id), { semana: i.semana ?? null, monto: parseImporte(i.monto) })
    if (i.semana != null) {
      const prev = porSemana.get(i.semana)
      if (prev) prev.monto += parseImporte(i.monto)
      else porSemana.set(i.semana, { monto: parseImporte(i.monto), semanasPago: [] })
    }
  }

  // Cuotas de las penalidades de exceso fraccionadas (para las semanas de pago).
  const fraccIds = ((pens || []) as Array<any>).filter(p => p.fraccionado === true).map(p => String(p.id))
  const cuotasPorPen = new Map<string, Array<{ semana: number; anio: number; aplicado: boolean }>>()
  if (fraccIds.length > 0) {
    const { data: cu } = await (supabase.from('penalidades_cuotas' as any) as any)
      .select('penalidad_id, semana, anio, aplicado, numero_cuota')
      .in('penalidad_id', fraccIds)
      .order('numero_cuota', { ascending: true })
    for (const c of (cu || []) as Array<any>) {
      const arr = cuotasPorPen.get(String(c.penalidad_id)) || []
      arr.push({ semana: Number(c.semana) || 0, anio: Number(c.anio) || 0, aplicado: c.aplicado === true })
      cuotasPorPen.set(String(c.penalidad_id), arr)
    }
  }

  // Pendiente (por aplicar) + semanas de pago por exceso.
  let pendienteTotal = 0
  for (const p of (pens || []) as Array<any>) {
    if (p.aplicado !== true && p.rechazado !== true) pendienteTotal += parseImporte(p.monto)
    const inc = p.incidencia_id != null ? incById.get(String(p.incidencia_id)) : null
    const sem = inc?.semana
    if (sem == null) continue
    let semanasPago: Array<{ semana: number; anio: number; aplicado: boolean }> = []
    if (p.fraccionado === true) {
      semanasPago = cuotasPorPen.get(String(p.id)) || []
    } else if (p.aplicado === true && p.semana_aplicacion != null) {
      semanasPago = [{ semana: p.semana_aplicacion, anio: p.anio_aplicacion ?? 0, aplicado: true }]
    }
    const entry = porSemana.get(sem)
    if (entry) entry.semanasPago.push(...semanasPago)
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
