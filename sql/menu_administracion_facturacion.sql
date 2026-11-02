-- =====================================================
-- Menú nuevo "Administración" con el submenú "Facturación"
-- (sale de Reportes) — 2026-11-02
-- =====================================================
-- • Crea el menú (name interno 'gestion-administrativa', para no chocar con el
--   menú viejo 'administracion' que ahora se ve como "Configuración").
-- • Lo ubica justo después de Reportes.
-- • Mueve el submenú 'facturacion' a este menú, con la ruta nueva
--   /administracion/facturacion (la vieja /reportes/facturacion redirige).
-- • Permisos: quien hoy puede ver Facturación (por rol o por usuario) recibe
--   el mismo permiso sobre el menú nuevo, así lo sigue viendo.
-- Se puede ejecutar más de una vez.

BEGIN;

DO $$
DECLARE
  v_orden_reportes integer;
  v_menu_id uuid;
BEGIN
  SELECT COALESCE(order_index, 0) INTO v_orden_reportes FROM menus WHERE name = 'reportes' LIMIT 1;
  IF v_orden_reportes IS NULL THEN
    RAISE EXCEPTION 'No existe el menú reportes.';
  END IF;

  SELECT id INTO v_menu_id FROM menus WHERE name = 'gestion-administrativa' LIMIT 1;

  IF v_menu_id IS NULL THEN
    -- Abrir hueco después de Reportes
    UPDATE menus SET order_index = order_index + 1 WHERE order_index > v_orden_reportes;
    INSERT INTO menus (name, label, route, order_index, is_active)
    VALUES ('gestion-administrativa', 'Administración', '/administracion', v_orden_reportes + 1, true)
    RETURNING id INTO v_menu_id;
  ELSE
    UPDATE menus SET label = 'Administración', is_active = true WHERE id = v_menu_id;
  END IF;

  -- Mover Facturación al menú nuevo (primer nivel)
  UPDATE submenus
  SET menu_id = v_menu_id, parent_id = NULL, level = 1, order_index = 1,
      route = '/administracion/facturacion', is_active = true
  WHERE name = 'facturacion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el submenú facturacion.';
  END IF;

  -- Permisos por rol: mismo permiso que tienen sobre Facturación
  INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
  SELECT rsp.role_id, v_menu_id, rsp.can_view, rsp.can_create, rsp.can_edit, rsp.can_delete
  FROM role_submenu_permissions rsp
  JOIN submenus s ON s.id = rsp.submenu_id AND s.name = 'facturacion'
  WHERE rsp.can_view
    AND NOT EXISTS (SELECT 1 FROM role_menu_permissions x WHERE x.role_id = rsp.role_id AND x.menu_id = v_menu_id);

  -- Excepciones por usuario
  INSERT INTO user_menu_permissions (user_id, menu_id, can_view, can_create, can_edit, can_delete)
  SELECT usp.user_id, v_menu_id, usp.can_view, usp.can_create, usp.can_edit, usp.can_delete
  FROM user_submenu_permissions usp
  JOIN submenus s ON s.id = usp.submenu_id AND s.name = 'facturacion'
  WHERE usp.can_view
    AND NOT EXISTS (SELECT 1 FROM user_menu_permissions x WHERE x.user_id = usp.user_id AND x.menu_id = v_menu_id);
END $$;

COMMIT;

-- Comprobar: el menú, su submenú y qué roles lo ven
SELECT m.label AS menu, s.label AS submenu, s.route
FROM submenus s JOIN menus m ON m.id = s.menu_id
WHERE s.name = 'facturacion';

SELECT r.name AS rol, rmp.can_view
FROM role_menu_permissions rmp
JOIN roles r ON r.id = rmp.role_id
JOIN menus m ON m.id = rmp.menu_id AND m.name = 'gestion-administrativa';
