-- =====================================================
-- Reportes: submenú "Rendimiento de agentes"
-- =====================================================
-- Tabla con una fila por agente de ventas (/reportes/rendimiento-agentes).
-- Se ubica en Reportes al final y lo ven los mismos que ven el Dashboard General
-- (dashboard-general). Se puede ejecutar más de una vez.
-- El name DEBE ser 'rendimiento-agentes' (es el submenuName del ProtectedRoute).

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
  WHERE name = 'dashboard-general'
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú dashboard-general (correr antes sql/dashboard_general_menu.sql).';
  END IF;

  -- Último lugar dentro de Reportes
  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM submenus
  WHERE menu_id IS NOT DISTINCT FROM v_menu_id
    AND parent_id IS NOT DISTINCT FROM v_parent_id
    AND name <> 'rendimiento-agentes';

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'rendimiento-agentes' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('rendimiento-agentes', 'Rendimiento de agentes', '/reportes/rendimiento-agentes',
            v_menu_id, v_parent_id, v_level, v_order + 1, true)
    RETURNING id INTO v_nuevo_id;
  ELSE
    UPDATE submenus
    SET label = 'Rendimiento de agentes', route = '/reportes/rendimiento-agentes',
        menu_id = v_menu_id, parent_id = v_parent_id, level = v_level,
        order_index = v_order + 1, is_active = true
    WHERE id = v_nuevo_id;
  END IF;

  -- Permisos de ver: los mismos que Dashboard General (roles)
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_nuevo_id, true, false, false, false
  FROM role_submenu_permissions
  WHERE submenu_id = v_ref_id AND can_view
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET can_view = true;

  -- ... y por usuario, si la tabla existe
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
      SELECT user_id, $1, true, false, false, false
      FROM user_submenu_permissions
      WHERE submenu_id = $2 AND can_view
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET can_view = true
    ' USING v_nuevo_id, v_ref_id;
  END IF;
END $$;

COMMIT;

-- Comprobar
SELECT s.name, s.label, s.order_index, s.is_active,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_submenu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.submenu_id = s.id AND p.can_view) AS roles_que_lo_ven
FROM submenus s
WHERE s.name = 'rendimiento-agentes';

-- Quitarlo: DELETE FROM submenus WHERE name = 'rendimiento-agentes';
