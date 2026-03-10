/**
 * Rutas de lectura para la tabla hireflix_historico
 * GET /api/v1/hireflix-historico - Listar registros con paginacion y filtros
 * GET /api/v1/hireflix-historico/:id - Obtener un registro por ID
 */

import { Router } from 'express';
import { verifyApiToken } from '../middleware/auth.js';

const router = Router();

// Todos los endpoints requieren autenticacion con rol "Api"
router.use(verifyApiToken);

/**
 * GET /api/v1/hireflix-historico
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50, max: 500)
 *   - search (busca en nombre, email)
 *   - desde (fecha desde)
 *   - hasta (fecha hasta)
 *   - order (campo para ordenar, default: fecha)
 *   - dir (asc/desc, default: desc)
 */
router.get('/', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const orderField = req.query.order || 'fecha';
    const orderDir = req.query.dir === 'asc' ? 'asc' : 'desc';

    // Construir filtros
    const filters = [];

    if (req.query.desde) {
      filters.push(`"fecha"=gte.${encodeURIComponent(req.query.desde)}`);
    }
    if (req.query.hasta) {
      filters.push(`"fecha"=lte.${encodeURIComponent(req.query.hasta)}`);
    }
    if (req.query.search) {
      const s = encodeURIComponent(req.query.search);
      filters.push(`or=("nombre".ilike.*${s}*,"email".ilike.*${s}*)`);
    }

    const filterStr = filters.length ? `&${filters.join('&')}` : '';
    const url = `${supabaseUrl}/rest/v1/hireflix_historico?select=*&order="${encodeURIComponent(orderField)}".${orderDir}&offset=${offset}&limit=${limit}${filterStr}`;

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
      return res.status(500).json({ error: 'Error consultando hireflix_historico' });
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
    console.error('Error en GET /hireflix-historico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/v1/hireflix-historico/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const dataRes = await fetch(
      `${supabaseUrl}/rest/v1/hireflix_historico?id=eq.${req.params.id}&select=*`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!dataRes.ok) {
      return res.status(500).json({ error: 'Error consultando registro' });
    }

    const data = await dataRes.json();
    if (!data.length) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error en GET /hireflix-historico/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
