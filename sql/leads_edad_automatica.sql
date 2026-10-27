-- =====================================================
-- Leads: edad calculada automáticamente desde la fecha de nacimiento
-- =====================================================
-- Los leads que entran por la web (y cualquier otra carga que no complete la
-- edad) traen fecha_de_nacimiento pero no edad. Esto la calcula en la base, así
-- sirve para todos los orígenes (web, Sellium, carga manual, API):
--
--   1. Trigger: al crear un lead o cambiar su fecha de nacimiento, la edad se
--      calcula sola. Si hay fecha de nacimiento, manda la fecha (la edad
--      escrita a mano se reemplaza por la calculada).
--   2. Actualización de los leads que ya existen.
--   3. Tarea diaria (pg_cron): actualiza la edad de quienes cumplieron años.
--
-- Sin fecha de nacimiento, la edad queda como esté (la que haya cargado el chatbot).
-- Fechas que darían una edad imposible (menos de 14 o más de 100) se ignoran.
-- Se puede ejecutar más de una vez.

-- Edad en años cumplidos, hora Argentina (NULL sin fecha).
CREATE OR REPLACE FUNCTION lead_edad_desde_nacimiento(p_nacimiento date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT date_part('year', age((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, p_nacimiento))::int
$$;

CREATE OR REPLACE FUNCTION leads_calcular_edad()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_edad integer := lead_edad_desde_nacimiento(NEW.fecha_de_nacimiento);
BEGIN
  IF v_edad BETWEEN 14 AND 100 THEN
    NEW.edad := v_edad;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_calcular_edad ON leads;
CREATE TRIGGER leads_calcular_edad
  BEFORE INSERT OR UPDATE OF fecha_de_nacimiento, edad ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_calcular_edad();

-- Actualiza la edad de los leads con fecha de nacimiento (los existentes y,
-- cada día, los que cumplieron años). Devuelve cuántos cambió.
CREATE OR REPLACE FUNCTION leads_actualizar_edades()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cambiados integer;
BEGIN
  UPDATE leads l
  SET edad = lead_edad_desde_nacimiento(l.fecha_de_nacimiento)
  WHERE l.fecha_de_nacimiento IS NOT NULL
    AND lead_edad_desde_nacimiento(l.fecha_de_nacimiento) BETWEEN 14 AND 100
    -- ::text para que funcione sea la columna edad numérica o de texto
    AND l.edad::text IS DISTINCT FROM lead_edad_desde_nacimiento(l.fecha_de_nacimiento)::text;
  GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  RETURN v_cambiados;
END;
$$;

REVOKE ALL ON FUNCTION leads_actualizar_edades() FROM PUBLIC, anon, authenticated;

-- 2. Leads que ya existen (muestra cuántos se actualizaron)
SELECT leads_actualizar_edades() AS leads_actualizados;

-- 3. Todos los días a las 00:15 hora Argentina (03:15 UTC).
-- Ejecutar aparte (si ya existe, primero: SELECT cron.unschedule('leads-edades');)
-- SELECT cron.schedule('leads-edades', '15 3 * * *', $$SELECT leads_actualizar_edades()$$);

-- Comprobar: leads con fecha de nacimiento y sin edad (debería dar 0, salvo fechas imposibles)
-- SELECT COUNT(*) FROM leads WHERE fecha_de_nacimiento IS NOT NULL AND edad IS NULL;

-- Quitarlo:
-- SELECT cron.unschedule('leads-edades');
-- DROP TRIGGER IF EXISTS leads_calcular_edad ON leads;
-- DROP FUNCTION IF EXISTS leads_calcular_edad();
-- DROP FUNCTION IF EXISTS leads_actualizar_edades();
-- DROP FUNCTION IF EXISTS lead_edad_desde_nacimiento(date);
