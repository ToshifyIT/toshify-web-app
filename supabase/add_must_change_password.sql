-- ============================================
-- Agregar campo must_change_password a user_profiles
-- Para forzar cambio de contraseña en primer inicio de sesión
-- ============================================

-- 1. Agregar columna
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 2. Comentario descriptivo
COMMENT ON COLUMN public.user_profiles.must_change_password IS
'Indica si el usuario debe cambiar su contraseña en el próximo inicio de sesión. Se usa para contraseñas temporales.';

-- 3. Actualizar usuarios existentes (false por defecto)
UPDATE public.user_profiles
SET must_change_password = false
WHERE must_change_password IS NULL;

-- 4. Crear función para marcar contraseña como cambiada
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET must_change_password = false
  WHERE id = auth.uid();
END;
$$;

-- 5. Dar permisos
GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;
