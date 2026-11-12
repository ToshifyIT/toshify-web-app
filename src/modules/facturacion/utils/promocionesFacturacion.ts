// src/modules/facturacion/utils/promocionesFacturacion.ts
// Promociones de Parámetros > Promociones aplicadas a la facturación semanal (regla 2026-11-12).
//
// Conductor NUEVO para una promoción = ingresa por primera vez o reingresa dentro del
// período de la promoción. Fecha de ingreso:
//   - si tiene un reingreso (conductores.fecha_reincorpoaracion o un BAJA → ACTIVO en
//     historial_conductores), el primer día trabajado desde el último reingreso;
//   - si no, su primer día trabajado.
// Entra si esa fecha cae entre el desde y el hasta de la promoción.
//
// Promociones conectadas:
//   · PROMO_CYBER_DESCUENTO_10: 10% del alquiler de cada día cobrado que cae en el período
//     (desde su ingreso) y 10% del ToshiPass en proporción a esos días. Línea de descuento
//     con el código visible de la promoción (PRM01...).
//   · PROMO_CYBER_LICENCIA_B1: no descuenta nada. Marca los días que manejó con B1 (antes de
//     su fecha de obtención D1) para mostrar el pago diario de $15.000 (saldo a favor).
//
// Este archivo solo decide QUÉ días entran; el monto lo calcula cada cálculo de Facturación
// (Vista Previa y Recálculo) con el precio que ya usa para el día, igual que el referido.
// El código visible se guarda en la línea de la factura: si después se edita en
// Parámetros, las semanas ya calculadas conservan el que tenían.

import { supabase } from '../../../lib/supabase'
import { PROMO_CYBER_DESCUENTO_10, PROMO_CYBER_LICENCIA_B1 } from '../../promociones/catalogoPromociones'

export const PROMO_DESCUENTO_PORCENTAJE = 0.10
export const PROMO_B1_PAGO_DIARIO = 15000
/** referencia_tipo de las líneas de facturacion_detalle que vienen de una promoción. */
export const REFERENCIA_PROMOCION = 'promocion'

export interface PromocionFacturacion {
  id: string
  clave: string
  /** Código visible al momento de calcular (PRM01...). */
  codigo: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
}

export interface PromocionesSemana {
  /** Fecha de ingreso (o reingreso) usada para decidir si el conductor es nuevo. */
  ingresos: Map<string, { fecha: string; esReingreso: boolean }>
  /** Promoción del 10%, si está activa y su período toca la semana. */
  descuento10: PromocionFacturacion | null
  /** Días de la semana con descuento del 10%, por conductor. */
  diasDescuento10: Map<string, Set<string>>
  /** Promoción de licencia B1, si está activa y su período toca la semana. */
  licenciaB1: PromocionFacturacion | null
  /** Días de la semana que manejó con B1 dentro de la promoción, por conductor. */
  diasB1: Map<string, Set<string>>
}

export function descripcionDescuentoPromoAlquiler(nombre: string, dias: number): string {
  return `${nombre} · 10% alquiler (${dias} ${dias === 1 ? 'día' : 'días'})`
}

export function descripcionDescuentoPromoToshipass(nombre: string, dias: number): string {
  return `${nombre} · 10% ToshiPass (${dias} ${dias === 1 ? 'día' : 'días'})`
}

export function descripcionPagoDiarioB1(nombre: string, dias: number): string {
  const monto = (dias * PROMO_B1_PAGO_DIARIO).toLocaleString('es-AR')
  return `${nombre} · Pago diario B1: ${dias} ${dias === 1 ? 'día' : 'días'} × $15.000 = $${monto} (saldo a favor)`
}

/** Texto de una línea de promoción con su código adelante (para PDF y Prev. Fact.). */
export function textoLineaPromocion(codigo: string, descripcion: string): string {
  return descripcion.startsWith(`${codigo} - `) ? descripcion : `${codigo} - ${descripcion}`
}

/**
 * Descuento del 10% sobre el ToshiPass, en proporción a los días con promoción sobre los
 * días que se le cobraron en la semana.
 */
export function descuentoPromoToshipass(
  montoToshipass: number,
  diasPromo: Set<string> | undefined,
  diasCobrados: Set<string> | undefined,
): { monto: number; dias: number; base: number; diasCobrados: number } {
  const nada = { monto: 0, dias: 0, base: montoToshipass, diasCobrados: diasCobrados?.size || 0 }
  if (montoToshipass <= 0 || !diasPromo || !diasCobrados || diasCobrados.size === 0) return nada
  let dias = 0
  for (const d of diasCobrados) if (diasPromo.has(d)) dias++
  if (dias === 0) return nada
  const fraccion = Math.min(1, dias / diasCobrados.size)
  return {
    monto: Math.round(montoToshipass * PROMO_DESCUENTO_PORCENTAJE * fraccion * 100) / 100,
    dias, base: montoToshipass, diasCobrados: diasCobrados.size,
  }
}

const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function fechaArg(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp
  return argDateFmt.format(new Date(timestamp))
}

function sumarDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const LOTE_IDS = 200

function vacio(): PromocionesSemana {
  return { ingresos: new Map(), descuento10: null, diasDescuento10: new Map(), licenciaB1: null, diasB1: new Map() }
}

/**
 * Promociones vigentes en la semana [inicio, fin] (yyyy-MM-dd) y los días que le tocan a
 * cada conductor. Lanza error si no puede leer los datos: facturar sin el descuento (o con
 * uno de más) en silencio es peor que avisar.
 */
export async function cargarPromocionesSemana(
  conductorIds: string[],
  semana: { inicio: string; fin: string },
): Promise<PromocionesSemana> {
  const resultado = vacio()
  const ids = [...new Set(conductorIds.filter(Boolean))]
  if (ids.length === 0) return resultado

  // 1. Promociones activas cuyo período toca la semana
  const { data: promos, error: errPromos } = await (supabase.from('promociones') as any)
    .select('id, clave, codigo, nombre, activa, fecha_inicio, fecha_fin')
    .in('clave', [PROMO_CYBER_DESCUENTO_10, PROMO_CYBER_LICENCIA_B1])
    .eq('activa', true)
  if (errPromos) {
    // 42P01 / 42703: falta la tabla o una columna (no se corrió sql/promociones.sql)
    const faltaSql = errPromos.code === '42P01' || errPromos.code === '42703'
    throw new Error(faltaSql
      ? 'Falta actualizar la base de Promociones: correr sql/promociones.sql en Supabase.'
      : `No se pudieron leer las promociones: ${errPromos.message}`)
  }
  for (const p of (promos || []) as any[]) {
    if (!p.fecha_inicio || !p.fecha_fin) continue
    if (p.fecha_inicio > semana.fin || p.fecha_fin < semana.inicio) continue
    const promo: PromocionFacturacion = {
      id: p.id, clave: p.clave, codigo: p.codigo, nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin,
    }
    if (p.clave === PROMO_CYBER_DESCUENTO_10) resultado.descuento10 = promo
    if (p.clave === PROMO_CYBER_LICENCIA_B1) resultado.licenciaB1 = promo
  }
  if (!resultado.descuento10 && !resultado.licenciaB1) return resultado

  // 2. Asignaciones (todas: hace falta el primer día trabajado), reingresos y licencia
  const asigs: any[] = []
  const conductores: any[] = []
  const reingresos: any[] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS)
    const [rAsigs, rCond, rHist] = await Promise.all([
      (supabase.from('asignaciones_conductores') as any)
        .select('conductor_id, fecha_inicio, fecha_fin, asignaciones!inner(estado, fecha_inicio, fecha_fin)')
        .in('conductor_id', lote)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada']),
      (supabase.from('conductores') as any)
        .select('id, fecha_reincorpoaracion, categoria_licencia, fecha_licencia_b1, fecha_licencia_d1')
        .in('id', lote),
      (supabase.from('historial_conductores') as any)
        .select('conductor_id, created_at')
        .in('conductor_id', lote)
        .eq('estado_anterior', 'BAJA')
        .eq('estado_nuevo', 'ACTIVO'),
    ])
    if (rAsigs.error) throw new Error(`No se pudieron leer las asignaciones para las promociones: ${rAsigs.error.message}`)
    if (rCond.error) throw new Error(`No se pudieron leer los conductores para las promociones: ${rCond.error.message}`)
    if (rHist.error) throw new Error(`No se pudieron leer los reingresos para las promociones: ${rHist.error.message}`)
    asigs.push(...(rAsigs.data || []))
    conductores.push(...(rCond.data || []))
    reingresos.push(...(rHist.data || []))
  }

  // Último reingreso por conductor
  const ultimoReingreso = new Map<string, string>()
  const anotarReingreso = (conductorId: string, fecha: string | null) => {
    if (!fecha) return
    const actual = ultimoReingreso.get(conductorId)
    if (!actual || fecha > actual) ultimoReingreso.set(conductorId, fecha)
  }
  for (const c of conductores) anotarReingreso(c.id, fechaArg(c.fecha_reincorpoaracion))
  for (const h of reingresos) anotarReingreso(h.conductor_id, fechaArg(h.created_at))

  // Días trabajados por conductor (mismos filtros que la facturación y el referido),
  // hasta el fin de la semana
  const diasPorConductor = new Map<string, Set<string>>()
  for (const ac of asigs) {
    const padre = ac.asignaciones
    if (!padre) continue
    const estadoPadre = (padre.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(estadoPadre)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !padre.fecha_fin) continue
    const inicios = [fechaArg(ac.fecha_inicio), fechaArg(padre.fecha_inicio)].filter(Boolean) as string[]
    if (inicios.length === 0) continue
    const finales = [fechaArg(ac.fecha_fin), fechaArg(padre.fecha_fin)].filter(Boolean) as string[]
    const inicio = inicios.sort()[inicios.length - 1]
    const fin = finales.length > 0 ? finales.sort()[0] : semana.fin
    const tope = fin < semana.fin ? fin : semana.fin
    const dias = diasPorConductor.get(ac.conductor_id) || new Set<string>()
    for (let d = inicio; d <= tope; d = sumarDia(d)) dias.add(d)
    diasPorConductor.set(ac.conductor_id, dias)
  }

  const licenciaPorConductor = new Map(conductores.map(c => [c.id, c]))

  for (const [conductorId, dias] of diasPorConductor) {
    const ordenados = [...dias].sort()
    const reingreso = ultimoReingreso.get(conductorId)
    const ingreso = reingreso ? ordenados.find(d => d >= reingreso) : ordenados[0]
    if (!ingreso) continue
    resultado.ingresos.set(conductorId, { fecha: ingreso, esReingreso: !!reingreso })
    const enSemana = ordenados.filter(d => d >= semana.inicio && d <= semana.fin && d >= ingreso)

    const promo10 = resultado.descuento10
    if (promo10 && ingreso >= promo10.fecha_inicio && ingreso <= promo10.fecha_fin) {
      const elegibles = enSemana.filter(d => d >= promo10.fecha_inicio && d <= promo10.fecha_fin)
      if (elegibles.length > 0) resultado.diasDescuento10.set(conductorId, new Set(elegibles))
    }

    const promoB1 = resultado.licenciaB1
    if (promoB1 && ingreso >= promoB1.fecha_inicio && ingreso <= promoB1.fecha_fin) {
      const lic = licenciaPorConductor.get(conductorId)
      const fechaD1: string | null = lic?.fecha_licencia_d1 || null
      // Manejó con B1: categoría actual B1, o tenía B1 y la D1 la obtuvo después
      const tuvoB1 = lic?.categoria_licencia === 'B1' || (!!lic?.fecha_licencia_b1 && !!fechaD1)
      if (tuvoB1) {
        const elegibles = enSemana.filter(d =>
          d >= promoB1.fecha_inicio && d <= promoB1.fecha_fin && (!fechaD1 || d < fechaD1))
        if (elegibles.length > 0) resultado.diasB1.set(conductorId, new Set(elegibles))
      }
    }
  }

  return resultado
}

/** Un día del alquiler que entra en el 10%. */
export interface DiaPromocion {
  fecha: string
  /** Código de alquiler de ese día (P021, P023...). */
  codigo: string
  /** Precio del día con IVA. */
  precio: number
  /** Parte del día que se cobró (1 = completo, 0.5 = medio turno). */
  fraccion: number
}

/**
 * Cómo se calculó una línea de promoción. Se guarda en facturacion_detalle.descripcion
 * (JSON) para mostrarlo en el detalle del concepto.
 */
export interface CalculoPromocion {
  v: 1
  tipo: 'alquiler' | 'toshipass' | 'b1'
  promocion: { codigo: string; nombre: string; desde: string; hasta: string }
  ingreso: { fecha: string; esReingreso: boolean } | null
  porcentaje: number
  /** alquiler: días con su precio y lo descontado. */
  dias?: Array<DiaPromocion & { descuento: number }>
  /** toshipass: monto semanal, días cobrados y días con promoción. */
  base?: number
  diasCobrados?: number
  diasPromo?: number
  /** b1: días con B1 y pago diario. */
  pagoDiario?: number
  diasB1?: string[]
  monto: number
}

export function leerCalculoPromocion(texto: string | null | undefined): CalculoPromocion | null {
  if (!texto) return null
  try {
    const dato = JSON.parse(texto)
    return dato && dato.v === 1 && dato.promocion ? dato as CalculoPromocion : null
  } catch {
    return null
  }
}

/** Línea de descuento de una promoción en la factura del conductor. */
export interface LineaPromocion {
  promocionId: string
  codigo: string
  descripcion: string
  monto: number
  calculo: CalculoPromocion
}

/** Días con B1 (pago diario) de la promoción de licencia B1. No resta de la factura. */
export interface PagoDiarioB1 {
  promocionId: string
  codigo: string
  descripcion: string
  dias: number
  calculo: CalculoPromocion
}

/** 10% del alquiler de los días con promoción, con el detalle de cada día. */
export function descuentoPromoAlquiler(dias: DiaPromocion[]): { monto: number; dias: number; detalle: DiaPromocion[] } {
  const cobrados = dias.filter(d => d.fraccion > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const monto = cobrados.reduce((sum, d) => sum + d.precio * d.fraccion * PROMO_DESCUENTO_PORCENTAJE, 0)
  return { monto: Math.round(monto * 100) / 100, dias: cobrados.length, detalle: cobrados }
}

/**
 * Arma las líneas de promoción de un conductor a partir de los montos que ya calculó la
 * facturación (alquiler y ToshiPass) y los días con B1.
 */
export function lineasPromocionConductor(
  promos: PromocionesSemana,
  conductorId: string,
  alquiler: { monto: number; dias: number; detalle: DiaPromocion[] } | undefined,
  toshipass: { monto: number; dias: number; base: number; diasCobrados: number },
): { lineas: LineaPromocion[]; b1: PagoDiarioB1 | null; codigos: string[] } {
  const lineas: LineaPromocion[] = []
  const ingreso = promos.ingresos.get(conductorId) || null
  const datosPromo = (p: PromocionFacturacion) => ({ codigo: p.codigo, nombre: p.nombre, desde: p.fecha_inicio, hasta: p.fecha_fin })
  const p10 = promos.descuento10
  if (p10 && alquiler && alquiler.monto > 0) {
    lineas.push({
      promocionId: p10.id, codigo: p10.codigo, monto: alquiler.monto,
      descripcion: descripcionDescuentoPromoAlquiler(p10.nombre, alquiler.dias),
      calculo: {
        v: 1, tipo: 'alquiler', promocion: datosPromo(p10), ingreso, porcentaje: PROMO_DESCUENTO_PORCENTAJE,
        dias: alquiler.detalle.map(d => ({ ...d, descuento: Math.round(d.precio * d.fraccion * PROMO_DESCUENTO_PORCENTAJE * 100) / 100 })),
        monto: alquiler.monto,
      },
    })
  }
  if (p10 && toshipass.monto > 0) {
    lineas.push({
      promocionId: p10.id, codigo: p10.codigo, monto: toshipass.monto,
      descripcion: descripcionDescuentoPromoToshipass(p10.nombre, toshipass.dias),
      calculo: {
        v: 1, tipo: 'toshipass', promocion: datosPromo(p10), ingreso, porcentaje: PROMO_DESCUENTO_PORCENTAJE,
        base: toshipass.base, diasCobrados: toshipass.diasCobrados, diasPromo: toshipass.dias, monto: toshipass.monto,
      },
    })
  }
  let b1: PagoDiarioB1 | null = null
  const pB1 = promos.licenciaB1
  const diasB1 = promos.diasB1.get(conductorId)
  if (pB1 && diasB1 && diasB1.size > 0) {
    b1 = {
      promocionId: pB1.id, codigo: pB1.codigo, dias: diasB1.size,
      descripcion: descripcionPagoDiarioB1(pB1.nombre, diasB1.size),
      calculo: {
        v: 1, tipo: 'b1', promocion: datosPromo(pB1), ingreso, porcentaje: 0,
        pagoDiario: PROMO_B1_PAGO_DIARIO, diasB1: [...diasB1].sort(), monto: diasB1.size * PROMO_B1_PAGO_DIARIO,
      },
    }
  }
  const codigos = [...new Set([...lineas.map(l => l.codigo), ...(b1 ? [b1.codigo] : [])])]
  return { lineas, b1, codigos }
}
