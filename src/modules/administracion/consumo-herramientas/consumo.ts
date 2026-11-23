// src/modules/administracion/consumo-herramientas/consumo.ts
// Cuentas del consumo real de las herramientas por uso (2Chat, Google Cloud):
// total del mes, proyección a fin de mes y cuánto queda del saldo prepago.

import type { ConsumoDia, Herramienta, Moneda } from './types'
import { convertir } from './types'

/** Días que se miran para calcular el ritmo de gasto del prepago */
export const DIAS_RITMO = 14
/** Con menos días de saldo que estos, se avisa en rojo */
export const DIAS_AVISO_SALDO = 7

export interface ResumenConsumo {
  /** Moneda en la que se muestra todo (la de la herramienta; si no tiene, la del consumo) */
  moneda: Moneda
  /** Total del mes elegido */
  total: number
  conceptos: { concepto: string; monto: number; cantidad: number | null; unidad: string | null }[]
  /** Total del mes anterior al elegido */
  anterior: number
  /** Solo en el mes en curso: total estimado al cierre con el ritmo del mes */
  proyeccion: number | null
  /** Último día con consumo cargado (cualquier mes) */
  ultimoDia: string | null
  prepago: {
    saldo: number
    fecha: string
    /** Concepto del que se descuenta (null = todo el consumo) */
    concepto: string | null
    usado: number
    queda: number
    /** Gasto promedio por día de los últimos DIAS_RITMO días */
    ritmoDiario: number
    /** Día estimado en que se termina el saldo (null si no hay gasto reciente) */
    alcanzaHasta: string | null
    diasRestantes: number | null
  } | null
}

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const mesAnterior = (mes: string) => sumarDias(`${mes}-01`, -1).slice(0, 7)

/**
 * @param filas consumo de UNA herramienta (cualquier fecha)
 * @param mes 'YYYY-MM' elegido en la pantalla
 * @param hoy 'YYYY-MM-DD' en hora Argentina
 */
export function resumirConsumo(
  h: Herramienta,
  filas: ConsumoDia[],
  mes: string,
  hoy: string,
  tasas: Map<string, number>,
): ResumenConsumo {
  const moneda: Moneda = h.moneda || filas[0]?.moneda || 'USD'
  // Sin cotización el monto queda en su moneda original (mejor que mostrar cero)
  const enMoneda = (f: ConsumoDia) => convertir(Number(f.monto), f.moneda, moneda, tasas) ?? Number(f.monto)
  const sumar = (lista: ConsumoDia[]) => lista.reduce((t, f) => t + enMoneda(f), 0)

  const delMes = filas.filter(f => f.fecha.startsWith(mes))
  const total = sumar(delMes)

  const porConcepto = new Map<string, { monto: number; cantidad: number | null; unidad: string | null }>()
  delMes.forEach(f => {
    const c = porConcepto.get(f.concepto) || { monto: 0, cantidad: null, unidad: f.unidad }
    c.monto += enMoneda(f)
    if (f.cantidad !== null && f.cantidad !== undefined) c.cantidad = (c.cantidad ?? 0) + Number(f.cantidad)
    porConcepto.set(f.concepto, c)
  })
  const conceptos = [...porConcepto.entries()]
    .map(([concepto, c]) => ({ concepto, ...c }))
    .sort((a, b) => b.monto - a.monto)

  // Proyección: lo gastado hasta ayer, al mismo ritmo, hasta el último día del mes
  let proyeccion: number | null = null
  if (mes === hoy.slice(0, 7)) {
    const dia = Number(hoy.slice(8, 10))
    const [y, m] = mes.split('-').map(Number)
    const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const hastaAyer = sumar(delMes.filter(f => f.fecha < hoy))
    if (dia > 1 && hastaAyer > 0) proyeccion = total + (hastaAyer / (dia - 1)) * (diasDelMes - dia)
  }

  const ultimoDia = filas.reduce<string | null>((u, f) => (!u || f.fecha > u ? f.fecha : u), null)

  let prepago: ResumenConsumo['prepago'] = null
  if (h.saldo_prepago !== null && h.saldo_prepago !== undefined && h.saldo_prepago_fecha) {
    const saldo = Number(h.saldo_prepago)
    const fecha = h.saldo_prepago_fecha
    // El saldo es el del cierre de ese día: se descuenta desde el día siguiente
    // En Google el prepago de Gemini es una billetera aparte de la de Maps
    const concepto = h.saldo_prepago_concepto || null
    const delSaldo = concepto ? filas.filter(f => f.concepto === concepto) : filas
    const usado = sumar(delSaldo.filter(f => f.fecha > fecha))
    const queda = saldo - usado
    const desde = sumarDias(hoy, -DIAS_RITMO)
    const ritmoDiario = sumar(delSaldo.filter(f => f.fecha >= desde && f.fecha < hoy)) / DIAS_RITMO
    const diasRestantes = ritmoDiario > 0 ? Math.max(0, Math.floor(queda / ritmoDiario)) : null
    prepago = {
      saldo, fecha, concepto, usado, queda, ritmoDiario, diasRestantes,
      alcanzaHasta: diasRestantes === null ? null : sumarDias(hoy, diasRestantes),
    }
  }

  return { moneda, total, conceptos, anterior: sumar(filas.filter(f => f.fecha.startsWith(mesAnterior(mes)))), proyeccion, ultimoDia, prepago }
}
