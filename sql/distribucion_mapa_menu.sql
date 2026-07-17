-- =====================================================
-- Onboarding: submenú "Distribución en mapa"
-- =====================================================
-- Crea un submenú de solo-visualización bajo Onboarding, ubicado justo
-- después de "Zonas restringidas" (submenú `zonas-peligrosas`).
--
-- Copia los permisos de rol y de usuario desde `zonas-peligrosas` para que
-- quienes ya ven ese submenú vean también el nuevo. Los admin lo ven
-- automáticamente al existir la fila con is_active = true.
--
-- Idempotente: si el submenú ya existe, actualiza sus datos.
-- El name DEBE ser 'distribucion-mapa' (coincide con el submenuName del
-- ProtectedRoute en HomePage.tsx).

BEGIN;

DO $$
DECLARE
  v_zonas_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_nuevo_id uuid;
BEGIN
  -- Submenú hermano de referencia: "zonas-peligrosas" (Zonas restringidas).
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_zonas_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus
  WHERE name = 'zonas-peligrosas'
  LIMIT 1;

  IF v_zonas_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú zonas-peligrosas (Onboarding). Validar el menú de onboarding primero.';
  END IF;

  -- Insertar / actualizar el nuevo submenú justo después de zonas-peligrosas.
  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'distribucion-mapa' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (
      name,
      label,
      route,
      menu_id,
      parent_id,
      level,
      order_index,
      is_active
    )
    VALUES (
      'distribucion-mapa',
      'Distribución en mapa',
      '/onboarding/distribucion-mapa',
      v_menu_id,
      v_parent_id,
      v_level,
      v_order + 1,
      true
    )
    RETURNING id INTO v_nuevo_id;
  ELSE
    UPDATE submenus
    SET
      label = 'Distribución en mapa',
      route = '/onboarding/distribucion-mapa',
      menu_id = v_menu_id,
      parent_id = v_parent_id,
      level = v_level,
      order_index = v_order + 1,
      is_active = true
    WHERE id = v_nuevo_id;
  END IF;

  -- Copiar permisos de rol desde zonas-peligrosas.
  INSERT INTO role_submenu_permissions (
    role_id,
    submenu_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  )
  SELECT
    role_id,
    v_nuevo_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_zonas_id
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;

  -- Copiar permisos por usuario (si la tabla existe).
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_submenu_permissions (
        user_id,
        submenu_id,
        can_view,
        can_create,
        can_edit,
        can_delete
      )
      SELECT
        user_id,
        $1,
        can_view,
        can_create,
        can_edit,
        can_delete
      FROM user_submenu_permissions
      WHERE submenu_id = $2
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete
    ' USING v_nuevo_id, v_zonas_id;
  END IF;
END $$;

COMMIT;
