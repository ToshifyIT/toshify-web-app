// Loader de detalle por conductor para el modal "Ver detalle" del Panel de Conductores.
// Reusa la misma logica de atribucion y de estado de pago que el portal Mi Espacio,
// pero devuelve datos crudos para renderizar en tablas densas.

import { supabase } from '../../../lib/supabase'
import { patronIlikeSinAcentos } from '../../../utils/nombreMatch'
import { parseImporte } from './conductoresPanelService'
import { getKardexGarantia, getFacturacionGarantiaConductor, type ControlGarantiaRow } from '../../../services/controlGarantiasService'
import type { GarantiaConductor } from '../../../types/facturacion.types'

export interface MultaDetalle {
  id: string
  fecha: string | null
  infraccion: string | null
  patente: string | null
  estado: 'pendiente' | 'pagada'   // fraccionada: 'pagada' solo si TODAS las cuotas están cobradas; si no, 'pendiente'
  monto: number                    // monto efectivo (penalidad si pagada/fraccionada; importe con/sin descuento si pendiente)
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

  // Prefiltro SQL tolerante a acentos + paginado. Antes era
  //     .ilike('conductor_responsable', `%${primerApellido}%`).limit(500)
  // con primerApellido ya normalizado por norm(): para "CARREÑO" mandaba
  // '%CARRENO%' contra un 'CARREÑO' guardado con ñ y la query volvia vacia
  // (ILIKE ignora mayusculas pero no acentos). Ademas el limit cortaba ANTES del
  // filtro fino, asi que en apellidos frecuentes se perdian multas viejas.
  // patronIlikeSinAcentos devuelve un SUPERCONJUNTO del patron anterior: ninguna
  // multa que hoy se muestre puede dejar de mostrarse.
  const patronSql = patronIlikeSinAcentos(primerApellido)
  const traerMultas = async (): Promise<Array<any>> => {
    const PAGE = 1000
    const out: Array<any> = []
    for (let from = 0, guard = 0; guard < 50; guard++, from += PAGE) {
      let q = supabase
        .from('multas_historico')
        .select('id, infraccion, patente, fecha_infraccion, importe, importe_descuento, fecha_vencimiento_descuento, conductor_responsable, created_at')
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .not('conductor_responsable', 'is', null)
      if (patronSql) q = q.ilike('conductor_responsable', `%${patronSql}%`)
      const { data, error } = await q
        .order('fecha_infraccion', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data || []) as Array<any>
      out.push(...rows)
      if (rows.length < PAGE) break
    }
    return out
  }

  const [multasRaw, penRes, perRes] = await Promise.all([
    traerMultas(),
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

  // Monto de la incidencia MÁS RECIENTE por multa (lo realmente enviado a facturar).
  // Si la multa tiene incidencia, ese monto tiene prioridad sobre la lógica de importe/desc.
  const incidenciaMonto = new Map<string, number>()
  const multaIds = filtradas.map(m => m.id)
  if (multaIds.length > 0) {
    const { data: incData } = await (supabase.from('incidencias' as any) as any)
      .select('multa_id, monto, created_at')
      .in('multa_id', multaIds)
    const tmp = new Map<string, { monto: number; fecha: string }>()
    for (const r of (incData || []) as Array<any>) {
      if (r.multa_id == null) continue
      const mid = String(r.multa_id)
      const fecha = r.created_at || ''
      const prev = tmp.get(mid)
      if (!prev || fecha >= prev.fecha) tmp.set(mid, { monto: Number(r.monto) || 0, fecha })
    }
    for (const [k, v] of tmp) incidenciaMonto.set(k, v.monto)
  }

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
      // Fraccionada: se muestran las cuotas. Queda "pagada" solo si TODAS están cobradas.
      cuotas = est.penId ? (cuotasPorPen.get(est.penId) || null) : null
      const todasCobradas = !!cuotas && cuotas.length > 0 && cuotas.every(c => c.aplicado)
      estado = todasCobradas ? 'pagada' : 'pendiente'
      monto = est.monto
    } else {
      // Pendiente: no se pagó, así que no hay semana de pago.
      estado = 'pendiente'
      usaDescuento = descuentoVigente
      monto = usaDescuento ? importeDescuento : importe
      semanaPago = null
    }
    // Si la multa fue enviada a incidencia, el monto se toma de ahí (prioridad).
    const inciMonto = incidenciaMonto.get(String(m.id))
    if (inciMonto != null) monto = inciMonto
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
      .select('concepto_codigo, concepto_descripcion, cantidad, precio_unitario, total, es_descuento')
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
    .map(d => {
      // Se prioriza precio_unitario × cantidad (el valor con centavos que usa la
      // factura para el total_a_pagar). Si no hay unitario/cantidad, se usa el total
      // guardado (que puede venir redondeado a entero).
      const cant = Number(d.cantidad)
      const pu = Number(d.precio_unitario)
      const total = (Number.isFinite(cant) && cant !== 0 && Number.isFinite(pu) && pu !== 0)
        ? cant * pu
        : Number(d.total || 0)
      return {
        nombre: d.concepto_descripcion || d.concepto_codigo || 'Concepto',
        total,
        esDescuento: d.es_descuento === true,
      }
    })

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
  monto: number                 // monto cobrado por el exceso de esa semana (de la incidencia)
  kmExceso: number              // km excedidos según la incidencia (fuente de verdad del cobro)
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
  // OJO: la incidencia/penalidad de exceso de KM se registra la semana SIGUIENTE a la del
  // exceso (se procesa el lunes, cuando ya cerró la semana del km). Por eso `incidencias.semana`
  // es la semana de registro, y la semana REAL del exceso (la que hay que alinear con la fila
  // de km recorridos) es (semana - 1). Sin esto, el exceso aparecía en la semana equivocada.
  const incById = new Map<string, { semana: number | null; monto: number }>()
  const porSemana = new Map<number, ExcesoKmSemana>()
  for (const i of (incs || []) as Array<{ id: unknown; semana: number | null; monto: unknown; km_exceso: unknown }>) {
    const km = Number(i.km_exceso) || 0
    const excesoWeek = i.semana != null ? i.semana - 1 : null
    incById.set(String(i.id), { semana: excesoWeek, monto: parseImporte(i.monto) })
    if (excesoWeek != null) {
      const prev = porSemana.get(excesoWeek)
      if (prev) { prev.monto += parseImporte(i.monto); prev.kmExceso += km }
      else porSemana.set(excesoWeek, { monto: parseImporte(i.monto), kmExceso: km, semanasPago: [] })
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

// Historial de asignaciones de vehículos del conductor (mismo criterio que el
// módulo de Conductores: excluye las asignaciones canceladas).
export interface AsignacionHist {
  id: string
  patente: string | null
  vehiculo: string | null        // marca modelo (año)
  horario: string | null         // diurno / nocturno / todo_dia
  modalidad: string | null       // turno / a_cargo
  estado: string | null          // estado de asignaciones_conductores
  estadoAsig: string | null      // estado de la asignación padre
  fechaInicio: string | null
  fechaFin: string | null
  companero: string | null       // conductor del otro turno en la misma asignación
}
export async function cargarAsignacionesConductor(conductorId: string): Promise<AsignacionHist[]> {
  const { data } = await supabase
    .from('asignaciones_conductores')
    .select('id, asignacion_id, horario, estado, fecha_inicio, fecha_fin, created_at, asignaciones!inner(codigo, estado, modalidad, fecha_inicio, fecha_fin, vehiculos(patente, marca, modelo, anio))')
    .eq('conductor_id', conductorId)
    .not('asignaciones.estado', 'eq', 'cancelada')
    .order('created_at', { ascending: false })

  const rows = (data || []) as Array<any>

  // Compañero: el/los otro/s conductor/es de la misma asignación (el turno opuesto).
  const companerosPorAsig = new Map<string, Set<string>>()
  const asigIds = [...new Set(rows.map(r => r.asignacion_id).filter(Boolean).map(String))]
  if (asigIds.length > 0) {
    const { data: otros } = await supabase
      .from('asignaciones_conductores')
      .select('asignacion_id, conductor_id, conductores(nombres, apellidos)')
      .in('asignacion_id', asigIds)
      .neq('conductor_id', conductorId)
    for (const o of (otros || []) as Array<any>) {
      const c = o.conductores
      const nombre = c ? [c.nombres, c.apellidos].filter(Boolean).join(' ').trim() : ''
      if (!nombre) continue
      const key = String(o.asignacion_id)
      const set = companerosPorAsig.get(key) || new Set<string>()
      set.add(nombre)
      companerosPorAsig.set(key, set)
    }
  }

  return rows.map((r) => {
    const a = r.asignaciones
    const v = a?.vehiculos
    const veh = v ? [v.marca, v.modelo].filter(Boolean).join(' ') + (v.anio ? ` (${v.anio})` : '') : null
    const comp = companerosPorAsig.get(String(r.asignacion_id))
    return {
      id: String(r.id),
      patente: v?.patente ?? a?.codigo ?? null,
      vehiculo: veh || null,
      horario: r.horario ?? null,
      modalidad: a?.modalidad ?? null,
      estado: r.estado ?? null,
      estadoAsig: a?.estado ?? null,
      fechaInicio: r.fecha_inicio ?? a?.fecha_inicio ?? null,
      fechaFin: r.fecha_fin ?? a?.fecha_fin ?? null,
      companero: comp && comp.size > 0 ? [...comp].join(', ') : null,
    }
  })
}

// Historial de bajas y reactivaciones del conductor (tabla conductores_historial_bajas).
export interface BajaHist {
  id: string
  tipoEvento: string             // baja / reactivacion
  estadoAnterior: string | null
  estadoNuevo: string | null
  motivo: string | null
  usuario: string | null
  fecha: string | null
}
export async function cargarHistorialBajasConductor(conductorId: string): Promise<BajaHist[]> {
  const { data } = await (supabase.from('conductores_historial_bajas' as any) as any)
    .select('id, tipo_evento, estado_anterior, estado_nuevo, motivo_baja, usuario_nombre, created_at')
    .eq('conductor_id', conductorId)
    .order('created_at', { ascending: false })
  return ((data || []) as Array<any>).map((r) => ({
    id: String(r.id),
    tipoEvento: r.tipo_evento ?? '',
    estadoAnterior: r.estado_anterior ?? null,
    estadoNuevo: r.estado_nuevo ?? null,
    motivo: r.motivo_baja ?? null,
    usuario: r.usuario_nombre ?? null,
    fecha: r.created_at ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Historial de saldo (kardex de control_saldos)
// Misma fuente y mismo shape que el modal "Control de Saldos" de
// Facturación > Saldos (SaldosAbonosTab.verHistorial), pero en solo lectura.
// ---------------------------------------------------------------------------

export interface SaldoMovimiento {
  id: string
  semana: number | null
  anio: number | null
  tipoMovimiento: string
  montoMovimiento: number
  referencia: string | null
  saldoPendiente: number
  saldoPrevio: number | null      // null en filas viejas (se cae al saldo de la fila siguiente)
  createdAt: string | null
  usuario: string | null
}

// Resumen de la facturación de una semana, para la columna "Facturado" y su detalle.
export interface FacturacionResumenSemana {
  saldoAnterior: number
  subtotalAlquiler: number
  subtotalGarantia: number
  subtotalCargos: number
  subtotalDescuentos: number
  subtotalNeto: number
  totalAPagar: number
}

export interface SaldoKardex {
  movimientos: SaldoMovimiento[]
  saldoActual: number                                  // saldos_conductores.saldo_actual (fallback si no hay kardex)
  cuit: string | null
  facPorSemana: Map<string, FacturacionResumenSemana>  // clave `${anio}-${semana}`
  detalleAbonos: Map<string, string>                   // clave `${referencia}_${monto}` -> referencia del abono
}

export async function cargarKardexSaldoConductor(conductorId: string): Promise<SaldoKardex> {
  const [movRes, factRes, abonosRes, saldoRes] = await Promise.all([
    (supabase.from('control_saldos') as any)
      .select('id, semana, anio, tipo_movimiento, monto_movimiento, referencia, saldo_pendiente, saldo_previo, created_at, created_by_name')
      .eq('conductor_id', conductorId)
      .order('anio', { ascending: false })
      .order('semana', { ascending: false })
      .order('created_at', { ascending: false }),
    (supabase.from('facturacion_conductores') as any)
      .select('id, subtotal_alquiler, subtotal_garantia, subtotal_cargos, subtotal_descuentos, subtotal_neto, saldo_anterior, total_a_pagar, periodo:periodos_facturacion(anio, semana)')
      .eq('conductor_id', conductorId),
    (supabase.from('abonos_conductores' as any) as any)
      .select('referencia, concepto, monto, fecha_abono')
      .eq('conductor_id', conductorId)
      .order('fecha_abono', { ascending: false }),
    (supabase.from('saldos_conductores' as any) as any)
      .select('saldo_actual, conductor_cuit')
      .eq('conductor_id', conductorId)
      .maybeSingle(),
  ])

  const movimientos: SaldoMovimiento[] = ((movRes.data || []) as Array<any>).map((r) => ({
    id: String(r.id),
    semana: r.semana ?? null,
    anio: r.anio ?? null,
    tipoMovimiento: r.tipo_movimiento || 'regularizado',
    montoMovimiento: Number(r.monto_movimiento) || 0,
    referencia: r.referencia ?? null,
    saldoPendiente: Number(r.saldo_pendiente) || 0,
    saldoPrevio: r.saldo_previo === null || r.saldo_previo === undefined ? null : Number(r.saldo_previo) || 0,
    createdAt: r.created_at ?? null,
    usuario: r.created_by_name ?? null,
  }))

  const facPorSemana = new Map<string, FacturacionResumenSemana>()
  for (const f of (factRes.data || []) as Array<any>) {
    const a = f.periodo?.anio
    const s = f.periodo?.semana
    if (!a || !s) continue
    facPorSemana.set(`${a}-${s}`, {
      saldoAnterior: Number(f.saldo_anterior) || 0,
      subtotalAlquiler: Number(f.subtotal_alquiler) || 0,
      subtotalGarantia: Number(f.subtotal_garantia) || 0,
      subtotalCargos: Number(f.subtotal_cargos) || 0,
      subtotalDescuentos: Number(f.subtotal_descuentos) || 0,
      subtotalNeto: Number(f.subtotal_neto) || 0,
      totalAPagar: Number(f.total_a_pagar) || 0,
    })
  }

  const detalleAbonos = new Map<string, string>()
  for (const ab of (abonosRes.data || []) as Array<any>) {
    if (ab.referencia && ab.concepto) detalleAbonos.set(`${ab.concepto}_${ab.monto}`, ab.referencia)
  }

  return {
    movimientos,
    saldoActual: Number(saldoRes?.data?.saldo_actual) || 0,
    cuit: saldoRes?.data?.conductor_cuit ?? null,
    facPorSemana,
    detalleAbonos,
  }
}

// Saldo vigente del conductor = saldo del ÚLTIMO movimiento del kardex. Si no hay
// kardex, cae al saldo_actual de saldos_conductores. Signo tal cual la BD:
// positivo = a favor del conductor, negativo = deuda. Los centavos residuales
// (<$1) se aplanan a 0 para no mostrar saldos tipo $0,03.
export function saldoActualKardex(k: SaldoKardex | null): number {
  if (!k) return 0
  const v = k.movimientos.length > 0 ? k.movimientos[0].saldoPendiente : k.saldoActual
  return Math.abs(v) < 1 ? 0 : v
}

// ---------------------------------------------------------------------------
// Historial de garantía (kardex de control_garantias)
// Misma fuente que el modal "Estado de Garantía" de Facturación > Garantías
// (GarantiasTab.abrirKardex), pero en solo lectura.
// ---------------------------------------------------------------------------

export interface SemanaFacturacionGarantia {
  semana: number
  anio: number
  subtotalGarantia: number
  fecha: string
  estado: string
  fechaCierre: string | null
}

export interface GarantiaKardex {
  garantia: GarantiaConductor | null          // null = el conductor no tiene garantía cargada
  movimientos: ControlGarantiaRow[]
  semanasFacturacion: SemanaFacturacionGarantia[]
}

export async function cargarGarantiaConductor(conductorId: string, dni: string | null): Promise<GarantiaKardex> {
  const { data } = await (supabase.from('garantias_conductores' as any) as any)
    .select('*')
    .eq('conductor_id', conductorId)
    .order('created_at', { ascending: false })
    .limit(1)

  const garantia = (data && data.length > 0 ? data[0] : null) as GarantiaConductor | null
  if (!garantia) return { garantia: null, movimientos: [], semanasFacturacion: [] }

  const [movimientos, semanasFacturacion] = await Promise.all([
    getKardexGarantia(garantia.id).catch(() => [] as ControlGarantiaRow[]),
    getFacturacionGarantiaConductor(garantia.conductor_dni || dni || '').catch(() => [] as SemanaFacturacionGarantia[]),
  ])

  return { garantia, movimientos, semanasFacturacion }
}

// Una fila por semana del historial de garantía: combina cuota_facturada +
// pago_aplicado de esa semana (mismo criterio que GarantiasTab).
export interface FilaGarantiaSemana {
  key: string
  anio: number
  semana: number
  fecha: string
  cuotaRef: number
  montoCuota: number             // la cuota P003 cobrada esa semana
  aplicado: number               // cuánto del pago Cabify se aplicó realmente
  estadoFila: 'cubierta' | 'parcial' | 'no-cubierta' | 'otro'
  tipoMovimiento: string
  referencia: string
  esExcedenteReal: boolean       // el acumulado cronológico supera monto_total
}

export type EstadoGarantia = 'pendiente' | 'en_curso' | 'completada' | 'cancelada' | 'suspendida' | 'en_devolucion'

export interface GarantiaResumen {
  montoTotal: number
  montoCuotaFijo: number
  totalRealPagado: number
  excedente: number
  tieneExcedente: boolean
  deudaReal: number
  tieneDeuda: boolean
  filas: FilaGarantiaSemana[]                 // de la semana más reciente a la más antigua
  cuotasPagadas: number
  cuotasNecesarias: number
  cuotasRestantes: number
  montoRestante: number
  ultimaSemanaPago: { semana: number; anio: number } | null   // última cuota facturada (cerrada o no)
  ultimaCuotaNumero: number | null
  estado: EstadoGarantia
  semanaCerrada: (anio: number, semana: number) => boolean
  fechaCierreSemana: (anio: number, semana: number) => string | null
}

// Cálculo derivado del kardex de garantía. Es PURO (no toca la BD) para que lo
// compartan los KPIs del modal y la pestaña "Historial de garantía" con una sola
// carga. Replica la lógica del modal "Estado de Garantía" de Facturación.
export function calcularResumenGarantia(k: GarantiaKardex, conductorActivo: boolean): GarantiaResumen | null {
  const g = k.garantia
  if (!g) return null

  const facturado = Number(g.monto_realmente_pagado || g.monto_pagado) || 0
  const montoTotal = Number(g.monto_total) || 1
  const montoTotalGarantia = Number(g.monto_total) || 1000000
  const montoCuotaFijo = Number(g.monto_cuota_semanal) || 50000

  // Estado de cierre por semana (fuente de verdad: periodos_facturacion). Sin info
  // de período (semana histórica sin facturación) se considera cerrada y cuenta.
  const periodoInfo = new Map<string, { estado: string; fechaCierre: string | null }>()
  for (const sf of k.semanasFacturacion) periodoInfo.set(`${sf.anio}-${sf.semana}`, { estado: sf.estado, fechaCierre: sf.fechaCierre })
  const semanaCerrada = (anio: number, semana: number) => {
    const info = periodoInfo.get(`${anio}-${semana}`)
    return !info || info.estado === 'cerrado'
  }
  const fechaCierreSemana = (anio: number, semana: number) => periodoInfo.get(`${anio}-${semana}`)?.fechaCierre || null

  // Deuda real = suma de delta_deuda (solo se llena cuando un pago Cabify no cubrió
  // la cuota completa; una cuota facturada sin pago aún no es deuda).
  const deudaReal = Math.max(0, k.movimientos.reduce((s, r) => s + (Number(r.delta_deuda) || 0), 0))

  // Consolidar el kardex: 1 fila por semana.
  const mapa = new Map<string, FilaGarantiaSemana>()
  for (const r of k.movimientos) {
    const key = `${r.anio}-${r.semana}`
    const existente = mapa.get(key)
    const f: FilaGarantiaSemana = existente ?? {
      key,
      anio: Number(r.anio) || 0,
      semana: Number(r.semana) || 0,
      fecha: r.created_at || '',
      cuotaRef: Number(r.cuotas_facturadas) || 0,
      montoCuota: 0,
      aplicado: 0,
      estadoFila: 'no-cubierta',
      tipoMovimiento: r.tipo_movimiento,
      referencia: r.referencia || '',
      esExcedenteReal: false,
    }
    if (!existente) mapa.set(key, f)
    if (r.created_at && r.created_at > f.fecha) f.fecha = r.created_at
    if (r.tipo_movimiento === 'cuota_facturada') {
      f.montoCuota += Number(r.monto_facturado) || 0
      if (Number(r.cuotas_facturadas) > f.cuotaRef) f.cuotaRef = Number(r.cuotas_facturadas)
    }
    if (r.tipo_movimiento === 'pago_aplicado') {
      f.aplicado += Number(r.monto_pagado_real) || 0
      if (r.referencia) f.referencia = r.referencia
    }
    if (r.tipo_movimiento === 'ajuste_manual' || r.tipo_movimiento === 'eliminacion') f.estadoFila = 'otro'
  }

  // Inyectar semanas de facturacion_conductores que no están en el kardex, en orden
  // cronológico real, para que el acumulado no se infle con entradas posteriores.
  const semanasOrdenadas = [...k.semanasFacturacion].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.semana - b.semana))
  const kardexOrdenado = [...mapa.values()].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.semana - b.semana))
  let acumuladoExtra = 0
  let idx = 0
  for (const sf of semanasOrdenadas) {
    const key = `${sf.anio}-${sf.semana}`
    while (idx < kardexOrdenado.length) {
      const kf = kardexOrdenado[idx]
      if (kf.anio < sf.anio || (kf.anio === sf.anio && kf.semana < sf.semana)) { acumuladoExtra += kf.montoCuota || 0; idx++ }
      else break
    }
    if (!mapa.has(key)) {
      const esExcedente = acumuladoExtra >= montoTotalGarantia
      mapa.set(key, {
        key,
        anio: sf.anio,
        semana: sf.semana,
        fecha: sf.fecha || '',
        cuotaRef: 0,
        montoCuota: sf.subtotalGarantia,
        aplicado: 0,
        estadoFila: 'no-cubierta',
        tipoMovimiento: esExcedente ? 'facturacion' : 'cuota_facturada',
        referencia: esExcedente ? 'Cobro via facturación' : 'Cuota sin kardex',
        esExcedenteReal: false,
      })
      acumuladoExtra += sf.subtotalGarantia
    }
  }

  // Estado de cada fila contra el valor fijo de la cuota.
  for (const f of mapa.values()) {
    if (f.estadoFila === 'otro') continue
    const objetivo = f.montoCuota > 0 ? f.montoCuota : montoCuotaFijo
    f.montoCuota = objetivo
    if (f.aplicado >= objetivo - 0.01) f.estadoFila = 'cubierta'
    else if (f.aplicado > 0.01) f.estadoFila = 'parcial'
    else f.estadoFila = 'no-cubierta'
  }

  // Nº de cuota secuencial en orden cronológico (se ignora cuotas_facturadas de la BD
  // para evitar saltos por filas stale o contadores reseteados).
  const cronologicas = [...mapa.values()].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.semana - b.semana))
  let contador = 0
  for (const f of cronologicas) {
    if (f.tipoMovimiento === 'cuota_facturada') { contador++; f.cuotaRef = contador }
  }
  const cuotasNecesarias = contador

  // Marcar filas que superan el objetivo en orden cronológico.
  let acum = 0
  for (const f of cronologicas) { acum += f.montoCuota || 0; f.esExcedenteReal = acum > montoTotal }

  const filas = [...mapa.values()].sort((a, b) => (a.anio !== b.anio ? b.anio - a.anio : b.semana - a.semana))

  // Total real pagado: solo semanas cerradas. La semana en curso se muestra pero no suma.
  const suma = filas.reduce((s, f) => (semanaCerrada(f.anio, f.semana) ? s + (f.montoCuota || 0) : s), 0)
  const totalRealPagado = suma > 0 ? suma : facturado
  const excedente = totalRealPagado - montoTotal

  const cuotasPagadas = filas.filter(f => f.tipoMovimiento === 'cuota_facturada' && semanaCerrada(f.anio, f.semana)).length
  const cuotasRestantes = Math.max(0, cuotasNecesarias - cuotasPagadas)
  const montoRestante = Math.max(0, montoTotal - totalRealPagado)

  // Última cuota facturada: la semana más reciente con cobro de garantía, esté
  // cerrada o no (filas ya viene de la más reciente a la más antigua).
  const ultimaCuota = filas.find(f => f.tipoMovimiento === 'cuota_facturada') || null

  // Estado: el guardado en BD, salvo que el conductor esté de baja con monto pagado
  // (ahí es devolución, igual que la vista de Garantías, que tampoco lo persiste).
  const necesitaDevolucion = !conductorActivo && totalRealPagado > 0 && g.estado !== 'cancelada'
  const estado = (necesitaDevolucion ? 'en_devolucion' : g.estado) as EstadoGarantia

  return {
    montoTotal,
    montoCuotaFijo,
    totalRealPagado,
    excedente,
    tieneExcedente: excedente > 1,
    deudaReal,
    tieneDeuda: deudaReal > 1,
    filas,
    cuotasPagadas,
    cuotasNecesarias,
    cuotasRestantes,
    montoRestante,
    ultimaSemanaPago: ultimaCuota ? { semana: ultimaCuota.semana, anio: ultimaCuota.anio } : null,
    ultimaCuotaNumero: ultimaCuota ? ultimaCuota.cuotaRef : null,
    estado,
    semanaCerrada,
    fechaCierreSemana,
  }
}

// Etiqueta y color del estado de la garantía (mismos que el módulo de Facturación).
export const ESTADO_GARANTIA_UI: Record<string, { label: string; color: string; bg: string }> = {
  completada: { label: 'Completada', color: '#16a34a', bg: '#dcfce7' },
  en_curso: { label: 'En curso', color: '#b45309', bg: '#fef3c7' },
  en_devolucion: { label: 'En devolución', color: '#2563eb', bg: '#dbeafe' },
  pendiente: { label: 'Pendiente', color: '#6b7280', bg: '#f3f4f6' },
  cancelada: { label: 'Cancelada', color: '#dc2626', bg: '#fee2e2' },
  suspendida: { label: 'Suspendida', color: '#6b7280', bg: '#f3f4f6' },
}
