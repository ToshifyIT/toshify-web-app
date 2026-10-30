-- Sincronización diaria de multas con los conductores de Geotab (2026-10-29)
--
-- Red de seguridad del bot de multas: todos los días a las 15:00 AR (18:00 UTC), después
-- de la corrida del bot (13:00 a ~13:50 AR), corre public.sincronizar_multas_geotab sobre
-- los últimos 60 días de todas las sedes. Completa las multas que el bot dejó sin
-- conductor y las que cambian cuando Geotab corrige un viaje días después.
-- Mismas reglas que el botón "Actualizar desde Geotab" (ver sql/sincronizar_multas_geotab.sql):
-- no toca multas editadas por una persona ni las que ya tienen incidencia.
--
-- Ver el resultado de cada corrida:
--   SELECT start_time, status, return_message FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-multas-geotab')
--   ORDER BY start_time DESC LIMIT 10;
-- Quitarlo:
--   SELECT cron.unschedule('sync-multas-geotab');
--
-- Ejecutar como supabase_admin.

BEGIN;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-multas-geotab';

SELECT cron.schedule(
  'sync-multas-geotab',
  '0 18 * * *',
  $$SELECT public.sincronizar_multas_geotab(
      ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 60),
      (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      NULL)$$
);

-- Primera corrida ahora mismo (sí se guarda). Hoy no debería cambiar nada: la 9109 ya se
-- sincronizó y la 8856 tiene incidencia.
SELECT public.sincronizar_multas_geotab(
  ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 60),
  (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  NULL) AS resultado_hoy;

SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'sync-multas-geotab';

COMMIT;
