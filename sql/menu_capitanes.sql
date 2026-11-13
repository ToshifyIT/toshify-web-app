-- sql/menu_capitanes.sql
-- El rol de guía / agente / gestor ahora se llama "capitán" (2026-11-13).
-- Cambia solo el texto que se ve en el menú; las rutas y los nombres internos quedan igual.

UPDATE submenus SET label = 'Capitanes'
 WHERE name = 'agentes';

UPDATE submenus SET label = 'Dashboard de capitanes'
 WHERE name = 'control-gestores';

UPDATE submenus SET label = 'Rango Seguimiento Capitanes'
 WHERE name = 'rango-seguimiento-guias';

-- Para revisar:
-- SELECT name, label FROM submenus
--  WHERE name IN ('agentes', 'control-gestores', 'rango-seguimiento-guias');
