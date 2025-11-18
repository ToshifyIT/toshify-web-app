-- ========================================
-- EJECUTAR ESTE SCRIPT EN SUPABASE SQL EDITOR
-- Para asignar permisos del submenú "Menú por Usuario" al rol admin
-- ========================================

-- Paso 1: Verificar el ID del submenú "menu-por-usuario"
SELECT id, name, label FROM submenus WHERE name = 'menu-por-usuario';

-- Paso 2: Verificar el ID del rol "admin"
SELECT id, name FROM roles WHERE name = 'admin';

-- Paso 3: Asignar permisos del submenú al rol admin
INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT
  r.id,
  s.id,
  true,  -- can_view
  true,  -- can_create
  true,  -- can_edit
  true   -- can_delete
FROM roles r
CROSS JOIN submenus s
WHERE r.name = 'admin'
  AND s.name = 'menu-por-usuario'
ON CONFLICT (role_id, submenu_id) DO UPDATE
SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;

-- Paso 4: Verificar que se creó correctamente
SELECT
  r.name as role_name,
  s.label as submenu_label,
  rsp.can_view,
  rsp.can_create,
  rsp.can_edit,
  rsp.can_delete
FROM role_submenu_permissions rsp
JOIN roles r ON rsp.role_id = r.id
JOIN submenus s ON rsp.submenu_id = s.id
WHERE s.name = 'menu-por-usuario';
