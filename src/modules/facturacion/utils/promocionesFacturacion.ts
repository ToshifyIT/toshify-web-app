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
//   · PROMO_CYBER_LICENCIA_B1: paga $15.000 por día mientras maneja con B1 (antes de su
//     fecha de obtención D1). Lo pagado en la semana (Cresium + registros a mano, ver
//     pagosB1.ts) resta como saldo a favor con el código de la promoción (PRM02). Si no
//     pagó nada, queda una línea informativa en $0 con los días.
//
// Este archivo solo decide QUÉ días entran; el monto lo calcula cada cálculo de Facturación
// (Vista Previa y Recálculo) con el precio que ya usa para el día, igual que el referido.
// El código visible se guarda en la línea de la factura: si después se edita en
// Parámetros, las semanas ya calculadas conservan el que tenían.

import { supabase } from '../../../lib/supabase'
import { quitarDiasPromocion } from '../../../utils/conceptoLabels'
import { PROMO_CYBER_DESCUENTO_10, PROMO_CYBER_LICENCIA_B1 } from '../../promociones/catalogoPromociones'
import { cargarPagosB1, ETIQUETA_EMPRESA_CRESIUM, PROMO_B1_PAGO_DIARIO } from './pagosB1'
import type { ConductorPagoB1, PagoB1 } from './pagosB1'

export { PROMO_B1_PAGO_DIARIO }
export const PROMO_DESCUENTO_PORCENTAJE = 0.10
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
  /** Pagos diarios B1 con fecha en la semana, por conductor (saldo a favor). */
  pagosB1: Map<string, PagoB1[]>
}

// Sin la cantidad de días en el texto (pedido 2026-11-13): el detalle de días está en el ⓘ.
export function descripcionDescuentoPromoAlquiler(nombre: string): string {
  return `${nombre} · 10% alquiler`
}

export function descripcionDescuentoPromoToshipass(nombre: string): string {
  return `${nombre} · 10% ToshiPass`
}

/** Texto de la línea de pagos diarios B1 en la factura (pedido 2026-11-13). */
export const TEXTO_PAGO_B1 = 'B1 - Pago Transferencia Bancaria'

/**
 * Texto de la línea de pagos diarios B1 en la factura: siempre "B1 - Pago Transferencia
 * Bancaria", sea el pago de Cresium o cargado a mano (el detalle de cada pago está en el ⓘ).
 */
export function textoPagoSemanalB1(): string {
  return TEXTO_PAGO_B1
}

/**
 * Texto para mostrar una línea de la factura de pagos diarios B1 (sin el código adelante).
 * Se arma con el desglose guardado, así sirve también para semanas ya calculadas.
 * null si la línea no es de pagos B1.
 */
export function textoLineaPagoB1(descripcion: string | null | undefined): string | null {
  const calculo = leerCalculoPromocion(descripcion)
  if (calculo?.tipo !== 'b1' || !(calculo.monto > 0)) return null
  return textoPagoSemanalB1()
}

export function descripcionPagoDiarioB1(nombre: string, dias: number, pagado = 0): string {
  const textoDias = `${dias} ${dias === 1 ? 'día' : 'días'} × $15.000`
  if (pagado > 0) return textoPagoSemanalB1()
  const monto = (dias * PROMO_B1_PAGO_DIARIO).toLocaleString('es-AR')
  return `${nombre} · Pago diario B1: ${textoDias} = $${monto} (sin pagos en la semana)`
}

/** Texto de una línea de promoción con su código adelante (para PDF y Prev. Fact.). */
export function textoLineaPromocion(codigo: string, descripcion: string): string {
  const texto = quitarDiasPromocion(descripcion)
  return texto.startsWith(`${codigo} - `) ? texto : `${codigo} - ${texto}`
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
  return {
    ingresos: new Map(), descuento10: null, diasDescuento10: new Map(), licenciaB1: null, diasB1: new Map(), pagosB1: new Map(),
  }
}

/** Ingreso (o reingreso), días trabajados y licencia de un conductor. */
export interface DatosIngresoConductor {
  ingreso: { fecha: string; esReingreso: boolean }
  /** Días trabajados hasta la fecha pedida, ordenados. */
  dias: string[]
  dni: string | null
  cuit: string | null
  categoriaLicencia: string | null
  fechaLicenciaB1: string | null
  fechaLicenciaD1: string | null
}

/**
 * Fecha de ingreso (o reingreso) y días trabajados de cada conductor hasta `hasta`
 * (yyyy-MM-dd). Mismos filtros de asignaciones que la facturación y el referido.
 */
export async function cargarIngresosConductores(
  conductorIds: string[],
  hasta: string,
): Promise<Map<string, DatosIngresoConductor>> {
  const resultado = new Map<string, DatosIngresoConductor>()
  const ids = [...new Set(conductorIds.filter(Boolean))]
  if (ids.length === 0) return resultado

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
        .select('id, numero_dni, numero_cuit, fecha_reincorpoaracion, categoria_licencia, fecha_licencia_b1, fecha_licencia_d1')
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

  // Días trabajados por conductor hasta la fecha pedida
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
    const fin = finales.length > 0 ? finales.sort()[0] : hasta
    const tope = fin < hasta ? fin : hasta
    const dias = diasPorConductor.get(ac.conductor_id) || new Set<string>()
    for (let d = inicio; d <= tope; d = sumarDia(d)) dias.add(d)
    diasPorConductor.set(ac.conductor_id, dias)
  }

  const datosConductor = new Map(conductores.map(c => [c.id, c]))
  for (const [conductorId, dias] of diasPorConductor) {
    const ordenados = [...dias].sort()
    const reingreso = ultimoReingreso.get(conductorId)
    const ingreso = reingreso ? ordenados.find(d => d >= reingreso) : ordenados[0]
    if (!ingreso) continue
    const c = datosConductor.get(conductorId)
    resultado.set(conductorId, {
      ingreso: { fecha: ingreso, esReingreso: !!reingreso },
      dias: ordenados,
      dni: c?.numero_dni ?? null,
      cuit: c?.numero_cuit ?? null,
      categoriaLicencia: c?.categoria_licencia ?? null,
      fechaLicenciaB1: c?.fecha_licencia_b1 ?? null,
      fechaLicenciaD1: c?.fecha_licencia_d1 ?? null,
    })
  }
  return resultado
}

/**
 * Período en que el conductor paga por día con la promoción de licencia B1, o null si no
 * entra: tiene que haber ingresado (o reingresado) dentro del período de la promoción y
 * haber manejado con B1. Termina el día antes de obtener la D1 o al terminar la promoción.
 */
export function periodoPagoB1(
  promo: { fecha_inicio: string; fecha_fin: string },
  datos: DatosIngresoConductor,
): { desde: string; hasta: string } | null {
  const ingreso = datos.ingreso.fecha
  if (ingreso < promo.fecha_inicio || ingreso > promo.fecha_fin) return null
  const fechaD1 = datos.fechaLicenciaD1
  // Manejó con B1: categoría actual B1, o tenía B1 y la D1 la obtuvo después
  const tuvoB1 = datos.categoriaLicencia === 'B1' || (!!datos.fechaLicenciaB1 && !!fechaD1)
  if (!tuvoB1) return null
  const antesD1 = fechaD1 ? restarDia(fechaD1) : null
  const hasta = antesD1 && antesD1 < promo.fecha_fin ? antesD1 : promo.fecha_fin
  return hasta >= ingreso ? { desde: ingreso, hasta } : null
}

function restarDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
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

  // 2. Ingreso (o reingreso), días trabajados y licencia de cada conductor
  const datos = await cargarIngresosConductores(ids, semana.fin)
  const conductoresB1: ConductorPagoB1[] = []

  for (const [conductorId, d] of datos) {
    const ingreso = d.ingreso.fecha
    resultado.ingresos.set(conductorId, d.ingreso)
    const enSemana = d.dias.filter(dia => dia >= semana.inicio && dia <= semana.fin && dia >= ingreso)

    const promo10 = resultado.descuento10
    if (promo10 && ingreso >= promo10.fecha_inicio && ingreso <= promo10.fecha_fin) {
      const elegibles = enSemana.filter(dia => dia >= promo10.fecha_inicio && dia <= promo10.fecha_fin)
      if (elegibles.length > 0) resultado.diasDescuento10.set(conductorId, new Set(elegibles))
    }

    const promoB1 = resultado.licenciaB1
    const periodo = promoB1 ? periodoPagoB1(promoB1, d) : null
    if (periodo) {
      const elegibles = enSemana.filter(dia => dia >= periodo.desde && dia <= periodo.hasta)
      if (elegibles.length > 0) resultado.diasB1.set(conductorId, new Set(elegibles))
      conductoresB1.push({ id: conductorId, dni: d.dni, cuit: d.cuit, ...periodo })
    }
  }

  // 3. Pagos diarios B1 de la semana (Cresium + registros a mano): saldo a favor
  if (conductoresB1.length > 0) {
    resultado.pagosB1 = await cargarPagosB1(conductoresB1, { desde: semana.inicio, hasta: semana.fin })
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
  /** b1: días con B1, pago diario y lo pagado en la semana. */
  pagoDiario?: number
  diasB1?: string[]
  pagos?: Array<{ fecha: string; monto: number; origen: string; pagador: string | null; detalle: string }>
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

/** De dónde salió un pago diario B1, para el detalle de la factura. */
function detallePagoB1(p: PagoB1): string {
  if (p.origen === 'manual') return 'Carga manual'
  const empresa = p.empresa ? ETIQUETA_EMPRESA_CRESIUM[p.empresa] || p.empresa : ''
  return `Cresium ${empresa}${p.origen === 'cresium' ? ' (asignado a mano)' : ''}`.trim()
}

/** true si la línea es el pago diario de la licencia B1: es un pago, no un descuento comercial. */
export function esPagoPromocionB1(descripcion: string | null | undefined): boolean {
  return leerCalculoPromocion(descripcion)?.tipo === 'b1'
}

/** Línea de descuento de una promoción en la factura del conductor. */
export interface LineaPromocion {
  promocionId: string
  codigo: string
  descripcion: string
  monto: number
  calculo: CalculoPromocion
}

/** Días con B1 de la promoción de licencia B1 cuando no pagó nada en la semana ($0). */
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
      descripcion: descripcionDescuentoPromoAlquiler(p10.nombre),
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
      descripcion: descripcionDescuentoPromoToshipass(p10.nombre),
      calculo: {
        v: 1, tipo: 'toshipass', promocion: datosPromo(p10), ingreso, porcentaje: PROMO_DESCUENTO_PORCENTAJE,
        base: toshipass.base, diasCobrados: toshipass.diasCobrados, diasPromo: toshipass.dias, monto: toshipass.monto,
      },
    })
  }
  // Licencia B1: lo pagado en la semana resta como saldo a favor; sin pagos, informativa en $0
  let b1: PagoDiarioB1 | null = null
  const pB1 = promos.licenciaB1
  const diasB1 = [...(promos.diasB1.get(conductorId) || [])].sort()
  const pagosB1 = promos.pagosB1.get(conductorId) || []
  if (pB1 && (diasB1.length > 0 || pagosB1.length > 0)) {
    const pagado = Math.round(pagosB1.reduce((s, p) => s + p.monto, 0) * 100) / 100
    const calculo: CalculoPromocion = {
      v: 1, tipo: 'b1', promocion: datosPromo(pB1), ingreso, porcentaje: 0,
      pagoDiario: PROMO_B1_PAGO_DIARIO, diasB1,
      pagos: pagosB1.map(p => ({ fecha: p.fecha, monto: p.monto, origen: p.origen, pagador: p.pagador, detalle: detallePagoB1(p) })),
      monto: pagado,
    }
    const descripcion = descripcionPagoDiarioB1(pB1.nombre, diasB1.length, pagado)
    if (pagado > 0) lineas.push({ promocionId: pB1.id, codigo: pB1.codigo, monto: pagado, descripcion, calculo })
    else b1 = { promocionId: pB1.id, codigo: pB1.codigo, dias: diasB1.length, descripcion, calculo }
  }
  const codigos = [...new Set([...lineas.map(l => l.codigo), ...(b1 ? [b1.codigo] : [])])]
  return { lineas, b1, codigos }
}
