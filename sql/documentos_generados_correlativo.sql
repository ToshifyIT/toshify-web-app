-- =====================================================
-- Documentos generados: correlativo por conductor (tarifa OCT-26)
-- =====================================================
-- Cada documento generado con la plantilla de tarifa nueva (OCT-26 / Toshipass)
-- lleva un numero correlativo POR CONDUCTOR: 000001, 000002, ... Se imprime en
-- {{VERSION}} ("Version N°" de los anexos) y en el nombre del archivo en Drive.
--
-- Lo calcula el servidor (/api/generate-contract, siguienteCorrelativo) como
-- el ultimo correlativo del conductor + 1. Los documentos anteriores y los de
-- tarifa antigua quedan con correlativo NULL: no cuentan.
--
-- El indice unico impide que un mismo conductor tenga dos documentos con el
-- mismo numero.
--
-- IMPORTANTE: correr ANTES de desplegar el server.js que usa la columna; sin
-- ella la generacion de documentos OCT-26 falla con "No se pudo calcular el
-- correlativo del documento".
--
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.documentos_generados
  ADD COLUMN IF NOT EXISTS correlativo integer;

COMMENT ON COLUMN public.documentos_generados.correlativo IS
  'Correlativo por conductor de los documentos con tarifa nueva (OCT-26). NULL en el resto.';

CREATE UNIQUE INDEX IF NOT EXISTS documentos_generados_conductor_correlativo_uq
  ON public.documentos_generados (conductor_id, correlativo)
  WHERE correlativo IS NOT NULL;
