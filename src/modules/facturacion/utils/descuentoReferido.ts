// src/modules/facturacion/utils/descuentoReferido.ts
// Descuento del 5% en la primera semana del conductor REFERIDO (conductores.referido = true
// con embajador cargado). El embajador no lo recibe: a él le corresponde el bono de
// procesar_bonos_referidos() en la base.
//
// Regla (2026-11-03):
//   - Son sus primeros 7 días TRABAJADOS (días con asignación), contados desde el primero.
//     Si queda sin asignación y vuelve, sigue contando. Si pasa a BAJA antes de completar
//     los 7, los que faltan se pierden aunque lo reactiven.
//   - Solo para referidos cuyo primer día es desde DESCUENTO_REFERIDO_VIGENCIA_DESDE.
//   - Por cada día: 5% del alquiler de ese día (precio_final, ya incluye IVA). Si ese día se
//     cobró medio turno, el 5% es sobre ese medio turno.
//   - Cada día se descuenta en la semana de facturación en la que cae, así que un ingreso de
//     viernes reparte el descuento: vie-dom en esa semana y lun-jue en la siguiente.
//
// La usan los dos cálculos de Facturación (Vista Previa y Recálculo). Este archivo solo
// decide QUÉ días entran; el monto lo calcula cada uno con el precio que ya usa para el día.

import { supabase } from '../../../lib/supabase'

/** Referidos cuyo primer día trabajado es anterior a esta fecha (Argentina) no lo reciben. */
export const DESCUENTO_REFERIDO_VIGENCIA_DESDE = '2026-11-03'
export const DESCUENTO_REFERIDO_DIAS = 7
export const DESCUENTO_REFERIDO_PORCENTAJE = 0.05

export function descripcionDescuentoReferido(dias: number): string {
  return `Descuento 5% primera semana (${dias} ${dias === 1 ? 'día' : 'días'})`
}

const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** yyyy-MM-dd en hora Argentina (los date-only se devuelven tal cual). */
function fechaArg(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp
  return argDateFmt.format(new Date(timestamp))
}

function sumarDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const LOTE_IDS = 200

/**
 * Días de la semana [inicio, fin] (yyyy-MM-dd) que entran en el descuento, por conductor.
 * Solo devuelve conductores con al menos un día en la semana.
 * Lanza error si no puede leer los datos: facturar sin el descuento (o con uno de más) en
 * silencio es peor que avisar.
 */
export async function cargarDiasDescuentoReferido(
  conductorIds: string[],
  semana: { inicio: string; fin: string },
): Promise<Map<string, Set<string>>> {
  const resultado = new Map<string, Set<string>>()
  const ids = [...new Set(conductorIds.filter(Boolean))]

  // 1. Referidos con embajador
  const referidos: string[] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await (supabase.from('conductores') as any)
      .select('id, embajador_id')
      .in('id', ids.slice(i, i + LOTE_IDS))
      .eq('referido', true)
      .not('embajador_id', 'is', null)
    if (error) throw new Error(`No se pudieron leer los referidos: ${error.message}`)
    for (const c of (data || []) as any[]) {
      if (c.embajador_id !== c.id) referidos.push(c.id)
    }
  }
  if (referidos.length === 0) return resultado

  // 2. Asignaciones (todas, no solo la semana: hay que contar los días ya usados) y bajas
  const [{ data: asigs, error: errAsigs }, { data: bajas, error: errBajas }] = await Promise.all([
    (supabase.from('asignaciones_conductores') as any)
      .select('conductor_id, fecha_inicio, fecha_fin, asignaciones!inner(estado, fecha_inicio, fecha_fin)')
      .in('conductor_id', referidos)
      .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada']),
    (supabase.from('historial_conductores') as any)
      .select('conductor_id, created_at')
      .in('conductor_id', referidos)
      .eq('estado_nuevo', 'BAJA'),
  ])
  if (errAsigs) throw new Error(`No se pudieron leer las asignaciones de los referidos: ${errAsigs.message}`)
  if (errBajas) throw new Error(`No se pudo leer el historial de bajas de los referidos: ${errBajas.message}`)

  const bajasPorConductor = new Map<string, string[]>()
  for (const b of (bajas || []) as any[]) {
    const f = fechaArg(b.created_at)
    if (!f) continue
    const lista = bajasPorConductor.get(b.conductor_id) || []
    lista.push(f)
    bajasPorConductor.set(b.conductor_id, lista)
  }

  // Días con asignación por conductor, con los mismos filtros que la facturación:
  // sin asignaciones programadas ni huérfanas; inicio = el más tardío (entrega real),
  // fin = el más temprano; abierta = hasta el fin de la semana.
  const diasPorConductor = new Map<string, Set<string>>()
  for (const ac of (asigs || []) as any[]) {
    const padre = ac.asignaciones
    if (!padre) continue
    const estadoPadre = (padre.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(estadoPadre)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !padre.fecha_fin) continue
    const inicios = [fechaArg(ac.fecha_inicio), fechaArg(padre.fecha_inicio)].filter(Boolean) as string[]
    if (inicios.length === 0) continue
    const finales = [fechaArg(ac.fecha_fin), fechaArg(padre.fecha_fin)].filter(Boolean) as string[]
    const inicio = inicios.sort()[inicios.length - 1]
    const fin = finales.length > 0 ? finales.sort()[0] : semana.fin
    const tope = fin < semana.fin ? fin : semana.fin
    const dias = diasPorConductor.get(ac.conductor_id) || new Set<string>()
    for (let d = inicio; d <= tope; d = sumarDia(d)) dias.add(d)
    diasPorConductor.set(ac.conductor_id, dias)
  }

  // 3. Primeros 7 días desde el primero, cortando en la primera baja
  for (const [conductorId, dias] of diasPorConductor) {
    const ordenados = [...dias].sort()
    const primerDia = ordenados[0]
    if (!primerDia || primerDia < DESCUENTO_REFERIDO_VIGENCIA_DESDE) continue
    const baja = (bajasPorConductor.get(conductorId) || []).filter(f => f >= primerDia).sort()[0]
    const elegibles = ordenados
      .filter(d => !baja || d <= baja)
      .slice(0, DESCUENTO_REFERIDO_DIAS)
      .filter(d => d >= semana.inicio && d <= semana.fin)
    if (elegibles.length > 0) resultado.set(conductorId, new Set(elegibles))
  }

  return resultado
}
