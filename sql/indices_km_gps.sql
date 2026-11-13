-- Índices para los viajes GPS por rango de fechas (Panel de conductores > KM GEO,
-- modal "Km recorridos", portal). Las consultas filtran por fecha_hora_inicio_gmt3
-- y ordenan por (fecha_hora_inicio_gmt3, id); sin índice recorrían la tabla entera.
-- Solo agrega índices: no cambia datos ni los procesos de sincronización.
BEGIN;

CREATE INDEX IF NOT EXISTS ix_geotab_hist_inicio_gmt3_id
  ON public.geotab_historico (fecha_hora_inicio_gmt3, id);

CREATE INDEX IF NOT EXISTS ix_uss_hist_inicio_gmt3_id
  ON public.uss_historico (fecha_hora_inicio_gmt3, id);

COMMIT;

ANALYZE public.geotab_historico;
ANALYZE public.uss_historico;
