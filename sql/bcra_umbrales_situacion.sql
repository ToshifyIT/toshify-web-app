-- =====================================================
-- Riesgo BCRA por situación (2026-11-23)
-- =====================================================
-- Simplifica el nivel de alerta de los leads (Parámetros > Riesgo BCRA): el color sale de
-- la SITUACIÓN del BCRA, como pide el correo de E. Ritegno (no superar la situación 2):
--
--   verde     situación menor a situacion_amarilla_desde (por defecto: 0 y 1)
--   amarillo  desde situacion_amarilla_desde hasta antes de situacion_roja_desde (2)
--   rojo      desde situacion_roja_desde (3 o peor),
--             o deuda con atraso mayor a deuda_amarilla_max,
--             o proceso judicial / cheques rechazados (si están marcados)
--
-- deuda_verde_max deja de usarse (queda la columna para no romper nada).
-- Reemplaza bcra_calcular_nivel de sql/bcra_umbrales.sql. Al actualizar la fila de
-- umbrales, el trigger existente recalcula el nivel de todos los leads consultados.
--
-- Se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE public.bcra_umbrales
  ADD COLUMN IF NOT EXISTS situacion_amarilla_desde smallint NOT NULL DEFAULT 2;

ALTER TABLE public.bcra_umbrales DROP CONSTRAINT IF EXISTS bcra_umbrales_situacion_amarilla_check;
ALTER TABLE public.bcra_umbrales ADD CONSTRAINT bcra_umbrales_situacion_amarilla_check
  CHECK (situacion_amarilla_desde BETWEEN 1 AND 6 AND situacion_amarilla_desde <= situacion_roja_desde);

CREATE OR REPLACE FUNCTION public.bcra_calcular_nivel(
  p_consultado_at timestamptz,
  p_error text,
  p_situacion smallint,
  p_deuda numeric,
  p_cheques integer,
  p_detalle jsonb,
  OUT nivel text,
  OUT motivo text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  u public.bcra_umbrales;
  v_sit smallint := COALESCE(p_situacion, 0);
  v_deuda numeric;
  v_judicial boolean;
  v_fmt text;
BEGIN
  IF p_consultado_at IS NULL OR p_error IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT * INTO u FROM public.bcra_umbrales WHERE id = 1;

  -- Deuda con atraso: entidades en situación 2 o peor
  SELECT COALESCE(sum((e ->> 'monto')::numeric), 0) INTO v_deuda
  FROM jsonb_array_elements(COALESCE(p_detalle -> 'entidades', '[]'::jsonb)) e
  WHERE (e ->> 'situacion')::int >= 2;

  v_judicial := EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_detalle -> 'entidades', '[]'::jsonb)) e
    WHERE (e ->> 'proceso_judicial')::boolean
  );

  IF u.rojo_con_judicial AND v_judicial THEN
    nivel := 'rojo'; motivo := 'Tiene proceso judicial';
  ELSIF u.rojo_con_cheques AND COALESCE(p_cheques, 0) > 0 THEN
    nivel := 'rojo'; motivo := 'Tiene cheques rechazados';
  ELSIF v_sit >= u.situacion_roja_desde THEN
    nivel := 'rojo'; motivo := format('Situación %s', v_sit);
  ELSIF v_deuda > u.deuda_amarilla_max THEN
    v_fmt := to_char(u.deuda_amarilla_max, 'FM999G999G999G990');
    nivel := 'rojo'; motivo := format('Deuda con atraso mayor a $%s', replace(v_fmt, ',', '.'));
  ELSIF v_sit >= u.situacion_amarilla_desde THEN
    nivel := 'amarillo'; motivo := format('Situación %s', v_sit);
  ELSE
    nivel := 'verde';
    motivo := CASE WHEN v_sit = 0 THEN 'Sin deudas' WHEN v_sit = 1 THEN 'Deudas al día' ELSE format('Situación %s', v_sit) END;
  END IF;
END;
$$;

-- Criterio del correo: amarillo desde la situación 2, rojo desde la 3.
-- (El UPDATE dispara el recálculo de todos los leads consultados.)
UPDATE public.bcra_umbrales
SET situacion_amarilla_desde = 2, situacion_roja_desde = 3
WHERE id = 1;

COMMIT;

-- Comprobar
SELECT situacion_amarilla_desde, situacion_roja_desde, deuda_amarilla_max, rojo_con_judicial, rojo_con_cheques
FROM public.bcra_umbrales;
SELECT bcra_nivel, count(*) FROM leads WHERE bcra_consultado_at IS NOT NULL GROUP BY 1 ORDER BY 1;
