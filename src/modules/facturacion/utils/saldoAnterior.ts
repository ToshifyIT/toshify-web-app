// src/modules/facturacion/utils/saldoAnterior.ts
// Saldo anterior de cada conductor para la facturación de una semana.
//
// Regla general: el último movimiento del kardex (control_saldos) hasta la semana
// facturada, con los movimientos ya ordenados por año, semana y created_at descendente.
//
// Excepción: si el conductor tiene un "Fraccionamiento de saldo", toda la deuda que tenía
// al fraccionar pasó a las cuotas (P010). Los movimientos creados ANTES del plan se ignoran
// para no cobrar esa deuda dos veces (como saldo anterior y como cuota). Pasaba cuando ya
// había un movimiento en la semana de la primera cuota (ej. un pago en efectivo) cargado
// antes de fraccionar: quedaba por encima del ajuste a $0 y arrastraba la deuda completa.
//
// Solo aplica a los planes creados desde "Fraccionar" en Saldos. Los cargos que se cargan
// ya fraccionados ("Agregar saldo") cubren solo ese cargo, no la deuda previa.
// La usan Vista Previa y Recálculo. Si se cambia acá, cambia en los dos.

/** Prefijo de la descripción de las cuotas creadas desde "Fraccionar" en Saldos. */
export const PREFIJO_FRACCIONAMIENTO_SALDO = 'Fraccionamiento de saldo'

interface MovimientoKardex {
  conductor_id: string
  saldo_pendiente: number | null
  created_at: string
}

interface CuotaFraccionada {
  conductor_id: string
  descripcion: string | null
  created_at: string
}

/**
 * Devuelve conductor_id → saldo_actual (signo del kardex: negativo = deuda).
 * Si un conductor no tiene movimientos válidos no aparece en el mapa (saldo 0).
 */
export function construirSaldosAnteriores(
  movimientosDesc: MovimientoKardex[],
  cuotas: CuotaFraccionada[],
): Map<string, { conductor_id: string; saldo_actual: number }> {
  // Creación del fraccionamiento de saldo más reciente por conductor
  const fraccionadoDesde = new Map<string, number>()
  for (const c of cuotas) {
    if (!c.descripcion?.startsWith(PREFIJO_FRACCIONAMIENTO_SALDO)) continue
    const creado = new Date(c.created_at).getTime()
    if (creado > (fraccionadoDesde.get(c.conductor_id) ?? 0)) fraccionadoDesde.set(c.conductor_id, creado)
  }

  const saldos = new Map<string, { conductor_id: string; saldo_actual: number }>()
  for (const m of movimientosDesc) {
    if (saldos.has(m.conductor_id)) continue
    const desde = fraccionadoDesde.get(m.conductor_id)
    if (desde && new Date(m.created_at).getTime() < desde) continue
    saldos.set(m.conductor_id, { conductor_id: m.conductor_id, saldo_actual: m.saldo_pendiente || 0 })
  }
  return saldos
}
