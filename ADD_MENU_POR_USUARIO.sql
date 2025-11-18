-- ========================================
-- EJECUTAR ESTE SCRIPT EN SUPABASE SQL EDITOR
-- Para agregar el submenú "Menú por Usuario"
-- ========================================

-- Paso 1: Verificar que existe el menú de Administración
SELECT id, name, label FROM menus WHERE name ILIKE '%admin%';

-- Paso 2: Insertar el submenú "Menú por Usuario"
-- IMPORTANTE: Reemplaza 'MENU_ID_AQUI' con el ID del menú de Administración del paso 1

INSERT INTO submenus (menu_id, name, label, path, icon, order_index, is_active)
SELECT
  m.id,
  'menu-por-usuario',
  'Menú por Usuario',
  '/administracion/menu-por-usuario',
  'UserCog',
  COALESCE((SELECT MAX(order_index) + 1 FROM submenus WHERE menu_id = m.id), 1),
  true
FROM menus m
WHERE m.name ILIKE '%admin%'
ON CONFLICT (menu_id, name) DO UPDATE
SET
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  icon = EXCLUDED.icon,
  is_active = EXCLUDED.is_active;

-- Paso 3: Verificar que se creó correctamente
SELECT
  s.id,
  s.name,
  s.label,
  s.path,
  s.is_active,
  m.label as menu_label
FROM submenus s
JOIN menus m ON s.menu_id = m.id
WHERE s.name = 'menu-por-usuario';
