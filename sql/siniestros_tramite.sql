-- sql/siniestros_tramite.sql
-- Siniestros v2, mejora 7: situación del trámite y motivo de cierre (2026-11-10).
--
-- situacion_tramite: qué se está esperando para avanzar (el estado dice en qué etapa
-- está; esto dice por qué está parado):
--   'doc_conductor'   documentación del conductor
--   'doc_tercero'     documentación del tercero
--   'oferta_seguro'   respuesta u oferta del seguro
--   'pago_seguro'     pago del seguro
--   'reparacion'      reparación en taller
--   'legal'           mediación o juicio
--   'al_dia'          nada pendiente
--
-- motivo_cierre: por qué se cerró (la app lo pide al pasar a Cerrado o Rechazado):
--   'cobrado_total'     cobrado total
--   'cobrado_parcial'   cobrado parcial
--   'rechazado_seguro'  rechazado por el seguro
--   'cargo_conductor'   a cargo del conductor
--   'sin_reclamo'       sin reclamo (culpa propia, sin tercero)
--   'desistido'         desistido
--   'prescripto'        prescripto
--
-- La app los lee directo de la tabla siniestros, así que no hace falta tocar la vista
-- v_siniestros_completos. Los siniestros que ya existen quedan sin valor.
--
-- Se puede correr más de una vez.

BEGIN;

ALTER TABLE public.siniestros ADD COLUMN IF NOT EXISTS situacion_tramite text;
ALTER TABLE public.siniestros ADD COLUMN IF NOT EXISTS motivo_cierre text;

ALTER TABLE public.siniestros DROP CONSTRAINT IF EXISTS siniestros_situacion_tramite_check;
ALTER TABLE public.siniestros ADD CONSTRAINT siniestros_situacion_tramite_check
  CHECK (situacion_tramite IS NULL OR situacion_tramite IN
    ('doc_conductor', 'doc_tercero', 'oferta_seguro', 'pago_seguro', 'reparacion', 'legal', 'al_dia'));

ALTER TABLE public.siniestros DROP CONSTRAINT IF EXISTS siniestros_motivo_cierre_check;
ALTER TABLE public.siniestros ADD CONSTRAINT siniestros_motivo_cierre_check
  CHECK (motivo_cierre IS NULL OR motivo_cierre IN
    ('cobrado_total', 'cobrado_parcial', 'rechazado_seguro', 'cargo_conductor',
     'sin_reclamo', 'desistido', 'prescripto'));

COMMIT;

-- Comprobar: siniestros cerrados o rechazados que todavía no tienen motivo
SELECT e.nombre AS estado, count(*) AS siniestros, count(s.motivo_cierre) AS con_motivo
FROM public.siniestros s
JOIN public.siniestros_estados e ON e.id = s.estado_id
WHERE e.codigo IN ('CERRADO', 'RECHAZADO')
GROUP BY 1 ORDER BY 1;
