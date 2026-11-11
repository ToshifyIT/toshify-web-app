-- sql/siniestros_gestionado_por_relleno.sql
-- Siniestros v2: completa "Gestiona" (siniestros.gestionado_por) con las casillas viejas
-- (2026-11-11). Requiere haber corrido sql/siniestros_gestionado_por.sql.
--
--   "Enviado a abogada"   → Legal
--   "Enviado a rentadora" → RDA
--   Si tiene las dos casillas, queda Legal.
--
-- Solo completa los que todavía están vacíos ("Sin definir"): no pisa lo que Eugenia ya
-- cargó a mano. El resto queda "Sin definir" para que lo cargue ella.
-- Se puede correr más de una vez.

-- Antes: cuántos quedarían en cada uno
SELECT CASE WHEN enviado_abogada THEN 'legal'
            WHEN enviado_alliance THEN 'rda'
            ELSE 'sin definir' END AS gestiona,
       count(*) AS siniestros,
       count(*) FILTER (WHERE enviado_abogada AND enviado_alliance) AS con_las_dos_casillas
FROM public.siniestros
WHERE gestionado_por IS NULL
GROUP BY 1 ORDER BY 1;

BEGIN;

UPDATE public.siniestros
SET gestionado_por = CASE WHEN enviado_abogada THEN 'legal' ELSE 'rda' END
WHERE gestionado_por IS NULL
  AND (enviado_abogada OR enviado_alliance);

COMMIT;

-- Después: cómo quedó
SELECT coalesce(gestionado_por, 'sin definir') AS gestiona, count(*) AS siniestros
FROM public.siniestros
GROUP BY 1 ORDER BY 1;
