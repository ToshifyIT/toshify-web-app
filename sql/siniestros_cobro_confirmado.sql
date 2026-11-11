-- sql/siniestros_cobro_confirmado.sql
-- Siniestros v2: confirmación manual de los cobros a conductor (2026-11-11).
--
-- Enviar una incidencia de cobro al conductor NO quiere decir que pagó. Desde ahora
-- "Cobrado al conductor" (siniestros.cobrado_conductor) es solo la suma de lo que
-- Eugenia confirma con el botón "Confirmar pago" en el historial de gestión.
--
-- 1) Nuevas columnas en siniestros_seguimientos (solo se usan en los cobro_conductor):
--      pago_confirmado_monto    lo efectivamente cobrado (puede ser menos que el monto)
--      pago_confirmado_at       cuándo se confirmó
--      pago_confirmado_por      nombre de quien lo confirmó
--      pago_confirmado_por_id   usuario que lo confirmó
--
-- 2) Recalcula siniestros.cobrado_conductor como la suma de lo confirmado. Como todavía
--    no hay nada confirmado, queda en 0 (o NULL) en todos los siniestros. Esto deshace
--    el relleno que hizo sql/siniestros_montos.sql, que sumaba las incidencias enviadas.
--    OJO: si alguien cargó a mano "Cobrado al conductor" en la v2, también se pierde;
--    revisá el SELECT de abajo antes de correr el UPDATE.
--
-- Se puede correr más de una vez.

-- Antes de correr: qué tiene hoy cobrado_conductor
SELECT count(*) FILTER (WHERE cobrado_conductor > 0) AS siniestros_con_valor,
       sum(cobrado_conductor)                         AS total_actual
FROM public.siniestros;

BEGIN;

ALTER TABLE public.siniestros_seguimientos ADD COLUMN IF NOT EXISTS pago_confirmado_monto numeric;
ALTER TABLE public.siniestros_seguimientos ADD COLUMN IF NOT EXISTS pago_confirmado_at timestamptz;
ALTER TABLE public.siniestros_seguimientos ADD COLUMN IF NOT EXISTS pago_confirmado_por text;
ALTER TABLE public.siniestros_seguimientos ADD COLUMN IF NOT EXISTS pago_confirmado_por_id uuid;

UPDATE public.siniestros s
SET cobrado_conductor = c.total
FROM (
  SELECT si.id AS siniestro_id,
         coalesce(sum(sg.pago_confirmado_monto), 0) AS total
  FROM public.siniestros si
  LEFT JOIN public.siniestros_seguimientos sg
    ON sg.siniestro_id = si.id
   AND sg.tipo_evento = 'cobro_conductor'
   AND sg.pago_confirmado_monto IS NOT NULL
  GROUP BY si.id
) c
WHERE s.id = c.siniestro_id
  AND coalesce(s.cobrado_conductor, 0) <> c.total;

COMMIT;

-- Comprobar: tiene que dar 0 hasta que se confirme algún pago
SELECT count(*) FILTER (WHERE cobrado_conductor > 0) AS siniestros_con_valor,
       sum(cobrado_conductor)                         AS total_cobrado_conductores
FROM public.siniestros;
