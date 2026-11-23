-- =====================================================
-- Calculadora de neto del conductor (Leads) (2026-11-23)
-- =====================================================
-- Ver src/modules/leads/calculadoraNeto.ts.
--
-- 1. calculadora_referencia_cabify: guarda, por sede, el resultado del cruce
--    asignaciones × Cabify (generado por hora trabajada, km por hora, peajes, de las
--    semanas completas de los últimos 3 meses). Solo cambia una vez por semana: el
--    primero que abre la calculadora en la semana lo calcula y lo guarda, y el resto lo
--    lee al instante. Clave: 'referencia_<sede_id>' o 'referencia_todas'.
--
-- 2. parametros_sistema: permite guardar los parámetros de la calculadora
--    (modulo = 'calculadora_neto': costo de GNC, monotributo, meta, etc.) desde
--    "Guardar como referencia". Hoy la tabla no deja crear filas nuevas (RLS) y el botón
--    fallaría. La política nueva vale SOLO para ese módulo; el resto de los parámetros
--    sigue como está.
--
-- Se puede ejecutar más de una vez.

BEGIN;

-- ---------- 1. Referencia de Cabify guardada ----------
CREATE TABLE IF NOT EXISTS public.calculadora_referencia_cabify (
  clave       text        PRIMARY KEY,
  version     smallint    NOT NULL,
  hasta       date        NOT NULL,
  referencia  jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calculadora_referencia_cabify ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calculadora_referencia_cabify_select ON public.calculadora_referencia_cabify;
CREATE POLICY calculadora_referencia_cabify_select ON public.calculadora_referencia_cabify
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS calculadora_referencia_cabify_insert ON public.calculadora_referencia_cabify;
CREATE POLICY calculadora_referencia_cabify_insert ON public.calculadora_referencia_cabify
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS calculadora_referencia_cabify_update ON public.calculadora_referencia_cabify;
CREATE POLICY calculadora_referencia_cabify_update ON public.calculadora_referencia_cabify
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.calculadora_referencia_cabify TO authenticated;

-- ---------- 2. Parámetros de la calculadora ----------
DROP POLICY IF EXISTS parametros_sistema_calculadora_insert ON public.parametros_sistema;
CREATE POLICY parametros_sistema_calculadora_insert ON public.parametros_sistema
  FOR INSERT TO authenticated WITH CHECK (modulo = 'calculadora_neto');

DROP POLICY IF EXISTS parametros_sistema_calculadora_update ON public.parametros_sistema;
CREATE POLICY parametros_sistema_calculadora_update ON public.parametros_sistema
  FOR UPDATE TO authenticated
  USING (modulo = 'calculadora_neto') WITH CHECK (modulo = 'calculadora_neto');

COMMIT;

-- Verificación: la tabla existe y las políticas están creadas.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE (tablename = 'calculadora_referencia_cabify')
   OR (tablename = 'parametros_sistema' AND policyname LIKE 'parametros_sistema_calculadora_%')
ORDER BY tablename, policyname;
