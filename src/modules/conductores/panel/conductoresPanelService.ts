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
import { filtrarSede, realesSiTodas } from '../../../utils/sedesReales'
import { FILTRO_SIN_INTERNOS } from '../../../utils/conductorUtils'
import { cabifyHistoricalService } from '../../../services/cabifyHistoricalService'
import { cargarAppsPagoSemana, etiquetasApps } from '../../../services/appsPagoService'
import { normalizeDni, normalizeLicencia, normalizeNombre } from '../../../utils/normalizeDocuments'
import { calcularKmSemanaConductores } from '../../portal/kmRecorridos'

import { fechaISOART, hoyART, lunesSemanaART } from '../../../utils/fechaArgentina'
// Ingresos de Cabify del periodo consultado. MISMA fuente que el modulo
// Integraciones > Cabify (cabifyHistoricalService), para que los numeros coincidan.
// Kilometros de Cabify: null significa "sin dato", que NO es lo mismo que 0 km.
// La suma conserva el null: si ninguna cuenta del conductor tiene kilometros,
// el total sigue siendo null y la tabla muestra "—".
const kmPanel = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v)
const sumKmPanel = (acc: number | null, v: number | null | undefined): number | null =>
  v === null || v === undefined ? acc : (acc ?? 0) + Number(v)

export interface CabifyIngresos {
  gananciaTotal: number      // ganancia_total (columna "Total" del modulo Cabify)
  viajesFinalizados: number
  cobroEfectivo: number
  cobroApp: number
  peajes: number
  kmTotal: number | null       // km_conectado: todo lo recorrido con la app encendida
  kmAsignado: number | null    // km_con_viaje: con un viaje asignado
  kmSinAsignar: number | null  // km_sin_viaje: conectado pero sin viaje asignado
}

export interface ConductorPanelRow {
  id: string
  nombre: string
  nombres: string | null
  apellidos: string | null
  dni: string | null
  ruc: string | null                // CUIT (RUC)
  telefono: string | null           // el de WhatsApp (conductores.telefono_contacto)
  telefonoSecundario: string | null // conductores.telefono_secundario
  guia: string | null               // guía del lead de origen o quien lo convirtió (conductores.guia)
  referido: boolean                 // conductores.referido
  embajador: string | null          // nombre de quien lo refirió (conductores.embajador_id)
  estadoCodigo: string | null
  activo: boolean
  categoriaLicencia: string | null       // B1 / D1 / Otros (conductores.categoria_licencia)
  categoriaLicenciaOtra: string | null   // detalle cuando es Otros (ej. "D2")
  tieneAsignacion: boolean
  vehiculoAsignado: string | null   // patente del auto asignado ahora mismo
  /** Nuevo: tiene auto y su primera asignación arrancó esta semana (desde el lunes) */
  nuevoEstaSemana?: boolean
  grupoFlotaAsignado: string | null // grupo de flota (razon social) de ese auto
  turno: string | null              // horario de la asignacion actual (diurno/nocturno/todo_dia)
  cantidadMultas: number
  vehiculos: string[]        // patentes distintas de sus multas
  // Tres estados EXCLUYENTES, misma logica que el modulo de Multas / Mi Espacio:
  //  - pendiente: sin penalidad de pago (no pagada ni fraccionada)
  //  - enProceso: penalidad fraccionada (en cuotas, sin saldar)
  //  - pagada: penalidad no fraccionada, aplicada en periodo cerrado
  pendientes: number
  enProceso: number
  pagadas: number
  // Montos por estado. Pendiente usa el importe de la multa (con descuento si vigente);
  // enProceso y pagada usan el monto facturado (penalidad).
  montoPendiente: number
  montoEnProceso: number
  montoPagado: number
  montoTotalMultas: number   // = montoPendiente + montoEnProceso + montoPagado
  // --- Saldo (kardex control_saldos) y garantía ---
  // Saldo del ULTIMO movimiento del kardex, con el signo tal cual lo guarda la BD:
  // positivo = a favor del conductor, negativo = deuda. Si no tiene kardex, cae al
  // saldo_actual de saldos_conductores (mismo criterio que el modal de detalle).
  ultimoSaldo: number
  saldoPendiente: number      // deuda como numero positivo = max(0, -ultimoSaldo)
  saldoAFavor: number         // a favor como numero positivo = max(0, ultimoSaldo)
  garantiaPagada: number      // monto_realmente_pagado (o monto_pagado) de la garantia
  garantiaTotal: number       // monto_total objetivo de la garantia (0 si no tiene)
  tieneGarantia: boolean
  // Cuanto de la deuda queda SIN cubrir si se aplica el fondo de garantia.
  // Positivo = todavia debe; <= 0 = la garantia alcanza.
  saldoMenosGarantia: number
  // --- Ingresos Cabify (opcional) ---
  // undefined = no se pidieron (el llamador no paso opciones.cabify).
  // null      = se pidieron, pero el conductor no cruzo con ningun registro Cabify.
  cabify?: CabifyIngresos | null
  /** Apps con las que trabajó la última semana cerrada (hoy solo 'Cabify'; DiDi más adelante). */
  apps?: string[]
  /** Si `apps` es la última app conocida (sin pagos por app la semana pasada): su semana, «S45/2026» */
  appsUltimaSemana?: string
  // Km de GPS de la semana de Cabify. undefined si no se pidio Cabify;
  // null si se pidio y ese conductor no tuvo viajes con GPS esa semana.
  kmGeo?: number | null
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

interface CuentaCabify {
  dni: string | null
  nombre: string | null
  apellido: string | null
}

// Cuentas de Cabify (dni ya traducido, nombre, apellido) con actividad desde `desde`.
// Rápido: la función panel_cuentas_cabify (sql/panel_conductores_cuentas_cabify.sql)
// devuelve una fila por cuenta. Si todavía no existe, se baja el histórico completo
// de la ventana y se traducen los hash acá, como antes. Si todo falla, sin cuentas.
async function cargarCuentasCabify(desde: string): Promise<CuentaCabify[]> {
  try {
    return await fetchAll<CuentaCabify>((from, to) =>
      (supabase.rpc as any)('panel_cuentas_cabify', { p_desde: desde }).range(from, to))
  } catch {
    const [historico, mapeo] = await Promise.all([
      fetchAll<CuentaCabify>((from, to) =>
        supabase.from('cabify_historico').select('dni, nombre, apellido')
          .gte('fecha_inicio', desde).order('fecha_inicio').range(from, to)).catch(() => []),
      fetchAll<{ cabify_hash: string; dni_real: string | null }>((from, to) =>
        supabase.from('cabify_dni_mapeo').select('cabify_hash, dni_real').range(from, to)).catch(() => []),
    ])
    const dniDeHash = new Map(mapeo.map(m => [m.cabify_hash, m.dni_real]))
    return historico.map(c => ({
      ...c,
      dni: c.dni?.startsWith('CABIFY_') ? dniDeHash.get(c.dni) || null : c.dni,
    }))
  }
}

interface RawConductor {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  numero_cuit: string | null
  telefono_contacto?: string | null
  telefono_secundario?: string | null
  numero_licencia: string | null
  categoria_licencia?: string | null
  categoria_licencia_otra?: string | null
  referido?: boolean | null
  embajador_id?: string | null
  conductores_estados: { codigo: string | null } | null
}

interface RawMulta {
  id: number | string
  patente: string | null
  importe: unknown
  importe_descuento: unknown
  fecha_vencimiento_descuento: string | null
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

export interface PanelOpciones {
  // Rango de fechas (YYYY-MM-DD) de Cabify a incluir. Si NO se pasa, Cabify no se
  // consulta y las filas quedan con `cabify: undefined` (los modulos de mapa, que
  // tambien usan este servicio, no pagan esa consulta).
  cabify?: { startDate: string; endDate: string }
  // Etiqueta de app (Cabify / DiDi): con qué app pagó, misma regla que Facturación
  // (appsPagoService). `inicio` = lunes de la semana en curso ("YYYY-MM-DD"): cuenta
  // la carga de Pagos Cabify / DiDi de la última semana cerrada + pagos manuales de esta.
  appsPago?: { inicio: string }
  // true = no calcula KM GEO (kmGeo queda undefined): el llamador lo pide aparte con
  // cargarKmGeoPanel para mostrar la tabla sin esperar los viajes de GPS.
  sinKmGeo?: boolean
}

/**
 * KM GEO de la semana por conductor, aparte del panel (misma cuenta que hace
 * cargarPanelConductores). Trae su propia lista de conductores (mismo filtro y
 * sede) para arrancar en paralelo con la carga principal.
 */
export async function cargarKmGeoPanel(
  sedeId: string | null | undefined,
  semana: { startDate: string; endDate: string },
): Promise<Map<string, number>> {
  const reales = await realesSiTodas(sedeId)
  const conductores = fetchAll<{ id: string; nombres: string | null; apellidos: string | null }>((from, to) => {
    let q = supabase
      .from('conductores')
      .select('id, nombres, apellidos').not(...FILTRO_SIN_INTERNOS)
      .range(from, to)
    q = filtrarSede(q, sedeId, reales)
    return q
  })
  conductores.catch(() => {}) // si el calculo corta antes de usarla, que no quede sin manejar
  return calcularKmSemanaConductores(
    supabase,
    conductores,
    { inicio: semana.startDate.slice(0, 10), fin: semana.endDate.slice(0, 10) },
  )
}

/**
 * Carga y agrega el panel de conductores.
 * @param sedeId    si se pasa, filtra conductores por sede.
 * @param opciones  bloques opcionales de datos extra (ver PanelOpciones).
 */
/**
 * Apps de la fila (2026-11-18):
 *  - Cabify: si tiene la cuenta relacionada en Cabify (figura en cabify_historico en las
 *    últimas 9 semanas). Es más seguro que el pago.
 *  - DiDi: por los pagos (todavía no hay API de DiDi), misma regla que Facturación. Si
 *    la semana pasada no pagó por DiDi, es la última conocida y se ve en gris.
 */
function appsDelConductor(
  pago: Parameters<typeof etiquetasApps>[0],
  hayDatosPago: boolean,
  tieneCuentaCabify: boolean,
): { apps?: string[]; appsUltimaSemana?: string } {
  if (!hayDatosPago) return { apps: undefined, appsUltimaSemana: undefined }
  const apps = [...(tieneCuentaCabify ? ['Cabify'] : []), ...(pago?.didi ? ['DiDi'] : [])]
  return { apps, appsUltimaSemana: pago?.didi ? pago?.ultimaSemana : undefined }
}

export async function cargarPanelConductores(
  sedeId?: string | null,
  opciones?: PanelOpciones,
): Promise<ConductorPanelRow[]> {
  // Con "Todas" (sin sedeId) se usan solo las sedes reales, sin Pruebas
  const reales = await realesSiTodas(sedeId)
  // Las 5 consultas son independientes entre si: se lanzan EN PARALELO para no
  // sumar la latencia de cada una (antes iban en serie). Los datos traidos y el
  // procesamiento posterior son identicos; solo cambia el "cuando" se piden.
  const [conductores, asignacionesCond, multas, penalidades, periodos, kardexSaldos, saldosResumen, garantias, cabifyDrivers, guias, appsPago] = await Promise.all([
    // 1. Conductores (con estado y dni).
    fetchAll<RawConductor>((from, to) => {
      let q = supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit, telefono_contacto, telefono_secundario, numero_licencia, categoria_licencia, categoria_licencia_otra, referido, embajador_id, conductores_estados(codigo)').not(...FILTRO_SIN_INTERNOS)
        .range(from, to)
      q = filtrarSede(q, sedeId, reales)
      return q
    }),
    // 2. Asignacion ACTUAL (auto asignado ahora mismo). Mismo criterio que
    // ConductoresModule: fila de asignaciones_conductores en estado asignado/activo,
    // cuya asignacion esta activo/activa, y con vehiculo. Filtra por sede.
    fetchAll<{
      conductor_id: string | null
      estado: string | null
      horario: string | null
      asignaciones: { estado: string | null; sede_id: string | null; modalidad: string | null; vehiculos: { patente: string | null; grupo_flota: string | null } | null } | null
    }>((from, to) =>
      supabase
        .from('asignaciones_conductores')
        .select('conductor_id, estado, horario, asignaciones(estado, sede_id, modalidad, vehiculos(patente, grupo_flota))')
        .not('conductor_id', 'is', null)
        // Solo las vigentes (el mismo filtro se aplica abajo): antes se traía todo el historial
        .in('estado', ['asignado', 'activo'])
        .range(from, to)
    ),
    // 3. Multas activas con responsable cargado (no borradas, no desestimadas).
    fetchAll<RawMulta>((from, to) =>
      supabase
        .from('multas_historico')
        .select('id, patente, importe, importe_descuento, fecha_vencimiento_descuento, conductor_responsable')
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .not('conductor_responsable', 'is', null)
        .range(from, to)
    ),
    // 4. Penalidades -> estado de pago por (conductor_id, multa_id).
    fetchAll<RawPenalidad>((from, to) =>
      supabase
        .from('penalidades')
        .select('conductor_id, monto, semana_aplicacion, anio_aplicacion, aplicado, rechazado, fraccionado, incidencias!inner(multa_id)')
        .not('incidencias.multa_id', 'is', null)
        .range(from, to)
    ),
    // 5. Periodos cerrados (para clasificar pagada, misma logica que Mi Espacio / Multas).
    // Solo los de la sede: un cierre en otra sede (Pruebas) no marca multas como pagadas.
    fetchAll<{ semana: number; anio: number }>((from, to) => {
      let q = supabase.from('periodos_facturacion').select('semana, anio').eq('estado', 'cerrado')
      q = filtrarSede(q, sedeId, reales)
      return q.range(from, to)
    }),
    // 6. Kardex de saldos, ordenado de mas reciente a mas viejo: la PRIMERA fila de
    // cada conductor es su ultimo saldo. Mismo criterio que el hero de la pestaña
    // "Historial de saldo" del modal de detalle (por eso los numeros coinciden).
    // Optimización: la vista v_ultimo_saldo_conductor (sql/panel_conductores_rapido.sql)
    // devuelve una fila por conductor. Si todavía no existe, se lee el kardex completo.
    fetchAll<{ conductor_id: string | null; saldo_pendiente: unknown }>((from, to) =>
      (supabase.from('v_ultimo_saldo_conductor' as any) as any)
        .select('conductor_id, saldo_pendiente')
        .range(from, to)
    ).catch(() => fetchAll<{ conductor_id: string | null; saldo_pendiente: unknown }>((from, to) =>
      (supabase.from('control_saldos') as any)
        .select('conductor_id, saldo_pendiente')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)
    )),
    // 7. Resumen de saldos: fallback para conductores sin movimientos en el kardex.
    fetchAll<{ conductor_id: string | null; saldo_actual: unknown }>((from, to) =>
      (supabase.from('saldos_conductores') as any)
        .select('conductor_id, saldo_actual')
        .range(from, to)
    ),
    // 8. Garantias: monto objetivo y monto realmente pagado (el mismo valor que
    // muestra la tabla del modulo Facturacion > Garantias).
    fetchAll<{ conductor_id: string | null; monto_total: unknown; monto_pagado: unknown; monto_realmente_pagado: unknown }>((from, to) =>
      (supabase.from('garantias_conductores') as any)
        .select('conductor_id, monto_total, monto_pagado, monto_realmente_pagado')
        .range(from, to)
    ),
    // 9. Ingresos Cabify del rango pedido (solo si el llamador los pide). Se reusa
    // el servicio del modulo Integraciones > Cabify: ya deduplica por (dni, dia),
    // excluye de BA las companias que llegan por Bariloche y filtra por identidad
    // de sede. Si falla, el panel sigue cargando y las columnas quedan en blanco.
    opciones?.cabify
      ? cabifyHistoricalService
          .getDriversData(opciones.cabify.startDate, opciones.cabify.endDate, { sedeId })
          .then(r => r.drivers)
          .catch(() => [])
      : Promise.resolve(null),
    // 10. Guía de cada conductor (conductores.guia, sql/conductores_guia.sql). Aparte y
    // tolerante: si la columna todavía no existe, el panel carga igual.
    fetchAll<{ id: string; guia: string | null }>((from, to) => {
      let q = (supabase.from('conductores') as any)
        .select('id, guia')
        .not('guia', 'is', null)
        .range(from, to)
      q = filtrarSede(q, sedeId, reales)
      return q
    }).catch(() => [] as { id: string; guia: string | null }[]),
    // 11. Apps con las que pagó (solo para la etiqueta de app). Tolerante: si falla,
    // la columna queda en "…" y el panel carga igual.
    opciones?.appsPago
      ? cargarAppsPagoSemana(opciones.appsPago.inicio, undefined, { ultimaConocida: true }).catch(() => null)
      : Promise.resolve(null),
  ])

  // 12. Cuenta Cabify relacionada: el conductor figura en cabify_historico (los datos de
  // Cabify que se sincronizan) en las últimas 9 semanas, la misma ventana que DiDi.
  // Algunos vienen con el DNI como hash (CABIFY_...): se traducen con cabify_dni_mapeo.
  const desdeCabify = new Date(Date.now() - 63 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const cuentasCabify = opciones?.appsPago ? await cargarCuentasCabify(desdeCabify) : []
  const guiaPorConductor = new Map(guias.map(g => [g.id, g.guia]))

  // 13. Embajador (quién lo refirió). El nombre sale de los conductores ya cargados; los
  // de otra sede se piden aparte. Tolerante: si falla, queda "Sí" sin nombre.
  const nombreConductor = (c: { nombres: string | null; apellidos: string | null }) =>
    `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim()
  const nombrePorId = new Map(conductores.map(c => [c.id, nombreConductor(c)]))
  const faltanEmbajadores = [...new Set(conductores
    .map(c => (c.referido ? c.embajador_id : null))
    .filter((id): id is string => !!id && !nombrePorId.has(id)))]
  for (let i = 0; i < faltanEmbajadores.length; i += 200) {
    const { data } = await (supabase.from('conductores') as any)
      .select('id, nombres, apellidos')
      .in('id', faltanEmbajadores.slice(i, i + 200))
    for (const c of (data || []) as { id: string; nombres: string | null; apellidos: string | null }[]) {
      nombrePorId.set(c.id, nombreConductor(c))
    }
  }

  // Ultimo saldo por conductor: primera aparicion en el kardex ya ordenado desc.
  const ultimoSaldoPorConductor = new Map<string, number>()
  for (const r of kardexSaldos) {
    if (!r.conductor_id) continue
    if (ultimoSaldoPorConductor.has(r.conductor_id)) continue
    ultimoSaldoPorConductor.set(r.conductor_id, Number(r.saldo_pendiente) || 0)
  }
  const saldoResumenPorConductor = new Map<string, number>()
  for (const r of saldosResumen) {
    if (!r.conductor_id) continue
    saldoResumenPorConductor.set(r.conductor_id, Number(r.saldo_actual) || 0)
  }
  // Garantia por conductor (si hay mas de una, gana la de mayor monto pagado).
  const garantiaPorConductor = new Map<string, { pagada: number; total: number }>()
  for (const gr of garantias) {
    if (!gr.conductor_id) continue
    const pagada = Number(gr.monto_realmente_pagado) || Number(gr.monto_pagado) || 0
    const total = Number(gr.monto_total) || 0
    const prev = garantiaPorConductor.get(gr.conductor_id)
    if (!prev || pagada > prev.pagada) garantiaPorConductor.set(gr.conductor_id, { pagada, total })
  }

  // Ingresos Cabify por conductor. NO hay FK entre Cabify y conductores: el cruce
  // se resuelve por identidad normalizada en cascada DNI -> licencia -> nombre
  // completo, el MISMO criterio que asignacionesService.getAllAsignacionesActivasIndex
  // usa en el modulo de Cabify. Un conductor puede cruzar con mas de una cuenta
  // Cabify (la agregacion devuelve una fila por cuenta+DNI): en ese caso se SUMAN.
  const cabifyPorConductor = new Map<string, CabifyIngresos>()
  const porDni = new Map<string, string>()       // dni normalizado -> conductorId
  const porLicencia = new Map<string, string>()
  const porNombre = new Map<string, string>()
  for (const c of conductores) {
    const d = normalizeDni(c.numero_dni)
    if (d && !porDni.has(d)) porDni.set(d, c.id)
    const l = normalizeLicencia(c.numero_licencia)
    if (l && !porLicencia.has(l)) porLicencia.set(l, c.id)
    const n = normalizeNombre(`${c.nombres || ''} ${c.apellidos || ''}`)
    if (n && !porNombre.has(n)) porNombre.set(n, c.id)
  }
  const conductorDeCabify = (d: { nationalIdNumber?: string | null; driverLicense?: string | null; name?: string | null; surname?: string | null }) =>
    porDni.get(normalizeDni(d.nationalIdNumber)) ||
    porLicencia.get(normalizeLicencia(d.driverLicense)) ||
    porNombre.get(normalizeNombre(`${d.name || ''} ${d.surname || ''}`))
  const conCuentaCabify = new Set<string>()
  for (const cta of cuentasCabify) {
    const cid = conductorDeCabify({ nationalIdNumber: cta.dni, name: cta.nombre, surname: cta.apellido })
    if (cid) conCuentaCabify.add(cid)
  }
  if (cabifyDrivers) {
    for (const d of cabifyDrivers) {
      const cid = conductorDeCabify(d)
      if (!cid) continue
      const prev = cabifyPorConductor.get(cid)
      if (prev) {
        prev.gananciaTotal += Number(d.gananciaTotal) || 0
        prev.viajesFinalizados += Number(d.viajesFinalizados) || 0
        prev.cobroEfectivo += Number(d.cobroEfectivo) || 0
        prev.cobroApp += Number(d.cobroApp) || 0
        prev.peajes += Number(d.peajes) || 0
        prev.kmTotal = sumKmPanel(prev.kmTotal, d.kmConectado)
        prev.kmAsignado = sumKmPanel(prev.kmAsignado, d.kmConViaje)
        prev.kmSinAsignar = sumKmPanel(prev.kmSinAsignar, d.kmSinViaje)
      } else {
        cabifyPorConductor.set(cid, {
          gananciaTotal: Number(d.gananciaTotal) || 0,
          viajesFinalizados: Number(d.viajesFinalizados) || 0,
          cobroEfectivo: Number(d.cobroEfectivo) || 0,
          cobroApp: Number(d.cobroApp) || 0,
          peajes: Number(d.peajes) || 0,
          kmTotal: kmPanel(d.kmConectado),
          kmAsignado: kmPanel(d.kmConViaje),
          kmSinAsignar: kmPanel(d.kmSinViaje),
        })
      }
    }
  }

  // Asignacion actual -> vehiculo + turno por conductor (mismo criterio que antes).
  const vehiculoPorConductor = new Map<string, string>()
  const grupoFlotaPorConductor = new Map<string, string>()
  const turnoPorConductor = new Map<string, string>()
  for (const ac of asignacionesCond) {
    const a = ac.asignaciones
    if (!a || !['activo', 'activa'].includes(a.estado || '')) continue
    if (!['asignado', 'activo'].includes(ac.estado || '')) continue
    if (sedeId ? a.sede_id !== sedeId : (reales && !reales.includes(a.sede_id || ''))) continue
    if (!ac.conductor_id || !a.vehiculos?.patente) continue
    if (!vehiculoPorConductor.has(ac.conductor_id)) {
      vehiculoPorConductor.set(ac.conductor_id, a.vehiculos.patente)
      const grupoFlota = a.vehiculos.grupo_flota?.trim()
      if (grupoFlota) grupoFlotaPorConductor.set(ac.conductor_id, grupoFlota)
      // Turno = modalidad "a cargo" -> 'a_cargo'; si no, el horario (diurno/nocturno).
      // (El horario 'todo_dia' corresponde a la modalidad a_cargo.)
      const turno = (a.modalidad === 'a_cargo' || ac.horario === 'todo_dia') ? 'a_cargo' : ac.horario
      if (turno) turnoPorConductor.set(ac.conductor_id, turno)
    }
  }

  // Nuevos de la semana (punto azul): con auto asignado y que arrancaron desde el lunes
  //  - su PRIMERA asignación (de todo su historial, sin las canceladas), o
  //  - una asignación activa a la que entró con Carta Oferta, si vuelve después de más de
  //    30 días sin auto (p. ej. alguien que trabajó hace meses). Si dejó el auto hace unos
  //    días y vuelve, no es nuevo aunque la asignación diga Carta Oferta.
  // Un cambio de auto (Anexo) no cuenta.
  const nuevosEstaSemana = new Set<string>()
  try {
    const conAuto = [...vehiculoPorConductor.keys()]
    const lunes = lunesSemanaART()
    const DIAS_PARA_VOLVER_COMO_NUEVO = 30
    type FilaNuevo = { conductor_id: string; estado: string | null; fecha_inicio: string | null; fecha_fin: string | null; documento: string | null; asignaciones: { estado: string | null; fecha_inicio: string | null; fecha_inicio_real: string | null; fecha_fin: string | null } | null }
    const porConductor = new Map<string, FilaNuevo[]>()
    for (let i = 0; i < conAuto.length; i += 200) {
      const lote = conAuto.slice(i, i + 200)
      const filas = await fetchAll<FilaNuevo>((from, to) =>
        supabase
          .from('asignaciones_conductores')
          .select('conductor_id, estado, fecha_inicio, fecha_fin, documento, asignaciones(estado, fecha_inicio, fecha_inicio_real, fecha_fin)')
          .in('conductor_id', lote)
          .range(from, to))
      for (const f of filas) {
        // Sin las canceladas (la asignación o el conductor dentro de ella)
        if (!f.asignaciones || /cancel/i.test(f.asignaciones.estado || '') || /cancel/i.test(f.estado || '')) continue
        const lista = porConductor.get(f.conductor_id) || []
        lista.push(f)
        porConductor.set(f.conductor_id, lista)
      }
    }
    const inicioDe = (f: FilaNuevo) => f.fecha_inicio || f.asignaciones?.fecha_inicio_real || f.asignaciones?.fecha_inicio || null
    for (const [cid, lista] of porConductor) {
      const conInicio = lista.filter(f => inicioDe(f)).sort((a, b) => inicioDe(a)!.localeCompare(inicioDe(b)!))
      if (!conInicio.length) continue
      // Primera asignación de todo el historial, desde el lunes
      if ((fechaISOART(inicioDe(conInicio[0])!) || '') >= lunes) { nuevosEstaSemana.add(cid); continue }
      // Volvió con Carta Oferta después de más de 30 días sin auto
      const actual = conInicio.find(f => f.asignaciones?.estado === 'activa' && f.documento === 'CARTA_OFERTA'
        && (fechaISOART(inicioDe(f)!) || '') >= lunes)
      if (!actual) continue
      const inicioActual = new Date(inicioDe(actual)!).getTime()
      const finAnterior = Math.max(0, ...conInicio
        .filter(f => f !== actual && new Date(inicioDe(f)!).getTime() < inicioActual)
        .map(f => new Date(f.fecha_fin || f.asignaciones?.fecha_fin || inicioDe(f)!).getTime()))
      if (inicioActual - finAnterior > DIAS_PARA_VOLVER_COMO_NUEVO * 86400000) nuevosEstaSemana.add(cid)
    }
  } catch (err) {
    console.warn('[panel] No se pudo calcular los nuevos de la semana:', err)
  }

  const cerradas = new Set<string>(periodos.map(p => `${p.semana}-${p.anio}`))

  // Estado de pago por multa (global, keyed por multa_id). Igual que el modulo de Multas:
  //  fraccionada = penalidad fraccionada (prioridad); pagada = no fraccionada, aplicada,
  //  no rechazada, en periodo cerrado. `monto` = monto facturado (penalidad).
  const estadoPorMulta = new Map<string, { estado: 'pagada' | 'fraccionada'; monto: number }>()
  for (const p of penalidades) {
    const mid = p.incidencias?.multa_id
    if (mid == null) continue
    const key = String(mid)
    const monto = parseImporte(p.monto)
    if (p.fraccionado === true) {
      estadoPorMulta.set(key, { estado: 'fraccionada', monto })
    } else if (p.aplicado === true && p.rechazado !== true && cerradas.has(`${p.semana_aplicacion}-${p.anio_aplicacion}`)) {
      const prev = estadoPorMulta.get(key)
      if (!prev || prev.estado !== 'fraccionada') estadoPorMulta.set(key, { estado: 'pagada', monto })
    }
  }

  // Monto pendiente de una multa: importe con descuento solo si el vencimiento es
  // posterior a hoy; si es hoy o pasado (o no hay descuento), el importe pleno.
  const hoyStr = hoyART()
  const montoPendienteMulta = (m: RawMulta): number => {
    const desc = parseImporte(m.importe_descuento)
    const vencStr = m.fecha_vencimiento_descuento ? String(m.fecha_vencimiento_descuento).slice(0, 10) : ''
    return (desc > 0 && vencStr > hoyStr) ? desc : parseImporte(m.importe)
  }

  // KM GEO: kilometros recorridos segun GPS en la semana de Cabify. Se calcula
  // con la MISMA funcion que la pestaña "Km recorridos" del modal (comparten
  // fetch, atribucion de conductor y matcher de nombre), asi que el numero de la
  // tabla y el del modal no pueden separarse. Solo se calcula si el llamador
  // pidio Cabify, que es lo que define la semana. Si falla, la columna queda
  // vacia y el panel sigue cargando.
  let kmGeoPorConductor = new Map<string, number>()
  if (opciones?.cabify && !opciones.sinKmGeo) {
    try {
      kmGeoPorConductor = await calcularKmSemanaConductores(
        supabase,
        conductores.map(c => ({ id: c.id, nombres: c.nombres, apellidos: c.apellidos })),
        { inicio: opciones.cabify.startDate.slice(0, 10), fin: opciones.cabify.endDate.slice(0, 10) },
      )
    } catch {
      kmGeoPorConductor = new Map()
    }
  }

  // Pre-normaliza conductores para el match de nombre.
  const conductoresNorm = conductores.map(c => ({
    ...c,
    _pn: primeraPalabra(c.nombres),
    _pa: primeraPalabra(c.apellidos),
  }))

  // Atribucion de multas por nombre (mismo criterio que el portal).
  // OPTIMIZACION: la atribucion depende SOLO del string de responsable, asi que
  // se memoiza por responsable normalizado. Muchas multas comparten el mismo
  // responsable (p.ej. 9 multas del mismo conductor) -> el barrido de conductores
  // se hace una vez por responsable unico, no una vez por multa. Resultado identico
  // (se elige el primer conductor que matchea, en el mismo orden que antes).
  const attribCache = new Map<string, string | null>() // responsable normalizado -> conductorId | null
  const multasPorConductor = new Map<string, RawMulta[]>()
  for (const m of multas) {
    const cr = m.conductor_responsable || ''
    if (cr.includes(',')) continue // responsable compartido: no se atribuye
    const crn = normalize(cr)
    let cid = attribCache.get(crn)
    if (cid === undefined) {
      cid = null
      for (const c of conductoresNorm) {
        if (c._pn && c._pa && crn.includes(c._pn) && crn.includes(c._pa)) { cid = c.id; break }
      }
      attribCache.set(crn, cid)
    }
    if (cid == null) continue // una multa sin conductor no se atribuye
    const arr = multasPorConductor.get(cid) || []
    arr.push(m)
    multasPorConductor.set(cid, arr)
  }

  // Ensambla filas.
  const rows: ConductorPanelRow[] = conductoresNorm.map(c => {
    const ms = multasPorConductor.get(c.id) || []
    const patentes = [...new Set(ms.map(m => m.patente).filter((x): x is string => !!x))]
    let pendientes = 0, enProceso = 0, pagadas = 0
    let montoPendiente = 0, montoEnProceso = 0, montoPagado = 0
    for (const m of ms) {
      const est = estadoPorMulta.get(String(m.id))
      if (est?.estado === 'pagada') {
        pagadas++; montoPagado += est.monto
      } else if (est?.estado === 'fraccionada') {
        enProceso++; montoEnProceso += est.monto
      } else {
        pendientes++; montoPendiente += montoPendienteMulta(m)
      }
    }
    const montoTotalMultas = montoPendiente + montoEnProceso + montoPagado
    const estadoCodigo = c.conductores_estados?.codigo?.toLowerCase() || null
    const vehiculoAsignado = vehiculoPorConductor.get(c.id) || null

    // Saldo: el del ultimo movimiento del kardex; si no hay kardex, el resumen.
    const ultimoSaldo = ultimoSaldoPorConductor.get(c.id) ?? saldoResumenPorConductor.get(c.id) ?? 0
    // Centavos residuales (<$1) se aplanan a 0, igual que en el modal.
    const saldoLimpio = Math.abs(ultimoSaldo) < 1 ? 0 : ultimoSaldo
    const saldoPendiente = Math.max(0, -saldoLimpio)
    const saldoAFavor = Math.max(0, saldoLimpio)
    const gar = garantiaPorConductor.get(c.id)
    const garantiaPagada = gar?.pagada || 0
    const garantiaTotal = gar?.total || 0

    return {
      id: c.id,
      nombre: `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
      nombres: c.nombres,
      apellidos: c.apellidos,
      dni: c.numero_dni,
      ruc: c.numero_cuit,
      telefono: c.telefono_contacto ?? null,
      telefonoSecundario: c.telefono_secundario ?? null,
      guia: guiaPorConductor.get(c.id) || null,
      referido: c.referido === true,
      embajador: c.referido && c.embajador_id ? nombrePorId.get(c.embajador_id) || null : null,
      estadoCodigo,
      activo: estadoCodigo === 'activo',
      categoriaLicencia: c.categoria_licencia || null,
      categoriaLicenciaOtra: c.categoria_licencia_otra || null,
      tieneAsignacion: !!vehiculoAsignado,
      vehiculoAsignado,
      nuevoEstaSemana: nuevosEstaSemana.has(c.id),
      grupoFlotaAsignado: grupoFlotaPorConductor.get(c.id) || null,
      turno: turnoPorConductor.get(c.id) || null,
      cantidadMultas: ms.length,
      vehiculos: patentes,
      pendientes,
      enProceso,
      pagadas,
      montoPendiente,
      montoEnProceso,
      montoPagado,
      montoTotalMultas,
      ultimoSaldo: saldoLimpio,
      saldoPendiente,
      saldoAFavor,
      garantiaPagada,
      garantiaTotal,
      tieneGarantia: !!gar,
      saldoMenosGarantia: saldoPendiente - garantiaPagada,
      // undefined si no se pidio Cabify; null si se pidio y no hubo cruce.
      cabify: cabifyDrivers ? (cabifyPorConductor.get(c.id) ?? null) : undefined,
      // Apps: con la que pagó (misma regla que Facturación) y, además, Cabify si en el
      // período tuvo viajes o ingresos en Cabify aunque el pago no se haya cargado por la
      // app (p. ej. lo pagó en efectivo): tiene la cuenta relacionada (2026-11-18).
      ...appsDelConductor(appsPago?.get(c.id), appsPago !== undefined && appsPago !== null, conCuentaCabify.has(c.id)),
      kmGeo: opciones?.cabify && !opciones.sinKmGeo ? (kmGeoPorConductor.get(c.id) ?? null) : undefined,
    }
  })

  return rows
}
