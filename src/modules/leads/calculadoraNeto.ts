// src/modules/leads/calculadoraNeto.ts
//
// Calculadora de neto del conductor (pedido de E. Ritegno, 21/11/2026, "Herramientas de
// sistematización de entrevistas"). La usa el capitán en la entrevista para hacer la cuenta
// con el candidato: cuánto factura, cuánto le cuesta trabajar y cuánto le queda.
//
// Misma fórmula que la planilla "Calculadora_neto_conductor.xlsx":
//   neto semanal = generado/hora × % escenario × horas × días
//                − km/hora × costo GNC/km × horas × días
//                − peajes − nafta para la bomba − (alquiler + ToshiPass)
//                − monotributo / semanas por mes − lavado − otros
//
// De dónde sale cada valor (no se guarda nada del candidato):
//   - Alquiler y ToshiPass: conceptos de facturación vigentes (tarifa nueva, con IVA), igual
//     que el selector de tarifas de Programación. Siempre a tarifa completa: los descuentos de
//     ingreso (promo del 10% y referido del 5%) son temporales y van aparte, solo en la
//     primera semana (ver descuentosIngreso), con las mismas reglas que Facturación.
//   - Generado por hora trabajada, km por hora y peajes por semana: promedio de los últimos
//     3 meses de Cabify de la sede, solo semanas COMPLETAS: el conductor tuvo el auto asignado
//     los 7 días (lunes a domingo), así no entran la primera semana de los nuevos ni las
//     semanas de entrada o salida a la mitad. Por hora = todo lo generado ÷ todas las horas
//     conectadas (no promedio de promedios). Pedido de M. Flores, 23/11/2026.
//     "Generado" = lo que el conductor cobra en Cabify, app + efectivo (no lo que Toshify le
//     factura). En la base coincide con ganancia_total (verificado el 23/11/2026), pero se suma
//     explícito por claridad. Días con asignación: mismos filtros que Facturación
//     (descuentoReferido.ts).
//   - El resto: parámetros compartidos (parametros_sistema, módulo 'calculadora_neto'), con
//     los valores de la planilla como respaldo mientras no estén cargados.

import { supabase } from '../../lib/supabase'
import { cargarConceptosTarifa, type ModalidadTarifa } from '../onboarding/tarifaConceptos'
import { CODIGO_TOSHIPASS } from '../facturacion/utils/toshipass'
import { estadoPromocion } from '../promociones/promocionesService'
import { PROMO_CYBER_DESCUENTO_10 } from '../promociones/catalogoPromociones'
import { DESCUENTO_REFERIDO_PORCENTAJE } from '../facturacion/utils/descuentoReferido'
import { PROMO_DESCUENTO_PORCENTAJE } from '../facturacion/utils/promocionesFacturacion'
import { fechaISOART, hoyART, lunesSemanaART, sumarDiasISO } from '../../utils/fechaArgentina'

export const MODULO_PARAMETROS = 'calculadora_neto'
/**
 * Resultado del cruce asignaciones × Cabify guardado por sede (tabla
 * calculadora_referencia_cabify, sql/calculadora_neto.sql). Solo cambia una vez por semana
 * (usa semanas cerradas hasta el domingo): el primero que abre la calculadora en la semana lo
 * calcula y lo guarda, y el resto lo lee al instante. Sin la tabla, se calcula cada vez.
 */
const TABLA_REFERENCIA = 'calculadora_referencia_cabify'
/** Subir si cambia la forma de calcular la referencia: invalida lo guardado. */
const VERSION_CACHE = 1
export const SEMANAS_POR_MES = 52 / 12
const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'
/** Semanas cerradas de Cabify que se usan para la referencia (unos 3 meses). */
const SEMANAS_CABIFY = 13
const PAGINA = 1000
const LOTE_IDS = 200

export interface DefinicionParametro {
  clave: string
  etiqueta: string
  unidad: string
  defecto: number
  nota: string
}

/** Parámetros propios de la calculadora. Los defectos son los de la planilla (nov-2026). */
export const PARAMETROS_CALCULADORA: DefinicionParametro[] = [
  { clave: 'costo_gnc_km', etiqueta: 'Costo de GNC por km', unidad: '$ por km', defecto: 67, nota: 'Estimación del informe de hallazgos' },
  { clave: 'nafta_bomba_semana', etiqueta: 'Nafta para mantener la bomba', unidad: '$ por semana', defecto: 10000, nota: 'Dato informado por la capitana' },
  { clave: 'monotributo_mes', etiqueta: 'Monotributo', unidad: '$ por mes', defecto: 70000, nota: 'Dato informado por la capitana' },
  { clave: 'lavado_semana', etiqueta: 'Lavado', unidad: '$ por semana', defecto: 0, nota: 'Completar si corresponde' },
  { clave: 'otros_semana', etiqueta: 'Otros gastos', unidad: '$ por semana', defecto: 0, nota: 'Celular, comida en el turno, etc.' },
  { clave: 'pct_semana_floja', etiqueta: 'Semana floja', unidad: '% de lo generado', defecto: 80, nota: 'Criterio de escenario' },
  { clave: 'pct_semana_buena', etiqueta: 'Semana buena', unidad: '% de lo generado', defecto: 120, nota: 'Criterio de escenario' },
  { clave: 'meta_neto_mes', etiqueta: 'Meta de neto', unidad: '$ por mes', defecto: 1800000, nota: 'Cifra publicitada' },
  { clave: 'horas_max_turno', etiqueta: 'Horas máximas del turno', unidad: 'h por día', defecto: 12, nota: 'Turno de 12 horas' },
  { clave: 'tope_deuda', etiqueta: 'Tope de deuda', unidad: '$', defecto: 200000, nota: 'Política vigente' },
  { clave: 'cuota_max_plan', etiqueta: 'Cuota máxima de un plan de pago', unidad: '$', defecto: 75000, nota: 'Política vigente' },
  { clave: 'fact_hora_referencia', etiqueta: 'Generado por hora en Cabify (respaldo)', unidad: '$ por hora', defecto: 12991, nota: 'Se usa solo si no hay datos de Cabify de la sede' },
  { clave: 'km_hora_referencia', etiqueta: 'Km por hora (respaldo)', unidad: 'km', defecto: 21, nota: 'Se usa solo si Cabify no trae km' },
  { clave: 'peajes_semana_referencia', etiqueta: 'Peajes (respaldo)', unidad: '$ por semana', defecto: 18000, nota: 'Se usa solo si no hay datos de Cabify de la sede' },
]

export type ClaveParametro =
  | 'costo_gnc_km' | 'nafta_bomba_semana' | 'monotributo_mes' | 'lavado_semana' | 'otros_semana'
  | 'pct_semana_floja' | 'pct_semana_buena' | 'meta_neto_mes' | 'horas_max_turno' | 'tope_deuda'
  | 'cuota_max_plan' | 'fact_hora_referencia' | 'km_hora_referencia' | 'peajes_semana_referencia'

export type ValoresParametros = Record<ClaveParametro, number>

/** Valores de la tarifa por modalidad (semanal, con IVA). */
export interface TarifaModalidad {
  alquiler: number
  periodo: string
}

export interface ReferenciaCabify {
  factHora: number | null
  kmHora: number | null
  peajesSemana: number | null
  /** Semanas completas (auto asignado los 7 días) con datos de Cabify. */
  semanas: number
  conductores: number
  /** Promedio real de horas conectadas por semana en esas semanas. */
  horasSemana: number | null
  /** Promedio real de lo generado por semana en esas semanas. */
  generadoSemana: number | null
  desde: string
  hasta: string
  tabla: string
}

/** Promoción del 10% vigente hoy (Parámetros > Promociones). */
export interface PromoIngreso {
  codigo: string
  fechaFin: string
}

export interface DatosCalculadora {
  parametros: ValoresParametros
  /** Claves que vienen de la base (el resto es el valor por defecto de la planilla). */
  parametrosCargados: Set<ClaveParametro>
  tarifas: Partial<Record<ModalidadTarifa, TarifaModalidad>>
  toshipass: number
  promo: PromoIngreso | null
  cabify: ReferenciaCabify
}

export interface DescuentosIngreso {
  /** Días de la primera semana que caen dentro de la promo (si empieza hoy). */
  diasPromo: number
  promoAlquiler: number
  promoToshipass: number
  referido: number
  total: number
}

/**
 * Descuentos de la PRIMERA semana, con las reglas de Facturación:
 *   - Promo del 10% (PRM01): 10% del alquiler de cada día dentro del período de la promo y
 *     10% del ToshiPass en proporción a esos días. Se supone que empieza hoy, así que solo
 *     cuentan los días hasta el fin de la promo.
 *   - Referido: 5% del alquiler de sus primeros 7 días trabajados (descuentoReferido.ts).
 * Después de esa semana paga la tarifa completa.
 */
export function descuentosIngreso(
  s: Pick<Supuestos, 'alquilerSemana' | 'toshipassSemana'>,
  promo: PromoIngreso | null,
  conPromo: boolean,
  esReferido: boolean,
): DescuentosIngreso {
  let diasPromo = 0
  if (promo && conPromo) {
    const [y1, m1, d1] = hoyART().split('-').map(Number)
    const [y2, m2, d2] = promo.fechaFin.split('-').map(Number)
    const dias = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1
    diasPromo = Math.min(7, Math.max(0, dias))
  }
  const promoAlquiler = s.alquilerSemana * PROMO_DESCUENTO_PORCENTAJE * diasPromo / 7
  const promoToshipass = s.toshipassSemana * PROMO_DESCUENTO_PORCENTAJE * diasPromo / 7
  const referido = esReferido ? s.alquilerSemana * DESCUENTO_REFERIDO_PORCENTAJE : 0
  return { diasPromo, promoAlquiler, promoToshipass, referido, total: promoAlquiler + promoToshipass + referido }
}

/** Supuestos con los que se hace la cuenta (lo que el capitán puede ajustar en pantalla). */
export interface Supuestos {
  factHora: number
  kmHora: number
  costoGncKm: number
  peajesSemana: number
  naftaSemana: number
  alquilerSemana: number
  toshipassSemana: number
  monotributoMes: number
  lavadoSemana: number
  otrosSemana: number
  pctFloja: number
  pctBuena: number
  metaMes: number
  horasMaxTurno: number
  topeDeuda: number
  cuotaMaxPlan: number
}

export interface ResultadoSemana {
  pct: number
  facturacion: number
  combustible: number
  peajes: number
  nafta: number
  alquilerToshipass: number
  monotributo: number
  lavado: number
  otros: number
  netoSemana: number
  netoMes: number
  /** Horas por día para cubrir los costos fijos (null si la hora no cubre ni el combustible). */
  horasCubrirFijos: number | null
}

export interface ResultadoCalculadora {
  normal: ResultadoSemana
  floja: ResultadoSemana
  buena: ResultadoSemana
  costosFijosSemana: number
  gananciaHora: number
  horasMeta: number | null
  metaEntraEnTurno: boolean
  diagnostico: 'deuda' | 'justo' | 'ok'
  deudaSemanal: number
  semanasHastaTope: number | null
}

export function valoresPorDefecto(): ValoresParametros {
  return Object.fromEntries(PARAMETROS_CALCULADORA.map(p => [p.clave, p.defecto])) as ValoresParametros
}

/** Lunes (yyyy-MM-dd) de la semana de una fecha yyyy-MM-dd. */
function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7))
  return f.toISOString().slice(0, 10)
}

async function cargarParametros(): Promise<{ valores: ValoresParametros; cargados: Set<ClaveParametro> }> {
  const valores = valoresPorDefecto()
  const cargados = new Set<ClaveParametro>()
  const { data, error } = await (supabase.from('parametros_sistema') as any)
    .select('clave, valor')
    .eq('modulo', MODULO_PARAMETROS)
  if (error) throw error
  for (const r of (data || []) as Array<{ clave: string; valor: string }>) {
    const n = Number(r.valor)
    if (r.clave in valores && Number.isFinite(n)) {
      valores[r.clave as ClaveParametro] = n
      cargados.add(r.clave as ClaveParametro)
    }
  }
  return { valores, cargados }
}

async function cargarPromoIngreso(): Promise<PromoIngreso | null> {
  const { data, error } = await (supabase.from('promociones') as any)
    .select('codigo, activa, fecha_inicio, fecha_fin')
    .eq('clave', PROMO_CYBER_DESCUENTO_10)
    .maybeSingle()
  if (error) throw error
  if (!data || estadoPromocion(data) !== 'vigente') return null
  return { codigo: data.codigo || 'PRM01', fechaFin: data.fecha_fin }
}

async function cargarToshipass(): Promise<number> {
  const { data, error } = await (supabase.from('conceptos_nomina') as any)
    .select('precio_final, precio_semanal, iva_porcentaje, activo')
    .eq('codigo', CODIGO_TOSHIPASS)
    .maybeSingle()
  if (error) throw error
  if (!data?.activo) return 0
  // Mismo criterio que cargarReglaToshipass: total semanal sin IVA × (1 + IVA).
  const iva = Number(data.iva_porcentaje) || 0
  return Number(data.precio_semanal) > 0
    ? Math.round(Number(data.precio_semanal) * (1 + iva / 100))
    : Math.round((Number(data.precio_final) || 0) * 7)
}

/**
 * Semanas completas por conductor de la sede: lunes (yyyy-MM-dd) de cada semana en la que tuvo
 * auto asignado los 7 días. Mismos filtros de asignaciones que Facturación: sin programadas ni
 * cerradas sin fecha de fin; inicio = el más tardío (entrega real), fin = el más temprano.
 */
async function semanasCompletasPorConductor(
  sedeId: string | null,
  desde: string,
  hasta: string,
): Promise<{ semanas: Map<string, Set<string>>; dniPorConductor: Map<string, string> }> {
  type Asig = { id: string; estado: string | null; fecha_inicio: string | null; fecha_fin: string | null }
  const asignaciones: Asig[] = []
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    let q = (supabase.from('asignaciones') as any)
      .select('id, estado, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', `${hasta}T23:59:59`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${desde}`)
    if (sedeId) q = q.eq('sede_id', sedeId)
    const { data, error } = await q.order('id', { ascending: true }).range(desdeFila, desdeFila + PAGINA - 1)
    if (error) throw error
    asignaciones.push(...((data || []) as Asig[]))
    if (!data || data.length < PAGINA) break
  }
  const porId = new Map(asignaciones.map(a => [a.id, a]))
  const ids = [...porId.keys()]

  const dias = new Map<string, Set<string>>()
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await (supabase.from('asignaciones_conductores') as any)
      .select('asignacion_id, conductor_id, fecha_inicio, fecha_fin')
      .in('asignacion_id', ids.slice(i, i + LOTE_IDS))
    if (error) throw error
    for (const ac of (data || []) as Array<{ asignacion_id: string; conductor_id: string; fecha_inicio: string | null; fecha_fin: string | null }>) {
      const padre = porId.get(ac.asignacion_id)
      if (!padre || !ac.conductor_id) continue
      const estado = (padre.estado || '').toLowerCase()
      if (['programado', 'programada'].includes(estado)) continue
      if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estado) && !padre.fecha_fin) continue
      const inicios = [fechaISOART(ac.fecha_inicio), fechaISOART(padre.fecha_inicio)].filter(Boolean) as string[]
      if (inicios.length === 0) continue
      const finales = [fechaISOART(ac.fecha_fin), fechaISOART(padre.fecha_fin)].filter(Boolean) as string[]
      const inicio = inicios.sort()[inicios.length - 1]
      const fin = finales.length > 0 ? finales.sort()[0] : hasta
      const set = dias.get(ac.conductor_id) || new Set<string>()
      for (let d = inicio < desde ? desde : inicio; d <= (fin < hasta ? fin : hasta); d = sumarDiasISO(d, 1)) set.add(d)
      dias.set(ac.conductor_id, set)
    }
  }

  const semanas = new Map<string, Set<string>>()
  for (const [conductorId, set] of dias) {
    const cuenta = new Map<string, number>()
    for (const d of set) cuenta.set(lunesDe(d), (cuenta.get(lunesDe(d)) || 0) + 1)
    const completas = new Set([...cuenta].filter(([, n]) => n === 7).map(([lunes]) => lunes))
    if (completas.size > 0) semanas.set(conductorId, completas)
  }

  const dniPorConductor = new Map<string, string>()
  const conductores = [...semanas.keys()]
  for (let i = 0; i < conductores.length; i += LOTE_IDS) {
    const { data, error } = await (supabase.from('conductores') as any)
      .select('id, numero_dni')
      .in('id', conductores.slice(i, i + LOTE_IDS))
    if (error) throw error
    for (const c of (data || []) as Array<{ id: string; numero_dni: string | null }>) {
      const dni = normalizarDni(c.numero_dni)
      if (dni) dniPorConductor.set(c.id, dni)
    }
  }
  return { semanas, dniPorConductor }
}

function normalizarDni(valor: string | null | undefined): string {
  return String(valor || '').replace(/[.\-\s]/g, '').replace(/^0+/, '')
}

/**
 * Referencia de Cabify de la sede, sobre los últimos 3 meses y solo semanas completas
 * (ver semanasCompletasPorConductor): generado por hora trabajada (total ÷ horas), km por
 * hora y peajes por semana. cabify_historico guarda un registro por conductor y día (puede
 * repetirse: vale el último guardado), así que la semana se arma sumando los días.
 */
export async function cargarReferenciaCabify(sedeId: string | null): Promise<ReferenciaCabify> {
  const tabla = sedeId === SEDE_BARILOCHE_ID ? 'cabify_historico_bariloche' : 'cabify_historico'
  const hasta = sumarDiasISO(lunesSemanaART(), -1)
  const desde = sumarDiasISO(hasta, -(SEMANAS_CABIFY * 7) + 1)

  type Fila = { dni: string | null; fecha_inicio: string | null; fecha_guardado: string | null; horas_conectadas: number | null; cobro_app: number | null; cobro_efectivo: number | null; peajes: number | null; km_conectado: number | null }
  const leerCabify = async () => {
    const filas: Fila[] = []
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error } = await (supabase.from(tabla) as any)
        .select('dni, fecha_inicio, fecha_guardado, horas_conectadas, cobro_app, cobro_efectivo, peajes, km_conectado')
        .gte('fecha_inicio', `${desde}T00:00:00`)
        .lte('fecha_inicio', `${hasta}T23:59:59`)
        .order('id', { ascending: true })
        .range(desdeFila, desdeFila + PAGINA - 1)
      if (error) throw error
      filas.push(...((data || []) as Fila[]))
      if (!data || data.length < PAGINA) break
    }
    return filas
  }
  const [filas, { semanas: completas, dniPorConductor }] = await Promise.all([
    leerCabify(),
    semanasCompletasPorConductor(sedeId, desde, hasta),
  ])
  const conductorPorDni = new Map([...dniPorConductor].map(([id, dni]) => [dni, id]))

  // Un registro por conductor y día: el último guardado.
  const porDia = new Map<string, Fila>()
  for (const f of filas) {
    const dia = (f.fecha_inicio || '').slice(0, 10)
    const dni = normalizarDni(f.dni)
    if (!dia || !dni) continue
    const clave = `${dni}|${dia}`
    const previa = porDia.get(clave)
    if (!previa || (f.fecha_guardado || '') > (previa.fecha_guardado || '')) porDia.set(clave, f)
  }

  // Semana por conductor, solo las semanas completas.
  const porSemana = new Map<string, { conductor: string; horas: number; ganancia: number; peajes: number; km: number }>()
  for (const [clave, f] of porDia) {
    const [dni, dia] = clave.split('|')
    const conductor = conductorPorDni.get(dni)
    const lunes = lunesDe(dia)
    if (!conductor || !completas.get(conductor)?.has(lunes)) continue
    const k = `${conductor}|${lunes}`
    const s = porSemana.get(k) || { conductor, horas: 0, ganancia: 0, peajes: 0, km: 0 }
    s.horas += Number(f.horas_conectadas) || 0
    s.ganancia += (Number(f.cobro_app) || 0) + (Number(f.cobro_efectivo) || 0)
    s.peajes += Number(f.peajes) || 0
    s.km += Number(f.km_conectado) || 0
    porSemana.set(k, s)
  }

  const conValor = [...porSemana.values()].filter(s => s.horas > 0 && s.ganancia > 0)
  const n = conValor.length
  const suma = (f: (s: (typeof conValor)[number]) => number) => conValor.reduce((acc, s) => acc + f(s), 0)
  const horas = suma(s => s.horas)
  const conKm = conValor.filter(s => s.km > 0)
  const horasConKm = conKm.reduce((acc, s) => acc + s.horas, 0)

  return {
    factHora: horas > 0 ? Math.round(suma(s => s.ganancia) / horas) : null,
    kmHora: horasConKm > 0 ? Math.round((conKm.reduce((acc, s) => acc + s.km, 0) / horasConKm) * 10) / 10 : null,
    peajesSemana: n > 0 ? Math.round(suma(s => s.peajes) / n) : null,
    semanas: n,
    conductores: new Set(conValor.map(s => s.conductor)).size,
    horasSemana: n > 0 ? Math.round(horas / n) : null,
    generadoSemana: n > 0 ? Math.round(suma(s => s.ganancia) / n) : null,
    desde,
    hasta,
    tabla,
  }
}

/** Referencia de Cabify guardada para la sede; si no es de esta semana, la calcula y la guarda. */
async function cargarReferenciaCabifyGuardada(sedeId: string | null): Promise<ReferenciaCabify> {
  const clave = `referencia_${sedeId || 'todas'}`
  const hasta = sumarDiasISO(lunesSemanaART(), -1)
  try {
    const { data, error } = await (supabase.from(TABLA_REFERENCIA) as any)
      .select('version, hasta, referencia')
      .eq('clave', clave)
      .maybeSingle()
    if (error) throw error
    if (data && data.version === VERSION_CACHE && data.hasta === hasta && data.referencia) {
      return data.referencia as ReferenciaCabify
    }
  } catch (err) {
    console.warn('Calculadora: no se pudo leer la referencia guardada', err)
  }

  const referencia = await cargarReferenciaCabify(sedeId)
  // Guardar es una ayuda: si falla (tabla sin crear, sin permiso), la calculadora sigue andando.
  try {
    const { error } = await (supabase.from(TABLA_REFERENCIA) as any).upsert({
      clave,
      version: VERSION_CACHE,
      hasta,
      referencia,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clave' })
    if (error) throw error
  } catch (err) {
    console.warn('Calculadora: no se pudo guardar la referencia', err)
  }
  return referencia
}

export async function cargarDatosCalculadora(sedeId: string | null): Promise<DatosCalculadora> {
  const { valores, cargados } = await cargarParametros()
  const [conceptos, toshipass, promo, cabify] = await Promise.all([
    cargarConceptosTarifa(),
    cargarToshipass(),
    cargarPromoIngreso().catch(() => null),
    cargarReferenciaCabifyGuardada(sedeId),
  ])

  // Candidato nuevo = tarifa nueva, auto con GNC (los mismos códigos que Programación).
  const codigos: Record<ModalidadTarifa, string> = { diurno: 'P021', nocturno: 'P023', cargo: 'P022' }
  const tarifas: Partial<Record<ModalidadTarifa, TarifaModalidad>> = {}
  for (const [modalidad, codigo] of Object.entries(codigos) as Array<[ModalidadTarifa, string]>) {
    const c = conceptos[codigo]
    if (c && c.precioSemanalConIva > 0) {
      tarifas[modalidad] = { alquiler: Math.round(c.precioSemanalConIva), periodo: c.periodo }
    }
  }

  return { parametros: valores, parametrosCargados: cargados, tarifas, toshipass, promo, cabify }
}

/**
 * Datos de la calculadora en memoria por sede, para que el botón abra al instante: Leads los
 * pide en segundo plano al entrar (precargarDatosCalculadora) y la ventana usa la misma
 * promesa. Duran 10 minutos; "Guardar como referencia" los fuerza de nuevo.
 */
const MEMORIA_MS = 10 * 60 * 1000
const enMemoria = new Map<string, { at: number; promesa: Promise<DatosCalculadora> }>()

export function obtenerDatosCalculadora(sedeId: string | null, forzar = false): Promise<DatosCalculadora> {
  const clave = sedeId || 'todas'
  const actual = enMemoria.get(clave)
  if (!forzar && actual && Date.now() - actual.at < MEMORIA_MS) return actual.promesa
  const promesa = cargarDatosCalculadora(sedeId)
  enMemoria.set(clave, { at: Date.now(), promesa })
  // Si falla, no queda guardado el error: el próximo intento vuelve a pedir.
  promesa.catch(() => { if (enMemoria.get(clave)?.promesa === promesa) enMemoria.delete(clave) })
  return promesa
}

/** Para Leads: empieza a cargar la calculadora sin esperar ni mostrar errores. */
export function precargarDatosCalculadora(sedeId: string | null): void {
  obtenerDatosCalculadora(sedeId).catch(() => { /* se reintenta al abrir la ventana */ })
}

function semana(s: Supuestos, dias: number, horas: number, pct: number): ResultadoSemana {
  const facturacion = s.factHora * pct * horas * dias
  const combustible = s.kmHora * s.costoGncKm * horas * dias
  const monotributo = s.monotributoMes / SEMANAS_POR_MES
  const alquilerToshipass = s.alquilerSemana + s.toshipassSemana
  const netoSemana = facturacion - combustible - s.peajesSemana - s.naftaSemana - alquilerToshipass
    - monotributo - s.lavadoSemana - s.otrosSemana
  const fijos = alquilerToshipass + monotributo + s.peajesSemana + s.naftaSemana + s.lavadoSemana + s.otrosSemana
  const gananciaHora = s.factHora * pct - s.kmHora * s.costoGncKm
  return {
    pct,
    facturacion,
    combustible,
    peajes: s.peajesSemana,
    nafta: s.naftaSemana,
    alquilerToshipass,
    monotributo,
    lavado: s.lavadoSemana,
    otros: s.otrosSemana,
    netoSemana,
    netoMes: netoSemana * SEMANAS_POR_MES,
    horasCubrirFijos: gananciaHora > 0 && dias > 0 ? fijos / gananciaHora / dias : null,
  }
}

export function calcular(s: Supuestos, dias: number, horas: number): ResultadoCalculadora {
  const normal = semana(s, dias, horas, 1)
  const floja = semana(s, dias, horas, s.pctFloja / 100)
  const buena = semana(s, dias, horas, s.pctBuena / 100)
  const costosFijosSemana = normal.alquilerToshipass + normal.monotributo + s.peajesSemana + s.naftaSemana
    + s.lavadoSemana + s.otrosSemana
  const gananciaHora = s.factHora - s.kmHora * s.costoGncKm
  const horasMeta = gananciaHora > 0 && dias > 0
    ? (s.metaMes / SEMANAS_POR_MES + costosFijosSemana) / gananciaHora / dias
    : null
  const diagnostico = normal.netoSemana < 0
    ? 'deuda'
    : normal.horasCubrirFijos !== null && horas < normal.horasCubrirFijos * 1.25 ? 'justo' : 'ok'
  const deudaSemanal = normal.netoSemana < 0 ? -normal.netoSemana : 0
  return {
    normal,
    floja,
    buena,
    costosFijosSemana,
    gananciaHora,
    horasMeta,
    metaEntraEnTurno: horasMeta !== null && horasMeta <= s.horasMaxTurno,
    diagnostico,
    deudaSemanal,
    semanasHastaTope: deudaSemanal > 0 ? s.topeDeuda / deudaSemanal : null,
  }
}

/**
 * Guarda un parámetro compartido de la calculadora (alta si todavía no existe).
 * parametros_sistema en la base tiene: id, clave, valor, tipo, descripcion, modulo,
 * updated_at, updated_by (no tiene activo ni unidad, aunque el tipo TS los declare).
 */
export async function guardarParametro(clave: ClaveParametro, valor: number, usuarioId?: string | null): Promise<void> {
  const def = PARAMETROS_CALCULADORA.find(p => p.clave === clave)
  const { data, error } = await (supabase.from('parametros_sistema') as any)
    .select('id')
    .eq('modulo', MODULO_PARAMETROS)
    .eq('clave', clave)
    .maybeSingle()
  if (error) throw error
  if (data?.id) {
    const { error: e } = await (supabase.from('parametros_sistema') as any)
      .update({ valor: String(valor), updated_at: new Date().toISOString(), updated_by: usuarioId || null })
      .eq('id', data.id)
    if (e) throw e
  } else {
    const { error: e } = await (supabase.from('parametros_sistema') as any).insert({
      modulo: MODULO_PARAMETROS,
      clave,
      valor: String(valor),
      tipo: 'number',
      descripcion: def ? `${def.etiqueta} (${def.unidad}). ${def.nota}` : null,
      updated_by: usuarioId || null,
    })
    if (e) throw e
  }
}
