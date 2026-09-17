/**
 * API REST publica: Estado de Flota (solo lectura).
 *
 *   GET /api/v1/estado-flota  -> toda la flota con su estado y, si la tiene,
 *                                su asignacion activa
 *
 * Permiso: flota:api
 *
 * NO es una tabla: es una vista compuesta, equivalente a lo que muestra la
 * pantalla /estado-de-flota de la app. Se arma desde `vehiculos` embebiendo
 * las asignaciones activas y, dentro de ellas, el conductor.
 *
 * Por que un embed y no un inner join: el requisito es "toda la flota", tenga
 * o no conductor. PostgREST filtra el embed sin descartar el padre, asi que un
 * vehiculo sin asignacion igual aparece, con asignacion_activa en null.
 *
 * OJO con los valores de `estado`: en la base conviven 'activa' y 'activo'
 * (y lo mismo con cancelada/cancelado, finalizada/finalizado). El frontend
 * defiende contra ambos, asi que aca se filtra con in.(activa,activo).
 * Si algun dia se normaliza la data, simplificar ESTADOS_ACTIVOS.
 */

import express from 'express';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';
import { parsearPaginacion, listar, eq, buscarEn, pidioTodo, exportarTodo } from '../lib/query.js';

const router = express.Router();

const ESTADOS_ACTIVOS = ['activa', 'activo'];

/**
 * Estados de asignaciones_conductores que NO cuentan como conductor vigente.
 * Mismo criterio que usa la pantalla /estado-de-flota de la app.
 */
const ESTADOS_CONDUCTOR_INACTIVO = ['cancelado', 'completado', 'finalizado'];

/**
 * Normaliza el turno. En la base conviven 'diurno', 'DIURNO' y 'D' (idem
 * nocturno), asi que se unifica antes de exponerlo.
 */
function normalizarTurno(h) {
  const v = String(h || '').trim().toLowerCase();
  if (v === 'd' || v === 'diurno') return 'diurno';
  if (v === 'n' || v === 'nocturno') return 'nocturno';
  return v || null;
}

function armarSelect({ soloAsignados }) {
  // `!inner` convierte el embed en inner join: PostgREST descarta el vehiculo si
  // no tiene asignacion activa, y el conteo exacto sale bien del mismo query.
  const embed = soloAsignados ? 'asignaciones!inner' : 'asignaciones';
  // Los conductores NO cuelgan de asignaciones.conductor_id (campo viejo, de
  // cuando habia uno solo) sino de asignaciones_conductores, con una fila por
  // turno. Un vehiculo en turno diurno y nocturno tiene DOS filas ahi.
  return CAMPOS.concat(
    `${embed}(id,codigo,estado,modalidad,tipo_tarifa,fecha_inicio,fecha_programada,` +
    'asignaciones_conductores(horario,estado,confirmado,' +
    'conductores(id,nombres,apellidos,numero_dni,numero_licencia)))'
  ).join(',');
}

const CAMPOS = [
  'id',
  'patente',
  'marca',
  'modelo',
  'anio',
  'color',
  'gnc',
  'categoria',
  'grupo_flota',
  'lugar_radicacion',
  'kilometraje_actual',
  'vehiculos_estados(codigo,descripcion)',
  'sedes(nombre)',
];

/**
 * PostgREST devuelve `asignaciones` como array. Para el consumidor es mas claro
 * un unico objeto (o null), asi que se aplana.
 */
function aplanar({ asignaciones, ...vehiculo }) {
  const activas = Array.isArray(asignaciones) ? asignaciones : [];
  const a = activas[0] || null;

  const conductores = (a?.asignaciones_conductores || [])
    .filter((ac) => ac.conductores
      && !ESTADOS_CONDUCTOR_INACTIVO.includes(String(ac.estado || '').toLowerCase()))
    .map((ac) => ({
      turno: normalizarTurno(ac.horario),
      confirmado: ac.confirmado ?? null,
      id: ac.conductores.id,
      nombres: ac.conductores.nombres,
      apellidos: ac.conductores.apellidos,
      numero_dni: ac.conductores.numero_dni,
      numero_licencia: ac.conductores.numero_licencia,
    }))
    // diurno primero, igual que en la pantalla
    .sort((x, y) => (x.turno === 'diurno' ? -1 : y.turno === 'diurno' ? 1 : 0));

  return {
    ...vehiculo,
    asignacion_activa: a
      ? {
          id: a.id,
          codigo: a.codigo,
          estado: a.estado,
          modalidad: a.modalidad,
          tipo_tarifa: a.tipo_tarifa,
          fecha_inicio: a.fecha_inicio,
          fecha_programada: a.fecha_programada,
          conductores,
        }
      : null,
    cantidad_conductores: conductores.length,
  };
}

router.get('/estado-flota', requireApiKey('flota:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);

  const filtros = [
    'deleted_at=is.null',
    `asignaciones.estado=in.(${ESTADOS_ACTIVOS.join(',')})`,
    `asignaciones.asignaciones_conductores.estado=not.in.(${ESTADOS_CONDUCTOR_INACTIVO.join(',')})`,
  ];

  if (req.query.sede) filtros.push(eq('sedes.nombre', req.query.sede));
  if (req.query.grupo_flota) filtros.push(eq('grupo_flota', req.query.grupo_flota));
  if (req.query.search) {
    const f = buscarEn(['patente', 'marca', 'modelo'], req.query.search);
    if (f) filtros.push(f);
  }

  // asignado=true -> solo vehiculos CON asignacion activa, via inner join.
  // Se resuelve en la base y no despues de paginar: filtrar en memoria dejaria
  // pagination.total mintiendo y paginas de tamano irregular.
  const soloAsignados = req.query.asignado === 'true';

  if (pidioTodo(req.query)) {
    try {
      const r = await exportarTodo({ res, tabla: 'vehiculos', select: armarSelect({ soloAsignados }), orden: 'patente.asc', filtros, transform: aplanar });
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: r.enviados });
    } catch (error) {
      const esTope = error.codigo === 'too_many_rows';
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: esTope ? 400 : 500, filas: 0 });
      if (res.headersSent) return;
      return res.status(esTope ? 400 : 500).json({
        error: esTope ? 'too_many_rows' : 'internal_error',
        message: esTope ? error.message : 'Error exportando el estado de flota',
      });
    }
    return;
  }

  try {
    const out = await listar({
      tabla: 'vehiculos', select: armarSelect({ soloAsignados }), orden: 'patente.asc',
      filtros, page, limit, offset,
    });

    const data = out.data.map(aplanar);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: data.length });
    return res.json({ data, pagination: out.pagination });
  } catch (error) {
    console.error('[API/estado-flota] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando el estado de flota' });
  }
});

export default router;
