-- sql/siniestros_gestionado_por.sql
-- Siniestros v2, mejora 5: quién gestiona cada siniestro (2026-11-10).
--
-- Nuevo campo siniestros.gestionado_por con estos valores:
--   'sancor'   lo gestiona el seguro (Sancor)
--   'rda'      lo gestiona la rentadora (RDA)
--   'legal'    lo gestiona legal (abogada)
--   'toshify'  lo gestiona Toshify (interno)
-- Si está vacío, figura como "Sin definir".
--
-- La app lo lee directo de la tabla siniestros, así que no hace falta tocar la vista
-- v_siniestros_completos.
--
-- Se puede correr más de una vez.

BEGIN;

ALTER TABLE public.siniestros ADD COLUMN IF NOT EXISTS gestionado_por text;

ALTER TABLE public.siniestros DROP CONSTRAINT IF EXISTS siniestros_gestionado_por_check;
ALTER TABLE public.siniestros ADD CONSTRAINT siniestros_gestionado_por_check
  CHECK (gestionado_por IS NULL OR gestionado_por IN ('sancor', 'rda', 'legal', 'toshify'));

COMMIT;

-- OPCIONAL: completar los siniestros que ya existen con las casillas viejas
-- ("Enviado a abogada" → Legal, "Enviado a rentadora" → RDA). Revisá el resultado de la
-- consulta de abajo antes de sacarle los comentarios a este UPDATE.
--
-- UPDATE public.siniestros
-- SET gestionado_por = CASE WHEN enviado_abogada THEN 'legal' ELSE 'rda' END
-- WHERE gestionado_por IS NULL
--   AND (enviado_abogada OR enviado_alliance);

-- Comprobar: cuántos quedarían en cada uno con las casillas viejas
SELECT CASE WHEN enviado_abogada THEN 'legal'
            WHEN enviado_alliance THEN 'rda'
            ELSE 'sin definir' END AS gestionaria,
       count(*) AS siniestros,
       count(*) FILTER (WHERE enviado_abogada AND enviado_alliance) AS con_las_dos_casillas
FROM public.siniestros
GROUP BY 1 ORDER BY 1;
