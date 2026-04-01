import { supabase } from '../lib/supabase';

// Tipos de evento para vehículos
export type TipoEventoVehiculo =
  | 'cambio_estado'
  | 'asignacion_creada'
  | 'asignacion_activada'
  | 'asignacion_finalizada'
  | 'asignacion_cancelada'
  | 'devolucion'
  | 'siniestro'
  | 'regularizacion'
  | 'eliminacion_asignacion'
  | 'conductor_removido';

// Tipos de evento para conductores
export type TipoEventoConductor =
  | 'cambio_estado'
  | 'baja'
  | 'asignacion_creada'
  | 'asignacion_activada'
  | 'asignacion_completada'
  | 'asignacion_cancelada'
  | 'devolucion'
  | 'siniestro'
  | 'regularizacion';

// Módulos que generan eventos
export type Modulo = 'vehiculos' | 'conductores' | 'asignaciones' | 'siniestros' | 'programacion';

interface HistorialVehiculoParams {
  vehiculoId: string;
  tipoEvento: TipoEventoVehiculo;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  detalles?: Record<string, unknown>;
  modulo: Modulo;
  sedeId?: string | null;
}

interface HistorialConductorParams {
  conductorId: string;
  tipoEvento: TipoEventoConductor;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  detalles?: Record<string, unknown>;
  modulo: Modulo;
  sedeId?: string | null;
}

/**
 * Obtiene el usuario actual (id y nombre) desde la sesión de Supabase.
 * Caches the result in memory so subsequent calls avoid extra queries.
 */
let cachedUsuario: { id: string | null; nombre: string | null } | null = null;

async function getUsuarioActual(): Promise<{ id: string | null; nombre: string | null }> {
  if (cachedUsuario) return cachedUsuario;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, nombre: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from('user_profiles') as any)
      .select('full_name')
      .eq('id', user.id)
      .single();

    cachedUsuario = {
      id: user.id,
      nombre: profile?.full_name || user.email || null,
    };
    return cachedUsuario;
  } catch {
    return { id: null, nombre: null };
  }
}

/**
 * Registra un evento en el historial de vehículos.
 * No lanza errores — falla silenciosamente para no interrumpir el flujo principal.
 */
export async function registrarHistorialVehiculo(params: HistorialVehiculoParams): Promise<void> {
  try {
    const usuario = await getUsuarioActual();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('historial_vehiculos') as any).insert({
      vehiculo_id: params.vehiculoId,
      tipo_evento: params.tipoEvento,
      estado_anterior: params.estadoAnterior || null,
      estado_nuevo: params.estadoNuevo || null,
      detalles: params.detalles || {},
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      modulo: params.modulo,
      sede_id: params.sedeId || null,
    });
  } catch {
    // Falla silenciosa — el historial no debe bloquear operaciones
  }
}

/**
 * Registra un evento en el historial de conductores.
 * No lanza errores — falla silenciosamente para no interrumpir el flujo principal.
 */
export async function registrarHistorialConductor(params: HistorialConductorParams): Promise<void> {
  try {
    const usuario = await getUsuarioActual();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('historial_conductores') as any).insert({
      conductor_id: params.conductorId,
      tipo_evento: params.tipoEvento,
      estado_anterior: params.estadoAnterior || null,
      estado_nuevo: params.estadoNuevo || null,
      detalles: params.detalles || {},
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      modulo: params.modulo,
      sede_id: params.sedeId || null,
    });
  } catch {
    // Falla silenciosa — el historial no debe bloquear operaciones
  }
}

/**
 * Registra cambios para vehículo Y conductor al mismo tiempo (ej: asignación, baja)
 */
export async function registrarHistorialAsignacion(params: {
  vehiculoId: string;
  conductorId: string;
  tipoEventoVehiculo: TipoEventoVehiculo;
  tipoEventoConductor: TipoEventoConductor;
  estadoAnteriorVehiculo?: string | null;
  estadoNuevoVehiculo?: string | null;
  estadoAnteriorConductor?: string | null;
  estadoNuevoConductor?: string | null;
  detalles?: Record<string, unknown>;
  modulo: Modulo;
  sedeId?: string | null;
}): Promise<void> {
  await Promise.all([
    registrarHistorialVehiculo({
      vehiculoId: params.vehiculoId,
      tipoEvento: params.tipoEventoVehiculo,
      estadoAnterior: params.estadoAnteriorVehiculo,
      estadoNuevo: params.estadoNuevoVehiculo,
      detalles: params.detalles,
      modulo: params.modulo,
      sedeId: params.sedeId,
    }),
    registrarHistorialConductor({
      conductorId: params.conductorId,
      tipoEvento: params.tipoEventoConductor,
      estadoAnterior: params.estadoAnteriorConductor,
      estadoNuevo: params.estadoNuevoConductor,
      detalles: params.detalles,
      modulo: params.modulo,
      sedeId: params.sedeId,
    }),
  ]);
}

// ─── Historial de Bajas / Reactivaciones ─────────────────────────────────────

export type TipoEventoBaja = 'baja' | 'reactivacion';

interface HistorialBajaParams {
  conductorId: string;
  conductorNombre: string;
  conductorDni: string;
  tipoEvento: TipoEventoBaja;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  fechaTerminacionAnterior?: string | null;
  fechaTerminacionNueva?: string | null;
  motivoBaja?: string | null;
  sedeId?: string | null;
}

/**
 * Registra un evento de baja o reactivación en conductores_historial_bajas.
 * No lanza errores — falla silenciosamente para no interrumpir el flujo principal.
 */
export async function registrarHistorialBaja(params: HistorialBajaParams): Promise<void> {
  try {
    const usuario = await getUsuarioActual();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('conductores_historial_bajas') as any).insert({
      conductor_id: params.conductorId,
      conductor_nombre: params.conductorNombre,
      conductor_dni: params.conductorDni,
      tipo_evento: params.tipoEvento,
      estado_anterior: params.estadoAnterior || null,
      estado_nuevo: params.estadoNuevo || null,
      fecha_terminacion_anterior: params.fechaTerminacionAnterior || null,
      fecha_terminacion_nueva: params.fechaTerminacionNueva || null,
      motivo_baja: params.motivoBaja || null,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      sede_id: params.sedeId || null,
    });
  } catch {
    // Falla silenciosa — el historial no debe bloquear operaciones
  }
}
