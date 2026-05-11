/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase'

/**
 * Tipos de movimiento del kardex de garantías.
 * Análogo a control_saldos.tipo_movimiento.
 */
export type TipoMovimientoGarantia =
  | 'cuota_facturada'   // se facturó P003 en una semana (acumula hacia las 20 cuotas)
  | 'pago_aplicado'     // un pago real cubrió parcial/total una cuota (cap $50k/semana)
  | 'ajuste_manual'     // admin editó manualmente desde la UI
  | 'eliminacion'       // se eliminó/reversó un pago histórico

/**
 * Fila del kardex tal como sale de la BD (control_garantias).
 */
export interface ControlGarantiaRow {
  id: string
  garantia_id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  conductor_cuit: string | null
  semana: number | null
  anio: number | null
  periodo_id: string | null
  tipo_movimiento: TipoMovimientoGarantia
  monto_facturado: number
  monto_pagado_real: number
  delta_deuda: number
  facturado_acumulado: number
  pagado_real_acumulado: number
  cuotas_facturadas: number
  estado_garantia: string | null
  referencia: string | null
  observaciones: string | null
  created_at: string
  created_by_name: string | null
  sede_id: string | null
}

/**
 * Carga el historial completo del kardex de una garantía, ordenado de más reciente a más viejo.
 */
export async function getKardexGarantia(garantiaId: string): Promise<ControlGarantiaRow[]> {
  const { data, error } = await (supabase
    .from('control_garantias') as any)
    .select('*')
    .eq('garantia_id', garantiaId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error cargando kardex garantía:', error)
    return []
  }
  return (data || []) as ControlGarantiaRow[]
}

/**
 * Inserta un movimiento en el kardex.
 * Calcula los acumulados leyendo el último movimiento existente.
 *
 * KISS: el llamador pasa solo lo que cambia (monto_facturado, monto_pagado_real, delta_deuda)
 * y este servicio se encarga de los acumulados.
 */
export async function insertMovimientoGarantia(params: {
  garantiaId: string
  conductorId: string
  conductorNombre?: string | null
  conductorDni?: string | null
  conductorCuit?: string | null
  semana?: number
  anio?: number
  periodoId?: string | null
  tipoMovimiento: TipoMovimientoGarantia
  montoFacturado?: number
  montoPagadoReal?: number
  deltaDeuda?: number
  cuotasFacturadasIncrement?: number  // típicamente 1 cuando es cuota_facturada
  estadoGarantia?: string
  referencia?: string
  observaciones?: string
  createdByName?: string
  sedeId?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Leer último movimiento para arrastrar acumulados
  const { data: ultimo } = await (supabase
    .from('control_garantias') as any)
    .select('facturado_acumulado, pagado_real_acumulado, cuotas_facturadas')
    .eq('garantia_id', params.garantiaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const facturadoPrev = Number(ultimo?.facturado_acumulado) || 0
  const pagadoPrev = Number(ultimo?.pagado_real_acumulado) || 0
  const cuotasPrev = Number(ultimo?.cuotas_facturadas) || 0

  const montoFact = Number(params.montoFacturado) || 0
  const montoPag = Number(params.montoPagadoReal) || 0
  const delta = Number(params.deltaDeuda) || 0
  const cuotasInc = Number(params.cuotasFacturadasIncrement) || 0

  const { data, error } = await (supabase
    .from('control_garantias') as any)
    .insert({
      garantia_id: params.garantiaId,
      conductor_id: params.conductorId,
      conductor_nombre: params.conductorNombre || null,
      conductor_dni: params.conductorDni || null,
      conductor_cuit: params.conductorCuit || null,
      semana: params.semana ?? null,
      anio: params.anio ?? null,
      periodo_id: params.periodoId ?? null,
      tipo_movimiento: params.tipoMovimiento,
      monto_facturado: montoFact,
      monto_pagado_real: montoPag,
      delta_deuda: delta,
      facturado_acumulado: facturadoPrev + montoFact,
      pagado_real_acumulado: pagadoPrev + montoPag,
      cuotas_facturadas: cuotasPrev + cuotasInc,
      estado_garantia: params.estadoGarantia || null,
      referencia: params.referencia || null,
      observaciones: params.observaciones || null,
      created_by_name: params.createdByName || 'Sistema',
      sede_id: params.sedeId ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error insertando movimiento garantía:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, id: data?.id }
}
