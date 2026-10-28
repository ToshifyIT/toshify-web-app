-- =====================================================
-- Parámetros: ajustes de menú (2026-10-29)
-- =====================================================
--  1. "Rango Seguimiento Guías" ya no se usa: se oculta (no se borra; se puede volver a mostrar).
--  2. "Configuración USS" pasa a llamarse "Configuración Turnos" (USS ya no se usa;
--     ahí quedan los horarios de turno y los límites de km).
-- Se puede ejecutar más de una vez.

UPDATE submenus SET is_active = false
WHERE name = 'rango-seguimiento-guias' OR route = '/parametros/rango-seguimiento-guias';

UPDATE submenus SET label = 'Configuración Turnos'
WHERE route = '/parametros/configuracion-uss';

-- Comprobar
SELECT name, label, route, is_active
FROM submenus
WHERE route IN ('/parametros/rango-seguimiento-guias', '/parametros/configuracion-uss');

-- Volver atrás:
-- UPDATE submenus SET is_active = true WHERE route = '/parametros/rango-seguimiento-guias';
-- UPDATE submenus SET label = 'Configuración USS' WHERE route = '/parametros/configuracion-uss';
