// src/modules/conductores/panel/calificacionesHistorial.ts
// Historial semanal de calificaciones (tabla conductor_calificaciones, ver
// sql/conductor_calificaciones.sql).
//  - guardarSemanaCerradaSiFalta: la primera vez que se abre el panel desde el lunes,
//    calcula la calificación de la semana que terminó (con los datos de Cabify de esa
//    semana) y la guarda para todos los conductores. Si ya está guardada, no hace nada.
//  - cargarHistorial: últimas semanas de un conductor, para el detalle.
import { supabase } from '../../../lib/supabase'
import { cabifyService } from '../../../services/cabifyService'
import { cargarPanelConductores } from './conductoresPanelService'
import { calificarConductor, referenciaIngresos, type ExcesosRecientes, type ExtrasCalificacion, type FactorGuardado } from './calificacionConductor'

export interface CalificacionSemana {
  semana_inicio: string
  estrellas: number
  puntaje: number
  parcial: boolean
  factores?: FactorGuardado[] | null
}

const yaRevisadas = new Set<string>()

/**
 * Excesos de km registrados en Facturación (excesos_kilometraje) en las 4 semanas
 * anteriores a `hasta`, por conductor. null si no se pudo leer.
 */
export async function cargarExcesosRecientes(conductorIds: string[], hasta: Date = new Date()): Promise<Map<string, ExcesosRecientes> | null> {
  try {
    const desde = new Date(hasta.getTime() - 28 * 86400000).toISOString()
    const filas: { conductor_id: string; periodo_id: string | null; km_exceso: number | null; monto_total: number | null; created_at: string }[] = []
    for (let i = 0; i < conductorIds.length; i += 150) {
      const { data, error } = await (supabase.from('excesos_kilometraje') as any)
        .select('conductor_id, periodo_id, km_exceso, monto_total, created_at')
        .in('conductor_id', conductorIds.slice(i, i + 150))
        .gte('created_at', desde)
        .lte('created_at', hasta.toISOString())
      if (error) throw error
      filas.push(...(data || []))
    }
    const porConductor = new Map<string, { semanas: Set<string>; km: number; monto: number }>()
    for (const f of filas) {
      if (!f.conductor_id || !(Number(f.km_exceso) > 0)) continue
      const acc = porConductor.get(f.conductor_id) ?? { semanas: new Set<string>(), km: 0, monto: 0 }
      acc.semanas.add(f.periodo_id || f.created_at.slice(0, 10))
      acc.km += Number(f.km_exceso) || 0
      acc.monto += Number(f.monto_total) || 0
      porConductor.set(f.conductor_id, acc)
    }
    const out = new Map<string, ExcesosRecientes>()
    for (const [id, a] of porConductor) out.set(id, { veces: a.semanas.size, km: a.km, monto: a.monto })
    return out
  } catch (err) {
    console.error('[Calificaciones] No se pudieron leer los excesos de km', err)
    return null
  }
}

const LOTE = 150
const DIA = 86400000

/**
 * Datos de la calificación que el panel no trae, hasta la fecha `hasta`:
 *  - cargoSemanal: lo que tenía que cubrir en la semana (total a pagar − saldo anterior
 *    de su facturación más reciente: alquiler + garantía o Toshipass + cargos de la semana).
 *  - siniestrosCulpa: siniestros con culpa del conductor en las 12 semanas previas.
 *  - antiguedadSemanas: semanas desde su primera asignación.
 * Cada parte es tolerante: si falla queda en null y ese factor no cuenta.
 */
export async function cargarExtrasCalificacion(conductorIds: string[], hasta: Date = new Date()): Promise<ExtrasCalificacion> {
  const lotes: string[][] = []
  for (let i = 0; i < conductorIds.length; i += LOTE) lotes.push(conductorIds.slice(i, i + LOTE))
  const hastaIso = hasta.toISOString()

  const cargo = (async () => {
    const desde = new Date(hasta.getTime() - 21 * DIA).toISOString().slice(0, 10)
    const out = new Map<string, { inicio: string; monto: number }>()
    for (const lote of lotes) {
      const { data, error } = await (supabase.from('facturacion_conductores') as any)
        .select('conductor_id, total_a_pagar, saldo_anterior, periodos_facturacion!inner(fecha_inicio)')
        .in('conductor_id', lote)
        .gte('periodos_facturacion.fecha_inicio', desde)
        .lte('periodos_facturacion.fecha_inicio', hastaIso.slice(0, 10))
      if (error) throw error
      for (const f of (data || []) as any[]) {
        const inicio = String(f.periodos_facturacion?.fecha_inicio || '')
        const monto = (Number(f.total_a_pagar) || 0) - (Number(f.saldo_anterior) || 0)
        const prev = out.get(f.conductor_id)
        if (monto > 0 && (!prev || inicio > prev.inicio)) out.set(f.conductor_id, { inicio, monto })
      }
    }
    return new Map([...out].map(([k, v]) => [k, v.monto]))
  })().catch(err => { console.error('[Calificaciones] cargo semanal', err); return null })

  const siniestros = (async () => {
    const desde = new Date(hasta.getTime() - 84 * DIA).toISOString().slice(0, 10)
    const out = new Map<string, number>()
    for (const lote of lotes) {
      const { data, error } = await (supabase.from('v_siniestros_completos' as any) as any)
        .select('conductor_id')
        .in('conductor_id', lote)
        .eq('responsable', 'conductor')
        .gte('fecha_siniestro', desde)
        .lte('fecha_siniestro', hastaIso.slice(0, 10))
      if (error) throw error
      for (const s of (data || []) as { conductor_id: string }[]) out.set(s.conductor_id, (out.get(s.conductor_id) || 0) + 1)
    }
    return out
  })().catch(err => { console.error('[Calificaciones] siniestros', err); return null })

  const antiguedad = (async () => {
    const primera = new Map<string, string>()
    for (const lote of lotes) {
      const { data, error } = await (supabase.from('asignaciones_conductores') as any)
        .select('conductor_id, fecha_inicio')
        .in('conductor_id', lote)
        .not('fecha_inicio', 'is', null)
        .lte('fecha_inicio', hastaIso)
      if (error) throw error
      for (const a of (data || []) as { conductor_id: string; fecha_inicio: string }[]) {
        const p = primera.get(a.conductor_id)
        if (!p || a.fecha_inicio < p) primera.set(a.conductor_id, a.fecha_inicio)
      }
    }
    return new Map([...primera].map(([k, f]) => [k, Math.max(0, (hasta.getTime() - new Date(f).getTime()) / (7 * DIA))]))
  })().catch(err => { console.error('[Calificaciones] antigüedad', err); return null })

  const [cargoSemanal, siniestrosCulpa, antiguedadSemanas] = await Promise.all([cargo, siniestros, antiguedad])
  return { cargoSemanal, siniestrosCulpa, antiguedadSemanas }
}

/** Lunes (YYYY-MM-DD) de la última semana cerrada. */
export function lunesSemanaCerrada(): string {
  return cabifyService.getWeekRange(1).startDate.slice(0, 10)
}

/** true si guardó la semana (para recargar lo que muestra la tabla). */
export async function guardarSemanaCerradaSiFalta(sedeId: string | null, conductorIds: string[]): Promise<boolean> {
  const semana = lunesSemanaCerrada()
  const clave = `${semana}|${sedeId ?? 'todas'}`
  if (yaRevisadas.has(clave) || !conductorIds.length) return false
  yaRevisadas.add(clave)
  try {
    // ¿Ya está calculada esa semana para estos conductores?
    const { count, error } = await (supabase.from('conductor_calificaciones' as any) as any)
      .select('conductor_id', { count: 'exact', head: true })
      .eq('semana_inicio', semana)
      .in('conductor_id', conductorIds.slice(0, 150))
    if (error) throw error
    if ((count ?? 0) > 0) return false

    const rango = cabifyService.getWeekRange(1)
    const filas = await cargarPanelConductores(sedeId, { cabify: { startDate: rango.startDate, endDate: rango.endDate } })
    const ref = referenciaIngresos(filas)
    // Excesos de km hasta el domingo de la semana cerrada (+2 días: se cargan al facturar)
    const finSemana = new Date(`${rango.endDate.slice(0, 10)}T23:59:59-03:00`)
    const [excesos, extras] = await Promise.all([
      cargarExcesosRecientes(filas.map(f => f.id), new Date(finSemana.getTime() + 2 * 86400000)),
      // Facturación de la semana cerrada: se genera al cerrar, así que se mira hasta +2 días
      cargarExtrasCalificacion(filas.map(f => f.id), new Date(finSemana.getTime() + 2 * 86400000)),
    ])
    const payload = filas
      .map(r => ({ r, c: calificarConductor(r, ref, excesos, extras) }))
      .filter(({ c }) => c.estrellas !== null && c.puntaje !== null)
      .map(({ r, c }) => ({
        conductor_id: r.id,
        estrellas: c.estrellas,
        puntaje: Number((c.puntaje as number).toFixed(4)),
        parcial: c.parcial,
        factores: c.factores.map(f => ({ clave: f.clave, puntaje: f.puntaje, valor: f.valor, explicacion: f.explicacion })),
      }))
    for (let i = 0; i < payload.length; i += 500) {
      const { error: e2 } = await (supabase.rpc as any)('guardar_calificaciones_semana', {
        p_semana: semana,
        p_filas: payload.slice(i, i + 500),
      })
      if (e2) throw e2
    }
    return payload.length > 0
  } catch (err) {
    // Sin tabla (SQL sin ejecutar) o sin conexión: se reintenta la próxima vez
    yaRevisadas.delete(clave)
    console.error('[Calificaciones] No se pudo guardar la semana cerrada', err)
    return false
  }
}

/**
 * Calificación guardada de la última semana cerrada, por conductor. Es la que muestra
 * la tabla: la semana en curso recién empieza el lunes y todavía no tiene viajes.
 */
export async function cargarSemanaCerradaGuardada(): Promise<Map<string, CalificacionSemana>> {
  const semana = lunesSemanaCerrada()
  const out = new Map<string, CalificacionSemana>()
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await (supabase.from('conductor_calificaciones' as any) as any)
      .select('conductor_id, semana_inicio, estrellas, puntaje, parcial, factores')
      .eq('semana_inicio', semana)
      .range(desde, desde + 999)
    if (error) throw error
    for (const d of (data || []) as (CalificacionSemana & { conductor_id: string })[]) out.set(d.conductor_id, d)
    if (!data || data.length < 1000) break
  }
  return out
}

export async function cargarHistorial(conductorId: string, semanas = 12): Promise<CalificacionSemana[]> {
  const { data, error } = await (supabase.from('conductor_calificaciones' as any) as any)
    .select('semana_inicio, estrellas, puntaje, parcial, factores')
    .eq('conductor_id', conductorId)
    .order('semana_inicio', { ascending: false })
    .limit(semanas)
  if (error) throw error
  return ((data || []) as CalificacionSemana[]).map(d => ({ ...d, estrellas: Number(d.estrellas), puntaje: Number(d.puntaje) }))
}
