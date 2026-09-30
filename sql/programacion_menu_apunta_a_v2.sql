-- =====================================================
-- Onboarding: el ítem "Programaciones" apunta al v2
-- =====================================================
-- El submenú `programacion-entregas` (el que se ve en el menú lateral) pasa a
-- abrir el módulo v2. No se crea un ítem nuevo ni se toca el label: quien ya
-- tenía permiso sobre "Programaciones" entra directo al v2.
--
-- En el frontend, la ruta /onboarding/programacion-v2 está protegida por este
-- mismo submenú (`submenuName="programacion-entregas"` en HomePage.tsx), así
-- que no hace falta un submenú `programacion-entregas-v2`. Si ya se había
-- creado, se desactiva acá para que no aparezcan dos ítems.
--
-- El v1 sigue disponible escribiendo /onboarding/programacion a mano, con el
-- mismo permiso.
--
-- IMPORTANTE: antes de correr esto tiene que estar aplicado
-- sql/programaciones_leads_columns.sql, porque el v2 no puede guardar leads
-- sin esas columnas.
--
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

BEGIN;

UPDATE submenus
   SET route = '/onboarding/programacion-v2'
 WHERE name = 'programacion-entregas'
   AND route IS DISTINCT FROM '/onboarding/programacion-v2';

-- Si en algún momento se creó el ítem v2 aparte, duplicaría el destino:
-- se desactiva (no se borra, por si hay permisos asociados).
UPDATE submenus
   SET is_active = false
 WHERE name = 'programacion-entregas-v2'
   AND is_active = true;

COMMIT;

-- Verificación:
-- SELECT name, label, route, is_active FROM submenus WHERE name LIKE 'programacion%';

-- Rollback (volver al v1):
-- UPDATE submenus SET route = '/onboarding/programacion' WHERE name = 'programacion-entregas';
