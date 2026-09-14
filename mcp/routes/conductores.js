/**
 * API REST publica de Conductores (solo lectura).
 *
 *   GET /api/v1/conductores      -> listado paginado
 *   GET /api/v1/conductores/:id  -> un conductor
 *
 * Permiso: conductores:api
 *
 * ESTA ES LA TABLA MAS SENSIBLE DEL SISTEMA. Corre con service_role, que
 * bypasea RLS, asi que CAMPOS es lo unico que separa a un tercero de la PII.
 * Antes de agregar una columna aca, leer la lista de abajo.
 *
 * PROHIBIDO EXPONER, sin excepciones:
 *   portal_password_hash  -> hash de la contrasena del Portal Conductor.
 *                            Un hash filtrado se ataca offline sin limite.
 *   portal_must_change_password
 *   cbu                   -> cuenta bancaria
 *   antecedentes_penales, antecedentes_transito
 *   fecha_nacimiento      -> con DNI y nombre facilita suplantacion
 *   contacto_emergencia, telefono_emergencia, parentesco_emergencia,
 *   direccion_emergencia  -> datos de terceros que nunca consintieron
 *   direccion_lat, direccion_lng -> ubican el domicilio con precision de metros
 *   observaciones, experiencia_previa, motivo_baja -> texto libre
 *   monotributo, estado_facturacion -> situacion fiscal
 *   foto_url, documentos_urls, drive_folder_url, drive_contract_folder_url,
 *   url_documentacion     -> punteros a documentacion escaneada
 *   intercom_id, intercom_status, geotab_user_id, id_conversation, id_guia,
 *   numero_ibutton        -> identificadores internos
 *
 * Decision tomada con el usuario (2026-09-14): se exponen contacto (email y
 * telefono_contacto) y domicilio como texto (direccion). Las coordenadas NO,
 * y las fechas/motivos de baja tampoco.
 */

import express from 'express';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';
import { RE_UUID, parsearPaginacion, listar, obtener, eq, buscarEn, pidioTodo, exportarTodo } from '../lib/query.js';

const router = express.Router();

const CAMPOS = [
  'id',
  'nombres',
  'apellidos',
  'numero_dni',
  'numero_cuit',
  'numero_licencia',
  'licencia_vencimiento',
  'email',
  'telefono_contacto',
  'direccion',
  'zona',
  'preferencia_turno',
  'fecha_contratacion',
  'conductores_estados(codigo,descripcion)',
  'sedes(nombre)',
];

const SELECT = CAMPOS.join(',');
const TABLA = 'conductores';

router.get('/conductores', requireApiKey('conductores:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);
  const filtros = [];

  if (req.query.dni) filtros.push(eq('numero_dni', req.query.dni));
  if (req.query.zona) filtros.push(eq('zona', req.query.zona));
  if (req.query.turno) filtros.push(eq('preferencia_turno', req.query.turno));
  if (req.query.search) {
    const f = buscarEn(['nombres', 'apellidos', 'numero_dni', 'email'], req.query.search);
    if (f) filtros.push(f);
  }

  if (pidioTodo(req.query)) {
    try {
      const r = await exportarTodo({ res, tabla: TABLA, select: SELECT, orden: 'apellidos.asc', filtros });
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: r.enviados });
    } catch (error) {
      const esTope = error.codigo === 'too_many_rows';
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: esTope ? 400 : 500, filas: 0 });
      if (res.headersSent) return;
      return res.status(esTope ? 400 : 500).json({
        error: esTope ? 'too_many_rows' : 'internal_error',
        message: esTope ? error.message : 'Error exportando conductores',
      });
    }
    return;
  }

  try {
    const out = await listar({
      tabla: TABLA, select: SELECT, orden: 'apellidos.asc',
      filtros, page, limit, offset,
    });
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: out.data.length });
    return res.json(out);
  } catch (error) {
    console.error('[API/conductores] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando conductores' });
  }
});

router.get('/conductores/:id', requireApiKey('conductores:api'), async (req, res) => {
  if (!RE_UUID.test(req.params.id)) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: 'El id debe ser un UUID valido' });
  }

  try {
    const row = await obtener({ tabla: TABLA, select: SELECT, id: req.params.id });
    if (!row) {
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 404, filas: 0 });
      return res.status(404).json({ error: 'not_found', message: 'Conductor no encontrado' });
    }
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: 1 });
    return res.json({ data: row });
  } catch (error) {
    console.error('[API/conductores/:id] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando el conductor' });
  }
});

export default router;
