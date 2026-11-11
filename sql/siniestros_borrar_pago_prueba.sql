-- sql/siniestros_borrar_pago_prueba.sql
-- Borra el "Pago recibido" de prueba ($10, descripción "Prueba") cargado el 12/01/2026
-- en el seguimiento del siniestro de AF992ZY (2026-11-11).
--
-- OJO: el DELETE no se puede deshacer. Corré primero el SELECT y fijate que devuelva
-- UNA sola fila (la de prueba). Si devuelve más o ninguna, no corras el DELETE.

-- 1) Revisar: tiene que salir una sola fila
SELECT sg.id, sg.tipo_evento, sg.monto, sg.descripcion, sg.created_at, sg.created_by_name,
       v.patente, s.total_pagado AS total_pagado_del_siniestro
FROM public.siniestros_seguimientos sg
JOIN public.siniestros s ON s.id = sg.siniestro_id
JOIN public.vehiculos v ON v.id = s.vehiculo_id
WHERE v.patente = 'AF992ZY'
  AND sg.tipo_evento = 'pago'
  AND sg.monto = 10
  AND trim(lower(sg.descripcion)) = 'prueba';

-- 2) Borrar
BEGIN;

DELETE FROM public.siniestros_seguimientos sg
USING public.siniestros s, public.vehiculos v
WHERE s.id = sg.siniestro_id
  AND v.id = s.vehiculo_id
  AND v.patente = 'AF992ZY'
  AND sg.tipo_evento = 'pago'
  AND sg.monto = 10
  AND trim(lower(sg.descripcion)) = 'prueba';

COMMIT;

-- 3) Si en el paso 1 "total_pagado_del_siniestro" incluía esos $10 (por ejemplo, daba 10),
--    restalos a mano en Editar → Gestión y montos → "Cobrado del seguro".
