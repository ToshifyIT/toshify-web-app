// src/modules/onboarding/programacion-v2/vehiculoActivoService.ts
//
// Resuelve "que vehiculo tiene hoy asignado tal conductor".
//
// Lo necesita la precarga de "Cambio de Vehiculo" que viene del mapa v2: el
// par trae personas, no vehiculos, y el mapa solo conoce la PATENTE de la
// asignacion (dato cacheado). Para ofrecer el vehiculo como origen o destino
// hace falta su id real, asi que se relee de la BD.
//
// Una sola consulta para los dos miembros del par: no se llama por conductor.

import { supabase } from '../../../lib/supabase'

/** Estados de `asignaciones_conductores` que cuentan como "lo tiene ahora". */
const ESTADOS_VIGENTES = ['asignado', 'activo']

export interface VehiculoActivoDeConductor {
  conductorId: string
  asignacionId: string
  vehiculoId: string
  patente: string | null
  modelo: string | null
  /** Turno del conductor dentro de esa asignacion: diurno | nocturno | todo_dia. */
  horarioConductor: string | null
  /** Modalidad de la asignacion: 'turno' | 'todo_dia'. */
  horarioAsignacion: string | null
}

/**
 * Devuelve, por conductor, el vehiculo de su asignacion ACTIVA.
 *
 * - Ignora ids vacios y duplicados.
 * - Un conductor sin asignacion activa simplemente no aparece en el Map.
 * - Si por datos sucios hubiera mas de una asignacion activa, gana la primera
 *   que devuelve la consulta. No se inventa una resolucion: con el modelo
 *   actual un conductor no deberia tener dos.
 */
export async function vehiculosActivosDeConductores(
  conductorIds: string[]
): Promise<Map<string, VehiculoActivoDeConductor>> {
  const ids = Array.from(new Set(conductorIds.filter(Boolean)))
  const resultado = new Map<string, VehiculoActivoDeConductor>()
  if (ids.length === 0) return resultado

  const { data, error } = await (supabase.from('asignaciones_conductores') as any)
    .select(
      'conductor_id, horario, estado, asignaciones!inner(id, estado, horario, vehiculo_id, vehiculos(id, patente, marca, modelo))'
    )
    .in('conductor_id', ids)
    .in('estado', ESTADOS_VIGENTES)
    .eq('asignaciones.estado', 'activa')

  if (error) {
    console.error('[vehiculoActivoService] No se pudieron leer las asignaciones activas:', error)
    return resultado
  }

  for (const fila of (data || []) as any[]) {
    const asig = fila.asignaciones
    if (!asig?.vehiculo_id) continue
    if (resultado.has(fila.conductor_id)) continue
    const veh = asig.vehiculos
    resultado.set(fila.conductor_id, {
      conductorId: fila.conductor_id,
      asignacionId: asig.id,
      vehiculoId: asig.vehiculo_id,
      patente: veh?.patente ?? null,
      modelo: [veh?.marca, veh?.modelo].filter(Boolean).join(' ') || null,
      horarioConductor: fila.horario ?? null,
      horarioAsignacion: asig.horario ?? null,
    })
  }

  return resultado
}
