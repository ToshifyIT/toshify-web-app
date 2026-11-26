-- =====================================================
-- Licencia B1: el pago diario en efectivo se carga desde Saldos > Registrar Pago
-- =====================================================
-- Regla 2026-11-26: el efectivo B1 se carga en Saldos con el tilde "Es pago diario de
-- Licencia B1". Entra al saldo como cualquier pago (abono + historial) y además queda un
-- registro en promocion_b1_pagos (origen 'manual') enlazado al abono por abono_id.
-- Facturación > Licencia B1 queda solo como seguimiento (no carga ni edita pagos).
--
-- Este script:
--   1. Agrega fecha_pago_informada: la fecha en que el conductor dice que pagó. Es solo
--      informativa (para B1 cuenta la fecha de carga, que siempre cae en una semana abierta).
--      Hasta correr el script, la app la guarda en la nota ("Pagó el dd/mm/aaaa").
--   2. Enlaza abono_id con ON DELETE CASCADE: si el pago (abono) se borra en Saldos o en
--      Facturación, el registro B1 se borra con él y deja de contar como adelanto.
--      La app además ignora los registros cuyo abono ya no existe, así que funciona igual
--      antes de correrlo; con el script tampoco queda el registro suelto.
--      NOT VALID: no revisa los registros que ya están (los 15 existentes no se tocan).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

ALTER TABLE public.promocion_b1_pagos ADD COLUMN IF NOT EXISTS fecha_pago_informada date;
ALTER TABLE public.promocion_b1_pagos ADD COLUMN IF NOT EXISTS abono_id uuid;

COMMENT ON COLUMN public.promocion_b1_pagos.fecha_pago_informada IS
  'Fecha en que el conductor dice que pagó (informativa). Para B1 cuenta fecha (la de carga).';
COMMENT ON COLUMN public.promocion_b1_pagos.abono_id IS
  'Abono de Saldos con el que entró el pago. Si el abono se borra, el registro B1 se borra con él.';

-- Quitar cualquier FK anterior de abono_id (el nombre puede variar) y crearla con CASCADE
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.promocion_b1_pagos'::regclass
      AND con.contype = 'f'
      AND att.attname = 'abono_id'
  LOOP
    EXECUTE format('ALTER TABLE public.promocion_b1_pagos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.promocion_b1_pagos
  ADD CONSTRAINT promocion_b1_pagos_abono_fk
  FOREIGN KEY (abono_id) REFERENCES public.abonos_conductores(id) ON DELETE CASCADE NOT VALID;

CREATE INDEX IF NOT EXISTS promocion_b1_pagos_abono ON public.promocion_b1_pagos (abono_id);

COMMIT;

-- Para deshacer:
--   ALTER TABLE public.promocion_b1_pagos DROP CONSTRAINT IF EXISTS promocion_b1_pagos_abono_fk;
--   ALTER TABLE public.promocion_b1_pagos DROP COLUMN IF EXISTS fecha_pago_informada;
