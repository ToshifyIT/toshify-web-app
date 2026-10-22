-- sql/homologar_si_no_leads.sql
-- Homologa los campos Si/No de texto de `leads` al formato que carga Sellium: 'Si' / 'No'.
-- Hoy conviven 'Si', 'Sí', 'SI', 'si ', 'NO', etc. según de dónde entró el lead
-- (Sellium, carga masiva, formulario, chatbot/MCP, edición directa).
--
-- Campos: licencia, d1, cochera, monotributo, experiencia_previa.
-- Regla: "si"/"sí" (cualquier mayúscula/espacios) -> 'Si'; "no" -> 'No'.
-- Cualquier otro texto se deja igual (solo se recortan espacios). Vacío/NULL no cambia.
--
-- Correr los pasos EN ORDEN, cada uno por separado.

-- ============================================================
-- PASO 1 (solo lectura): variantes actuales por campo
-- ============================================================
SELECT 'licencia' AS campo, licencia AS valor, count(*) FROM leads GROUP BY licencia
UNION ALL SELECT 'd1', d1, count(*) FROM leads GROUP BY d1
UNION ALL SELECT 'cochera', cochera, count(*) FROM leads GROUP BY cochera
UNION ALL SELECT 'monotributo', monotributo, count(*) FROM leads GROUP BY monotributo
UNION ALL SELECT 'experiencia_previa', experiencia_previa, count(*) FROM leads
  WHERE lower(btrim(experiencia_previa)) IN ('si', 'sí', 'no') OR experiencia_previa IS NULL
  GROUP BY experiencia_previa
ORDER BY 1, 2;

-- ============================================================
-- PASO 2: función + trigger (desde acá, todo lo que se guarde entra homologado,
-- venga de la app, de Sellium, del chatbot o de cualquier otra integración)
-- ============================================================
CREATE OR REPLACE FUNCTION public.homologar_si_no(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN v
    WHEN lower(translate(btrim(v), 'íÍ', 'ii')) = 'si' THEN 'Si'
    WHEN lower(btrim(v)) = 'no' THEN 'No'
    ELSE btrim(v)
  END
$$;

CREATE OR REPLACE FUNCTION public.leads_homologar_si_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.licencia           := public.homologar_si_no(NEW.licencia);
  NEW.d1                 := public.homologar_si_no(NEW.d1);
  NEW.cochera            := public.homologar_si_no(NEW.cochera);
  NEW.monotributo        := public.homologar_si_no(NEW.monotributo);
  NEW.experiencia_previa := public.homologar_si_no(NEW.experiencia_previa);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_leads_homologar_si_no ON public.leads;
CREATE TRIGGER trg_leads_homologar_si_no
  BEFORE INSERT OR UPDATE OF licencia, d1, cochera, monotributo, experiencia_previa
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_homologar_si_no();

-- ============================================================
-- PASO 3: corregir los datos existentes (solo filas con alguna variante distinta)
-- Nota: si `leads` tiene un trigger que actualiza updated_at, esas filas
-- quedarán con updated_at de hoy.
-- ============================================================
UPDATE leads SET
  licencia           = public.homologar_si_no(licencia),
  d1                 = public.homologar_si_no(d1),
  cochera            = public.homologar_si_no(cochera),
  monotributo        = public.homologar_si_no(monotributo),
  experiencia_previa = public.homologar_si_no(experiencia_previa)
WHERE licencia           IS DISTINCT FROM public.homologar_si_no(licencia)
   OR d1                 IS DISTINCT FROM public.homologar_si_no(d1)
   OR cochera            IS DISTINCT FROM public.homologar_si_no(cochera)
   OR monotributo        IS DISTINCT FROM public.homologar_si_no(monotributo)
   OR experiencia_previa IS DISTINCT FROM public.homologar_si_no(experiencia_previa);

-- ============================================================
-- PASO 4 (verificación): debe dar 0
-- ============================================================
SELECT count(*) AS pendientes
FROM leads
WHERE licencia           IS DISTINCT FROM public.homologar_si_no(licencia)
   OR d1                 IS DISTINCT FROM public.homologar_si_no(d1)
   OR cochera            IS DISTINCT FROM public.homologar_si_no(cochera)
   OR monotributo        IS DISTINCT FROM public.homologar_si_no(monotributo)
   OR experiencia_previa IS DISTINCT FROM public.homologar_si_no(experiencia_previa);

-- ============================================================
-- REVERTIR el trigger (los datos ya homologados no se deshacen)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_leads_homologar_si_no ON public.leads;
-- DROP FUNCTION IF EXISTS public.leads_homologar_si_no();
-- DROP FUNCTION IF EXISTS public.homologar_si_no(text);
