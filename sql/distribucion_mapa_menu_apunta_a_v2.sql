-- =====================================================
-- Onboarding: el ítem "Distribución en mapa" apunta al v2
-- =====================================================
-- El submenú `distribucion-mapa` (el que se ve en el menú lateral) pasa a
-- abrir el módulo v2. No se crea un ítem nuevo ni se toca el label: quien ya
-- tenía permiso sobre "Distribución en mapa" entra directo al v2.
--
-- En el frontend, la ruta /onboarding/distribucion-mapa-v2 está protegida por
-- este mismo submenú (`submenuName="distribucion-mapa"` en HomePage.tsx), así
-- que no hace falta el submenú `distribucion-mapa-v2` de
-- sql/distribucion_mapa_v2_menu.sql. Si ya se había creado, se desactiva acá
-- para que no aparezcan dos ítems.
--
-- El v1 sigue disponible escribiendo /onboarding/distribucion-mapa a mano,
-- con el mismo permiso.
--
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

BEGIN;

UPDATE submenus
   SET route = '/onboarding/distribucion-mapa-v2'
 WHERE name = 'distribucion-mapa'
   AND route IS DISTINCT FROM '/onboarding/distribucion-mapa-v2';

-- Si en algún momento se corrió distribucion_mapa_v2_menu.sql, ese ítem
-- duplicaría el destino: se desactiva (no se borra, por si hay permisos).
UPDATE submenus
   SET is_active = false
 WHERE name = 'distribucion-mapa-v2'
   AND is_active = true;

COMMIT;

-- Verificación:
-- SELECT name, label, route, is_active FROM submenus WHERE name LIKE 'distribucion-mapa%';
