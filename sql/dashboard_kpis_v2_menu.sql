-- =====================================================
-- Reportes: submenú "Dashboard KPI v2"
-- =====================================================
-- Crea el submenú junto a `dashboard-kpis` (después del directivo si existe),
-- SIN tocar los existentes.
--
-- DOS PASOS (la base es compartida con producción):
--   PASO 1 (ahora): crea el submenú. Solo lo ven los admin, que ven todo
--     submenú activo. Así se puede probar en local sin mostrarlo al resto.
--   PASO 2 (al desplegar el frontend): copia los permisos de VER desde
--     `dashboard-kpis`. Cargar el forecast requiere permiso de EDITAR el
--     submenú (o ser admin): darlo desde Administración > Roles a quien
--     corresponda (dirección / administración).
--
-- Idempotente: si el submenú ya existe, actualiza sus datos.
-- El name DEBE ser 'dashboard-kpis-v2' (coincide con el submenuName del
-- ProtectedRoute en HomePage.tsx y con el permiso que usa la pantalla).

BEGIN;

DO $$
DECLARE
  v_ref_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_nuevo_id uuid;
BEGIN
  SELECT id, menu_id, parent_id, COALESCE(level, 1)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level
  FROM submenus
  WHERE name = 'dashboard-kpis'
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú dashboard-kpis.';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM submenus
  WHERE name IN ('dashboard-kpis', 'dashboard-directivo');

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'dashboard-kpis-v2' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES (
      'dashboard-kpis-v2',
      'Dashboard KPI v2',
      '/reportes/dashboard-kpis-v2',
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
      label = 'Dashboard KPI v2',
      route = '/reportes/dashboard-kpis-v2',
      menu_id = v_menu_id,
      parent_id = v_parent_id,
      level = v_level,
      order_index = v_order + 1,
      is_active = true
    WHERE id = v_nuevo_id;
  END IF;

END $$;

COMMIT;


-- =====================================================
-- PASO 2: ejecutar SOLO cuando el frontend con /reportes/dashboard-kpis-v2
-- esté desplegado en producción.
-- =====================================================
/*
BEGIN;

DO $$
DECLARE
  v_ref_id uuid;
  v_nuevo_id uuid;
BEGIN
  SELECT id INTO v_ref_id FROM submenus WHERE name = 'dashboard-kpis' LIMIT 1;
  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'dashboard-kpis-v2' LIMIT 1;
  IF v_ref_id IS NULL OR v_nuevo_id IS NULL THEN
    RAISE EXCEPTION 'Falta dashboard-kpis o dashboard-kpis-v2 (ejecutar antes el paso 1).';
  END IF;

  -- Permisos de rol: solo VER, copiados desde dashboard-kpis.
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_nuevo_id, can_view, false, false, false
  FROM role_submenu_permissions
  WHERE submenu_id = v_ref_id
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET
    can_view = EXCLUDED.can_view;

  -- Permisos por usuario (si la tabla existe).
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
      SELECT user_id, $1, can_view, false, false, false
      FROM user_submenu_permissions
      WHERE submenu_id = $2
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET
        can_view = EXCLUDED.can_view
    ' USING v_nuevo_id, v_ref_id;
  END IF;
END $$;

COMMIT;
*/
