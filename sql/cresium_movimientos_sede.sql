-- =====================================================
-- Cresium: movimientos separados por sede
-- =====================================================
-- Las cuentas de Cresium (44 Dreams y Grupo CG) son de Buenos Aires. Para probar en la sede
-- Pruebas se cargan transferencias inventadas; con esta columna no aparecen en lo contable
-- (Integraciones > Cresium, totales, Alegra) y solo se ven con la sede Pruebas elegida.
--
--   sede_id = Buenos Aires  -> movimientos reales (los que trae el servidor de Cresium)
--   sede_id = Pruebas       -> transferencias de prueba (cresium_id desde 9000000000000)
--
-- Los movimientos nuevos que trae el servidor quedan en Buenos Aires por el DEFAULT.
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

ALTER TABLE public.cresium_movimientos
  ADD COLUMN IF NOT EXISTS sede_id uuid REFERENCES public.sedes(id);

-- Reales: Buenos Aires (también los que entren desde ahora)
UPDATE public.cresium_movimientos
SET sede_id = (SELECT id FROM public.sedes WHERE codigo = 'BSAS' OR nombre ILIKE 'Buenos Aires%' LIMIT 1)
WHERE sede_id IS NULL AND cresium_id < 9000000000000;

DO $$
DECLARE bsas uuid;
BEGIN
  SELECT id INTO bsas FROM public.sedes WHERE codigo = 'BSAS' OR nombre ILIKE 'Buenos Aires%' LIMIT 1;
  IF bsas IS NULL THEN RAISE EXCEPTION 'No se encontró la sede Buenos Aires'; END IF;
  EXECUTE format('ALTER TABLE public.cresium_movimientos ALTER COLUMN sede_id SET DEFAULT %L', bsas);
END $$;

-- Prueba: sede Pruebas
UPDATE public.cresium_movimientos
SET sede_id = (SELECT id FROM public.sedes WHERE codigo = 'PRUEBAS' LIMIT 1)
WHERE cresium_id >= 9000000000000;

CREATE INDEX IF NOT EXISTS cresium_movimientos_sede ON public.cresium_movimientos (sede_id, fecha);

COMMIT;

-- Verificación: cuántos movimientos quedaron en cada sede
SELECT s.nombre AS sede, count(*) AS movimientos
FROM public.cresium_movimientos m LEFT JOIN public.sedes s ON s.id = m.sede_id
GROUP BY s.nombre ORDER BY s.nombre;
