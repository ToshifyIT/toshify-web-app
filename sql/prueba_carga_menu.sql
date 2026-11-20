-- =====================================================
-- Menú de prueba "Prueba carga" (/prueba-carga) — 2026-11-20
-- =====================================================
-- Sube una foto a una carpeta de Google Drive pasando por el servidor
-- (/api/prueba-carga/subir-foto). Sin permisos por rol: solo lo ve admin
-- (admin ve todos los menús). Para dárselo a otro rol, Administración > Menú por rol.
-- El name DEBE ser 'prueba-carga' (es el menuName del ProtectedRoute).
-- Se puede ejecutar más de una vez. Para quitarlo: UPDATE menus SET is_active = false WHERE name = 'prueba-carga';

INSERT INTO menus (name, label, route, order_index, is_active)
SELECT 'prueba-carga', 'Prueba carga', '/prueba-carga', COALESCE(MAX(order_index), 0) + 1, true
FROM menus
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE name = 'prueba-carga');

UPDATE menus SET label = 'Prueba carga', route = '/prueba-carga', is_active = true
WHERE name = 'prueba-carga';

-- Comprobar
SELECT name, label, route, order_index, is_active FROM menus WHERE name = 'prueba-carga';
