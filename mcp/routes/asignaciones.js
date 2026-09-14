/**
 * API REST publica de Asignaciones (solo lectura).
 *
 *   GET /api/v1/asignaciones      -> listado paginado
 *   GET /api/v1/asignaciones/:id  -> una asignacion
 *
 * Permiso: asignaciones:api
 *
 * Es el vinculo conductor <-> vehiculo con sus fechas, turno y estado.
 * Se embeben patente y nombre del conductor porque una asignacion con solo
 * dos UUIDs es inutil para un consumidor externo.
 *
 * NO exponer: notas, observaciones, motivo_cancelacion (texto libre, puede
 * contener cualquier cosa) ni created_by / created_by_name / updated_by
 * (nombres de empleados internos).
 */

import express from 'express';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';
import { RE_UUID, parsearPaginacion, listar, obtener, eq, fecha, pidioTodo, exportarTodo } from '../lib/query.js';

const router = express.Router();

const CAMPOS = [
  'id',
  'codigo',
  'vehiculo_id',
  'conductor_id',
  'estado',
  'horario',
  'modalidad',
  'tipo_tarifa',
  'zona',
  'fecha_inicio',
  'fecha_fin',
  'fecha_inicio_real',
  'fecha_fin_real',
  'fecha_programada',
  'control_completado',
  'vehiculos(patente,marca,modelo)',
  'conductores(nombres,apellidos,numero_dni)',
  'sedes(nombre)',
];

const SELECT = CAMPOS.join(',');
const TABLA = 'asignaciones';

router.get('/asignaciones', requireApiKey('asignaciones:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);
  const filtros = [];
  const errores = [];

  if (req.query.estado) filtros.push(eq('estado', req.query.estado));
  if (req.query.horario) filtros.push(eq('horario', req.query.horario));
  if (req.query.modalidad) filtros.push(eq('modalidad', req.query.modalidad));
  if (req.query.vehiculo_id) {
    if (!RE_UUID.test(req.query.vehiculo_id)) errores.push('vehiculo_id debe ser un UUID valido');
    else filtros.push(eq('vehiculo_id', req.query.vehiculo_id));
  }
  if (req.query.conductor_id) {
    if (!RE_UUID.test(req.query.conductor_id)) errores.push('conductor_id debe ser un UUID valido');
    else filtros.push(eq('conductor_id', req.query.conductor_id));
  }
  if (req.query.desde) {
    const f = fecha('fecha_inicio', 'gte', req.query.desde, errores, 'desde');
    if (f) filtros.push(f);
  }
  if (req.query.hasta) {
    const f = fecha('fecha_inicio', 'lte', req.query.hasta, errores, 'hasta');
    if (f) filtros.push(f);
  }

  if (errores.length) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: errores.join('; ') });
  }

  if (pidioTodo(req.query)) {
    try {
      const r = await exportarTodo({ res, tabla: TABLA, select: SELECT, orden: 'fecha_inicio.desc', filtros });
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: r.enviados });
    } catch (error) {
      const esTope = error.codigo === 'too_many_rows';
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: esTope ? 400 : 500, filas: 0 });
      if (res.headersSent) return;
      return res.status(esTope ? 400 : 500).json({
        error: esTope ? 'too_many_rows' : 'internal_error',
        message: esTope ? error.message : 'Error exportando asignaciones',
      });
    }
    return;
  }

  try {
    const out = await listar({
      tabla: TABLA, select: SELECT, orden: 'fecha_inicio.desc',
      filtros, page, limit, offset,
    });
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: out.data.length });
    return res.json(out);
  } catch (error) {
    console.error('[API/asignaciones] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando asignaciones' });
  }
});

router.get('/asignaciones/:id', requireApiKey('asignaciones:api'), async (req, res) => {
  if (!RE_UUID.test(req.params.id)) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: 'El id debe ser un UUID valido' });
  }

  try {
    const row = await obtener({ tabla: TABLA, select: SELECT, id: req.params.id });
    if (!row) {
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 404, filas: 0 });
      return res.status(404).json({ error: 'not_found', message: 'Asignacion no encontrada' });
    }
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: 1 });
    return res.json({ data: row });
  } catch (error) {
    console.error('[API/asignaciones/:id] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando la asignacion' });
  }
});

export default router;
