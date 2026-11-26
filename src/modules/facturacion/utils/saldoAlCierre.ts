// src/modules/facturacion/utils/saldoAlCierre.ts
// Histórico de saldos por semana cerrada, leído del kardex (control_saldos).
//
// Saldo al cierre de la semana N = el efecto de todos los movimientos cargados con semana
// menor o igual a N. Los pagos de Cabify y DiDi de la semana N se cargan después (el lunes
// siguiente) pero llevan semana N, así que cuentan. Los pagos en efectivo, ajustes y demás
// movimientos de semanas posteriores no cuentan, aunque se hayan cargado antes que el pago
// de Cabify de la semana N.
//
// Ese último caso es por qué no alcanza con tomar el saldo del último movimiento de la
// semana N: el saldo del kardex es acumulado, y si el pago de Cabify se cargó después de un
// pago en efectivo de la semana siguiente, su saldo ya trae ese pago. Acá se le resta el
// efecto de cada movimiento de semanas posteriores cargado antes (efecto = su saldo menos el
// del movimiento anterior del mismo conductor).
//
// No usa la excepción de fraccionamiento de utils/saldoAnterior: esa existe para no cobrar
// dos veces la deuda en la facturación. Acá se muestra la deuda que había al cierre; si se
// fraccionó en una semana posterior, a ese cierre todavía se debía completa.

import { addWeeks, getISOWeek, getISOWeekYear } from 'date-fns'
import { supabase } from '../../../lib/supabase'

const LOTE_IDS = 200
const PAGINA = 1000

interface Movimiento {
  conductor_id: string
  saldo_pendiente: number | null
  created_at: string
}

/** Filtro PostgREST: (anio, semana) menor o igual a la semana dada. */
function hastaSemana(semana: number, anio: number): string {
  return `anio.lt.${anio},and(anio.eq.${anio},semana.lte.${semana})`
}

/** Filtro PostgREST: (anio, semana) mayor a la semana dada. */
function despuesDeSemana(semana: number, anio: number): string {
  return `anio.gt.${anio},and(anio.eq.${anio},semana.gt.${semana})`
}

/** Trae todas las filas de una consulta paginando de a 1000. */
async function traerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = (data || []) as T[]
    filas.push(...lote)
    if (lote.length < PAGINA) return filas
  }
}

function agruparPorConductor<T extends { conductor_id: string }>(filas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const f of filas) {
    const lista = mapa.get(f.conductor_id)
    if (lista) lista.push(f)
    else mapa.set(f.conductor_id, [f])
  }
  return mapa
}

const ms = (m: Movimiento) => new Date(m.created_at).getTime()

/**
 * Saldo al cierre de un conductor.
 * `hasta`: sus movimientos con semana <= N; `despues`: los de semanas posteriores cargados
 * antes del último de `hasta`. Las dos listas en orden de carga (más viejo primero).
 */
function saldoDelCierre(hasta: Movimiento[], despues: Movimiento[]): number {
  const ultimo = hasta[hasta.length - 1]
  const corte = ms(ultimo)
  // Todos los movimientos hasta el último de la semana, en orden de carga. Ante igual hora
  // se resta solo lo cargado estrictamente antes (las cargas masivas comparten la hora).
  const todos = [...hasta.map(m => ({ m, posterior: false })), ...despues.map(m => ({ m, posterior: true }))]
    .sort((a, b) => ms(a.m) - ms(b.m))
  let saldoPrevio = 0
  let aRestar = 0
  for (const { m, posterior } of todos) {
    const saldo = Number(m.saldo_pendiente) || 0
    if (posterior && ms(m) < corte) aRestar += saldo - saldoPrevio
    saldoPrevio = saldo
  }
  return Math.round(((Number(ultimo.saldo_pendiente) || 0) - aRestar) * 100) / 100
}

/**
 * conductor_id → saldo al cierre de la semana (negativo = deuda, positivo = a favor).
 * Quien no tiene movimientos hasta esa semana no aparece (saldo 0).
 */
export async function cargarSaldosAlCierre(
  conductorIds: string[],
  semana: number,
  anio: number,
): Promise<Map<string, number>> {
  const lotes: string[][] = []
  for (let i = 0; i < conductorIds.length; i += LOTE_IDS) lotes.push(conductorIds.slice(i, i + LOTE_IDS))

  const saldos = new Map<string, number>()
  await Promise.all(lotes.map(async (ids) => {
    const hasta = await traerTodo<Movimiento>((desde, h) =>
      (supabase.from('control_saldos') as any)
        .select('conductor_id, saldo_pendiente, created_at')
        .in('conductor_id', ids)
        .or(hastaSemana(semana, anio))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(desde, h))
    if (hasta.length === 0) return

    // Movimientos de semanas posteriores cargados antes del último de la semana
    const ultimaCarga = hasta.reduce((max, m) => (m.created_at > max ? m.created_at : max), hasta[0].created_at)
    const despues = await traerTodo<Movimiento>((desde, h) =>
      (supabase.from('control_saldos') as any)
        .select('conductor_id, saldo_pendiente, created_at')
        .in('conductor_id', ids)
        .or(despuesDeSemana(semana, anio))
        .lt('created_at', ultimaCarga)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(desde, h))

    const despuesPorConductor = agruparPorConductor(despues)
    for (const [id, lista] of agruparPorConductor(hasta)) {
      saldos.set(id, saldoDelCierre(lista, despuesPorConductor.get(id) || []))
    }
  }))
  return saldos
}

export interface PagosManualesSemana {
  /** Efectivo y transferencias cargados a mano */
  efectivo: number
  /** Ingresos de DiDi cargados a mano ("Pago en efectivo | Ingreso por DiDi") */
  didi: number
  /** Cantidad de pagos en efectivo y transferencias (los eliminados restan) */
  cantidad: number
}

/**
 * Pagos cargados a mano con la semana dada (control_saldos, pago_manual). Los pagos
 * eliminados (eliminacion_pago) se descuentan. Usa monto_movimiento, no la diferencia de
 * saldos, así un salto mal registrado en el kardex no cambia lo cobrado.
 */
export async function cargarPagosManualesSemana(
  conductorIds: string[],
  semana: number,
  anio: number,
): Promise<Map<string, PagosManualesSemana>> {
  const lotes: string[][] = []
  for (let i = 0; i < conductorIds.length; i += LOTE_IDS) lotes.push(conductorIds.slice(i, i + LOTE_IDS))

  const pagos = new Map<string, PagosManualesSemana>()
  await Promise.all(lotes.map(async (ids) => {
    const filas = await traerTodo<{
      conductor_id: string
      tipo_movimiento: string
      monto_movimiento: number | null
      referencia: string | null
    }>((desde, h) =>
      (supabase.from('control_saldos') as any)
        .select('conductor_id, tipo_movimiento, monto_movimiento, referencia')
        .in('conductor_id', ids)
        .eq('semana', semana)
        .eq('anio', anio)
        .in('tipo_movimiento', ['pago_manual', 'eliminacion_pago'])
        .order('id')
        .range(desde, h))
    for (const f of filas) {
      const monto = Math.abs(Number(f.monto_movimiento) || 0)
      const signo = f.tipo_movimiento === 'eliminacion_pago' ? -1 : 1
      const actual = pagos.get(f.conductor_id) || { efectivo: 0, didi: 0, cantidad: 0 }
      if (/didi/i.test(f.referencia || '')) actual.didi += signo * monto
      else {
        actual.efectivo += signo * monto
        actual.cantidad += signo
      }
      pagos.set(f.conductor_id, actual)
    }
  }))
  return pagos
}

/** Movimientos del kardex que cambian la deuda sin ser un cargo de la factura ni un cobro. */
const TIPOS_OTROS = ['ajuste_manual', 'cancelacion_fraccionado_baja', 'devolucion_garantia', 'cargo', 'abono', 'eliminacion_saldo']

export interface OtrosMovimientosSemana {
  /** Cuánto cambiaron la deuda (positivo = más deuda, negativo = menos deuda) */
  efecto: number
  cantidad: number
}

/**
 * Ajustes, cancelaciones de fraccionado por baja, devoluciones de garantía y demás
 * movimientos cargados con la semana dada. No incluye las "Regularización de saldo": esas
 * igualan el kardex con descuentos que ya están en la factura (contarlas sería doble).
 * El efecto de cada uno es su saldo menos el del movimiento anterior del conductor.
 */
export async function cargarOtrosMovimientosSemana(
  conductorIds: string[],
  semana: number,
  anio: number,
): Promise<Map<string, OtrosMovimientosSemana>> {
  const lotes: string[][] = []
  for (let i = 0; i < conductorIds.length; i += LOTE_IDS) lotes.push(conductorIds.slice(i, i + LOTE_IDS))

  const otros = new Map<string, OtrosMovimientosSemana>()
  await Promise.all(lotes.map(async (ids) => {
    const deLaSemana = (await traerTodo<{ id: string; conductor_id: string; referencia: string | null }>((desde, h) =>
      (supabase.from('control_saldos') as any)
        .select('id, conductor_id, referencia')
        .in('conductor_id', ids)
        .eq('semana', semana)
        .eq('anio', anio)
        .in('tipo_movimiento', TIPOS_OTROS)
        .order('id')
        .range(desde, h)))
      .filter(m => !/^regularizaci[oó]n de saldo/i.test(m.referencia || ''))
    if (deLaSemana.length === 0) return

    // Historial completo de esos conductores para sacar el efecto de cada movimiento
    const buscados = new Set(deLaSemana.map(m => m.id))
    const conductores = [...new Set(deLaSemana.map(m => m.conductor_id))]
    const historial = await traerTodo<Movimiento & { id: string }>((desde, h) =>
      (supabase.from('control_saldos') as any)
        .select('id, conductor_id, saldo_pendiente, created_at')
        .in('conductor_id', conductores)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(desde, h))
    for (const [id, lista] of agruparPorConductor(historial)) {
      let saldoPrevio = 0
      for (const m of lista) {
        const saldo = Number(m.saldo_pendiente) || 0
        if (buscados.has(m.id)) {
          const actual = otros.get(id) || { efecto: 0, cantidad: 0 }
          // Kardex: negativo = deuda. Bajar el saldo es sumar deuda.
          actual.efecto += saldoPrevio - saldo
          actual.cantidad += 1
          otros.set(id, actual)
        }
        saldoPrevio = saldo
      }
    }
  }))
  return otros
}

/** Semana siguiente a la dada (número ISO y año). */
export function semanaSiguiente(inicioSemana: Date): { semana: number; anio: number } {
  const sig = addWeeks(inicioSemana, 1)
  return { semana: getISOWeek(sig), anio: getISOWeekYear(sig) }
}

/**
 * Saldo que entró en la facturación de una semana (facturacion_conductores.saldo_anterior):
 * el saldo al cierre de la semana anterior menos lo que el conductor pagó durante esta,
 * hasta que se calculó la factura. Es el "Saldo pendiente de la semana anterior" del modal.
 * conductor_id → saldo con el signo de Saldos (negativo = deuda).
 * Devuelve null si esa semana todavía no tiene período en la sede.
 */
export async function cargarSaldoEnFactura(
  semana: number,
  anio: number,
  sedeId: string | null,
): Promise<{ mapa: Map<string, number>; estado: string } | null> {
  let q = (supabase.from('periodos_facturacion') as any)
    .select('id, estado')
    .eq('semana', semana)
    .eq('anio', anio)
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data: periodo, error } = await q.maybeSingle()
  if (error) throw error
  if (!periodo) return null

  const filas = await traerTodo<{ conductor_id: string; saldo_anterior: number | null }>((desde, h) =>
    (supabase.from('facturacion_conductores') as any)
      .select('conductor_id, saldo_anterior')
      .eq('periodo_id', periodo.id)
      .order('id')
      .range(desde, h))
  const mapa = new Map<string, number>()
  // `|| 0` evita el -0 (se vería "-$ 0,00")
  for (const f of filas) mapa.set(f.conductor_id, -(Number(f.saldo_anterior) || 0) || 0)
  return { mapa, estado: periodo.estado }
}
