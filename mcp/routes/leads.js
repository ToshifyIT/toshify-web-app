/**
 * API REST publica de Leads (solo lectura).
 *
 *   GET /api/v1/leads      -> listado paginado
 *   GET /api/v1/leads/:id  -> un lead
 *
 * Autenticacion: header x-api-key con permiso `leads:api`.
 *
 * Esta ruta corre con la service_role key (bypasea RLS), asi que el control de
 * que se expone vive ENTERAMENTE aca:
 *   - CAMPOS_PUBLICOS es fijo. El cliente no elige columnas.
 *   - Los filtros son una lista blanca. Nada se pasa crudo a PostgREST.
 * La tabla leads tiene datos que NO deben salir (cbu, bcra, antecedentes,
 * geolocalizacion del domicilio, observaciones libres): si se agrega un campo
 * aca, es una decision deliberada.
 */

import express from 'express';
import { supabaseRequest } from '../lib/supabase.js';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';

const router = express.Router();

// Lista blanca de campos expuestos al tercero. NO agregar sin decision explicita.
const CAMPOS_PUBLICOS = [
  'id',
  'nombre_completo',
  'dni',
  'email',
  'phone',
  'whatsapp_number',
  'direccion',
  'edad',
  'estado_de_lead',
  'sede',
  'fecha_creacion',
];

const SELECT = CAMPOS_PUBLICOS.join(',');

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;

/**
 * Limpia el texto de busqueda: saca los caracteres que tienen significado en la
 * sintaxis `or=(campo.ilike.*valor*)` de PostgREST. Sin esto, una coma o un
 * parentesis en el input rompen (o alteran) el filtro.
 */
function limpiarBusqueda(texto) {
  return String(texto).replace(/[,.()*\\"%]/g, ' ').trim().slice(0, 100);
}

function construirFiltros(query) {
  const filtros = [];
  const errores = [];

  if (query.estado) {
    filtros.push(`estado_de_lead=eq.${encodeURIComponent(String(query.estado))}`);
  }

  if (query.sede) {
    filtros.push(`sede=eq.${encodeURIComponent(String(query.sede))}`);
  }

  if (query.desde) {
    if (!RE_FECHA.test(String(query.desde))) errores.push('desde debe ser una fecha ISO (YYYY-MM-DD)');
    else filtros.push(`fecha_creacion=gte.${encodeURIComponent(String(query.desde))}`);
  }

  if (query.hasta) {
    if (!RE_FECHA.test(String(query.hasta))) errores.push('hasta debe ser una fecha ISO (YYYY-MM-DD)');
    else filtros.push(`fecha_creacion=lte.${encodeURIComponent(String(query.hasta))}`);
  }

  if (query.search) {
    const s = limpiarBusqueda(query.search);
    if (s) {
      const e = encodeURIComponent(s);
      filtros.push(`or=(nombre_completo.ilike.*${e}*,email.ilike.*${e}*,dni.ilike.*${e}*)`);
    }
  }

  return { filtros, errores };
}

function parsearPaginacion(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(query.limit, 10) || LIMIT_DEFAULT));
  return { page, limit, offset: (page - 1) * limit };
}

// ---------------------------------------------------------
// GET /api/v1/leads
// ---------------------------------------------------------
router.get('/leads', requireApiKey('leads:api'), async (req, res) => {
  const { page, limit, offset } = parsearPaginacion(req.query);
  const { filtros, errores } = construirFiltros(req.query);

  if (errores.length) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: errores.join('; ') });
  }

  const qs = [
    `select=${SELECT}`,
    'order=fecha_creacion.desc',
    `offset=${offset}`,
    `limit=${limit}`,
    ...filtros,
  ].join('&');

  try {
    const resp = await supabaseRequest(`leads?${qs}`, {
      headers: { Prefer: 'count=exact' },
    });

    const data = await resp.json();
    const total = parseInt(resp.headers.get('content-range')?.split('/')[1], 10) || data.length;

    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: data.length });

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API/leads] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando leads' });
  }
});

// ---------------------------------------------------------
// GET /api/v1/leads/:id
// ---------------------------------------------------------
router.get('/leads/:id', requireApiKey('leads:api'), async (req, res) => {
  const { id } = req.params;

  if (!RE_UUID.test(id)) {
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 400, filas: 0 });
    return res.status(400).json({ error: 'bad_request', message: 'El id debe ser un UUID valido' });
  }

  try {
    const resp = await supabaseRequest(`leads?id=eq.${id}&select=${SELECT}&limit=1`);
    const data = await resp.json();

    if (!data.length) {
      registrarRequest({ apiKeyData: req.apiKeyData, req, status: 404, filas: 0 });
      return res.status(404).json({ error: 'not_found', message: 'Lead no encontrado' });
    }

    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 200, filas: 1 });
    return res.json({ data: data[0] });
  } catch (error) {
    console.error('[API/leads/:id] Error:', error.message);
    registrarRequest({ apiKeyData: req.apiKeyData, req, status: 500, filas: 0 });
    return res.status(500).json({ error: 'internal_error', message: 'Error consultando el lead' });
  }
});

export default router;
