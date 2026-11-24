-- =====================================================
-- Ocultar el menú principal "Agentes" (2026-11-24)
-- =====================================================
-- Desde el 04/11 la pantalla está en Onboarding > Capitanes (submenú 'agentes',
-- ruta /onboarding/agentes; /agentes redirige ahí). El menú principal viejo volvió
-- a verse, seguramente porque se corrió de nuevo sql/agentes_menu.sql, que lo activa.
-- No volver a correr ese archivo.
--
-- Solo se oculta el menú principal (no se borra). Los permisos del submenú
-- Capitanes no se tocan, así que nadie pierde acceso.
-- Se puede ejecutar más de una vez.

UPDATE menus SET is_active = false WHERE name = 'agentes';

-- Comprobar: el menú principal tiene que quedar inactivo y Capitanes activo en Onboarding
SELECT 'menu' AS tipo, name, label, route, is_active FROM menus WHERE name = 'agentes'
UNION ALL
SELECT 'submenu', s.name, s.label, s.route, s.is_active FROM submenus s WHERE s.name = 'agentes';
