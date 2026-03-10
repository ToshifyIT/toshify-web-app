/**
 * Rutas de autenticacion para la API externa
 * Usa Supabase Auth - el usuario debe existir en Supabase con rol "Api"
 */

import { Router } from 'express';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Response: { token, expiresIn, user }
 *
 * Autentica via Supabase Auth y verifica que el usuario tenga rol "Api"
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Se requiere email y password',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return res.status(500).json({ error: 'Configuracion del servidor incompleta' });
    }

    // 1. Login via Supabase Auth
    const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!authRes.ok) {
      const errBody = await authRes.json().catch(() => ({}));
      if (authRes.status === 400) {
        return res.status(401).json({
          error: 'Credenciales invalidas',
          message: 'Email o contraseña incorrectos',
        });
      }
      return res.status(authRes.status).json({
        error: 'Error de autenticacion',
        message: errBody.error_description || errBody.msg || 'Error al autenticar',
      });
    }

    const authData = await authRes.json();

    // 2. Verificar que el usuario tenga rol "Api" o "admin"
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${authData.user.id}&select=id,full_name,role_id,roles(name)`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!profileRes.ok) {
      return res.status(500).json({ error: 'Error verificando perfil de usuario' });
    }

    const profiles = await profileRes.json();
    const profile = profiles[0];
    const roleName = profile?.roles?.name;
    const allowedRoles = ['Api', 'admin'];

    if (!allowedRoles.includes(roleName)) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `El rol "${roleName || 'sin rol'}" no tiene acceso a esta API. Contacta al administrador.`,
      });
    }

    // 3. Responder con el token de Supabase
    res.json({
      success: true,
      token: authData.access_token,
      refreshToken: authData.refresh_token,
      expiresIn: authData.expires_in,
      expiresAt: authData.expires_at,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: profile.full_name,
        role: roleName,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 * Renueva el token sin pedir email/password de nuevo
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Se requiere refreshToken',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Configuracion del servidor incompleta' });
    }

    const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!authRes.ok) {
      return res.status(401).json({
        error: 'Refresh token invalido',
        message: 'Inicia sesion nuevamente con email y password',
      });
    }

    const authData = await authRes.json();

    res.json({
      success: true,
      token: authData.access_token,
      refreshToken: authData.refresh_token,
      expiresIn: authData.expires_in,
      expiresAt: authData.expires_at,
    });
  } catch (error) {
    console.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
