-- =====================================================
-- Dashboard KPI v2 reemplaza a "Dashboard KPI's"
-- =====================================================
-- 1. Quien veía "Dashboard KPI's" (dirección incluida) pasa a ver el v2.
-- 2. Los roles de dirección pueden cargar el forecast (editar el v2).
-- 3. "Dashboard KPI's" se oculta del menú (is_active = false) y queda de
--    respaldo: no se borra nada (ni el submenú, ni sus permisos, ni la pantalla).
--
-- Ejecutar con el frontend del v2 ya desplegado.
-- Antes, revisar qué roles se toman como "dirección" (consulta A).

-- A) Roles que se toman como dirección (solo lectura)
SELECT id, name FROM roles WHERE name ILIKE '%direc%' OR name ILIKE '%director%';

BEGIN;

DO $$
DECLARE
  v_viejo uuid;
  v_nuevo uuid;
BEGIN
  SELECT id INTO v_viejo FROM submenus WHERE name = 'dashboard-kpis' LIMIT 1;
  SELECT id INTO v_nuevo FROM submenus WHERE name = 'dashboard-kpis-v2' LIMIT 1;
  IF v_viejo IS NULL OR v_nuevo IS NULL THEN
    RAISE EXCEPTION 'Falta dashboard-kpis o dashboard-kpis-v2.';
  END IF;

  -- 1. Ver: copiado desde Dashboard KPI's (roles)
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_nuevo, can_view, false, false, false
  FROM role_submenu_permissions
  WHERE submenu_id = v_viejo AND can_view
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET can_view = true;

  -- 1b. Ver: copiado desde Dashboard KPI's (usuarios), si existe la tabla
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
      SELECT user_id, $1, can_view, false, false, false
      FROM user_submenu_permissions
      WHERE submenu_id = $2 AND can_view
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET can_view = true
    ' USING v_nuevo, v_viejo;
  END IF;

  -- 2. Dirección: ver y cargar forecast
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT id, v_nuevo, true, false, true, false
  FROM roles
  WHERE name ILIKE '%direc%' OR name ILIKE '%director%'
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET can_view = true, can_edit = true;

  -- 3. Ocultar el anterior (respaldo) y que el v2 tome su nombre
  UPDATE submenus SET is_active = false, label = 'Dashboard KPI''s (respaldo)' WHERE id = v_viejo;
  UPDATE submenus SET label = 'Dashboard KPI''s' WHERE id = v_nuevo;
END $$;

COMMIT;

-- Comprobar
SELECT name, label, is_active FROM submenus WHERE name IN ('dashboard-kpis', 'dashboard-kpis-v2');
SELECT r.name AS rol, p.can_view, p.can_edit
FROM role_submenu_permissions p
JOIN roles r ON r.id = p.role_id
JOIN submenus s ON s.id = p.submenu_id
WHERE s.name = 'dashboard-kpis-v2'
ORDER BY r.name;

-- Volver atrás (mostrar de nuevo Dashboard KPI's):
-- UPDATE submenus SET is_active = true, label = 'Dashboard KPI''s' WHERE name = 'dashboard-kpis';
-- UPDATE submenus SET label = 'Dashboard KPI v2' WHERE name = 'dashboard-kpis-v2';
