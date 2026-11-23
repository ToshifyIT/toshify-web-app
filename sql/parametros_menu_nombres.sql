-- =====================================================
-- Parámetros: nombres del menú homologados (2026-11-23)
-- =====================================================
-- Solo cambia el texto que se ve (submenus.label). La clave de permisos
-- (submenus.name) y la ruta no se tocan, así que nadie pierde acceso.
-- Criterio: sustantivo, plural cuando corresponde, sin "Configuración"
-- (todo lo que está en Parámetros ya es configuración).
-- Se puede ejecutar más de una vez.

UPDATE submenus SET label = 'Turnos'
WHERE route = '/parametros/configuracion-uss';

-- Antes "Configuración Asignaciones": cuántos turnos se descuentan según la hora
-- en que el conductor entrega el auto o en que el auto sale de servicio.
UPDATE submenus SET label = 'Descuentos por entrega'
WHERE route = '/parametros/configuracion-asignaciones';

UPDATE submenus SET label = 'Grupos de flota'
WHERE route = '/parametros/grupos-flota';

UPDATE submenus SET label = 'Conceptos de facturación'
WHERE route = '/parametros/conceptos-facturacion';

-- Orden alfabético dentro de Parámetros (solo los que se ven)
WITH ordenados AS (
  SELECT s.id, row_number() OVER (ORDER BY s.label) AS n
  FROM submenus s
  JOIN menus m ON m.id = s.menu_id
  WHERE m.name = 'parametros' AND s.parent_id IS NULL AND s.is_active
)
UPDATE submenus s SET order_index = o.n
FROM ordenados o WHERE o.id = s.id;

-- Comprobar
SELECT s.label, s.route, s.order_index
FROM submenus s JOIN menus m ON m.id = s.menu_id
WHERE m.name = 'parametros' AND s.is_active
ORDER BY s.order_index;

-- Volver atrás:
-- UPDATE submenus SET label = 'Configuración Turnos' WHERE route = '/parametros/configuracion-uss';
-- UPDATE submenus SET label = 'Configuración Asignaciones' WHERE route = '/parametros/configuracion-asignaciones';
-- UPDATE submenus SET label = 'Grupo de Flota' WHERE route = '/parametros/grupos-flota';
