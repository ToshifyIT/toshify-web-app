-- Verificar si hay submenús duplicados con el nombre "menu-por-usuario"

SELECT
  id,
  name,
  label,
  route,
  menu_id,
  is_active,
  order_index,
  created_at
FROM submenus
WHERE name = 'menu-por-usuario'
ORDER BY created_at;

-- Ver todos los submenús de Administración
SELECT
  s.id,
  s.name,
  s.label,
  s.route,
  s.order_index,
  m.label as menu_label
FROM submenus s
JOIN menus m ON s.menu_id = m.id
WHERE m.name ILIKE '%admin%'
ORDER BY s.order_index;
