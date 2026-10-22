// src/modules/facturacion/utils/toshipass.ts
// Toshipass (concepto P027): reemplaza a la garantía desde que el conductor pasa a la
// tarifa nueva, hoy OCT-26 (tipo_tarifa = 'nueva'). Una vez en tarifa nueva no se vuelve a la
// antigua, así que el régimen es permanente.
//
// Entran al régimen los conductores cuya PRIMERA asignación con tarifa nueva empezó desde
// TOSHIPASS_VIGENCIA_DESDE. Son dos casos:
//   - Conductor NUEVO: esa es su primera asignación. Nunca paga garantía.
//   - CAMBIO DE TARIFA: ya tenía asignaciones con tarifa antigua. Desde la semana del
//     cambio deja de pagar garantía y paga Toshipass. La garantía que ya pagó NO se
//     descuenta de la deuda: Garantías solo muestra el resultado (pagado + saldo) como
//     información, "DEVOLUCIÓN", y se resuelve aparte (decisión 2026-10-09).
// Los que pasaron a tarifa nueva antes del corte siguen como estaban (garantía).
//
// Cobro de Toshipass: monto fijo semanal (no proporcional). Se cobra completo si el
// conductor TRABAJÓ al menos un día de la semana; el día en que devuelve el auto (sin
// seguir con otra asignación) no cuenta como trabajado. Ej.: devuelve el lunes → no paga.
//
// La usan los dos cálculos de Facturación (Vista Previa y Recálculo) y la pestaña
// Garantías. Si se cambia acá, cambia en los tres.

import { supabase } from '../../../lib/supabase'

export const CODIGO_TOSHIPASS = 'P027'

/** Pasos a tarifa nueva anteriores a esta fecha (Argentina) no entran al régimen. */
export const TOSHIPASS_VIGENCIA_DESDE = '2026-10-09'

const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** yyyy-MM-dd en hora Argentina (los date-only se devuelven tal cual). */
function fechaArg(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp
  return argDateFmt.format(new Date(timestamp))
}

const ESTADOS_SIN_INICIO = ['programado', 'programada', 'cancelado', 'cancelada']
const LOTE_IDS = 200

export interface RegimenToshipass {
  /** Inicio (yyyy-MM-dd) de la primera asignación con tarifa nueva. */
  desde: string
  /** true si antes tuvo asignaciones con tarifa antigua (cambio de tarifa). */
  esCambioTarifa: boolean
}

/**
 * Conductores en régimen Toshipass (id → desde cuándo y si es cambio de tarifa).
 * Lanza error si no puede leer las asignaciones: facturar con un régimen equivocado
 * (garantía en vez de Toshipass, o al revés) es peor que no facturar.
 */
export async function analizarRegimenToshipass(conductorIds: string[]): Promise<Map<string, RegimenToshipass>> {
  const regimen = new Map<string, RegimenToshipass>()
  const ids = [...new Set(conductorIds.filter(Boolean))]

  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS)
    const { data, error } = await (supabase.from('asignaciones_conductores') as any)
      .select('conductor_id, fecha_inicio, tipo_tarifa, asignaciones(fecha_inicio, tipo_tarifa, estado)')
      .in('conductor_id', lote)
    if (error) throw new Error(`No se pudo determinar el régimen Toshipass: ${error.message}`)

    // Por conductor: primera asignación con tarifa nueva y si hubo alguna antigua antes
    const porConductor = new Map<string, { primeraNueva: string | null; primeraAntigua: string | null }>()
    for (const ac of (data || []) as any[]) {
      const padre = ac.asignaciones
      if (ESTADOS_SIN_INICIO.includes((padre?.estado || '').toLowerCase())) continue
      const inicio = fechaArg(ac.fecha_inicio) || fechaArg(padre?.fecha_inicio)
      if (!inicio) continue
      const esNueva = (ac.tipo_tarifa || padre?.tipo_tarifa) === 'nueva'
      const c = porConductor.get(ac.conductor_id) || { primeraNueva: null, primeraAntigua: null }
      if (esNueva) {
        if (!c.primeraNueva || inicio < c.primeraNueva) c.primeraNueva = inicio
      } else if (!c.primeraAntigua || inicio < c.primeraAntigua) {
        c.primeraAntigua = inicio
      }
      porConductor.set(ac.conductor_id, c)
    }

    for (const [conductorId, c] of porConductor) {
      if (!c.primeraNueva || c.primeraNueva < TOSHIPASS_VIGENCIA_DESDE) continue
      regimen.set(conductorId, {
        desde: c.primeraNueva,
        esCambioTarifa: !!c.primeraAntigua && c.primeraAntigua < c.primeraNueva,
      })
    }
  }

  return regimen
}

export interface ReglaToshipass {
  /** Conductores (id) que en este período pagan Toshipass en lugar de garantía. */
  conductores: Set<string>
  /** Monto semanal vigente del concepto P027 (0 si el concepto no está activo). */
  cuotaSemanal: number
}

/** Régimen Toshipass aplicado a un período (fechas yyyy-MM-dd) + monto semanal vigente. */
export async function cargarReglaToshipass(
  conductorIds: string[],
  periodo: { inicio: string; fin: string },
): Promise<ReglaToshipass> {
  const { data: concepto } = await (supabase.from('conceptos_nomina') as any)
    .select('precio_final, precio_semanal, iva_porcentaje, activo')
    .eq('codigo', CODIGO_TOSHIPASS)
    .maybeSingle()
  // Monto semanal CON IVA (lo que se cobra): "Total por semana (Sin IVA)" × (1 + IVA), mismo
  // criterio que el selector de tarifas (tarifaConceptos.ts). Ej: 41.322,31 × 1,21 = 50.000.
  // Sin total semanal cargado, el precio diario con IVA × 7 (criterio de la garantía).
  // El detalle de facturación lo muestra en neto + su renglón de IVA (ver facturacionIva).
  const iva = Number(concepto?.iva_porcentaje) || 0
  const cuotaSemanal = concepto?.activo
    ? (Number(concepto.precio_semanal) > 0
      ? Math.round(Number(concepto.precio_semanal) * (1 + iva / 100) * 100) / 100
      : Math.round((Number(concepto.precio_final) || 0) * 7))
    : 0

  const regimen = await analizarRegimenToshipass(conductorIds)
  const conductores = new Set<string>()
  for (const [conductorId, r] of regimen) {
    // Semanas anteriores al paso a tarifa nueva siguen con garantía.
    if (r.desde <= periodo.fin) conductores.add(conductorId)
  }

  return { conductores, cuotaSemanal }
}

/**
 * Días TRABAJADOS para Toshipass: los días cobrados de la semana, sin contar el día en
 * que el conductor devolvió el auto si después no siguió con otra asignación.
 *
 * @param diasCobrados   fechas (yyyy-MM-dd) que la facturación ya contó para el conductor
 * @param ultimoFin      fecha (yyyy-MM-dd) de la última fecha_fin de sus asignaciones de la semana
 * @param sigueAsignado  true si tiene alguna asignación sin fecha de fin (no devolvió el auto)
 */
export function diasTrabajadosToshipass(
  diasCobrados: Set<string> | undefined,
  ultimoFin: string | undefined,
  sigueAsignado: boolean,
): number {
  if (!diasCobrados || diasCobrados.size === 0) return 0
  let dias = diasCobrados.size
  if (!sigueAsignado && ultimoFin && diasCobrados.has(ultimoFin)) dias--
  return dias
}

// ─────────────────────── Cambio de tarifa: resultado informativo ───────────────────────

/** Garantía que todavía tenemos del conductor: lo pagado menos lo ya devuelto. */
export function garantiaRetenida(g: { monto_realmente_pagado?: number | null; monto_pagado?: number | null; monto_devuelto?: number | null } | null | undefined): number {
  if (!g) return 0
  const pagado = Number(g.monto_realmente_pagado) || Number(g.monto_pagado) || 0
  const retenida = pagado - (Number(g.monto_devuelto) || 0)
  return retenida > 0.01 ? Math.round(retenida * 100) / 100 : 0
}

// ─────────────── Devolución de garantía por cambio de tarifa (P028) ───────────────
//
// Cuando el resultado del cambio de tarifa es positivo (le debemos al conductor), desde
// Garantías se registra la "Devolución de garantía". No se paga en efectivo: es un
// crédito que la facturación de la semana en curso (según la fecha de la devolución)
// descuenta del total a pagar con el concepto P028. Así llega a Saldos por el pago de
// Cabify de esa semana, igual que cualquier descuento.

export const CODIGO_DEVOLUCION_GARANTIA = 'P028'
export const DESCRIPCION_DEVOLUCION_GARANTIA = 'Devolución de Garantía'

/** Marca en garantias_devoluciones.referencia: estas devoluciones se descuentan en facturación. */
export const MARCA_DEVOLUCION_CAMBIO_TARIFA = 'DEV_CAMBIO_TARIFA'

/** Referencia que se guarda: marca + texto que cargó el usuario. */
export function referenciaDevolucionCambioTarifa(textoUsuario: string | null | undefined): string {
  const texto = (textoUsuario || '').trim() || 'Devolución de garantía por cambio de tarifa'
  return `${MARCA_DEVOLUCION_CAMBIO_TARIFA} — ${texto}`
}

export function esDevolucionCambioTarifa(referencia: string | null | undefined): boolean {
  return (referencia || '').startsWith(MARCA_DEVOLUCION_CAMBIO_TARIFA)
}

/** Referencia para mostrar (sin la marca interna). */
export function referenciaVisible(referencia: string | null | undefined): string {
  return (referencia || '').replace(new RegExp(`^${MARCA_DEVOLUCION_CAMBIO_TARIFA}\\s*—\\s*`), '')
}

/**
 * Devoluciones de garantía por cambio de tarifa registradas dentro del período (fechas
 * yyyy-MM-dd, días completos en hora Argentina). conductor_id → monto total del período.
 */
export async function cargarDevolucionesCambioTarifaEnPeriodo(
  conductorIds: string[],
  periodo: { inicio: string; fin: string },
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(conductorIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS)
    const { data, error } = await (supabase.from('garantias_devoluciones') as any)
      .select('conductor_id, monto')
      .in('conductor_id', lote)
      .like('referencia', `${MARCA_DEVOLUCION_CAMBIO_TARIFA}%`)
      .gte('fecha_devolucion', `${periodo.inicio}T00:00:00-03:00`)
      .lte('fecha_devolucion', `${periodo.fin}T23:59:59.999-03:00`)
    if (error) throw new Error(`No se pudieron leer las devoluciones de garantía: ${error.message}`)
    for (const d of (data || []) as any[]) {
      out.set(d.conductor_id, Math.round(((out.get(d.conductor_id) || 0) + (Number(d.monto) || 0)) * 100) / 100)
    }
  }
  return out
}
