-- sql/nombres_limpios.sql
-- Nombres de conductores y leads sin puntos ni espacios de más (2026-11-17).
-- Al guardar (desde cualquier pantalla, el wizard, la carga de Sellium o la
-- conversión de lead a conductor) el nombre se limpia solo:
--   "CARLOS ALBERTO COLMAN."  -> "CARLOS ALBERTO COLMAN"
--   " EMILIANO  SEVERO "      -> "EMILIANO SEVERO"
-- Se permiten apóstrofo y coma (O'BRIEN, DE LA CRUZ, ...). El punto no.

-- 1) Función que limpia un nombre
CREATE OR REPLACE FUNCTION public.limpiar_nombre_persona(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(regexp_replace(replace(valor, '.', ' '), '\s+', ' ', 'g')),
    ''
  );
$$;

-- 2) Conductores: nombres y apellidos
CREATE OR REPLACE FUNCTION public.conductores_limpiar_nombres()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nombres := public.limpiar_nombre_persona(NEW.nombres);
  NEW.apellidos := public.limpiar_nombre_persona(NEW.apellidos);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conductores_limpiar_nombres ON public.conductores;
CREATE TRIGGER conductores_limpiar_nombres
  BEFORE INSERT OR UPDATE OF nombres, apellidos ON public.conductores
  FOR EACH ROW EXECUTE FUNCTION public.conductores_limpiar_nombres();

-- 3) Leads: nombre completo, nombre y apellido
CREATE OR REPLACE FUNCTION public.leads_limpiar_nombres()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nombre_completo := public.limpiar_nombre_persona(NEW.nombre_completo);
  NEW.nombre_completo_2 := public.limpiar_nombre_persona(NEW.nombre_completo_2);
  NEW.primer_nombre := public.limpiar_nombre_persona(NEW.primer_nombre);
  NEW.apellido := public.limpiar_nombre_persona(NEW.apellido);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_limpiar_nombres ON public.leads;
CREATE TRIGGER leads_limpiar_nombres
  BEFORE INSERT OR UPDATE OF nombre_completo, nombre_completo_2, primer_nombre, apellido ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_limpiar_nombres();

-- 4) Limpiar lo que ya está cargado (24 conductores y ~261 leads al 2026-11-17).
--    Sólo toca las filas que cambian.
UPDATE public.conductores
   SET nombres = nombres, apellidos = apellidos
 WHERE nombres IS DISTINCT FROM public.limpiar_nombre_persona(nombres)
    OR apellidos IS DISTINCT FROM public.limpiar_nombre_persona(apellidos);

UPDATE public.leads
   SET nombre_completo = nombre_completo, nombre_completo_2 = nombre_completo_2,
       primer_nombre = primer_nombre, apellido = apellido
 WHERE nombre_completo IS DISTINCT FROM public.limpiar_nombre_persona(nombre_completo)
    OR nombre_completo_2 IS DISTINCT FROM public.limpiar_nombre_persona(nombre_completo_2)
    OR primer_nombre IS DISTINCT FROM public.limpiar_nombre_persona(primer_nombre)
    OR apellido IS DISTINCT FROM public.limpiar_nombre_persona(apellido);

-- Para revisar (debería dar 0 y 0):
-- SELECT count(*) FROM conductores WHERE nombres ~ '\.|^\s|\s$|\s{2}' OR apellidos ~ '\.|^\s|\s$|\s{2}';
-- SELECT count(*) FROM leads WHERE nombre_completo ~ '\.|^\s|\s$|\s{2}';
