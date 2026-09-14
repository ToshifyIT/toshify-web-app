/**
 * API REST publica de Vehiculos (solo lectura).
 *
 *   GET /api/v1/vehiculos      -> listado paginado
 *   GET /api/v1/vehiculos/:id  -> un vehiculo
 *
 * Permiso: vehiculos:api
 *
 * Corre con service_role (bypasea RLS), asi que el control vive aca:
 * CAMPOS es fijo y el cliente no elige columnas.
 *
 * DOS PARTICULARIDADES DE ESTA TABLA:
 * 1) `deleted_at` = borrado logico. TODA consulta filtra deleted_at is null,
 *    o la API devolveria vehiculos dados de baja como si estuvieran activos.
 * 2) Los *_id son UUIDs sin significado para un externo: estado y sede se
 *    resuelven a texto por embed de PostgREST.
 *
 * NO exponer: numero_motor, numero_chasis (identidad registral, se usan para
 * clonado), seguro_numero, titular, gps_uss/tipo_gps/traccar (identificadores
 * de rastreo), foto_url, documentos_urls, drive_folder_*, url_documentacion,
 * notas (texto libre) y los campos created_by/updated_by (empleados internos).
 */

import express from 'express';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';
import { RE_UUID, parsearPaginacion, listar, obtener, eq, buscarEn, pidioTodo, exportarTodo } from '../lib/query.js';

const router = express.Router();

const CAMPOS = [
  'id',
  'patente',
  'provisoria',
  'marca',
  'modelo',
  'anio',
  'color',
  'categoria',
  'tipo_vehiculo',
  'tipo_combustible',
  'gnc',
  'telepase',
  'cobertura',
  'grupo_flota',
  'lugar_radicacion',
  'kilometraje_actual',
  'vencimiento_seguro',
  'vto_vtv_aplica',
  'vto_vtv_fecha',
  'vto_gnc_aplica',
  'vto_gnc_fecha',
  'vto_matafuego_aplica',
  'vto_matafuego_fecha',
  'fecha_ulti_inspeccion',
  'fecha_prox_inspeccion',
  'vehiculos_estados(codigo,descripcion)',
  'sedes(nombre)',
];

const SELECT = CAMPOS.join(',');
const TABLA = 'vehiculos';
const NO_BORRADOS = 'deleted_at=is.null';

router.get('/vehiculos', requireApiKey('vehiculos:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);
  const filtros = [NO_BORRADOS];

  if (req.query.patente) filtros.push(eq('patente', req.query.patente));
  if (req.query.marca) filtros.push(eq('marca', req.query.marca));
  if (req.query.grupo_flota) filtros.push(eq('grupo_flota', req.query.grupo_flota));
  if (req.query.gnc) filtros.push(eq('gnc', req.query.gnc === 'true'));
  if (req.query.search) {
    const f = buscarEn(['patente', 'marca', 'modelo'], req.query.search);
    if (f) filtros.push(f);
  }

  if (pidioTodo(req.query)) {
    try {
      const r = await exportarTodo({ res, tabla: TABLA, select: SELECT, orden: 'patente.asc', filtros });
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: r.enviados });
    } catch (error) {
      const esTope = error.codigo === 'too_many_rows';
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: esTope ? 400 : 500, filas: 0 });
      if (res.headersSent) return;
      return res.status(esTope ? 400 : 500).json({
        error: esTope ? 'too_many_rows' : 'internal_error',
        message: esTope ? error.message : 'Error exportando vehiculos',
      });
    }
    return;
  }

  try {
    const out = await listar({
      tabla: TABLA, select: SELECT, orden: 'patente.asc',
      filtros, page, limit, offset,
    });
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: out.data.length });
    return res.json(out);
  } catch (error) {
    console.error('[API/vehiculos] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando vehiculos' });
  }
});

router.get('/vehiculos/:id', requireApiKey('vehiculos:api'), async (req, res) => {
  if (!RE_UUID.test(req.params.id)) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: 'El id debe ser un UUID valido' });
  }

  try {
    const row = await obtener({
      tabla: TABLA, select: SELECT, id: req.params.id, filtros: [NO_BORRADOS],
    });
    if (!row) {
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 404, filas: 0 });
      return res.status(404).json({ error: 'not_found', message: 'Vehiculo no encontrado' });
    }
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: 1 });
    return res.json({ data: row });
  } catch (error) {
    console.error('[API/vehiculos/:id] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando el vehiculo' });
  }
});

export default router;
