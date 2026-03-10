/**
 * Middleware de autenticacion para la API externa
 * Usa Supabase Auth para verificar el token y chequea que el rol sea "Api"
 * No usa tablas separadas - se integra con el sistema de roles existente
 */

const ALLOWED_ROLES = ['Api', 'admin'];

/**
 * Verifica el token de Supabase Auth y chequea que el usuario tenga rol "Api" o "admin"
 * Agrega req.apiUser con { id, email, role }
 */
export async function verifyApiToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No autorizado',
      message: 'Token de acceso requerido. Usa: Authorization: Bearer <token>',
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuracion del servidor incompleta' });
  }

  try {
    // 1. Verificar token con Supabase Auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceKey,
      },
    });

    if (!userRes.ok) {
      return res.status(401).json({
        error: 'Token invalido o expirado',
        message: 'Inicia sesion nuevamente en POST /api/v1/auth/login',
      });
    }

    const user = await userRes.json();

    // 2. Obtener perfil y rol del usuario
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${user.id}&select=id,full_name,role_id,roles(name)`,
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

    if (!profile) {
      return res.status(403).json({
        error: 'Sin perfil',
        message: 'El usuario no tiene un perfil configurado en el sistema.',
      });
    }

    const roleName = profile.roles?.name;

    // 3. Verificar que el rol sea "Api" o "admin"
    if (!ALLOWED_ROLES.includes(roleName)) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `El rol "${roleName || 'sin rol'}" no tiene acceso a esta API. Se requiere rol "Api".`,
      });
    }

    // 4. Guardar datos del usuario en el request
    req.apiUser = {
      id: user.id,
      email: user.email,
      fullName: profile.full_name,
      role: roleName,
    };

    next();
  } catch (error) {
    console.error('Error en verifyApiToken:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
