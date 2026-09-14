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
import { parsearPaginacion, listar, eq, buscarEn } from '../lib/query.js';

const router = express.Router();

const ESTADOS_ACTIVOS = ['activa', 'activo'];

function armarSelect({ soloAsignados }) {
  // `!inner` convierte el embed en inner join: PostgREST descarta el vehiculo si
  // no tiene asignacion activa, y el conteo exacto sale bien del mismo query.
  const embed = soloAsignados ? 'asignaciones!inner' : 'asignaciones';
  return CAMPOS.concat(
    `${embed}(id,estado,horario,modalidad,tipo_tarifa,fecha_inicio,conductores(nombres,apellidos,numero_dni))`
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
  const a = Array.isArray(asignaciones) ? asignaciones[0] || null : null;
  return {
    ...vehiculo,
    asignacion_activa: a
      ? {
          id: a.id,
          estado: a.estado,
          horario: a.horario,
          modalidad: a.modalidad,
          tipo_tarifa: a.tipo_tarifa,
          fecha_inicio: a.fecha_inicio,
          conductor: a.conductores || null,
        }
      : null,
  };
}

router.get('/estado-flota', requireApiKey('flota:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);

  const filtros = [
    'deleted_at=is.null',
    `asignaciones.estado=in.(${ESTADOS_ACTIVOS.join(',')})`,
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
