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
 * Obtiene las semanas de facturación donde se cobró garantía (subtotal_garantia > 0)
 * para un conductor dado, junto con la semana/año del período.
 * Se usa para cruzar con el kardex y detectar cobros no reflejados.
 */
export async function getFacturacionGarantiaConductor(conductorDni: string): Promise<{
  semana: number
  anio: number
  subtotalGarantia: number
  fecha: string
}[]> {
  // 1. Obtener registros de facturacion con garantia > 0
  const { data: facts, error: e1 } = await (supabase
    .from('facturacion_conductores') as any)
    .select('periodo_id, subtotal_garantia')
    .eq('conductor_dni', conductorDni)
    .gt('subtotal_garantia', 0)

  if (e1 || !facts || facts.length === 0) return []

  // 2. Obtener semana/anio/fecha_fin de cada periodo
  const periodoIds = [...new Set(facts.map((f: any) => f.periodo_id))] as string[]
  const { data: periodos, error: e2 } = await (supabase
    .from('periodos_facturacion') as any)
    .select('id, semana, anio, fecha_fin')
    .in('id', periodoIds)

  if (e2 || !periodos) return []

  const periodoMap = new Map<string, { semana: number; anio: number; fecha: string }>()
  for (const p of periodos) {
    periodoMap.set(p.id, { semana: p.semana, anio: p.anio, fecha: p.fecha_fin || '' })
  }

  return facts
    .map((f: any) => {
      const p = periodoMap.get(f.periodo_id)
      if (!p) return null
      return { semana: p.semana, anio: p.anio, subtotalGarantia: Number(f.subtotal_garantia) || 0, fecha: p.fecha }
    })
    .filter(Boolean) as { semana: number; anio: number; subtotalGarantia: number; fecha: string }[]
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

/**
 * Sincroniza el kardex de garantías para un período recién cerrado.
 *
 * Para cada facturacion_conductores con subtotal_garantia > 0 en el período dado,
 * verifica si ya existe un control_garantias para ese conductor/semana/anio.
 * Si no existe, lo crea como cuota_facturada. Idempotente.
 *
 * Requiere que el conductor tenga un registro en garantias_conductores (garantía maestra).
 * Si no lo tiene, se salta silenciosamente.
 */
export async function syncKardexForPeriodo(periodoId: string): Promise<{
  created: number
  updated: number
  skipped: number
  errors: number
}> {
  // 1. Obtener semana/anio del período
  const { data: periodo } = await (supabase
    .from('periodos_facturacion') as any)
    .select('id, semana, anio')
    .eq('id', periodoId)
    .single()

  if (!periodo) return { created: 0, updated: 0, skipped: 0, errors: 0 }

  const semana = periodo.semana as number
  const anio = periodo.anio as number

  // 2. Obtener facturacion con garantía > 0 para este período
  const { data: facturas } = await (supabase
    .from('facturacion_conductores') as any)
    .select('conductor_id, conductor_nombre, conductor_dni, subtotal_garantia')
    .eq('periodo_id', periodoId)
    .gt('subtotal_garantia', 0)

  if (!facturas || facturas.length === 0) return { created: 0, updated: 0, skipped: 0, errors: 0 }

  const conductorIds = facturas.map((f: any) => f.conductor_id).filter(Boolean)

  // 3. Verificar cuáles ya tienen kardex para esta semana/anio
  const { data: existentes } = await (supabase
    .from('control_garantias') as any)
    .select('id, conductor_id, monto_facturado')
    .in('conductor_id', conductorIds)
    .eq('semana', semana)
    .eq('anio', anio)
    .eq('tipo_movimiento', 'cuota_facturada')

  const existenteMap = new Map<string, { id: string; monto_facturado: number }>()
  for (const e of (existentes || []) as any[]) {
    existenteMap.set(e.conductor_id, { id: e.id, monto_facturado: Number(e.monto_facturado) || 0 })
  }

  // 4. Obtener garantías maestras para TODOS los conductores (nuevos + existentes que puedan necesitar update)
  const { data: garantias } = await (supabase
    .from('garantias_conductores') as any)
    .select('id, conductor_id, conductor_nombre, conductor_dni, conductor_cuit, sede_id, monto_cuota_semanal')
    .in('conductor_id', conductorIds)

  const garMap = new Map<string, any>()
  for (const g of (garantias || []) as any[]) {
    garMap.set(g.conductor_id, g)
  }

  // 5. Insertar nuevos o actualizar existentes si el monto cambió
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const f of facturas as any[]) {
    const g = garMap.get(f.conductor_id)
    if (!g) {
      skipped++
      continue
    }

    const cuota = Math.min(Number(f.subtotal_garantia) || 0, Number(g.monto_cuota_semanal) || 50000)
    const existente = existenteMap.get(f.conductor_id)

    if (existente) {
      // Ya existe: actualizar solo si el monto cambió
      if (Math.abs(existente.monto_facturado - cuota) > 0.01) {
        const { error: updErr } = await (supabase
          .from('control_garantias') as any)
          .update({
            monto_facturado: cuota,
            monto_pagado_real: cuota,
            observaciones: `Actualizado por recálculo S${semana}/${anio}`
          })
          .eq('id', existente.id)

        if (updErr) {
          errors++
          console.error(`Error actualizando kardex para ${f.conductor_id} S${semana}/${anio}:`, updErr.message)
        } else {
          updated++
        }
      } else {
        skipped++
      }
      continue
    }

    // No existe: insertar nuevo
    const result = await insertMovimientoGarantia({
      garantiaId: g.id,
      conductorId: f.conductor_id,
      conductorNombre: g.conductor_nombre || f.conductor_nombre,
      conductorDni: g.conductor_dni || f.conductor_dni,
      conductorCuit: g.conductor_cuit,
      semana,
      anio,
      periodoId,
      tipoMovimiento: 'cuota_facturada',
      montoFacturado: cuota,
      montoPagadoReal: cuota,
      deltaDeuda: 0,
      cuotasFacturadasIncrement: 1,
      estadoGarantia: 'en_curso',
      referencia: `Cuota S${semana}/${anio} facturada`,
      observaciones: 'Cuota sistema automatico',
      createdByName: 'Sistema',
      sedeId: g.sede_id
    })

    if (result.ok) {
      created++
    } else {
      errors++
      console.error(`Error creando kardex para ${f.conductor_id} S${semana}/${anio}:`, result.error)
    }
  }

  return { created, updated, skipped, errors }
}
