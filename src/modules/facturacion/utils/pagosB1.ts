// src/modules/facturacion/utils/pagosB1.ts
// Pagos diarios de la promoción de licencia B1 (PRM02), regla 2026-11-13.
//
// El conductor con B1 paga $15.000 por día, todos los días, desde su primer día de turno
// hasta que obtiene la D1. Los pagos salen de:
//   · Cresium (44 Dreams y Grupo CG), SOLOS: depósitos del conductor, con el mismo cruce que
//     server-cresium-pagos.js (CUIT/CUIL, DNI dentro del CUIL, CBU propio, y quien paga por
//     él en Administración > Cresium conductores: cresium_pagadores_conductor, solo desde
//     DESDE_PAGOS_CRESIUM, el 26/11 12:00). Todo depósito del conductor cuenta como adelanto.
//   · registros de promocion_b1_pagos:
//       'manual'   → pago en efectivo cargado en Saldos > Registrar Pago con el tilde B1
//                    (abono_id enlaza el abono: si el abono se borra, el pago sale de B1);
//                    también los cargados antes desde Licencia B1;
//       'cresium'  → depósito elegido a mano antes en Licencia B1 (lo envió un tercero),
//       'excluido' → depósito que se quitó antes en Licencia B1 (ya no se excluyen nuevos).
// Regla 2026-11-26 (tarde): Licencia B1 es solo seguimiento; el efectivo se carga en Saldos.
//
// Lo que paga por día es un ADELANTO de su facturación semanal, no una deuda: lo que no
// adelanta se le cobra igual al facturar la semana. Por eso cada semana (lunes a domingo)
// se mira sola y empieza en cero: lo pagado con fecha en la semana se reparte de a $15.000
// por día en orden desde el lunes (dos depósitos de $10.000 y $5.000 = 1 día; uno de
// $30.000 = 2 días). Lo que faltó en semanas anteriores no se arrastra: queda como
// historial (ResumenB1.semanas). Es la misma regla que la facturación: saldo a favor de la
// semana = lo pagado con fecha en esa semana.
//
// Regla 2026-11-26: cada pago es un pago más del conductor y entra a su saldo. La factura ya
// no lo descuenta: la línea de la promoción queda informativa.
//   · Depósitos de Cresium: los carga el servidor (server-cresium-pagos.js) como
//     "Transferencia bancaria - B1", con la fecha de la transferencia. Asignar un depósito
//     acá le dice al servidor de quién es. cresium_movimientos.pago_* dice si ya entró.
//   · Pagos en efectivo: entran al saldo desde Saldos > Registrar Pago (abono + kardex) y
//     quedan enlazados acá por promocion_b1_pagos.abono_id.

import { supabase } from '../../../lib/supabase'
import { hoyART, sumarDiasISO } from '../../../utils/fechaArgentina'
import { semanaISO } from '../../../utils/semanaISO'

export const PROMO_B1_PAGO_DIARIO = 15000

/**
 * Desde el jueves 26/11/2026 12:00 (Argentina) el servidor carga solo en el saldo las
 * transferencias de Cresium (server-cresium-pagos.js). Las de antes se cargaron a mano:
 * no se muestran como "no entró al saldo" para no duplicarlas.
 */
export const DESDE_PAGOS_CRESIUM = '2026-11-26T15:00:00Z'

/** Depósito de Cresium anterior a la carga automática (ya se cargó a mano si correspondía). */
export function anteriorACargaAutomatica(p: { procesadoEn?: string | null; fechaDeposito: string | null; movimientoId: string | null }): boolean {
  if (!p.movimientoId) return false
  if (p.procesadoEn) return p.procesadoEn < DESDE_PAGOS_CRESIUM
  return !!p.fechaDeposito && p.fechaDeposito < DESDE_PAGOS_CRESIUM.slice(0, 10)
}

export const ETIQUETA_EMPRESA_CRESIUM: Record<string, string> = {
  '44dreams': '44 Dreams',
  grupocg: 'Grupo CG',
}

export type OrigenPagoB1 = 'auto' | 'cresium' | 'manual'

export interface PagoB1 {
  /** Clave única: movimiento de Cresium (auto) o registro de promocion_b1_pagos. */
  key: string
  origen: OrigenPagoB1
  fecha: string
  monto: number
  /** Quién envió / pagó. */
  pagador: string | null
  cuit: string | null
  /** '44dreams' | 'grupocg' cuando viene de Cresium. */
  empresa: string | null
  nota: string | null
  movimientoId: string | null
  registroId: string | null
  cargadoPor: string | null
  cargadoEn: string | null
  editadoPor: string | null
  editadoEn: string | null
  /** Fecha real del depósito en Cresium (puede diferir del día al que se imputó). */
  fechaDeposito: string | null
  /** Momento del depósito en Cresium (con hora); null en los pagos manuales */
  procesadoEn?: string | null
  /** Abono con el que entró al saldo (null: todavía no entró) */
  abonoId: string | null
  /** Fecha en que dijo que pagó (solo informativa: para B1 cuenta la fecha de carga) */
  fechaInformada?: string | null
  /** Depósito que ya estaba cargado a mano como pago: no cuenta ni se muestra */
  yaCargadoAMano?: boolean
  /** Depósito de Cresium que el servidor ya cargó en el saldo */
  enSaldo?: boolean
}

/** Datos del conductor para cruzar con Cresium y período en que paga por día. */
export interface ConductorPagoB1 {
  id: string
  dni: string | null
  cuit: string | null
  /** CBU/CVU propio (cruce por la cuenta de origen del depósito). */
  cbu?: string | null
  /** Primer y último día que se toman depósitos solos (inclusive). */
  desde: string
  hasta: string
}

export interface MovimientoCresium {
  id: string
  empresa: string
  fecha: string
  contraparte: string | null
  cuit: string | null
  /** CBU/CVU de origen */
  cuenta_contraparte?: string | null
  importe: number
  /** Momento en que Cresium acreditó el depósito (con hora) */
  procesado_en?: string | null
  /** Cuándo lo cargó el servidor en el saldo (sql/cresium_pagos_conductores.sql) */
  pago_cargado_en?: string | null
  pago_omitido?: string | null
}

export type EstadoDiaB1 = 'pagado' | 'atrasado' | 'parcial' | 'no_pago' | 'adelantado' | 'proximo' | 'en_curso'

export interface DiaB1 {
  fecha: string
  /** Pagos con fecha de ese día. */
  pagos: PagoB1[]
  /** Parte de los $15.000 del día que quedó cubierta con lo pagado. */
  cubierto: number
  /** Fecha del pago que terminó de cubrir el día. */
  cubiertoEl: string | null
  estado: EstadoDiaB1
}

/** Cómo quedó el adelanto de una semana. */
export type EstadoSemanaB1 = 'completa' | 'parcial' | 'sin_pago' | 'en_curso' | 'sin_dias'

export interface SemanaB1 {
  /** Lunes y domingo (yyyy-MM-dd). */
  lunes: string
  domingo: string
  /** Semana ISO. */
  numero: number
  anio: number
  esActual: boolean
  /** Días que le toca adelantar en la semana (con turno, dentro de su período). */
  dias: number
  /** Días cerrados (hasta ayer). */
  diasVencidos: number
  /** Días cerrados cubiertos con lo adelantado en la semana. */
  diasPagados: number
  /** Días cerrados × $15.000. */
  aPagar: number
  /** Lo pagado con fecha en la semana. */
  pagado: number
  /** Lo que no adelantó de los días cerrados (se cobra igual en la facturación). */
  faltante: number
  /** Pagado de más sobre los días cerrados (cubre los que siguen de la semana). */
  adelantado: number
  estado: EstadoSemanaB1
}

export interface ResumenB1 {
  dias: DiaB1[]
  /** Todas sus semanas, de la más vieja a la actual. */
  semanas: SemanaB1[]
  /** Semana actual (cada lunes empieza en cero). */
  diasVencidos: number
  diasPagados: number
  pagadoSemana: number
  /** Lo que no adelantó esta semana de los días cerrados. Hoy no cuenta hasta que termina. */
  faltante: number
  /** Pagado de más esta semana sobre lo vencido. */
  adelantado: number
  /** Total pagado en toda la promoción. */
  totalPagado: number
  /** Semanas anteriores (cerradas) en que no adelantó todo. */
  semanasIncompletas: number
  /** Lo que no adelantó en semanas anteriores (informativo: ya se facturó). */
  faltanteAnteriores: number
}

const LOTE = 1000

function soloDigitos(valor: string | null | undefined): string {
  return String(valor || '').replace(/\D/g, '')
}

/** DNI que está dentro de un CUIT/CUIL de 11 dígitos. */
function dniDeCuit(cuit: string): string | null {
  const d = soloDigitos(cuit)
  return d.length === 11 ? String(Number(d.slice(2, 10))) : null
}

/** CUIT de empresa (30, 33, 34): no es de un conductor (como server-cresium-pagos.js). */
function esCuitEmpresa(cuit: string): boolean {
  const d = soloDigitos(cuit)
  return d.length === 11 && ['30', '33', '34'].includes(d.slice(0, 2))
}

/** Quien paga por un conductor (Administración > Cresium conductores). Sin la tabla: ninguno. */
async function pagadoresConductores(): Promise<Array<{ cuit: string | null; cbu: string | null; conductor_id: string }>> {
  const { data, error } = await (supabase.from('cresium_pagadores_conductor') as any)
    .select('cuit, cbu, conductor_id')
  if (error) {
    console.error('No se pudieron leer los pagadores de Cresium conductores:', error)
    return []
  }
  return data || []
}

/**
 * Abonos que siguen existiendo (de los ids pedidos). Un pago B1 cargado desde Saldos sale de
 * B1 si su abono se borró.
 */
async function abonosExistentes(ids: string[]): Promise<Set<string>> {
  const existen = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase.from('abonos_conductores') as any)
      .select('id')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`No se pudieron leer los abonos de los pagos B1: ${error.message}`)
    for (const a of (data || []) as any[]) existen.add(a.id)
  }
  return existen
}

function errorTabla(error: { code?: string; message: string }): Error {
  const faltaSql = error.code === '42P01' || error.code === '42703'
  return new Error(faltaSql
    ? 'Falta crear la tabla de pagos B1: correr sql/promocion_licencia_b1.sql en Supabase.'
    : error.message)
}

/** Depósitos acreditados de Cresium entre dos fechas (inclusive). */
const COLUMNAS_DEPOSITO = 'id, empresa, fecha, procesado_en, contraparte, cuit, cuenta_contraparte, importe'
const COLUMNAS_PAGO = ', pago_cargado_en, pago_omitido'
/** Las columnas de pago existen desde sql/cresium_pagos_conductores.sql: sin él, se leen sin ellas */
let hayColumnasPago = true
const columnasDeposito = () => COLUMNAS_DEPOSITO + (hayColumnasPago ? COLUMNAS_PAGO : '')
const faltaColumna = (error: { code?: string } | null) => error?.code === '42703'

async function depositosCresium(desde: string, hasta: string): Promise<MovimientoCresium[]> {
  try {
    return await leerDepositosCresium(desde, hasta)
  } catch (err) {
    if (!hayColumnasPago || !(err as { faltaColumna?: boolean }).faltaColumna) throw err
    hayColumnasPago = false
    return leerDepositosCresium(desde, hasta)
  }
}

async function leerDepositosCresium(desde: string, hasta: string): Promise<MovimientoCresium[]> {
  const filas: MovimientoCresium[] = []
  for (let desdeFila = 0; ; desdeFila += LOTE) {
    const { data, error } = await (supabase.from('cresium_movimientos') as any)
      .select(columnasDeposito())
      .eq('tipo', 'DEPOSIT').eq('estado', 'SUCCESS').eq('direccion', 'entrada')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('id')
      .range(desdeFila, desdeFila + LOTE - 1)
    if (error) throw Object.assign(new Error(`No se pudieron leer los depósitos de Cresium: ${error.message}`), { faltaColumna: faltaColumna(error) })
    filas.push(...((data || []) as any[]).map(m => ({ ...m, importe: Number(m.importe) || 0 })))
    if (!data || data.length < LOTE) break
  }
  return filas
}

function pagoDeMovimiento(m: MovimientoCresium, origen: OrigenPagoB1, registro?: any): PagoB1 {
  return {
    key: registro ? `reg-${registro.id}` : `mov-${m.id}`,
    origen,
    fecha: registro?.fecha || m.fecha,
    monto: m.importe,
    pagador: m.contraparte,
    cuit: m.cuit,
    empresa: m.empresa,
    nota: registro?.nota || null,
    movimientoId: m.id,
    registroId: registro?.id || null,
    cargadoPor: registro?.created_by_name || null,
    cargadoEn: registro?.created_at || null,
    editadoPor: registro?.editado_by_name || null,
    editadoEn: registro?.editado_at || null,
    fechaDeposito: m.fecha,
    procesadoEn: m.procesado_en ?? null,
    abonoId: registro?.abono_id || null,
    enSaldo: !!m.pago_cargado_en,
    yaCargadoAMano: m.pago_omitido === 'ya_cargado_a_mano',
  }
}

/**
 * Pagos de cada conductor con fecha entre `rango.desde` y `rango.hasta`: depósitos de Cresium
 * que coinciden por CUIT/DNI dentro de su período, más los registros cargados a mano.
 */
export async function cargarPagosB1(
  conductores: ConductorPagoB1[],
  rango: { desde: string; hasta: string },
): Promise<Map<string, PagoB1[]>> {
  const resultado = new Map<string, PagoB1[]>()
  if (conductores.length === 0 || rango.desde > rango.hasta) return resultado
  const ids = conductores.map(c => c.id)

  // Registros a mano (no anulados)
  const registros: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase.from('promocion_b1_pagos') as any)
      .select('*')
      .in('conductor_id', ids.slice(i, i + 200))
      .is('anulado_at', null)
    if (error) throw errorTabla(error)
    registros.push(...(data || []))
  }
  // Pagos enlazados a un abono de Saldos: si el abono ya no está (se borró el pago), no cuentan
  const conAbono = registros.filter(r => r.origen === 'manual' && r.abono_id)
  if (conAbono.length > 0) {
    const existen = await abonosExistentes([...new Set(conAbono.map(r => r.abono_id as string))])
    for (let i = registros.length - 1; i >= 0; i--) {
      const r = registros[i]
      if (r.origen === 'manual' && r.abono_id && !existen.has(r.abono_id)) registros.splice(i, 1)
    }
  }
  // Depósitos asignados a mano a CUALQUIER conductor: no se toman solos para otro
  const asignados = new Set<string>()
  {
    const { data, error } = await (supabase.from('promocion_b1_pagos') as any)
      .select('cresium_movimiento_id')
      .eq('origen', 'cresium')
      .is('anulado_at', null)
    if (error) throw errorTabla(error)
    for (const r of (data || []) as any[]) asignados.add(r.cresium_movimiento_id)
  }

  // Depósitos de Cresium del rango (los asignados a mano se buscan por id: pueden ser de otra fecha)
  const desdeAuto = conductores.reduce((min, c) => (c.desde < min ? c.desde : min), rango.hasta)
  const depositos = await depositosCresium(desdeAuto < rango.desde ? rango.desde : desdeAuto, rango.hasta)
  const movPorId = new Map(depositos.map(m => [m.id, m]))
  const faltan = registros.filter(r => r.origen === 'cresium' && !movPorId.has(r.cresium_movimiento_id)).map(r => r.cresium_movimiento_id)
  for (let i = 0; i < faltan.length; i += 200) {
    const { data, error } = await (supabase.from('cresium_movimientos') as any)
      .select(columnasDeposito())
      .in('id', faltan.slice(i, i + 200))
    if (error) throw new Error(`No se pudieron leer los depósitos de Cresium: ${error.message}`)
    for (const m of (data || []) as any[]) movPorId.set(m.id, { ...m, importe: Number(m.importe) || 0 })
  }

  // Índices para el cruce automático (mismo orden que server-cresium-pagos.js)
  const porCuit = new Map<string, ConductorPagoB1>()
  const porDni = new Map<string, ConductorPagoB1>()
  const porCbu = new Map<string, ConductorPagoB1>()
  for (const c of conductores) {
    const cuit = soloDigitos(c.cuit)
    if (cuit.length === 11) porCuit.set(cuit, c)
    const dni = soloDigitos(c.dni)
    if (dni) porDni.set(String(Number(dni)), c)
    const cbu = soloDigitos(c.cbu)
    if (cbu.length === 22 && !porCbu.has(cbu)) porCbu.set(cbu, c)
  }
  // Quien paga por un conductor (terceros vinculados en Cresium conductores)
  const porId = new Map(conductores.map(c => [c.id, c]))
  const pagadorPorCuit = new Map<string, ConductorPagoB1>()
  const pagadorPorCbu = new Map<string, ConductorPagoB1>()
  for (const p of await pagadoresConductores()) {
    const c = porId.get(p.conductor_id)
    if (!c) continue
    if (p.cuit) pagadorPorCuit.set(soloDigitos(p.cuit), c)
    else if (p.cbu) pagadorPorCbu.set(soloDigitos(p.cbu), c)
  }
  const conductorDelDeposito = (m: MovimientoCresium): ConductorPagoB1 | undefined => {
    const cuit = soloDigitos(m.cuit)
    if (cuit && esCuitEmpresa(cuit)) return undefined
    const dni = cuit ? dniDeCuit(cuit) : null
    const cbu = soloDigitos(m.cuenta_contraparte)
    const propio = (cuit ? porCuit.get(cuit) : undefined)
      || (dni ? porDni.get(dni) : undefined)
      || (cbu ? porCbu.get(cbu) : undefined)
    if (propio) return propio
    // Terceros vinculados: solo desde el 26/11 12:00, igual que el servidor. Antes, lo que
    // pagaba un tercero se asignaba a mano (y puede haberse cargado como pago manual).
    const momento = m.procesado_en || `${m.fecha}T23:59:59Z`
    if (momento < DESDE_PAGOS_CRESIUM) return undefined
    return (cuit ? pagadorPorCuit.get(cuit) : undefined)
      || (!cuit && cbu ? pagadorPorCbu.get(cbu) : undefined)
  }
  const excluidos = new Set(registros.filter(r => r.origen === 'excluido').map(r => `${r.conductor_id}|${r.cresium_movimiento_id}`))

  const agregar = (conductorId: string, pago: PagoB1) => {
    if (pago.fecha < rango.desde || pago.fecha > rango.hasta) return
    const lista = resultado.get(conductorId) || []
    lista.push(pago)
    resultado.set(conductorId, lista)
  }

  for (const m of depositos) {
    if (asignados.has(m.id)) continue
    const c = conductorDelDeposito(m)
    if (!c || m.fecha < c.desde || m.fecha > c.hasta) continue
    // Los depósitos que se quitaron antes en Licencia B1 siguen afuera (ya no se quitan nuevos)
    if (excluidos.has(`${c.id}|${m.id}`)) continue
    agregar(c.id, pagoDeMovimiento(m, 'auto'))
  }

  for (const r of registros) {
    if (r.origen === 'cresium') {
      const m = movPorId.get(r.cresium_movimiento_id)
      if (m) agregar(r.conductor_id, pagoDeMovimiento(m, 'cresium', r))
    } else if (r.origen === 'manual') {
      agregar(r.conductor_id, {
        key: `reg-${r.id}`, origen: 'manual', fecha: r.fecha, monto: Number(r.monto) || 0,
        pagador: r.pagador, cuit: r.cuit, empresa: null, nota: r.nota,
        movimientoId: null, registroId: r.id, cargadoPor: r.created_by_name, cargadoEn: r.created_at,
        editadoPor: r.editado_by_name || null, editadoEn: r.editado_at || null, fechaDeposito: null,
        abonoId: r.abono_id || null, fechaInformada: r.fecha_pago_informada || null,
      })
    }
  }

  for (const lista of resultado.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.key.localeCompare(b.key))
  return resultado
}

/** Lunes (yyyy-MM-dd) de la semana de una fecha. */
export function lunesSemanaB1(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return sumarDiasISO(fecha, -((dia + 6) % 7))
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Reparte lo pagado semana por semana: lo pagado con fecha en la semana cubre de a $15.000
 * los días de esa semana en orden desde el lunes. `dias` son los días que le toca pagar
 * (ordenados). Solo los días cerrados (hasta ayer) cuentan como no adelantados: hoy sale
 * "en curso" mientras no lo cubra, y los días que vienen "próximo" / "adelantado".
 */
export function repartirPagosB1(dias: string[], pagos: PagoB1[], hoy = hoyART()): ResumenB1 {
  const ordenados = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.key.localeCompare(b.key))
  const pagosPorDia = new Map<string, PagoB1[]>()
  for (const p of ordenados) pagosPorDia.set(p.fecha, [...(pagosPorDia.get(p.fecha) || []), p])

  // Días y pagos agrupados por semana (también las semanas con pagos y sin días)
  const diasPorSemana = new Map<string, string[]>()
  const pagosPorSemana = new Map<string, PagoB1[]>()
  for (const d of dias) {
    const l = lunesSemanaB1(d)
    diasPorSemana.set(l, [...(diasPorSemana.get(l) || []), d])
  }
  for (const p of ordenados) {
    const l = lunesSemanaB1(p.fecha)
    pagosPorSemana.set(l, [...(pagosPorSemana.get(l) || []), p])
  }
  const lunesHoy = lunesSemanaB1(hoy)

  const resultadoDias: DiaB1[] = []
  const semanas: SemanaB1[] = []
  for (const lunes of [...new Set([...diasPorSemana.keys(), ...pagosPorSemana.keys()])].sort()) {
    const diasSemana = diasPorSemana.get(lunes) || []
    const pagosSemana = pagosPorSemana.get(lunes) || []
    const pagado = redondear(pagosSemana.reduce((s, p) => s + p.monto, 0))

    // Fecha en que lo pagado en la semana alcanzó cada monto
    let idxPago = 0
    let acumulado = 0
    const fechaQueAlcanza = (objetivo: number): string | null => {
      while (acumulado < objetivo - 0.005 && idxPago < pagosSemana.length) acumulado += pagosSemana[idxPago++].monto
      return acumulado >= objetivo - 0.005 ? pagosSemana[idxPago - 1]?.fecha ?? null : null
    }

    for (const [i, fecha] of diasSemana.entries()) {
      const cubierto = Math.max(0, Math.min(PROMO_B1_PAGO_DIARIO, pagado - i * PROMO_B1_PAGO_DIARIO))
      const cubiertoEl = cubierto >= PROMO_B1_PAGO_DIARIO - 0.005 ? fechaQueAlcanza((i + 1) * PROMO_B1_PAGO_DIARIO) : null
      let estado: EstadoDiaB1
      if (fecha > hoy) estado = cubiertoEl ? 'adelantado' : 'proximo'
      else if (fecha === hoy) estado = cubiertoEl ? 'pagado' : 'en_curso'
      else if (cubiertoEl) estado = cubiertoEl > fecha ? 'atrasado' : 'pagado'
      else estado = cubierto > 0 ? 'parcial' : 'no_pago'
      resultadoDias.push({ fecha, pagos: pagosPorDia.get(fecha) || [], cubierto, cubiertoEl, estado })
    }

    // Hoy todavía no terminó: no cuenta como día sin adelantar
    const diasVencidos = diasSemana.filter(d => d < hoy).length
    const aPagar = diasVencidos * PROMO_B1_PAGO_DIARIO
    const faltante = Math.max(0, redondear(aPagar - pagado))
    const esActual = lunes === lunesHoy
    const { semana: numero, anio } = semanaISO(lunes)
    let estado: EstadoSemanaB1
    if (diasVencidos === 0) estado = esActual || lunes > lunesHoy ? 'en_curso' : 'sin_dias'
    else if (faltante === 0) estado = esActual && diasSemana.some(d => d >= hoy) ? 'en_curso' : 'completa'
    else estado = esActual ? 'en_curso' : pagado > 0 ? 'parcial' : 'sin_pago'
    semanas.push({
      lunes, domingo: sumarDiasISO(lunes, 6), numero, anio, esActual,
      dias: diasSemana.length, diasVencidos,
      diasPagados: resultadoDias.filter(d => lunesSemanaB1(d.fecha) === lunes && d.fecha < hoy && d.cubiertoEl).length,
      aPagar, pagado, faltante, adelantado: Math.max(0, redondear(pagado - aPagar)), estado,
    })
  }

  const actual = semanas.find(s => s.esActual)
  const anteriores = semanas.filter(s => s.lunes < lunesHoy)
  return {
    dias: resultadoDias,
    semanas,
    diasVencidos: actual?.diasVencidos ?? 0,
    diasPagados: actual?.diasPagados ?? 0,
    pagadoSemana: actual?.pagado ?? 0,
    faltante: actual?.faltante ?? 0,
    adelantado: actual?.adelantado ?? 0,
    totalPagado: redondear(ordenados.reduce((s, p) => s + p.monto, 0)),
    semanasIncompletas: anteriores.filter(s => s.faltante > 0).length,
    faltanteAnteriores: redondear(anteriores.reduce((s, x) => s + x.faltante, 0)),
  }
}

export interface Usuario { id: string | null; nombre: string | null }

/** Semana (número y año) si la semana de la fecha ya está cerrada en la sede del conductor. */
export async function semanaCerrada(conductorId: string, fecha: string): Promise<{ semana: number; anio: number } | null> {
  const { data: conductor, error: errConductor } = await (supabase.from('conductores') as any)
    .select('sede_id')
    .eq('id', conductorId)
    .maybeSingle()
  if (errConductor) throw new Error(`No se pudo leer la sede del conductor: ${errConductor.message}`)
  let q = (supabase.from('periodos_facturacion') as any)
    .select('semana, anio')
    .eq('fecha_inicio', lunesSemanaB1(fecha))
    .eq('estado', 'cerrado')
  if (conductor?.sede_id) q = q.eq('sede_id', conductor.sede_id)
  const { data: cerrados, error } = await q.limit(1)
  if (error) throw new Error(`No se pudo revisar la semana del pago: ${error.message}`)
  return (cerrados || [])[0] || null
}

/** id de saldos_conductores del conductor; si no tiene, lo crea en $0. */
export async function idSaldoConductor(conductorId: string): Promise<string> {
  const { data: existente, error } = await (supabase.from('saldos_conductores') as any)
    .select('id')
    .eq('conductor_id', conductorId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el saldo del conductor: ${error.message}`)
  if (existente) return existente.id
  const { data: c, error: errC } = await (supabase.from('conductores') as any)
    .select('nombres, apellidos, numero_dni, numero_cuit, sede_id')
    .eq('id', conductorId)
    .single()
  if (errC) throw new Error(`No se pudo leer el conductor: ${errC.message}`)
  const { data: nuevo, error: errNuevo } = await (supabase.from('saldos_conductores') as any)
    .insert({
      conductor_id: conductorId,
      conductor_nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
      conductor_dni: c.numero_dni,
      conductor_cuit: c.numero_cuit,
      saldo_actual: 0,
      dias_mora: 0,
      ultima_actualizacion: new Date().toISOString(),
      ...(c.sede_id ? { sede_id: c.sede_id } : {}),
    })
    .select('id')
    .single()
  if (errNuevo) throw new Error(`No se pudo crear el saldo del conductor: ${errNuevo.message}`)
  return nuevo.id
}

/**
 * Pago diario B1 en efectivo cargado desde Saldos > Registrar Pago (tilde "Es pago diario de
 * Licencia B1"). El abono, el saldo y el historial ya los hizo Saldos: acá queda el registro
 * B1 enlazado a ese abono (si el abono se borra, el pago sale de B1). Cuenta entero como
 * adelanto con la fecha de carga (hoy: siempre una semana abierta). `fechaInformada` es la
 * fecha en que dijo que pagó: solo informativa, no cambia la semana.
 */
export async function registrarPagoB1DesdeSaldos(
  conductorId: string,
  abonoId: string,
  datos: { monto: number; fechaInformada: string | null; nota: string | null },
  usuario: Usuario,
): Promise<void> {
  const fila = {
    conductor_id: conductorId, origen: 'manual', fecha: hoyART(), monto: datos.monto,
    abono_id: abonoId, nota: datos.nota?.trim() || null,
    created_by: usuario.id, created_by_name: usuario.nombre,
  }
  const { error } = await (supabase.from('promocion_b1_pagos') as any)
    .insert({ ...fila, fecha_pago_informada: datos.fechaInformada })
  if (!error) return
  // Sin sql/promocion_b1_pagos_desde_saldos.sql todavía no está la columna: la fecha
  // informada queda en la nota
  if (error.code === '42703' || /fecha_pago_informada/.test(error.message || '')) {
    const [a, m, d] = (datos.fechaInformada || '').split('-')
    const nota = [fila.nota, datos.fechaInformada ? `Pagó el ${d}/${m}/${a}` : null].filter(Boolean).join(' · ') || null
    const { error: err2 } = await (supabase.from('promocion_b1_pagos') as any).insert({ ...fila, nota })
    if (err2) throw errorTabla(err2)
    return
  }
  throw errorTabla(error)
}
