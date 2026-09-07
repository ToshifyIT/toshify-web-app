-- =====================================================
-- Onboarding: submenú "Distribución en mapa v2"
-- =====================================================
-- Crea el submenú del módulo v2 (modo emparejamiento) justo después del
-- submenú `distribucion-mapa` existente, SIN tocarlo: los dos conviven.
--
-- Copia los permisos de rol y de usuario desde `distribucion-mapa`, de modo que
-- quien ya ve el v1 vea también el v2. Los admin lo ven automáticamente al
-- existir la fila con is_active = true.
--
-- Idempotente: si el submenú ya existe, actualiza sus datos.
-- El name DEBE ser 'distribucion-mapa-v2' (coincide con el submenuName del
-- ProtectedRoute en HomePage.tsx).

BEGIN;

DO $$
DECLARE
  v_v1_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_nuevo_id uuid;
BEGIN
  -- Submenú hermano de referencia: el v1.
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_v1_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus
  WHERE name = 'distribucion-mapa'
  LIMIT 1;

  IF v_v1_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú distribucion-mapa. Correr primero sql/distribucion_mapa_menu.sql';
  END IF;

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'distribucion-mapa-v2' LIMIT 1;

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
      'distribucion-mapa-v2',
      'Distribución en mapa v2',
      '/onboarding/distribucion-mapa-v2',
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
      label = 'Distribución en mapa v2',
      route = '/onboarding/distribucion-mapa-v2',
      menu_id = v_menu_id,
      parent_id = v_parent_id,
      level = v_level,
      order_index = v_order + 1,
      is_active = true
    WHERE id = v_nuevo_id;
  END IF;

  -- Copiar permisos de rol desde el v1.
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
  WHERE submenu_id = v_v1_id
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
    ' USING v_nuevo_id, v_v1_id;
  END IF;
END $$;

COMMIT;
