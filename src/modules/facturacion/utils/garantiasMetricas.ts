// src/modules/facturacion/utils/garantiasMetricas.ts
// Métricas de garantías para tableros (Dashboard KPI's).
//
// MISMAS reglas que Facturación > Garantías (GarantiasTab.tsx): monto pagado,
// "en devolución" para conductores de baja, días hábiles de baja, neto contra la
// cuenta corriente y el umbral de 120 días. Si cambian allá, hay que cambiarlas acá.

export interface GarantiaFila {
  id: string
  conductor_id: string
  estado: string | null
  monto_pagado: number | null
  monto_realmente_pagado?: number | null
  monto_devuelto: number | null
}

export interface ConductorFila {
  id: string
  esActivo: boolean
  fecha_terminacion: string | null
  updated_at: string | null
}

const TOLERANCIA_DEVOLUCION = 0.01
export const DIAS_BAJA_PARA_DEVOLVER = 120

const montoPagado = (g: GarantiaFila) => Number(g.monto_realmente_pagado || g.monto_pagado || 0)

/** Días hábiles (lunes a viernes) desde la baja hasta hoy. */
function diasHabilesDesde(fecha: string | null): number {
  if (!fecha) return 0
  let dias = 0
  const cur = new Date(fecha)
  const hoy = new Date()
  while (cur <= hoy) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) dias++
    cur.setDate(cur.getDate() + 1)
  }
  return dias
}

export interface MetricasGarantias {
  enCurso: { cantidad: number; monto: number }
  /** Le debemos al conductor y la baja tiene menos de 120 días hábiles */
  devolucionReciente: { cantidad: number; monto: number }
  /** Le debemos al conductor y la baja tiene 120 días hábiles o más ("En Devolución" de Garantías) */
  devolucionVencida: { cantidad: number; monto: number }
  /** Aun descontando la garantía, el conductor nos debe ("Debe" de Garantías) */
  debe: { cantidad: number; monto: number }
}

export function calcularMetricasGarantias(
  garantias: GarantiaFila[],
  conductores: ConductorFila[],
  saldos: Map<string, number>,
): MetricasGarantias {
  const conductoresMap = new Map(conductores.map(c => [c.id, c]))
  const out: MetricasGarantias = {
    enCurso: { cantidad: 0, monto: 0 },
    devolucionReciente: { cantidad: 0, monto: 0 },
    devolucionVencida: { cantidad: 0, monto: 0 },
    debe: { cantidad: 0, monto: 0 },
  }

  for (const g of garantias) {
    const c = conductoresMap.get(g.conductor_id)
    const esBaja = c ? !c.esActivo : false
    const pagado = montoPagado(g)
    const devuelto = Number(g.monto_devuelto || 0)
    // Conductor de baja con plata pagada: se trata como en devolución (igual que Garantías)
    const estado = esBaja && pagado > 0 && g.estado !== 'cancelada' ? 'en_devolucion' : g.estado
    const noAplica = esBaja && !(pagado > 0)

    if (estado === 'en_curso') {
      if (!noAplica) {
        out.enCurso.cantidad++
        out.enCurso.monto += pagado
      }
      continue
    }
    if (estado !== 'en_devolucion' || noAplica) continue

    // Devuelta: ya no queda nada por devolver
    const devuelta = pagado - devuelto < TOLERANCIA_DEVOLUCION && (pagado <= 0 || devuelto > 0)
    if (devuelta) continue

    const saldo = saldos.get(g.conductor_id)
    if (saldo === undefined) continue // sin cuenta corriente: no se puede netear
    const neto = saldo + (pagado - devuelto)
    if (Math.abs(neto) < TOLERANCIA_DEVOLUCION) continue // neto saldado

    if (neto < 0) {
      out.debe.cantidad++
      out.debe.monto += Math.abs(neto)
      continue
    }
    // Le debemos al conductor
    const fechaBaja = c?.fecha_terminacion
      ? c.fecha_terminacion.substring(0, 10)
      : esBaja && c?.updated_at ? c.updated_at.substring(0, 10) : null
    const dias = esBaja ? diasHabilesDesde(fechaBaja) : 0
    const destino = dias >= DIAS_BAJA_PARA_DEVOLVER ? out.devolucionVencida : out.devolucionReciente
    destino.cantidad++
    destino.monto += neto
  }
  return out
}
