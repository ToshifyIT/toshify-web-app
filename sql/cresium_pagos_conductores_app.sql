-- =====================================================
-- Cresium: la app puede marcar una transferencia como cargada en un saldo
-- =====================================================
-- Saldos > Registrar Pago > "Transferencia (Cresium)" carga en el saldo del conductor una
-- transferencia que hizo un familiar o amigo, y la marca en cresium_movimientos para que no
-- se use dos veces. La app (rol authenticated) solo podía leer esa tabla: este permiso la
-- deja cambiar ÚNICAMENTE las columnas de pago (sql/cresium_pagos_conductores.sql). El resto
-- de la tabla (importes, datos de Alegra, etc.) sigue sin poder tocarse desde la app.
--
-- Ejecutar en el SQL Editor de Supabase, después de sql/cresium_pagos_conductores.sql.
-- Idempotente: se puede correr de nuevo.

BEGIN;

GRANT UPDATE (pago_cargado_en, pago_conductor_id, pago_abono_id, pago_control_saldo_id, pago_omitido)
  ON public.cresium_movimientos TO authenticated;

-- Si la tabla tiene RLS, hace falta una política de UPDATE (las columnas las limita el GRANT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'cresium_movimientos' AND rowsecurity
  ) THEN
    DROP POLICY IF EXISTS cresium_movimientos_pago_update ON public.cresium_movimientos;
    CREATE POLICY cresium_movimientos_pago_update ON public.cresium_movimientos
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- Verificación: tienen que salir las 5 columnas con UPDATE para authenticated
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'cresium_movimientos'
  AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
ORDER BY column_name;
