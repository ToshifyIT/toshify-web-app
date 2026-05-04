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
 * Recalcula cuotas_pagadas de las garantías a partir de la cantidad de
 * facturacion_conductores con subtotal_garantia > 0 en períodos CERRADOS.
 *
 * Regla MAX-only: nunca baja un valor existente, solo sube si la facturación
 * cerrada cuenta más cuotas que las registradas. Esto preserva datos
 * históricos importados manualmente (ej. via Excel) que no están reflejados
 * en facturacion_conductores.
 *
 * - Si conductor no tiene garantía en BD → skip.
 * - Si garantía en estado cancelada/suspendida → skip.
 * - Si conductor está de BAJA y tiene pagos parciales → estado en_devolucion.
 * - Else: completada / en_curso / pendiente según cuotas y monto.
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

  const { data: facturasGarantia } = await (supabase
    .from('facturacion_conductores') as any)
    .select('conductor_id, periodo_id, subtotal_garantia')
    .in('conductor_id', conductorIds)
    .in('periodo_id', periodoIdsCerrados)
    .gt('subtotal_garantia', 0)

  // Contar cuotas por conductor (1 factura cerrada con garantía = 1 cuota).
  const cuotasPorConductor = new Map<string, number>()
  for (const f of (facturasGarantia || []) as any[]) {
    cuotasPorConductor.set(f.conductor_id, (cuotasPorConductor.get(f.conductor_id) || 0) + 1)
  }

  const estadoConductor = new Map<string, string>()
  for (const c of conductores) {
    estadoConductor.set(c.id, c.conductores_estados?.codigo || '')
  }

  const resultados: GarantiaSyncResult[] = []
  const updates: Promise<any>[] = []

  for (const g of garantias) {
    if (ESTADOS_INMUTABLES.has(g.estado)) continue

    const cuotasContadas = cuotasPorConductor.get(g.conductor_id) || 0
    const cuotasActuales = Number(g.cuotas_pagadas) || 0
    // MAX-only: nunca decrementar (preserva imports históricos no reflejados
    // en facturacion_conductores).
    const cuotasNuevas = Math.min(
      Math.max(cuotasActuales, cuotasContadas),
      g.cuotas_totales || 0
    )
    const cuotaSemanal = Number(g.monto_cuota_semanal) || 0
    const montoTotal = Number(g.monto_total) || 0
    const montoPagadoNuevo = Math.min(
      Math.round(cuotasNuevas * cuotaSemanal * 100) / 100,
      montoTotal
    )

    const esBaja = estadoConductor.get(g.conductor_id) === 'BAJA'
    let estadoNuevo: string
    if (esBaja && montoPagadoNuevo > 0 && montoPagadoNuevo < montoTotal) {
      estadoNuevo = 'en_devolucion'
    } else if (montoPagadoNuevo >= montoTotal && montoTotal > 0) {
      estadoNuevo = 'completada'
    } else if (montoPagadoNuevo > 0) {
      estadoNuevo = 'en_curso'
    } else {
      estadoNuevo = 'pendiente'
    }

    const cambio =
      g.cuotas_pagadas !== cuotasNuevas ||
      Math.abs(Number(g.monto_pagado) - montoPagadoNuevo) > 0.01 ||
      g.estado !== estadoNuevo

    resultados.push({
      conductor_id: g.conductor_id,
      conductor_nombre: g.conductor_nombre,
      cuotas_pagadas_anterior: g.cuotas_pagadas,
      cuotas_pagadas_nuevo: cuotasNuevas,
      monto_pagado_anterior: Number(g.monto_pagado),
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
