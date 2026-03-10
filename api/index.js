/**
 * API Externa v1 - Router principal
 * Monta todas las rutas bajo /api/v1
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import hireflixRoutes from './routes/hireflix.js';

const router = Router();

// Rate limiter para login: max 10 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Demasiados intentos de login',
    message: 'Has excedido el limite de intentos. Intenta de nuevo en 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter general para endpoints de datos: max 200 requests por IP cada 15 minutos
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    error: 'Demasiadas solicitudes',
    message: 'Has excedido el limite de solicitudes. Intenta de nuevo en unos minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swagger UI - Documentacion interactiva en /api/v1/docs
router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Toshify API - Documentacion',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Spec JSON crudo en /api/v1/docs.json
router.get('/docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// Montar rutas
router.use('/auth', loginLimiter, authRoutes);
router.use('/leads', apiLimiter, leadsRoutes);
router.use('/hireflix-historico', apiLimiter, hireflixRoutes);

// Root info
router.get('/', (req, res) => {
  res.json({
    api: 'Toshify API Externa',
    version: 'v1',
    docs: '/api/v1/docs',
    endpoints: {
      auth: {
        'POST /api/v1/auth/login': 'Iniciar sesion (body: { username, password })',
      },
      leads: {
        'GET /api/v1/leads': 'Listar leads (query: page, limit, search, estado, agente, sede, desde, hasta)',
        'GET /api/v1/leads/:id': 'Obtener un lead por ID',
      },
      hireflix: {
        'GET /api/v1/hireflix-historico': 'Listar registros (query: page, limit, search, desde, hasta)',
        'GET /api/v1/hireflix-historico/:id': 'Obtener un registro por ID',
      },
    },
    auth_info: 'Enviar header: Authorization: Bearer <token>',
  });
});

export default router;
