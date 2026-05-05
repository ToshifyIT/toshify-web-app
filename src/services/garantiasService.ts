/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase'

export interface GarantiaSyncResult {
  conductor_id: string
  conductor_nombre: string
  cuotas_pagadas_anterior: number
  cuotas_pagadas_nuevo: number
  monto_pagado_anterior: number
  monto_pagado_nuevo: number
  estado_anterior: string
  estado_nuevo: string
  cambio: boolean
}

// Estados que NO deben recalcularse automáticamente (gestionados manualmente).
const ESTADOS_INMUTABLES = new Set(['cancelada', 'suspendida'])

/**
 * Recalcula garantías por PRORRATEO PROPORCIONAL del pago real.
 *
 * Regla de negocio:
 *   - Garantía universal: monto_total / cuotas_totales / cuota_semanal por garantía.
 *   - El estado es PORCENTUAL (monto_pagado / monto_total).
 *   - El número de cuota es REFERENCIAL (derivado de monto_pagado / cuota_semanal).
 *
 * Cómo se calcula monto_pagado:
 *   Por cada conductor sumamos lo realmente cobrado vía pagos_conductores y lo
 *   prorrateamos según el peso de la garantía dentro del total facturado:
 *
 *     ratio_garantia = sum(subtotal_garantia) / sum(total_a_pagar)
 *     monto_pagado_garantia = sum(pagos) * ratio_garantia
 *
 *   Esto refleja: "si pagaste el X% de tu deuda total, asumimos que pagaste el
 *   X% de cada concepto, incluida la garantía".
 *
 * MAX-only: nunca decrementa el monto_pagado existente — preserva imports
 * históricos por Excel que no estén reflejados en pagos_conductores.
 *
 * - Si conductor no tiene garantía en BD → skip.
 * - Si garantía en estado cancelada/suspendida → skip.
 * - Estados: completada (>=100%) / en_curso (>0) / pendiente (0). El estado
 *   "en_devolucion" lo deriva la UI según estado_conductor=BAJA + monto parcial.
 */
export async function recalcGarantiasForConductors(
  conductorIds: string[]
): Promise<GarantiaSyncResult[]> {
  if (conductorIds.length === 0) return []

  const [garantiasRes, periodosCerradosRes, conductoresRes] = await Promise.all([
    (supabase
      .from('garantias_conductores') as any)
      .select('id, conductor_id, conductor_nombre, cuotas_pagadas, cuotas_totales, monto_pagado, monto_total, monto_cuota_semanal, estado, fecha_completada')
      .in('conductor_id', conductorIds),
    (supabase
      .from('periodos_facturacion') as any)
      .select('id')
      .eq('estado', 'cerrado'),
    (supabase
      .from('conductores') as any)
      .select('id, estado_id, conductores_estados(codigo)')
      .in('id', conductorIds)
  ])

  const garantias = (garantiasRes.data || []) as any[]
  const periodosCerrados = (periodosCerradosRes.data || []) as any[]
  const conductores = (conductoresRes.data || []) as any[]

  if (garantias.length === 0 || periodosCerrados.length === 0) return []

  const periodoIdsCerrados = periodosCerrados.map((p: any) => p.id)

  // Cargar facturación cerrada (para calcular ratio garantía/total) + pagos.
  const [facturasRes, pagosRes] = await Promise.all([
    (supabase
      .from('facturacion_conductores') as any)
      .select('conductor_id, subtotal_garantia, total_a_pagar')
      .in('conductor_id', conductorIds)
      .in('periodo_id', periodoIdsCerrados),
    (supabase
      .from('pagos_conductores') as any)
      .select('conductor_id, monto, tipo_cobro')
      .in('conductor_id', conductorIds)
  ])

  // Acumular por conductor: garantía facturada, total facturado, total pagado.
  const garantiaFacturada = new Map<string, number>()
  const totalFacturado = new Map<string, number>()
  for (const f of (facturasRes.data || []) as any[]) {
    const cid = f.conductor_id
    const sg = Number(f.subtotal_garantia) || 0
    const tp = Number(f.total_a_pagar) || 0
    if (sg > 0) garantiaFacturada.set(cid, (garantiaFacturada.get(cid) || 0) + sg)
    if (tp > 0) totalFacturado.set(cid, (totalFacturado.get(cid) || 0) + tp)
  }

  // Total pagado por conductor: solo cuenta pagos atribuibles a facturación
  // (excluimos cobros fraccionados y penalidades, que son flujos paralelos).
  const totalPagado = new Map<string, number>()
  for (const p of (pagosRes.data || []) as any[]) {
    if (p.tipo_cobro && p.tipo_cobro !== 'facturacion_semanal') continue
    const cid = p.conductor_id
    totalPagado.set(cid, (totalPagado.get(cid) || 0) + (Number(p.monto) || 0))
  }

  const estadoConductor = new Map<string, string>()
  for (const c of conductores) {
    estadoConductor.set(c.id, c.conductores_estados?.codigo || '')
  }

  const resultados: GarantiaSyncResult[] = []
  const updates: Promise<any>[] = []

  for (const g of garantias) {
    if (ESTADOS_INMUTABLES.has(g.estado)) continue

    const cid = g.conductor_id
    const garFact = garantiaFacturada.get(cid) || 0
    const totalFact = totalFacturado.get(cid) || 0
    const totalPag = totalPagado.get(cid) || 0
    const cuotaSemanal = Number(g.monto_cuota_semanal) || 0
    const montoTotal = Number(g.monto_total) || 0
    const montoPagadoActual = Number(g.monto_pagado) || 0

    // Prorrateo: monto pagado de garantía = total pagado × ratio garantía/total
    const ratio = totalFact > 0 ? garFact / totalFact : 0
    const montoGarantiaCalculado = Math.round(totalPag * ratio * 100) / 100

    // MAX-only: nunca bajar valor existente.
    const montoPagadoNuevo = Math.min(
      Math.max(montoPagadoActual, montoGarantiaCalculado),
      montoTotal
    )

    // Cuotas referenciales: derivadas de monto_pagado / cuota_semanal.
    const cuotasNuevas = cuotaSemanal > 0
      ? Math.min(Math.round(montoPagadoNuevo / cuotaSemanal), g.cuotas_totales || 0)
      : 0

    // Nota: el constraint solo permite pendiente/en_curso/completada/cancelada/
    // suspendida. El estado "en_devolucion" es virtual — lo deriva la UI según
    // estado_conductor=BAJA + monto parcial.
    let estadoNuevo: string
    if (montoPagadoNuevo >= montoTotal && montoTotal > 0) {
      estadoNuevo = 'completada'
    } else if (montoPagadoNuevo > 0) {
      estadoNuevo = 'en_curso'
    } else {
      estadoNuevo = 'pendiente'
    }

    const cambio =
      g.cuotas_pagadas !== cuotasNuevas ||
      Math.abs(montoPagadoActual - montoPagadoNuevo) > 0.01 ||
      g.estado !== estadoNuevo

    resultados.push({
      conductor_id: cid,
      conductor_nombre: g.conductor_nombre,
      cuotas_pagadas_anterior: g.cuotas_pagadas,
      cuotas_pagadas_nuevo: cuotasNuevas,
      monto_pagado_anterior: montoPagadoActual,
      monto_pagado_nuevo: montoPagadoNuevo,
      estado_anterior: g.estado,
      estado_nuevo: estadoNuevo,
      cambio
    })

    if (cambio) {
      const fechaCompletada =
        estadoNuevo === 'completada' && g.estado !== 'completada'
          ? new Date().toISOString().slice(0, 10)
          : g.fecha_completada
      updates.push(
        (supabase.from('garantias_conductores') as any)
          .update({
            cuotas_pagadas: cuotasNuevas,
            monto_pagado: montoPagadoNuevo,
            estado: estadoNuevo,
            fecha_completada: fechaCompletada
          })
          .eq('id', g.id)
      )
    }
  }

  await Promise.all(updates)
  return resultados
}

/**
 * Recalcula garantías de todos los conductores con garantía en la sede dada.
 * Usado por el botón "Sincronizar Garantías" en GarantiasTab para fix retroactivo.
 */
export async function recalcGarantiasForSede(
  sedeId: string
): Promise<GarantiaSyncResult[]> {
  const { data: garantias } = await (supabase
    .from('garantias_conductores') as any)
    .select('conductor_id')
    .eq('sede_id', sedeId)

  const conductorIds = Array.from(
    new Set(((garantias || []) as any[]).map((g: any) => g.conductor_id).filter(Boolean))
  )
  return recalcGarantiasForConductors(conductorIds)
}

/**
 * Recalcula garantías de los conductores facturados en un período.
 * Llamado al cerrar/reabrir un período para mantener idempotencia.
 */
export async function recalcGarantiasForPeriodo(
  periodoId: string
): Promise<GarantiaSyncResult[]> {
  const { data: facturas } = await (supabase
    .from('facturacion_conductores') as any)
    .select('conductor_id')
    .eq('periodo_id', periodoId)

  const conductorIds = Array.from(
    new Set(((facturas || []) as any[]).map((f: any) => f.conductor_id).filter(Boolean))
  )
  return recalcGarantiasForConductors(conductorIds)
}
