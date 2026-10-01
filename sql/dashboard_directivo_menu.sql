-- =====================================================
-- Reportes: submenú "Dashboard KPI Directivo"
-- =====================================================
-- Crea el submenú justo después de `dashboard-kpis`, SIN tocarlo.
--
-- DOS PASOS (la base es compartida con producción):
--   PASO 1 (ahora): crea el submenú. Solo lo ven los admin, que ven todo
--     submenú activo. Así se puede probar en local sin mostrarlo al resto.
--   PASO 2 (al desplegar el frontend): copia los permisos de rol y de usuario
--     desde `dashboard-kpis`, para que lo vea quien hoy ve el Dashboard KPI.
--     Si se quiere restringir a dirección, ajustar desde Administración > Roles.
--
-- Idempotente: si el submenú ya existe, actualiza sus datos.
-- El name DEBE ser 'dashboard-directivo' (coincide con el submenuName del
-- ProtectedRoute en HomePage.tsx).

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
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus
  WHERE name = 'dashboard-kpis'
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú dashboard-kpis.';
  END IF;

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'dashboard-directivo' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES (
      'dashboard-directivo',
      'Dashboard KPI Directivo',
      '/reportes/dashboard-directivo',
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
      label = 'Dashboard KPI Directivo',
      route = '/reportes/dashboard-directivo',
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
-- PASO 2: ejecutar SOLO cuando el frontend con /reportes/dashboard-directivo
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
  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'dashboard-directivo' LIMIT 1;
  IF v_ref_id IS NULL OR v_nuevo_id IS NULL THEN
    RAISE EXCEPTION 'Falta dashboard-kpis o dashboard-directivo (ejecutar antes el paso 1).';
  END IF;

  -- Permisos de rol copiados desde dashboard-kpis (solo lectura tiene sentido acá).
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
