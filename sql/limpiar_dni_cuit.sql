-- =====================================================
-- DNI y CUIT solo con números (2026-11-17)
-- =====================================================
-- Saca puntos, guiones, espacios y cualquier otro carácter que no sea dígito
-- en conductores y leads. Si no queda ningún número (p. ej. "a"), queda NULL.
-- Solo toca las filas que tienen algo para limpiar. Idempotente.

-- Para ver antes qué se va a cambiar:
-- SELECT 'conductores' AS tabla, id::text, numero_dni AS dni, numero_cuit AS cuit FROM conductores
--   WHERE numero_dni ~ '\D' OR numero_cuit ~ '\D'
-- UNION ALL
-- SELECT 'leads', id::text, dni, cuit FROM leads WHERE dni ~ '\D' OR cuit ~ '\D';

BEGIN;

UPDATE conductores
SET numero_dni = NULLIF(regexp_replace(numero_dni, '\D', '', 'g'), '')
WHERE numero_dni ~ '\D';

UPDATE conductores
SET numero_cuit = NULLIF(regexp_replace(numero_cuit, '\D', '', 'g'), '')
WHERE numero_cuit ~ '\D';

UPDATE leads
SET dni = NULLIF(regexp_replace(dni, '\D', '', 'g'), '')
WHERE dni ~ '\D';

UPDATE leads
SET cuit = NULLIF(regexp_replace(cuit, '\D', '', 'g'), '')
WHERE cuit ~ '\D';

COMMIT;
