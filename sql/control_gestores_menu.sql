-- =====================================================
-- Reportes: submenú "Control de gestores" (2026-11-05)
-- =====================================================
-- Tablero de ocupación de turnos, pérdida por turnos vacíos, churn y retención por
-- gestor (/reportes/control-gestores). Lo ven solo los roles admin, directivo y
-- operaciones (pedido de Operaciones). Se ubica al final de Reportes.
-- El name DEBE ser 'control-gestores' (es el submenuName del ProtectedRoute).
-- Necesita sql/vehiculos_guia_historial.sql. Se puede ejecutar más de una vez.

BEGIN;

DO $$
DECLARE
  v_ref_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_nuevo_id uuid;
  v_roles text[] := ARRAY['admin', 'directivo', 'operaciones'];
BEGIN
  -- Mismo lugar que Dashboard General (menú Reportes)
  SELECT id, menu_id, parent_id, COALESCE(level, 1)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level
  FROM submenus
  WHERE name = 'dashboard-general'
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú dashboard-general (correr antes sql/dashboard_general_menu.sql).';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM submenus
  WHERE menu_id IS NOT DISTINCT FROM v_menu_id
    AND parent_id IS NOT DISTINCT FROM v_parent_id
    AND name <> 'control-gestores';

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'control-gestores' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('control-gestores', 'Control de gestores', '/reportes/control-gestores',
            v_menu_id, v_parent_id, v_level, v_order + 1, true)
    RETURNING id INTO v_nuevo_id;
  ELSE
    UPDATE submenus
    SET label = 'Control de gestores', route = '/reportes/control-gestores',
        menu_id = v_menu_id, parent_id = v_parent_id, level = v_level,
        order_index = v_order + 1, is_active = true
    WHERE id = v_nuevo_id;
  END IF;

  -- Ver el submenú: solo esos tres roles
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT r.id, v_nuevo_id, true, false, false, false
  FROM roles r
  WHERE r.name = ANY (v_roles)
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET can_view = true;

  -- Y que vean el menú Reportes (sin esto no aparece en la barra lateral). Los demás
  -- submenús de Reportes tienen su propio permiso: no se habilita ninguno más.
  IF v_menu_id IS NOT NULL THEN
    INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
    SELECT r.id, v_menu_id, true, false, false, false
    FROM roles r
    WHERE r.name = ANY (v_roles)
      AND NOT EXISTS (SELECT 1 FROM role_menu_permissions x WHERE x.role_id = r.id AND x.menu_id = v_menu_id);
    UPDATE role_menu_permissions p
    SET can_view = true
    FROM roles r
    WHERE p.role_id = r.id AND r.name = ANY (v_roles) AND p.menu_id = v_menu_id AND NOT p.can_view;
  END IF;
END $$;

COMMIT;

-- Comprobar
SELECT s.name, s.label, s.order_index, s.is_active,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_submenu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.submenu_id = s.id AND p.can_view) AS roles_que_lo_ven
FROM submenus s
WHERE s.name = 'control-gestores';

-- Quitarlo: DELETE FROM submenus WHERE name = 'control-gestores';
