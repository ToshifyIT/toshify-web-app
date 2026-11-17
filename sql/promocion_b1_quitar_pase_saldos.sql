-- =====================================================
-- Promoción PRM02 (licencia B1): quitar el "pase a Saldos"
-- =====================================================
-- Deshace sql/promocion_b1_pase_saldos.sql. Se descartó la idea: lo que el conductor paga por
-- día es un adelanto de su facturación semanal, no una deuda (lo que no adelanta se cobra
-- igual al facturar la semana), así que no hay nada que pasar a Saldos.
--
-- Al 16/11/2026 no había ningún registro origen 'saldo'. Si hubiera alguno, el script se
-- detiene sin cambiar nada.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promocion_b1_pagos WHERE origen = 'saldo') THEN
    RAISE EXCEPTION 'Hay registros de pase a Saldos (origen = saldo): revisarlos antes de correr este script.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.promocion_b1_pagos_saldo_unico;

-- Constraints como en sql/promocion_licencia_b1.sql (sin el origen 'saldo')
ALTER TABLE public.promocion_b1_pagos DROP CONSTRAINT IF EXISTS promocion_b1_pagos_datos_check;
ALTER TABLE public.promocion_b1_pagos ADD CONSTRAINT promocion_b1_pagos_datos_check CHECK (
  (origen = 'manual' AND cresium_movimiento_id IS NULL AND monto > 0)
  OR (origen IN ('cresium', 'excluido') AND cresium_movimiento_id IS NOT NULL)
);

ALTER TABLE public.promocion_b1_pagos DROP CONSTRAINT IF EXISTS promocion_b1_pagos_origen_check;
ALTER TABLE public.promocion_b1_pagos ADD CONSTRAINT promocion_b1_pagos_origen_check
  CHECK (origen IN ('manual', 'cresium', 'excluido'));

ALTER TABLE public.promocion_b1_pagos DROP COLUMN IF EXISTS abono_id;

COMMIT;
