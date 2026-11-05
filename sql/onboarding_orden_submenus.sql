-- =====================================================
-- Orden de los submenús de Onboarding — 2026-11-04
-- =====================================================
-- 1. Agentes
-- 2. Distribución en Mapa
-- 3. Programaciones
-- 4. Asignaciones
-- 5. Zonas Restringidas
-- Cualquier otro submenú de Onboarding queda después, en el orden que ya tenía.
-- Se aceptan los nombres viejos y los v2 (programacion-entregas[-v2], distribucion-mapa[-v2]).
-- Se puede ejecutar más de una vez.

BEGIN;

WITH onboarding AS (
  SELECT id FROM menus WHERE name = 'asignaciones' LIMIT 1
),
nuevo_orden AS (
  SELECT s.id,
         CASE
           WHEN s.name = 'agentes' THEN 1
           WHEN s.name IN ('distribucion-mapa', 'distribucion-mapa-v2') THEN 2
           WHEN s.name IN ('programacion-entregas', 'programacion-entregas-v2') THEN 3
           WHEN s.name = 'asignaciones' THEN 4
           WHEN s.name = 'zonas-peligrosas' THEN 5
           ELSE 10 + ROW_NUMBER() OVER (ORDER BY s.order_index, s.label)
         END AS orden
  FROM submenus s
  WHERE s.menu_id = (SELECT id FROM onboarding)
    AND s.parent_id IS NULL
)
UPDATE submenus s
SET order_index = n.orden
FROM nuevo_orden n
WHERE s.id = n.id;

COMMIT;

-- Comprobar
SELECT s.name, s.label, s.route, s.order_index, s.is_active
FROM submenus s
WHERE s.menu_id = (SELECT id FROM menus WHERE name = 'asignaciones')
ORDER BY s.order_index;
