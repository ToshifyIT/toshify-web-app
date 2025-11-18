-- Agregar submenú "Menú por Usuario" bajo Administración

INSERT INTO submenus (menu_id, name, label, route, icon, order_index, is_active, level, parent_id)
SELECT
  m.id,
  'menu-por-usuario',
  'Menú por Usuario',
  '/administracion/menu-por-usuario',
  'UserCog',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM submenus WHERE menu_id = m.id),
  true,
  1,
  null
FROM menus m
WHERE m.name ILIKE '%administr%'
ON CONFLICT DO NOTHING;

-- Comentario para documentar
COMMENT ON TABLE submenus IS 'Submenús del sistema - incluye Menú por Usuario para asignar permisos específicos a usuarios';
