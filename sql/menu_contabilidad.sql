-- =====================================================
-- Menú Contabilidad (2026-11-17)
-- =====================================================
-- Menú nuevo «Contabilidad» (name 'contabilidad'), justo debajo de Administración:
--   1. Consumo herramientas  (antes en Administración)
--   2. Cresium               (antes en Integraciones; con 44 Dreams y Grupo CG)
--   3. Alegra                (antes en Integraciones; con 44 Dreams, Grupo CG y Proveedores)
-- Facturación se queda en Administración.
-- Las URLs no cambian (las rutas protegen por nombre de submenú).
-- Permiso "ver" del menú: roles admin, ryt y directivo (los que ven Cresium/Alegra)
-- y Karen, Sara y Josué (acceso a Consumo herramientas). Idempotente.

BEGIN;

UPDATE menus SET label = 'Administración' WHERE name = 'gestion-administrativa';

-- Hacer lugar debajo de Administración
UPDATE menus SET order_index = order_index + 1
WHERE order_index >= 9 AND name <> 'contabilidad'
  AND NOT EXISTS (SELECT 1 FROM menus WHERE name = 'contabilidad');

INSERT INTO menus (name, label, route, order_index, is_active)
VALUES ('contabilidad', 'Contabilidad', '/contabilidad', 9, true)
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, is_active = true;

UPDATE submenus s SET menu_id = m.id, updated_at = now()
FROM menus m
WHERE m.name = 'contabilidad'
  AND s.name IN (
    'consumo-herramientas',
    'cresium', 'cresium-44dreams', 'cresium-grupocg',
    'alegra-compras', 'alegra-compras-44dreams', 'alegra-compras-grupocg', 'alegra-proveedores'
  );

UPDATE submenus SET order_index = 1 WHERE name = 'consumo-herramientas';
UPDATE submenus SET order_index = 2 WHERE name = 'cresium';
UPDATE submenus SET order_index = 3 WHERE name = 'alegra-compras';

-- Permisos del menú
INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.id, true, r.name = 'admin', r.name = 'admin', r.name = 'admin'
FROM roles r CROSS JOIN menus m
WHERE m.name = 'contabilidad' AND r.name IN ('admin', 'ryt', 'directivo')
  AND NOT EXISTS (SELECT 1 FROM role_menu_permissions x WHERE x.role_id = r.id AND x.menu_id = m.id);

INSERT INTO user_menu_permissions (user_id, menu_id, can_view, can_create, can_edit, can_delete)
SELECT u.id, m.id, true, false, false, false
FROM (VALUES
  ('bd44de51-1197-48f5-809d-d6c6048a8e30'::uuid),  -- Karen
  ('9310b225-553a-4c7b-886e-1df389f47bd2'::uuid),  -- Sara
  ('386eaa01-ff79-48fb-a8ab-4c85f8224604'::uuid)   -- Josué
) AS u(id)
CROSS JOIN menus m
WHERE m.name = 'contabilidad'
  AND NOT EXISTS (SELECT 1 FROM user_menu_permissions x WHERE x.user_id = u.id AND x.menu_id = m.id);

COMMIT;
