// Aportes (pagos del conductor) que se usaron para bajar una deuda que después se fraccionó.
//
// "Fraccionar" en Saldos pasa TODO el saldo del momento a cuotas (P010) y deja el saldo
// en $0 con un ajuste_manual. Un pago registrado entre el último cierre (pago_cabify) y
// ese fraccionamiento ya está descontado dentro del monto fraccionado: no paga los
// cargos de la semana. Si se lo resta en "Aportes" se cuenta dos veces.
//
// La usan el Panel de Conductores (detalle de semana) y el Portal (Mi Espacio).

import { supabase } from '../lib/supabase'

/** Prefijo de la referencia del ajuste que registra un fraccionamiento de saldo. */
const PREFIJO_AJUSTE_FRACCIONAMIENTO = 'Fraccionamiento de saldo'

/** Tipos de aporte que pueden quedar dentro de una deuda fraccionada (pago_cabify es el cierre). */
const TIPOS_APORTE_MANUAL = ['pago_manual', 'pago', 'pago_cuota', 'pago_efectivo']

interface MovimientoKardex {
  id: string
  tipo_movimiento: string
  referencia: string | null
  created_at: string
}

/** IDs de los movimientos de aporte que quedaron dentro de un fraccionamiento de saldo. */
export function idsAportesEnFraccionamiento(movimientos: MovimientoKardex[]): Set<string> {
  const ids = new Set<string>()
  const ms = (m: MovimientoKardex) => new Date(m.created_at).getTime()
  const ajustes = movimientos.filter(m =>
    m.tipo_movimiento === 'ajuste_manual' &&
    String(m.referencia || '').startsWith(PREFIJO_AJUSTE_FRACCIONAMIENTO))

  for (const ajuste of ajustes) {
    const ajusteMs = ms(ajuste)
    // Último cierre antes del fraccionamiento (si no hay, desde el inicio)
    const desdeMs = movimientos
      .filter(m => m.tipo_movimiento === 'pago_cabify' && ms(m) < ajusteMs)
      .reduce((max, m) => Math.max(max, ms(m)), -Infinity)
    for (const m of movimientos) {
      if (TIPOS_APORTE_MANUAL.includes(m.tipo_movimiento) && ms(m) > desdeMs && ms(m) < ajusteMs) {
        ids.add(m.id)
      }
    }
  }
  return ids
}

export interface DesgloseFraccionamiento {
  saldoCierre: number            // deuda al cierre de la semana previa (positivo = deuda)
  cierreSemana: number | null
  // Movimientos entre el cierre y el fraccionamiento (más viejo primero).
  // monto > 0 = bajó la deuda (pago); monto < 0 = la subió (cargo).
  pagos: Array<{ id: string; tipo: string; monto: number; ref: string; fecha: string | null }>
  fraccionamiento: { monto: number; cuotas: number; fecha: string }
}

/**
 * Desglose del saldo anterior de una semana en la que se cobra la cuota 1 de un
 * "Fraccionamiento de saldo": cierre de la semana previa - pagos hasta el fraccionamiento
 * - deuda fraccionada = saldo_anterior. Solo visual. Devuelve null si la semana no tiene
 * cuota 1 o si los números no cierran contra saldo_anterior.
 * La usan Facturación (detalle), el Panel de Conductores y el Portal.
 */
export async function cargarDesgloseFraccionamiento(
  conductorId: string,
  saldoAnterior: number,
  detalles: Array<{ concepto_descripcion?: string | null; referencia_id?: string | null; referencia_tipo?: string | null }>,
): Promise<DesgloseFraccionamiento | null> {
  const cuota1 = detalles.find(d =>
    d.referencia_tipo === 'cobro_fraccionado' && d.referencia_id &&
    /^Fraccionamiento de saldo - Cuota 1\/\d+/.test(d.concepto_descripcion || ''))
  if (!cuota1) return null
  const cuotas = Number(/Cuota 1\/(\d+)/.exec(cuota1.concepto_descripcion || '')?.[1]) || 0

  const { data: plan } = await (supabase.from('cobros_fraccionados') as any)
    .select('created_at')
    .eq('id', cuota1.referencia_id)
    .single()
  if (!plan) return null
  const planMs = new Date(plan.created_at).getTime()

  const { data: movs } = await (supabase.from('control_saldos') as any)
    .select('id, semana, tipo_movimiento, monto_movimiento, saldo_pendiente, referencia, created_at')
    .eq('conductor_id', conductorId)
    .lte('created_at', new Date(planMs + 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30)
  const lista = (movs || []) as any[]

  // Ajuste a $0 que registró el fraccionamiento (se crea segundos después de las cuotas)
  const ajuste = lista.find(m =>
    m.tipo_movimiento === 'ajuste_manual' &&
    String(m.referencia || '').startsWith(PREFIJO_AJUSTE_FRACCIONAMIENTO) &&
    new Date(m.created_at).getTime() >= planMs)
  if (!ajuste) return null
  const ajusteMs = new Date(ajuste.created_at).getTime()

  // Cierre de la semana previa: último pago_cabify antes del fraccionamiento
  const idxCierre = lista.findIndex(m => m.tipo_movimiento === 'pago_cabify' && new Date(m.created_at).getTime() < ajusteMs)
  if (idxCierre < 0) return null
  const cierre = lista[idxCierre]

  const pagos: DesgloseFraccionamiento['pagos'] = []
  let saldoPrev = Number(cierre.saldo_pendiente) || 0
  for (const m of lista.slice(0, idxCierre).reverse()) {
    if (new Date(m.created_at).getTime() >= ajusteMs) continue
    const saldoMov = Number(m.saldo_pendiente) || 0
    const efecto = Math.round((saldoMov - saldoPrev) * 100) / 100
    saldoPrev = saldoMov
    if (Math.abs(efecto) < 0.01) continue
    pagos.push({ id: String(m.id), tipo: m.tipo_movimiento, monto: efecto, ref: m.referencia || m.tipo_movimiento, fecha: m.created_at || null })
  }

  const saldoCierre = -(Number(cierre.saldo_pendiente) || 0)
  const montoFraccionado = Number(ajuste.monto_movimiento) || 0
  const totalPagos = pagos.reduce((acc, p) => acc + p.monto, 0)
  const centavos = (n: number) => Math.round(n * 100)
  if (centavos(saldoCierre - totalPagos - montoFraccionado) !== centavos(saldoAnterior)) return null

  return {
    saldoCierre,
    cierreSemana: Number(cierre.semana) || null,
    pagos,
    fraccionamiento: { monto: montoFraccionado, cuotas, fecha: ajuste.created_at },
  }
}
