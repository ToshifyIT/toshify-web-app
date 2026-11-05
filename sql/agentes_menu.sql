-- =====================================================
-- Menú nuevo "Agentes" (/agentes) — 2026-11-04
-- =====================================================
-- Misma vista que Estado de Flota pero por agente de ventas (guía): responsable de
-- cada vehículo, guía de cada conductor y filtro por agente que recalcula los
-- indicadores. Se ubica justo después de Estado de Flota y lo ven los mismos que
-- hoy ven Estado de Flota (por rol y por usuario).
-- El name DEBE ser 'agentes' (es el menuName del ProtectedRoute).
-- Requiere sql/vehiculos_guia_responsable.sql (columna vehiculos.guia_responsable).
-- Se puede ejecutar más de una vez.
-- Después se movió a Onboarding: ver sql/agentes_submenu_onboarding.sql.

BEGIN;

DO $$
DECLARE
  v_ref_id uuid;
  v_orden integer;
  v_menu_id uuid;
BEGIN
  SELECT id, COALESCE(order_index, 0) INTO v_ref_id, v_orden FROM menus WHERE name = 'estado-de-flota' LIMIT 1;
  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el menú estado-de-flota.';
  END IF;

  SELECT id INTO v_menu_id FROM menus WHERE name = 'agentes' LIMIT 1;

  IF v_menu_id IS NULL THEN
    -- Abrir hueco después de Estado de Flota
    UPDATE menus SET order_index = order_index + 1 WHERE order_index > v_orden;
    INSERT INTO menus (name, label, route, order_index, is_active)
    VALUES ('agentes', 'Agentes', '/agentes', v_orden + 1, true)
    RETURNING id INTO v_menu_id;
  ELSE
    UPDATE menus SET label = 'Agentes', route = '/agentes', is_active = true WHERE id = v_menu_id;
  END IF;

  -- Permisos por rol: los mismos que Estado de Flota (solo ver)
  INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
  SELECT rmp.role_id, v_menu_id, true, false, false, false
  FROM role_menu_permissions rmp
  WHERE rmp.menu_id = v_ref_id AND rmp.can_view
    AND NOT EXISTS (SELECT 1 FROM role_menu_permissions x WHERE x.role_id = rmp.role_id AND x.menu_id = v_menu_id);

  -- Excepciones por usuario
  IF to_regclass('public.user_menu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_menu_permissions (user_id, menu_id, can_view, can_create, can_edit, can_delete)
      SELECT ump.user_id, $1, true, false, false, false
      FROM user_menu_permissions ump
      WHERE ump.menu_id = $2 AND ump.can_view
        AND NOT EXISTS (SELECT 1 FROM user_menu_permissions x WHERE x.user_id = ump.user_id AND x.menu_id = $1)
    ' USING v_menu_id, v_ref_id;
  END IF;
END $$;

COMMIT;

-- Comprobar
SELECT m.name, m.label, m.route, m.order_index,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_menu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.menu_id = m.id AND p.can_view) AS roles_que_lo_ven
FROM menus m
WHERE m.name IN ('estado-de-flota', 'agentes')
ORDER BY m.order_index;
