-- =====================================================
-- Menú: "Administración" pasa a llamarse "Configuración" (2026-11-02)
-- =====================================================
-- Solo cambia el texto que se ve en el menú. No cambia el nombre interno (name)
-- ni las rutas, así que permisos y enlaces siguen funcionando igual.
-- Se puede ejecutar más de una vez.

UPDATE menus SET label = 'Configuración'
WHERE lower(label) IN ('administración', 'administracion')
   OR name IN ('administracion', 'admin');

-- Comprobar
SELECT name, label, route, is_active FROM menus WHERE label = 'Configuración';

-- Volver atrás:
-- UPDATE menus SET label = 'Administración' WHERE label = 'Configuración';
