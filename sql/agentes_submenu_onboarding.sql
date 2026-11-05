-- =====================================================
-- "Agentes" pasa a ser un submenú de Onboarding — 2026-11-04
-- =====================================================
-- Antes era un menú principal (sql/agentes_menu.sql). Ahora va dentro de Onboarding
-- (menú `asignaciones`), justo después del submenú "Asignaciones", con la ruta
-- /onboarding/agentes (/agentes redirige ahí).
--
-- Los permisos se copian del menú principal "agentes" (rol y usuario) al submenú, así
-- lo siguen viendo los mismos. Después el menú principal se desactiva (no se borra).
-- El name DEBE ser 'agentes' (es el submenuName del ProtectedRoute en HomePage.tsx).
-- Se puede ejecutar más de una vez.

BEGIN;

DO $$
DECLARE
  v_menu_viejo uuid;
  v_onboarding uuid;
  v_ref_orden integer;
  v_submenu uuid;
BEGIN
  SELECT id INTO v_onboarding FROM menus WHERE name = 'asignaciones' LIMIT 1;
  IF v_onboarding IS NULL THEN
    RAISE EXCEPTION 'No existe el menú asignaciones (Onboarding).';
  END IF;

  -- Lugar: después del submenú "Asignaciones"
  SELECT COALESCE(order_index, 0) INTO v_ref_orden
  FROM submenus WHERE menu_id = v_onboarding AND name = 'asignaciones' LIMIT 1;
  v_ref_orden := COALESCE(v_ref_orden, 0);

  SELECT id INTO v_submenu FROM submenus WHERE name = 'agentes' LIMIT 1;
  IF v_submenu IS NULL THEN
    -- Abrir hueco después de Asignaciones
    UPDATE submenus SET order_index = order_index + 1
    WHERE menu_id = v_onboarding AND order_index > v_ref_orden;
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('agentes', 'Agentes', '/onboarding/agentes', v_onboarding, NULL, 1, v_ref_orden + 1, true)
    RETURNING id INTO v_submenu;
  ELSE
    UPDATE submenus
    SET label = 'Agentes', route = '/onboarding/agentes', menu_id = v_onboarding,
        parent_id = NULL, level = 1, is_active = true
    WHERE id = v_submenu;
  END IF;

  SELECT id INTO v_menu_viejo FROM menus WHERE name = 'agentes' LIMIT 1;

  IF v_menu_viejo IS NOT NULL THEN
    -- Permisos por rol: los que tenía el menú principal
    INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
    SELECT role_id, v_submenu, can_view, can_create, can_edit, can_delete
    FROM role_menu_permissions
    WHERE menu_id = v_menu_viejo
    ON CONFLICT (role_id, submenu_id) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete;

    -- Excepciones por usuario
    IF to_regclass('public.user_menu_permissions') IS NOT NULL
       AND to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
      EXECUTE '
        INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
        SELECT user_id, $1, can_view, can_create, can_edit, can_delete
        FROM user_menu_permissions
        WHERE menu_id = $2
        ON CONFLICT (user_id, submenu_id) DO UPDATE SET
          can_view = EXCLUDED.can_view,
          can_create = EXCLUDED.can_create,
          can_edit = EXCLUDED.can_edit,
          can_delete = EXCLUDED.can_delete
      ' USING v_submenu, v_menu_viejo;
    END IF;

    -- El menú principal deja de mostrarse
    UPDATE menus SET is_active = false WHERE id = v_menu_viejo;
  END IF;

  -- Quienes ven Agentes tienen que poder abrir Onboarding: se les da "ver" en el menú
  -- (sin tocar a quienes ya lo tienen)
  INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
  SELECT rsp.role_id, v_onboarding, true, false, false, false
  FROM role_submenu_permissions rsp
  WHERE rsp.submenu_id = v_submenu AND rsp.can_view
    AND NOT EXISTS (SELECT 1 FROM role_menu_permissions x WHERE x.role_id = rsp.role_id AND x.menu_id = v_onboarding);

  IF to_regclass('public.user_menu_permissions') IS NOT NULL
     AND to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_menu_permissions (user_id, menu_id, can_view, can_create, can_edit, can_delete)
      SELECT usp.user_id, $1, true, false, false, false
      FROM user_submenu_permissions usp
      WHERE usp.submenu_id = $2 AND usp.can_view
        AND NOT EXISTS (SELECT 1 FROM user_menu_permissions x WHERE x.user_id = usp.user_id AND x.menu_id = $1)
    ' USING v_onboarding, v_submenu;
  END IF;
END $$;

COMMIT;

-- Comprobar
SELECT s.name, s.label, s.route, s.order_index, s.is_active,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_submenu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.submenu_id = s.id AND p.can_view) AS roles_que_lo_ven
FROM submenus s
WHERE s.menu_id = (SELECT id FROM menus WHERE name = 'asignaciones')
ORDER BY s.order_index;
