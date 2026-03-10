/**
 * Rutas para la tabla leads
 * GET /api/v1/leads - Listar leads con paginacion y filtros
 * GET /api/v1/leads/:id - Obtener un lead por ID
 * PATCH /api/v1/leads/:id - Actualizar un lead (estado, datos, asignaciones)
 */

import { Router } from 'express';
import { verifyApiToken } from '../middleware/auth.js';

const router = Router();

// Todos los endpoints requieren autenticacion con rol "Api"
router.use(verifyApiToken);

/**
 * GET /api/v1/leads
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50, max: 500)
 *   - search (busca en Nombre Completo, Email, DNI)
 *   - estado (filtra por Estado de Lead)
 *   - agente (filtra por Agente asignado)
 *   - sede (filtra por Sede)
 *   - desde (fecha desde - Fecha creacion)
 *   - hasta (fecha hasta - Fecha creacion)
 *   - order (campo para ordenar, default: Fecha creación)
 *   - dir (asc/desc, default: desc)
 */
router.get('/', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const orderField = req.query.order || 'Fecha creación';
    const orderDir = req.query.dir === 'asc' ? 'asc' : 'desc';

    // Construir filtros
    const filters = [];

    if (req.query.estado) {
      filters.push(`"Estado de Lead"=eq.${encodeURIComponent(req.query.estado)}`);
    }
    if (req.query.agente) {
      filters.push(`"Agente asignado"=eq.${encodeURIComponent(req.query.agente)}`);
    }
    if (req.query.sede) {
      filters.push(`"Sede"=eq.${encodeURIComponent(req.query.sede)}`);
    }
    if (req.query.desde) {
      filters.push(`"Fecha creación"=gte.${encodeURIComponent(req.query.desde)}`);
    }
    if (req.query.hasta) {
      filters.push(`"Fecha creación"=lte.${encodeURIComponent(req.query.hasta)}`);
    }
    if (req.query.search) {
      const s = encodeURIComponent(req.query.search);
      filters.push(`or=("Nombre Completo".ilike.*${s}*,"Email".ilike.*${s}*,"DNI".ilike.*${s}*)`);
    }

    const filterStr = filters.length ? `&${filters.join('&')}` : '';
    const url = `${supabaseUrl}/rest/v1/leads?select=*&order="${encodeURIComponent(orderField)}".${orderDir}&offset=${offset}&limit=${limit}${filterStr}`;

    const dataRes = await fetch(url, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'count=exact',
      },
    });

    if (!dataRes.ok) {
      const errBody = await dataRes.text();
      console.error('Supabase error:', errBody);
      return res.status(500).json({ error: 'Error consultando leads' });
    }

    const data = await dataRes.json();
    const totalCount = parseInt(dataRes.headers.get('content-range')?.split('/')[1]) || data.length;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error en GET /leads:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/v1/leads/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const dataRes = await fetch(
      `${supabaseUrl}/rest/v1/leads?id=eq.${req.params.id}&select=*`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!dataRes.ok) {
      return res.status(500).json({ error: 'Error consultando lead' });
    }

    const data = await dataRes.json();
    if (!data.length) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error en GET /leads/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Campos permitidos para actualizar via API.
 * Se usa un Set para validar que el chatbot solo pueda modificar estos campos.
 */
const UPDATABLE_FIELDS = new Set([
  'Estado de Lead',
  'Agente asignado',
  'Entrevistador asignado',
  'Especialista Onboarding',
  'Administrativo Asignado',
  'Dataentry Asignado',
  'Agente logistico asignado',
  'Guia asignado',
  'Asistente Virtual',
  'Nombre Completo',
  'Apellido',
  'Primer nombre',
  'Email',
  'Phone',
  'WhatsApp number',
  'DNI',
  'Edad',
  'Direccion',
  'City',
  'Region',
  'Country',
  'Zona',
  'Sede',
  'Turno',
  'Patente',
  'Compañero',
  'Tipo',
  'Licencia',
  'Monotributo',
  'Experiencia previa',
  'Acepta oferta',
  'Antecedentes penales',
  'Tiempo de antiguedad',
  'Fase de Preguntas',
  'Documentos pendientes',
  'Causal de cierre',
  'Contacto de emergencia',
  'Link facturacion',
  'Ayuda Entrevista',
  'Código Referido',
  'Año de auto',
  'Km de auto',
  'Marca y modelo de vehículo',
  'Fuente de lead',
  'Cerrado timeout wpp',
]);

/**
 * PATCH /api/v1/leads/:id
 * Actualizar campos de un lead.
 * Body: objeto con los campos a actualizar (solo campos permitidos).
 * Ejemplo: { "Estado de Lead": "Contactado", "Sede": "Córdoba" }
 */
router.patch('/:id', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = req.body;

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return res.status(400).json({
        error: 'Body vacio',
        message: 'Envia un JSON con los campos a actualizar. Ejemplo: { "Estado de Lead": "Contactado" }',
      });
    }

    // Filtrar solo campos permitidos
    const updates = {};
    const rejected = [];

    for (const [key, value] of Object.entries(body)) {
      if (UPDATABLE_FIELDS.has(key)) {
        updates[key] = value;
      } else {
        rejected.push(key);
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Ningun campo valido',
        message: 'Los campos enviados no son actualizables.',
        rejectedFields: rejected,
        allowedFields: [...UPDATABLE_FIELDS].sort(),
      });
    }

    // Verificar que el lead existe
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/leads?id=eq.${req.params.id}&select=id`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!checkRes.ok) {
      return res.status(500).json({ error: 'Error verificando lead' });
    }

    const existing = await checkRes.json();
    if (!existing.length) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    // Hacer el update via Supabase REST API
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/leads?id=eq.${req.params.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updates),
      }
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error('Supabase update error:', errBody);
      return res.status(500).json({ error: 'Error actualizando lead' });
    }

    const updatedData = await updateRes.json();

    const result = {
      success: true,
      data: updatedData[0],
      updatedFields: Object.keys(updates),
    };

    if (rejected.length > 0) {
      result.rejectedFields = rejected;
    }

    res.json(result);
  } catch (error) {
    console.error('Error en PATCH /leads/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
