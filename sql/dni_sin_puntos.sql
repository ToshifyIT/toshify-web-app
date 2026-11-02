-- DNI siempre solo con números: sin puntos, espacios, guiones ni ningún otro carácter
-- (leads.dni y conductores.numero_dni).
-- 1) Limpia lo que ya está cargado.
-- 2) Agrega un trigger para que todo lo que entre (app, cargas masivas, API, Sellium)
--    quede limpio aunque venga con puntos.
-- Correr completo en el SQL Editor de Supabase.

-- ── 0) Vista previa (opcional): cuántos tienen algún carácter que no sea número ──
-- SELECT 'leads' AS tabla, count(*) FROM leads WHERE dni ~ '\D'
-- UNION ALL
-- SELECT 'conductores', count(*) FROM conductores WHERE numero_dni ~ '\D';

-- Conductores que quedarían con el mismo DNI al limpiar (revisar a mano si aparece alguno):
-- SELECT regexp_replace(numero_dni, '\D', '', 'g') AS dni, count(*), string_agg(apellidos || ', ' || nombres, ' | ')
-- FROM conductores WHERE numero_dni IS NOT NULL
-- GROUP BY 1 HAVING count(*) > 1;

-- ── 1) Función de limpieza ──
CREATE OR REPLACE FUNCTION public.limpiar_dni(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(v, '\D', '', 'g'), '')
$$;

-- ── 2) Limpieza de los datos existentes ──
UPDATE leads
SET dni = public.limpiar_dni(dni)
WHERE dni IS NOT NULL AND dni IS DISTINCT FROM public.limpiar_dni(dni);

UPDATE conductores
SET numero_dni = public.limpiar_dni(numero_dni)
WHERE numero_dni IS NOT NULL AND numero_dni IS DISTINCT FROM public.limpiar_dni(numero_dni);

-- ── 3) Triggers: limpian al insertar o editar ──
CREATE OR REPLACE FUNCTION public.trg_leads_dni_limpio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.dni := public.limpiar_dni(NEW.dni);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_dni_limpio ON leads;
CREATE TRIGGER leads_dni_limpio
  BEFORE INSERT OR UPDATE OF dni ON leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_dni_limpio();

CREATE OR REPLACE FUNCTION public.trg_conductores_dni_limpio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.numero_dni := public.limpiar_dni(NEW.numero_dni);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conductores_dni_limpio ON conductores;
CREATE TRIGGER conductores_dni_limpio
  BEFORE INSERT OR UPDATE OF numero_dni ON conductores
  FOR EACH ROW EXECUTE FUNCTION public.trg_conductores_dni_limpio();
