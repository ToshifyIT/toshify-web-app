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
//
// Desde la revisión del 20/11/2026 (A2, A3, A7) confirmar, cerrar lo anterior y
// activar pasan dentro de la base en una sola transacción:
// confirmar_asignacion() en sql/confirmar_asignacion_atomica.sql.
import { supabase } from '../../lib/supabase'
import { actualizarEstadoVehiculo } from '../../services/vehiculoEstadoService'

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

/** Lo que devuelve confirmar_asignacion() (sql/confirmar_asignacion_atomica.sql). */
export interface ResultadoConfirmacion {
  /** true si la asignación pasó de programada a activa en esta llamada. */
  activada: boolean
  /** Conductores que quedaron vigentes por esta acción. */
  conductores: string[]
  /** Cómo quedaron las filas de conductores de la asignación. */
  filas: { id: string; conductor_id: string | null; horario: string | null; confirmado: boolean; estado: string }[]
  sin_confirmar: number
  /** Asignaciones anteriores del vehículo que se finalizaron, con sus conductores. */
  cerradas: { id: string; codigo: string | null; conductores: string[] }[]
  /** Avisos: asignaciones programadas a futuro donde los conductores siguen figurando. */
  programadas_pendientes: string[]
}

/**
 * Confirma a los conductores y, si la asignación estaba programada, la activa:
 * cierra a los conductores en sus otras asignaciones (no en las programadas a
 * futuro), cierra las asignaciones activas anteriores del vehículo y activa la
 * nueva. Todo en una transacción de la base: si algo falla, no cambia nada.
 */
export async function confirmarAsignacionAtomica(
  asignacionId: string,
  filasConfirmar: string[],
  notas: string | null,
  usuario: string,
): Promise<ResultadoConfirmacion> {
  const { data, error } = await (supabase as any).rpc('confirmar_asignacion', {
    p_asignacion_id: asignacionId,
    p_filas_confirmar: filasConfirmar,
    p_notas: notas,
    p_usuario: usuario,
  })
  if (error) {
    const mensaje = String(error.message || '')
    if (error.code === 'PGRST202' || (error.code !== 'P0001' && mensaje.includes('confirmar_asignacion'))) {
      throw new Error('Falta instalar en la base la función confirmar_asignacion (sql/confirmar_asignacion_atomica.sql). No se cambió nada.')
    }
    // P0001: la función frenó a propósito (la asignación cambió de estado, etc.)
    if (error.code === 'P0001') throw new Error(`${mensaje} No se cambió nada.`)
    throw new ErrorPasoConfirmacion('confirmar la asignación (no se cambió nada)', mensaje)
  }
  const r = (data || {}) as Partial<ResultadoConfirmacion>
  return {
    activada: r.activada === true,
    conductores: r.conductores || [],
    filas: r.filas || [],
    sin_confirmar: Number(r.sin_confirmar) || 0,
    cerradas: r.cerradas || [],
    programadas_pendientes: r.programadas_pendientes || [],
  }
}

/**
 * Devolución de un vehículo: finaliza sus asignaciones ACTIVAS (y la asignación
 * de devolución, si se pasa) y deja el auto en PKG ON BASE. La usan los dos
 * caminos de "Confirmar Devolución" para que hagan lo mismo (A4):
 *  - no toca las asignaciones PROGRAMADAS del auto (las devuelve como aviso);
 *  - agrega la nota al final, sin borrar las anteriores;
 *  - frena si no puede finalizar una asignación (si no, se seguiría cobrando).
 * Devuelve los avisos a mostrar; lista vacía = todo bien.
 */
export async function confirmarDevolucionVehiculo(p: {
  vehiculoId: string
  ahora: string
  usuario: string
  asignacionDevolucionId?: string
}): Promise<string[]> {
  const avisos: string[] = []
  const hoy = new Date(p.ahora).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  let consulta = (supabase as any)
    .from('asignaciones')
    .select('id, codigo, estado, notas')
    .eq('vehiculo_id', p.vehiculoId)
  consulta = p.asignacionDevolucionId
    ? consulta.or(`estado.in.(activa,activo),id.eq.${p.asignacionDevolucionId}`)
    : consulta.in('estado', ['activa', 'activo'])
  const aFinalizar = (exigirOk<any[]>(await consulta, 'buscar las asignaciones activas del vehículo') || [])
    .filter(a => a.estado !== 'finalizada' && a.estado !== 'cancelada')

  for (const asig of aFinalizar) {
    exigirOk(
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ estado: 'completado', fecha_fin: p.ahora })
        .eq('asignacion_id', asig.id)
        .in('estado', ['asignado', 'activo']),
      'cerrar a los conductores de la asignación del vehículo',
    )
    const cambios: Record<string, unknown> = {
      estado: 'finalizada',
      fecha_fin: p.ahora,
      notas: `${asig.notas || ''}\n[DEVOLUCIÓN ${hoy}] Vehículo devuelto a base.`,
      updated_by: p.usuario,
    }
    if (asig.id === p.asignacionDevolucionId) cambios.fecha_inicio = p.ahora
    exigirOk(
      await (supabase as any).from('asignaciones').update(cambios).eq('id', asig.id),
      'finalizar la asignación del vehículo',
    )
  }

  // ── Desde acá las asignaciones ya están finalizadas: lo que falla se avisa ──
  const estadoBase = await supabase.from('vehiculos_estados').select('id').eq('codigo', 'PKG_ON_BASE').single()
  const estadoBaseId = (estadoBase.data as { id: string } | null)?.id
  if (!estadoBaseId) {
    avisos.push('No se pudo pasar el vehículo a PKG ON BASE: cambiá su estado a mano.')
  } else {
    const { error } = await actualizarEstadoVehiculo(p.vehiculoId, estadoBaseId, 'Devolución del vehículo: asignación finalizada')
    if (error) avisos.push(`No se pudo pasar el vehículo a PKG ON BASE (${error.message || 'error'}): cambiá su estado a mano.`)
  }

  let programadas = (supabase as any)
    .from('asignaciones')
    .select('codigo')
    .eq('vehiculo_id', p.vehiculoId)
    .eq('estado', 'programado')
  if (p.asignacionDevolucionId) programadas = programadas.neq('id', p.asignacionDevolucionId)
  const resProg = await programadas
  if (resProg.error) {
    avisos.push('No se pudo verificar si el vehículo tiene asignaciones programadas.')
  } else {
    for (const a of (resProg.data || []) as { codigo: string | null }[]) {
      avisos.push(`El vehículo tiene la asignación programada ${a.codigo || ''}: no se modificó, revisá si sigue en pie.`)
    }
  }
  return avisos
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
