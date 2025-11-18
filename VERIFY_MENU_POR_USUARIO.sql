-- Verificar completamente el submenú "Menú por Usuario"

-- 1. Verificar que el submenú existe y está activo
SELECT
  s.id,
  s.name,
  s.label,
  s.route,
  s.is_active,
  s.order_index,
  s.level,
  s.parent_id,
  m.name as menu_name,
  m.label as menu_label,
  m.is_active as menu_active
FROM submenus s
JOIN menus m ON s.menu_id = m.id
WHERE s.name = 'menu-por-usuario';

-- 2. Verificar permisos del rol admin para este submenú
SELECT
  r.name as role_name,
  s.name as submenu_name,
  s.label as submenu_label,
  rsp.can_view,
  rsp.can_create,
  rsp.can_edit,
  rsp.can_delete
FROM role_submenu_permissions rsp
JOIN roles r ON rsp.role_id = r.id
JOIN submenus s ON rsp.submenu_id = s.id
WHERE s.name = 'menu-por-usuario';

-- 3. Verificar TODOS los submenús activos de Administración
SELECT
  s.id,
  s.name,
  s.label,
  s.is_active,
  s.order_index,
  m.label as menu_label
FROM submenus s
JOIN menus m ON s.menu_id = m.id
WHERE m.name ILIKE '%admin%'
  AND s.is_active = true
ORDER BY s.order_index;
