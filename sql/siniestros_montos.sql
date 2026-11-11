-- sql/siniestros_montos.sql
-- Siniestros v2, mejora 4: montos completos del siniestro (2026-11-10).
--
-- Agrega a siniestros los dos montos que faltaban para ver el resultado de cada caso:
--   oferta_seguro       lo que ofreció el seguro (antes del acuerdo final)
--   cobrado_conductor   lo que se le cobró al conductor por el siniestro
--
-- Los demás montos ya existían:
--   presupuesto_real             presupuesto del taller
--   presupuesto_enviado_seguro   lo que se reclamó al seguro
--   presupuesto_aprobado_seguro  aprobado / acordado con el seguro
--   total_pagado                 cobrado del seguro (lo suma el "Pago recibido" del seguimiento)
--   total_reparacion_pagada      pagado al taller (no se veía en el formulario)
--
-- El resultado (cobrado del seguro + cobrado al conductor - costo de la reparación) lo
-- calcula la app; no se guarda.
--
-- La app lee estas dos columnas directo de la tabla siniestros, así que no hace falta
-- tocar la vista v_siniestros_completos.
--
-- Pasa a cobrado_conductor los cobros a conductor que ya estaban en el seguimiento.
-- Se puede correr más de una vez: solo completa los siniestros que todavía no tienen valor.

BEGIN;

ALTER TABLE public.siniestros ADD COLUMN IF NOT EXISTS oferta_seguro numeric;
ALTER TABLE public.siniestros ADD COLUMN IF NOT EXISTS cobrado_conductor numeric;

UPDATE public.siniestros s
SET cobrado_conductor = c.total
FROM (
  SELECT siniestro_id, sum(monto) AS total
  FROM public.siniestros_seguimientos
  WHERE tipo_evento = 'cobro_conductor' AND coalesce(monto, 0) > 0
  GROUP BY siniestro_id
) c
WHERE s.id = c.siniestro_id
  AND s.cobrado_conductor IS NULL;

COMMIT;

-- Comprobar
SELECT count(*) FILTER (WHERE cobrado_conductor > 0) AS con_cobro_conductor,
       sum(cobrado_conductor)                         AS total_cobrado_conductores,
       count(*) FILTER (WHERE oferta_seguro > 0)      AS con_oferta_seguro
FROM public.siniestros;
