-- sql/homologar_si_no_dispuesto_d1.sql
-- Suma `dispuesto_a_sacar_d1` a la homologación Si/No de `leads` (2026-11-23).
--
-- sql/homologar_si_no_leads.sql ya deja 'Si' / 'No' en licencia, d1, cochera,
-- monotributo y experiencia_previa. "¿Dispuesto a sacar la D1?" quedó afuera y la
-- web lo guardaba como 'Sí' con tilde, así que el filtro no lo encontraba igual que
-- al resto. Desde ahora la web guarda 'Si' / 'No'; esto corrige lo que ya está
-- cargado y hace que cualquier otra fuente también entre homologada.
--
-- También corrige cuenta_cabify (PASO 5).
--
-- Requiere que antes se haya corrido sql/homologar_si_no_leads.sql (usa su función
-- public.homologar_si_no). Correr los pasos EN ORDEN, cada uno por separado, en el
-- SQL Editor de Supabase.

-- ============================================================
-- PASO 1 (solo lectura): variantes actuales de los campos Si/No
-- ============================================================
SELECT 'dispuesto_a_sacar_d1' AS campo, dispuesto_a_sacar_d1 AS valor, count(*) FROM leads GROUP BY dispuesto_a_sacar_d1
UNION ALL SELECT 'monotributo', monotributo, count(*) FROM leads GROUP BY monotributo
UNION ALL SELECT 'experiencia_previa', experiencia_previa, count(*) FROM leads
  WHERE lower(btrim(experiencia_previa)) IN ('si', 'sí', 'no') OR experiencia_previa IS NULL
  GROUP BY experiencia_previa
ORDER BY 1, 2;

-- ============================================================
-- PASO 2: el trigger también homologa dispuesto_a_sacar_d1
-- ============================================================
CREATE OR REPLACE FUNCTION public.leads_homologar_si_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.licencia             := public.homologar_si_no(NEW.licencia);
  NEW.d1                   := public.homologar_si_no(NEW.d1);
  NEW.cochera              := public.homologar_si_no(NEW.cochera);
  NEW.monotributo          := public.homologar_si_no(NEW.monotributo);
  NEW.experiencia_previa   := public.homologar_si_no(NEW.experiencia_previa);
  NEW.dispuesto_a_sacar_d1 := public.homologar_si_no(NEW.dispuesto_a_sacar_d1);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_leads_homologar_si_no ON public.leads;
CREATE TRIGGER trg_leads_homologar_si_no
  BEFORE INSERT OR UPDATE OF licencia, d1, cochera, monotributo, experiencia_previa, dispuesto_a_sacar_d1
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_homologar_si_no();

-- ============================================================
-- PASO 3: corregir lo ya cargado (solo filas con alguna variante distinta).
-- Incluye monotributo y experiencia_previa por si quedó algo de antes del trigger.
-- ============================================================
UPDATE leads SET
  dispuesto_a_sacar_d1 = public.homologar_si_no(dispuesto_a_sacar_d1),
  monotributo          = public.homologar_si_no(monotributo),
  experiencia_previa   = public.homologar_si_no(experiencia_previa)
WHERE dispuesto_a_sacar_d1 IS DISTINCT FROM public.homologar_si_no(dispuesto_a_sacar_d1)
   OR monotributo          IS DISTINCT FROM public.homologar_si_no(monotributo)
   OR experiencia_previa   IS DISTINCT FROM public.homologar_si_no(experiencia_previa);

-- ============================================================
-- PASO 4 (verificación): debe dar 0
-- ============================================================
SELECT count(*) AS pendientes
FROM leads
WHERE dispuesto_a_sacar_d1 IS DISTINCT FROM public.homologar_si_no(dispuesto_a_sacar_d1)
   OR monotributo          IS DISTINCT FROM public.homologar_si_no(monotributo)
   OR experiencia_previa   IS DISTINCT FROM public.homologar_si_no(experiencia_previa);

-- ============================================================
-- PASO 5: cuenta de Cabify que la web guardó como 'Sí' / 'No'.
-- Esa columna no es Si/No: guarda el estado de la cuenta ("Crear cuenta",
-- "Pendiente", "Confirmada"; ver src/modules/leads/cuentasApps.ts). Desde ahora la
-- web guarda 'Pendiente' si la persona dice que tiene cuenta y 'Crear cuenta' si no.
-- 5a (solo lectura): cuántos hay de cada uno
SELECT cuenta_cabify, count(*) FROM leads
WHERE lower(translate(btrim(cuenta_cabify), 'íÍ', 'ii')) IN ('si', 'no')
GROUP BY cuenta_cabify;

-- 5b: corregirlos
UPDATE leads SET cuenta_cabify = CASE
    WHEN lower(translate(btrim(cuenta_cabify), 'íÍ', 'ii')) = 'si' THEN 'Pendiente'
    ELSE 'Crear cuenta'
  END
WHERE lower(translate(btrim(cuenta_cabify), 'íÍ', 'ii')) IN ('si', 'no');

-- ============================================================
-- REVERTIR (vuelve al trigger anterior, sin dispuesto_a_sacar_d1):
-- volver a correr el PASO 2 de sql/homologar_si_no_leads.sql.
-- ============================================================
