-- =====================================================
-- Reportes: submenú "Dashboard Marketing"
-- =====================================================
-- Crea el submenú después de `dashboard-directivo` (o de `dashboard-kpis` si no
-- existe), SIN tocar los demás.
--
-- Al crearlo solo lo ven los admin (ven todo submenú activo). Para la agencia:
-- crear un rol (ej. "Marketing") en Administración > Roles con permiso de ver
-- SOLO este submenú, y asignarlo al usuario de la agencia.
--
-- Idempotente: si el submenú ya existe, actualiza sus datos.
-- El name DEBE ser 'dashboard-marketing' (coincide con el submenuName del
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
  WHERE name IN ('dashboard-directivo', 'dashboard-kpis')
  ORDER BY (name = 'dashboard-directivo') DESC
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú dashboard-kpis.';
  END IF;

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'dashboard-marketing' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES (
      'dashboard-marketing',
      'Dashboard Marketing',
      '/reportes/dashboard-marketing',
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
      label = 'Dashboard Marketing',
      route = '/reportes/dashboard-marketing',
      menu_id = v_menu_id,
      parent_id = v_parent_id,
      level = v_level,
      order_index = v_order + 1,
      is_active = true
    WHERE id = v_nuevo_id;
  END IF;

END $$;

COMMIT;
