// Desglose de un pago manual en el Control de Saldos: cuánto debía el conductor antes de
// pagar y de dónde sale (la factura de la última semana cerrada menos lo que pagó después).
// Lo usan el Control de Saldos de Facturación y el del panel del conductor.

/** Lo mínimo de un movimiento del kardex. Signo del kardex: negativo = deuda. */
export interface MovimientoKardexMin {
  tipo: string
  saldo: number
  referencia: string | null
  semana: number | null
  anio: number | null
}

export interface DesglosePago {
  /** Semana de la factura de la que sale la deuda, "S47/2026" */
  semanaFactura: string
  /** Lo que quedó debiendo al cerrar esa semana (positivo = deuda) */
  facturado: number
  /** Movimientos entre el cierre y este pago (negativo = bajó la deuda) */
  movimientos: Array<{ nombre: string; monto: number }>
  /** Lo que debía justo antes de este pago */
  pendiente: number
  /** Este pago (negativo: baja la deuda) */
  pago: number
  /** Saldo después del pago (positivo = deuda, negativo = a favor) */
  despues: number
}

const TIPOS_CIERRE = new Set(['cierre_sin_pago', 'regularizado'])

/**
 * `rows` en el orden del Control de Saldos (más nuevo primero) e `idx` el pago.
 * Devuelve null si antes del pago no había deuda o no hay un cierre de semana anterior.
 */
export function desglosarPago(
  rows: MovimientoKardexMin[],
  idx: number,
  nombreTipo: (tipo: string) => string,
): DesglosePago | null {
  const previo = rows[idx + 1]
  if (!previo) return null
  const pendiente = -previo.saldo
  // Menos de $1 es residuo de centavos (Saldo ya lo muestra como $0): no había deuda
  if (pendiente < 1) return null

  // Último cierre de semana (o facturación vieja) anterior al pago
  let k = idx + 1
  while (k < rows.length && !TIPOS_CIERRE.has(rows[k].tipo)) k++
  if (k >= rows.length) return null
  const cierre = rows[k]

  const movimientos: DesglosePago['movimientos'] = []
  for (let j = k - 1; j > idx; j--) {
    const monto = -(rows[j].saldo - rows[j + 1].saldo)
    if (Math.abs(monto) < 0.01) continue
    movimientos.push({ nombre: rows[j].referencia || nombreTipo(rows[j].tipo), monto })
  }

  return {
    semanaFactura: `S${cierre.semana}/${cierre.anio}`,
    facturado: -cierre.saldo,
    movimientos,
    pendiente,
    pago: -(rows[idx].saldo - previo.saldo),
    despues: -rows[idx].saldo,
  }
}
