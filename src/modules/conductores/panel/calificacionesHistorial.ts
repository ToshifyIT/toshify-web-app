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
import { calificarConductor, referenciaIngresos, type ExcesosRecientes } from './calificacionConductor'

export interface CalificacionSemana {
  semana_inicio: string
  estrellas: number
  puntaje: number
  parcial: boolean
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

/** Lunes (YYYY-MM-DD) de la última semana cerrada. */
export function lunesSemanaCerrada(): string {
  return cabifyService.getWeekRange(1).startDate.slice(0, 10)
}

export async function guardarSemanaCerradaSiFalta(sedeId: string | null, conductorIds: string[]): Promise<void> {
  const semana = lunesSemanaCerrada()
  const clave = `${semana}|${sedeId ?? 'todas'}`
  if (yaRevisadas.has(clave) || !conductorIds.length) return
  yaRevisadas.add(clave)
  try {
    // ¿Ya está calculada esa semana para estos conductores?
    const { count, error } = await (supabase.from('conductor_calificaciones' as any) as any)
      .select('conductor_id', { count: 'exact', head: true })
      .eq('semana_inicio', semana)
      .in('conductor_id', conductorIds.slice(0, 150))
    if (error) throw error
    if ((count ?? 0) > 0) return

    const rango = cabifyService.getWeekRange(1)
    const filas = await cargarPanelConductores(sedeId, { cabify: { startDate: rango.startDate, endDate: rango.endDate } })
    const ref = referenciaIngresos(filas)
    // Excesos de km hasta el domingo de la semana cerrada (+2 días: se cargan al facturar)
    const finSemana = new Date(`${rango.endDate.slice(0, 10)}T23:59:59-03:00`)
    const excesos = await cargarExcesosRecientes(filas.map(f => f.id), new Date(finSemana.getTime() + 2 * 86400000))
    const payload = filas
      .map(r => ({ r, c: calificarConductor(r, ref, excesos) }))
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
  } catch (err) {
    // Sin tabla (SQL sin ejecutar) o sin conexión: se reintenta la próxima vez
    yaRevisadas.delete(clave)
    console.error('[Calificaciones] No se pudo guardar la semana cerrada', err)
  }
}

export async function cargarHistorial(conductorId: string, semanas = 8): Promise<CalificacionSemana[]> {
  const { data, error } = await (supabase.from('conductor_calificaciones' as any) as any)
    .select('semana_inicio, estrellas, puntaje, parcial')
    .eq('conductor_id', conductorId)
    .order('semana_inicio', { ascending: false })
    .limit(semanas)
  if (error) throw error
  return ((data || []) as CalificacionSemana[]).map(d => ({ ...d, estrellas: Number(d.estrellas), puntaje: Number(d.puntaje) }))
}
