-- =====================================================
-- Consumo herramientas: periodicidad «N/A» (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
-- Gratis: plan free de una herramienta (GitHub, Cloudflare...).
-- N/A: cuenta o acceso que no es una suscripción (paneles de Didi y Cabify, cuentas
-- de Google/Apple, Telepase...). Ninguna de las dos lleva monto ni genera pagos.

BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.contype = 'c' AND c.conrelid = 'herramientas'::regclass
      AND pg_get_constraintdef(c.oid) ILIKE '%periodicidad%'
  LOOP
    EXECUTE format('ALTER TABLE herramientas DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE herramientas
  ADD CONSTRAINT herramientas_periodicidad_check
  CHECK (periodicidad IN ('Mensual', 'Anual', 'Por uso', 'Gratis', 'N/A'));

-- Didi – Fleet es un panel de flota, no una suscripción
UPDATE herramientas SET periodicidad = 'N/A' WHERE nombre = 'Didi – Fleet' AND periodicidad = 'Gratis';

COMMIT;

-- Para revisar:
-- SELECT nombre, periodicidad FROM herramientas WHERE periodicidad IN ('Gratis', 'N/A') ORDER BY periodicidad, nombre;
