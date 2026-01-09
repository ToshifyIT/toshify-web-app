-- ============================================
-- Fix Security Issues - Supabase Linter
-- ============================================
-- Ejecutar en SQL Editor de Supabase
-- IMPORTANTE: Este script NO rompe funcionalidad existente

-- ============================================
-- PASO 1: Revocar acceso de anon a las views
-- (Soluciona: auth_users_exposed)
-- ============================================

-- Solo usuarios autenticados deben acceder a sus permisos
REVOKE ALL ON public.user_effective_menu_permissions FROM anon;
REVOKE ALL ON public.user_effective_submenu_permissions FROM anon;

-- Confirmar que authenticated sí tiene acceso
GRANT SELECT ON public.user_effective_menu_permissions TO authenticated;
GRANT SELECT ON public.user_effective_submenu_permissions TO authenticated;

-- ============================================
-- PASO 2: Fix Functions search_path
-- (Soluciona: function_search_path_mutable)
-- ============================================

-- Fijar search_path para prevenir inyección de esquemas
ALTER FUNCTION public.assign_menu_permissions_to_admin() SET search_path = public;
ALTER FUNCTION public.assign_submenu_permissions_to_admin() SET search_path = public;
ALTER FUNCTION public.update_conceptos_updated_at() SET search_path = public;

-- ============================================
-- PASO 3: (OPCIONAL) Recrear views más seguras
-- Solo ejecutar si el PASO 1 no elimina los warnings
-- ============================================

-- Las views actuales usan SECURITY DEFINER que es necesario para acceder auth.users
-- Si quieres eliminar ese warning, puedes recrear las views así:
-- (Descomenta si es necesario)

/*
-- Backup: guardar estructura actual
-- SELECT * FROM user_effective_menu_permissions LIMIT 1;
-- SELECT * FROM user_effective_submenu_permissions LIMIT 1;

-- Recrear con SECURITY INVOKER (usa permisos del usuario que consulta)
DROP VIEW IF EXISTS public.user_effective_menu_permissions;
CREATE VIEW public.user_effective_menu_permissions
WITH (security_invoker = true)
AS
SELECT
    auth.uid() as user_id,
    up.role_id,
    m.id as menu_id,
    m.nombre as menu_nombre,
    m.icono,
    m.orden,
    COALESCE(mp.can_view, false) as can_view,
    COALESCE(mp.can_create, false) as can_create,
    COALESCE(mp.can_edit, false) as can_edit,
    COALESCE(mp.can_delete, false) as can_delete
FROM user_profiles up
JOIN menus m ON true
LEFT JOIN menu_permissions mp ON mp.role_id = up.role_id AND mp.menu_id = m.id
WHERE up.id = auth.uid()
  AND m.activo = true;

DROP VIEW IF EXISTS public.user_effective_submenu_permissions;
CREATE VIEW public.user_effective_submenu_permissions
WITH (security_invoker = true)
AS
SELECT
    auth.uid() as user_id,
    up.role_id,
    sm.id as submenu_id,
    sm.menu_id,
    sm.nombre as submenu_nombre,
    sm.codigo,
    sm.orden,
    COALESCE(smp.can_view, false) as can_view,
    COALESCE(smp.can_create, false) as can_create,
    COALESCE(smp.can_edit, false) as can_edit,
    COALESCE(smp.can_delete, false) as can_delete
FROM user_profiles up
JOIN submenus sm ON true
LEFT JOIN submenu_permissions smp ON smp.role_id = up.role_id AND smp.submenu_id = sm.id
WHERE up.id = auth.uid()
  AND sm.activo = true;

GRANT SELECT ON public.user_effective_menu_permissions TO authenticated;
GRANT SELECT ON public.user_effective_submenu_permissions TO authenticated;
*/

-- ============================================
-- Verificación
-- ============================================
-- Ejecuta esto para verificar los cambios:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name IN ('user_effective_menu_permissions', 'user_effective_submenu_permissions');
