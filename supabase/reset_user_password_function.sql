-- ============================================
-- Función para resetear contraseña de usuario
-- Solo puede ser ejecutada por administradores
-- ============================================

-- 1. Crear función que actualiza contraseña usando extensión pgcrypto
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  result JSONB;
BEGIN
  -- Verificar que el usuario que llama sea admin
  SELECT r.name INTO caller_role
  FROM user_profiles up
  JOIN roles r ON up.role_id = r.id
  WHERE up.id = auth.uid();

  IF caller_role IS NULL OR LOWER(caller_role) NOT IN ('admin', 'administrador', 'superadmin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No tienes permisos para realizar esta acción'
    );
  END IF;

  -- Verificar que el usuario target existe
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Usuario no encontrado'
    );
  END IF;

  -- Actualizar contraseña en auth.users
  -- Nota: Esto requiere que la función tenga SECURITY DEFINER
  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Marcar must_change_password
  UPDATE public.user_profiles
  SET must_change_password = true
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Contraseña actualizada correctamente'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 2. Dar permisos solo a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;

-- 3. Comentario
COMMENT ON FUNCTION public.admin_reset_user_password IS 'Permite a administradores resetear contraseñas de usuarios. Requiere rol admin/administrador/superadmin.';
