-- ============================================
-- Agregar columna email a user_profiles
-- Sincronizada automáticamente con auth.users
-- ============================================

-- 1. Agregar columna email
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Poblar emails existentes desde auth.users
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id;

-- 3. Crear trigger para sincronizar email automáticamente
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cuando se actualiza auth.users, sincronizar email a user_profiles
  UPDATE public.user_profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- 4. Crear trigger en auth.users (si no existe)
DROP TRIGGER IF EXISTS on_auth_user_email_update ON auth.users;
CREATE TRIGGER on_auth_user_email_update
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_email();

-- 5. Comentario descriptivo
COMMENT ON COLUMN public.user_profiles.email IS 'Email del usuario, sincronizado automáticamente desde auth.users';
