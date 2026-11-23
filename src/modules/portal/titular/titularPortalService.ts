// Datos del espacio del titular (proveedor de flota): qué vehículos tiene, cuáles
// están generando y cuánto se facturó y se cobró por cada uno.
//
// Criterios (validados con CACTUS S.R.L. en la semana 47/2026):
// - Vehículos del titular: vehiculos_titulares con activo = true. La tabla guarda
//   historial (muchas filas inactivas por vehículo), por eso no alcanza con el titular_id.
// - Generando: el vehículo tiene una asignación en estado 'activa'.
// - Ingreso esperado: facturacion_conductores.subtotal_neto (cargos - descuentos de la
//   semana, sin saldo anterior) de las facturas emitidas sobre esa patente. Incluye
//   alquiler, ToshiPass y promociones a propósito (decisión del 20/11/2026: el titular
//   ve lo mismo que se le factura al conductor).
// - Ingreso cobrado: aportes en control_saldos (Cabify, DiDi, manual, cuota) de los
//   conductores facturados sobre esa patente, en la misma semana.
// - No se expone ningún dato del conductor: los ids se usan solo para cruzar pagos.
import { format, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabase';

export type SituacionVehiculo = 'generando' | 'disponible' | 'preparacion' | 'taller' | 'fuera';

export interface TitularPortal {
  id: string;
  nombre: string;
  tipo: 'persona' | 'empresa';
  /** Documento tal como está cargado en Titulares (para mostrar). */
  documento: string;
  debeCambiarPassword: boolean;
}

export interface VehiculoTitular {
  vehiculoId: string;
  patente: string;
  descripcion: string;
  situacion: SituacionVehiculo;
  estadoDescripcion: string;
  turnosCubiertos: number;
  turnosTotales: number;
  /** Días sin asignación activa. null si está generando. */
  /** Desde cuándo el auto está activo a nombre del titular (yyyy-MM-dd). */
  activoDesde: string;
  kilometraje: number | null;
  vencimientoSeguro: string | null;
  vencimientoVtv: string | null;
  /** Tramos en que el auto tuvo al menos un conductor (fechas yyyy-MM-dd; hasta null = sigue). */
  tramosAlquiler: TramoAlquiler[];
}

export interface TramoAlquiler {
  desde: string;
  hasta: string | null;
}

export interface IngresoVehiculoSemana {
  patente: string;
  esperado: number;
  cobrado: number;
  cobradoCabify: number;
}

export interface SemanaTitular {
  clave: string;
  semana: number;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
  abierta: boolean;
  esperado: number;
  cobrado: number;
  cobradoCabify: number;
  porVehiculo: Record<string, IngresoVehiculoSemana>;
}

export interface DatosTitular {
  vehiculos: VehiculoTitular[];
  /** De la más reciente a la más antigua. */
  semanas: SemanaTitular[];
}

const TIPOS_APORTE = ['pago_cabify', 'pago_didi', 'pago_manual', 'pago', 'pago_cuota'];
const ESTADOS_CONDUCTOR_VIGENTE = ['asignado', 'activo'];

function situacionDesdeEstado(codigo: string | null): SituacionVehiculo {
  const c = (codigo ?? '').toUpperCase();
  if (c === 'EN_USO') return 'generando';
  if (c === 'DISPONIBLE' || c === 'PROGRAMADO' || c.startsWith('PKG_ON')) return 'disponible';
  if (c.startsWith('PKG_OFF')) return 'preparacion';
  if (c.startsWith('TALLER') || c === 'INSTALACION_GNC') return 'taller';
  return 'fuera';
}

interface TitularRpc {
  id: string;
  nombre: string;
  tipo: 'persona' | 'empresa';
  documento: string | null;
  must_change_password: boolean;
}

interface RespuestaRpc {
  success: boolean;
  error?: string;
  titular?: TitularRpc;
}

type ResultadoIngreso = { ok: true; titular: TitularPortal } | { ok: false; error: string };
type ResultadoAccion = { ok: true } | { ok: false; error: string };

function aTitularPortal(t: TitularRpc): TitularPortal {
  return {
    id: t.id,
    nombre: t.nombre || 'Titular',
    tipo: t.tipo,
    documento: t.documento ?? '',
    debeCambiarPassword: t.must_change_password,
  };
}

// Las funciones portal_titular_* están en sql/portal_titular_login.sql. La
// contraseña se valida dentro de la base: el navegador nunca ve el hash.
// Todavía no están en los tipos generados de Supabase, por eso el cast.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function loginTitular(documento: string, password: string): Promise<ResultadoIngreso> {
  const { data, error } = await rpc('portal_titular_login', {
    p_documento: documento,
    p_password: password,
  });
  if (error) throw error;
  const resultado = data as RespuestaRpc | null;
  if (!resultado?.success || !resultado.titular) {
    return { ok: false, error: resultado?.error ?? 'Documento o contraseña incorrectos' };
  }
  return { ok: true, titular: aTitularPortal(resultado.titular) };
}

export async function cambiarPasswordTitular(
  titularId: string,
  actual: string,
  nueva: string,
): Promise<ResultadoAccion> {
  const { data, error } = await rpc('portal_titular_cambiar_password', {
    p_titular_id: titularId,
    p_password_actual: actual,
    p_password_nueva: nueva,
  });
  if (error) throw error;
  const resultado = data as RespuestaRpc | null;
  if (!resultado?.success) {
    return { ok: false, error: resultado?.error ?? 'No se pudo cambiar la contraseña' };
  }
  return { ok: true };
}

/** Recupera la sesión guardada al recargar. null si el titular ya no puede entrar. */
export async function restaurarSesionTitular(titularId: string): Promise<TitularPortal | null> {
  const { data, error } = await rpc('portal_titular_sesion', { p_titular_id: titularId });
  if (error) throw error;
  const resultado = data as RespuestaRpc | null;
  return resultado?.success && resultado.titular ? aTitularPortal(resultado.titular) : null;
}

interface FilaVinculo {
  vehiculo_id: string;
  fecha_desde: string;
  activo: boolean;
  vehiculos: {
    patente: string;
    marca: string | null;
    modelo: string | null;
    anio: number | string | null;
    kilometraje_actual: number | null;
    vencimiento_seguro: string | null;
    vto_vtv_fecha: string | null;
    vehiculos_estados: { codigo: string; descripcion: string } | null;
  } | null;
}

interface FilaAsignacion {
  vehiculo_id: string;
  estado: string;
  modalidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  asignaciones_conductores: {
    estado: string;
    fecha_inicio: string | null;
    fecha_fin: string | null;
  }[] | null;
}

interface FilaFactura {
  conductor_id: string;
  vehiculo_patente: string;
  subtotal_neto: number | null;
  periodos_facturacion: {
    semana: number;
    anio: number;
    fecha_inicio: string;
    fecha_fin: string;
    estado: string;
  } | null;
}

interface FilaPago {
  conductor_id: string;
  semana: number;
  anio: number;
  tipo_movimiento: string;
  monto_movimiento: number | null;
}

function aFechaLocal(valor: string): string {
  return format(parseISO(valor), 'yyyy-MM-dd');
}

/**
 * Tramos con conductor de cada asignación activa o finalizada. Se usa la fecha de
 * cada conductor y, si falta, la de la asignación. Un conductor sin fecha de
 * inicio (todavía no arrancó) no cuenta.
 */
function tramosDeAlquiler(asignaciones: FilaAsignacion[]): TramoAlquiler[] {
  const tramos: TramoAlquiler[] = [];
  for (const a of asignaciones) {
    for (const c of a.asignaciones_conductores ?? []) {
      if (c.estado === 'cancelado') continue;
      const inicio = c.fecha_inicio ?? a.fecha_inicio;
      if (!inicio) continue;
      const fin = c.fecha_fin ?? a.fecha_fin;
      if (!fin && a.estado !== 'activa') continue;
      tramos.push({ desde: aFechaLocal(inicio), hasta: fin ? aFechaLocal(fin) : null });
    }
  }
  return tramos;
}

export async function cargarDatosTitular(titularId: string): Promise<DatosTitular> {
  const { data: vinculosData, error: errVinculos } = await supabase
    .from('vehiculos_titulares')
    .select(`
      vehiculo_id, fecha_desde, activo,
      vehiculos(
        patente, marca, modelo, anio, kilometraje_actual, vencimiento_seguro, vto_vtv_fecha,
        vehiculos_estados(codigo, descripcion)
      )
    `)
    .eq('titular_id', titularId);
  if (errVinculos) throw errVinculos;

  const vinculos = (vinculosData ?? []) as unknown as FilaVinculo[];
  const activos = new Map<string, FilaVinculo>();
  // Primera fecha en que el vehículo quedó a nombre del titular: sirve para no
  // atribuirle facturación de cuando el auto era de otro.
  const desdePorVehiculo = new Map<string, string>();
  for (const v of vinculos) {
    if (!v.vehiculos) continue;
    const previa = desdePorVehiculo.get(v.vehiculo_id);
    if (!previa || v.fecha_desde < previa) desdePorVehiculo.set(v.vehiculo_id, v.fecha_desde);
    if (v.activo) activos.set(v.vehiculo_id, v);
  }

  const vehiculoIds = [...activos.keys()];
  if (vehiculoIds.length === 0) return { vehiculos: [], semanas: [] };

  const patentes = [...activos.values()].map(v => v.vehiculos!.patente);
  const desdePorPatente = new Map<string, string>();
  for (const [id, v] of activos) {
    desdePorPatente.set(v.vehiculos!.patente, desdePorVehiculo.get(id) ?? v.fecha_desde);
  }

  const [asignacionesRes, facturasRes] = await Promise.all([
    supabase
      .from('asignaciones')
      .select(`
        vehiculo_id, estado, modalidad, fecha_inicio, fecha_fin,
        asignaciones_conductores(estado, fecha_inicio, fecha_fin)
      `)
      .in('vehiculo_id', vehiculoIds)
      .in('estado', ['activa', 'finalizada']),
    supabase
      .from('facturacion_conductores')
      .select(`
        conductor_id, vehiculo_patente, subtotal_neto,
        periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin, estado)
      `)
      .in('vehiculo_patente', patentes),
  ]);
  if (asignacionesRes.error) throw asignacionesRes.error;
  if (facturasRes.error) throw facturasRes.error;

  const asignaciones = (asignacionesRes.data ?? []) as unknown as FilaAsignacion[];
  const facturas = ((facturasRes.data ?? []) as unknown as FilaFactura[]).filter(f => {
    const desde = desdePorPatente.get(f.vehiculo_patente);
    return !!f.periodos_facturacion && !!desde && f.periodos_facturacion.fecha_fin >= desde;
  });

  // ---- Vehículos ----
  const vehiculos: VehiculoTitular[] = [...activos.entries()].map(([vehiculoId, v]) => {
    const veh = v.vehiculos!;
    const propias = asignaciones.filter(a => a.vehiculo_id === vehiculoId);
    const activa = propias.find(a => a.estado === 'activa');
    const situacionEstado = situacionDesdeEstado(veh.vehiculos_estados?.codigo ?? null);
    const situacion: SituacionVehiculo = activa
      ? 'generando'
      : (situacionEstado === 'generando' ? 'disponible' : situacionEstado);

    const turnosTotales = activa && activa.modalidad !== 'turno' ? 1 : 2;
    const turnosCubiertos = activa
      ? Math.min(
        turnosTotales,
        (activa.asignaciones_conductores ?? [])
          .filter(c => ESTADOS_CONDUCTOR_VIGENTE.includes(c.estado)).length,
      )
      : 0;


    return {
      vehiculoId,
      patente: veh.patente,
      descripcion: [veh.marca, veh.modelo, veh.anio].filter(Boolean).join(' '),
      situacion,
      estadoDescripcion: veh.vehiculos_estados?.descripcion ?? 'Sin estado',
      turnosCubiertos,
      turnosTotales,
      activoDesde: v.fecha_desde,
      kilometraje: veh.kilometraje_actual,
      vencimientoSeguro: veh.vencimiento_seguro,
      vencimientoVtv: veh.vto_vtv_fecha,
      tramosAlquiler: tramosDeAlquiler(propias),
    };
  });

  const orden: SituacionVehiculo[] = ['generando', 'disponible', 'preparacion', 'taller', 'fuera'];
  vehiculos.sort((a, b) =>
    orden.indexOf(a.situacion) - orden.indexOf(b.situacion) || a.patente.localeCompare(b.patente));

  // ---- Ingresos por semana ----
  const conductorIds = [...new Set(facturas.map(f => f.conductor_id))];
  let pagos: FilaPago[] = [];
  if (conductorIds.length > 0) {
    const { data: pagosData, error: errPagos } = await supabase
      .from('control_saldos')
      .select('conductor_id, semana, anio, tipo_movimiento, monto_movimiento')
      .in('conductor_id', conductorIds)
      .in('tipo_movimiento', TIPOS_APORTE);
    if (errPagos) throw errPagos;
    pagos = (pagosData ?? []) as unknown as FilaPago[];
  }

  const semanasMap = new Map<string, SemanaTitular>();
  // Un pago se atribuye a la patente sobre la que se facturó a ese conductor esa
  // semana. Si tuvo dos patentes en la misma semana, va a la primera.
  const patentePorConductorSemana = new Map<string, string>();

  for (const f of facturas) {
    const p = f.periodos_facturacion!;
    const clave = `${p.anio}-${String(p.semana).padStart(2, '0')}`;
    let semana = semanasMap.get(clave);
    if (!semana) {
      semana = {
        clave,
        semana: p.semana,
        anio: p.anio,
        fechaInicio: p.fecha_inicio,
        fechaFin: p.fecha_fin,
        abierta: p.estado === 'abierto',
        esperado: 0,
        cobrado: 0,
        cobradoCabify: 0,
        porVehiculo: {},
      };
      semanasMap.set(clave, semana);
    }
    const monto = Number(f.subtotal_neto) || 0;
    const fila = semana.porVehiculo[f.vehiculo_patente]
      ?? (semana.porVehiculo[f.vehiculo_patente] = {
        patente: f.vehiculo_patente, esperado: 0, cobrado: 0, cobradoCabify: 0,
      });
    fila.esperado += monto;
    semana.esperado += monto;

    const claveConductor = `${f.conductor_id}|${clave}`;
    if (!patentePorConductorSemana.has(claveConductor)) {
      patentePorConductorSemana.set(claveConductor, f.vehiculo_patente);
    }
  }

  for (const pago of pagos) {
    const clave = `${pago.anio}-${String(pago.semana).padStart(2, '0')}`;
    const patente = patentePorConductorSemana.get(`${pago.conductor_id}|${clave}`);
    const semana = semanasMap.get(clave);
    if (!patente || !semana) continue;
    const monto = Number(pago.monto_movimiento) || 0;
    const fila = semana.porVehiculo[patente];
    fila.cobrado += monto;
    semana.cobrado += monto;
    if (pago.tipo_movimiento === 'pago_cabify') {
      fila.cobradoCabify += monto;
      semana.cobradoCabify += monto;
    }
  }

  const semanas = [...semanasMap.values()].sort((a, b) => b.clave.localeCompare(a.clave));
  return { vehiculos, semanas };
}
