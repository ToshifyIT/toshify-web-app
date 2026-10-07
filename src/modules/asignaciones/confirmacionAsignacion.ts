// src/modules/asignaciones/confirmacionAsignacion.ts
// Pasos compartidos de "Confirmar" y "Activar Asignación" (AsignacionesModule).
//
// Por qué existe: supabase-js no lanza excepciones; ante un corte de red o un
// error devuelve { data: null, error }. El flujo de confirmación ignoraba ese
// error y seguía con datos vacíos. Caso real (05/10/2026): al confirmar AF294DZ
// falló la lectura de conductores; la asignación nueva quedó activa, pero los
// conductores siguieron vigentes en AF541GI y no se registraron los turnos.
//
// Regla: hasta activar la asignación, cualquier paso que falle FRENA la
// confirmación (exigirOk). Después de activarla, los pasos que fallan se
// AVISAN al usuario pero no deshacen la activación.
import { supabase } from '../../lib/supabase'

/** Error de un paso de la confirmación, con un mensaje para el usuario. */
export class ErrorPasoConfirmacion extends Error {
  constructor(paso: string, detalle?: string) {
    super(
      `No se pudo ${paso}. Puede ser un corte de conexión: revisá tu internet y volvé a intentar.` +
        (detalle ? `\n\nDetalle: ${detalle}` : ''),
    )
    this.name = 'ErrorPasoConfirmacion'
  }
}

interface RespuestaSupabase {
  data?: unknown
  error: { message?: string } | null
}

/** Devuelve data si la llamada salió bien; si no, frena con un error legible. */
export function exigirOk<T = unknown>(res: RespuestaSupabase, paso: string): T | null {
  if (res.error) throw new ErrorPasoConfirmacion(paso, res.error.message)
  return (res.data ?? null) as T | null
}

/**
 * Cierra (estado completado) la participación de estos conductores en cualquier
 * otra asignación vigente. Es lo que hace que un cambio de auto deje de
 * mostrar al conductor en el auto anterior.
 */
export async function cerrarOtrasParticipaciones(conductorIds: string[], asignacionId: string, ahora: string): Promise<void> {
  if (conductorIds.length === 0) return
  exigirOk(
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({ estado: 'completado', fecha_fin: ahora })
      .in('conductor_id', conductorIds)
      .in('estado', ['asignado', 'activo'])
      .neq('asignacion_id', asignacionId),
    'cerrar la asignación anterior de los conductores',
  )
}

/**
 * Finaliza las asignaciones activas que quedaron sin ningún conductor vigente
 * (por ejemplo, la del auto anterior en un cambio de auto).
 */
export async function finalizarAsignacionesSinConductores(excluirId: string, ahora: string, usuario: string): Promise<void> {
  const asignaciones = exigirOk<any[]>(
    await (supabase as any)
      .from('asignaciones')
      .select(`
        id, notas,
        asignaciones_conductores(conductor_id, estado, horario,
          conductores(nombres, apellidos)
        )
      `)
      .in('estado', ['activa', 'activo'])
      .neq('id', excluirId),
    'revisar asignaciones que quedaron sin conductores',
  ) || []

  for (const asig of asignaciones) {
    const activos = (asig.asignaciones_conductores || []).filter(
      (ac: any) => ac.estado === 'asignado' || ac.estado === 'activo',
    )
    if (activos.length > 0) continue

    const ultimos = (asig.asignaciones_conductores || [])
      .filter((ac: any) => ac.estado === 'completado' || ac.estado === 'finalizado')
      .map((ac: any) => {
        const nombre = ac.conductores ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim() : 'Desconocido'
        return `${nombre} (${ac.horario || 'sin turno'})`
      })
    const traza = `\n[AUTO-CERRADA ${new Date().toLocaleDateString('es-AR')}] Sin conductores activos.\nUltimos conductores: ${ultimos.length > 0 ? ultimos.join(', ') : 'ninguno'}`
    exigirOk(
      await (supabase as any)
        .from('asignaciones')
        .update({ estado: 'finalizada', fecha_fin: ahora, notas: (asig.notas || '') + traza, updated_by: usuario })
        .eq('id', asig.id),
      'finalizar una asignación que quedó sin conductores',
    )
  }
}

/**
 * Registra los turnos ocupados del vehículo para la fecha programada.
 * Se llama con la asignación ya activa: si falla, devuelve un aviso (no frena).
 */
export async function registrarTurnosOcupados(
  vehiculoId: string,
  fechaProgramada: string,
  conductores: { id: string; horario: string }[],
): Promise<string | null> {
  const borrado = await supabase
    .from('vehiculos_turnos_ocupados')
    .delete()
    .eq('vehiculo_id', vehiculoId)
    .eq('fecha', fechaProgramada)
  if (borrado.error) return `No se pudieron registrar los turnos ocupados del vehículo (${borrado.error.message}).`

  if (conductores.length === 0) return null
  const filas = conductores.map(c => ({
    vehiculo_id: vehiculoId,
    fecha: fechaProgramada,
    horario: c.horario,
    asignacion_conductor_id: c.id,
    estado: 'activo',
  }))
  const alta = await (supabase as any).from('vehiculos_turnos_ocupados').insert(filas)
  if (alta.error) return `No se pudieron registrar los turnos ocupados del vehículo (${alta.error.message}).`
  return null
}

/**
 * Control final: conductores que siguen vigentes en OTRA asignación activa.
 * Si la lista no está vacía, algo no se cerró y hay que avisar.
 */
export async function conductoresVigentesEnOtraAsignacion(conductorIds: string[], asignacionId: string): Promise<string[]> {
  if (conductorIds.length === 0) return []
  const res = await (supabase as any)
    .from('asignaciones_conductores')
    .select('conductor_id, conductores(nombres, apellidos), asignaciones!inner(codigo, estado, vehiculos(patente))')
    .in('conductor_id', conductorIds)
    .in('estado', ['asignado', 'activo'])
    .neq('asignacion_id', asignacionId)
    .in('asignaciones.estado', ['activa', 'activo'])
  if (res.error) return [`No se pudo verificar si quedaron asignaciones anteriores abiertas (${res.error.message}).`]
  return ((res.data || []) as any[]).map(ac => {
    const nombre = ac.conductores ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim() : 'Conductor'
    const patente = ac.asignaciones?.vehiculos?.patente || ac.asignaciones?.codigo || ''
    return `${nombre} sigue activo en ${patente}`
  })
}
