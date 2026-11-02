-- =====================================================
-- USS / Wialon: validar que no corre nada y desactivarlo
-- =====================================================
-- Ya no se usan (GPS pasó a Geotab). "Online" en la pestaña Monitor solo significa que
-- la edge function sigue publicada y responde: NO que se esté ejecutando.
-- Lo que de verdad las ejecuta son los jobs de pg_cron (o los scripts del servidor
-- toshify-sync, pausados desde el 06/08/2026).
-- Correr por partes en el SQL Editor de Supabase.

-- ── 1) VALIDAR (solo lectura) ──

-- 1a. ¿Hay jobs de pg_cron que las llamen?
SELECT jobid, jobname, schedule, active, left(command, 120) AS comando
FROM cron.job
WHERE command ~* '(uss|wialon)' OR jobname ~* '(uss|wialon)';

-- 1b. ¿Cuándo corrieron por última vez (pg_cron)?
SELECT j.jobname, max(d.start_time) AS ultima_corrida, count(*) AS corridas_ultimos_30d
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE (j.command ~* '(uss|wialon)' OR j.jobname ~* '(uss|wialon)')
  AND d.start_time > now() - interval '30 days'
GROUP BY j.jobname;

-- 1c. Estado en el monitor
SELECT function_name, category, is_active, last_health_check
FROM edge_function_config
WHERE function_name ~* '(uss|wialon)' OR category ~* '(uss|wialon)';

-- ── 2) DESACTIVAR ──

-- 2a. Quita los jobs de pg_cron que llaman a USS / Wialon (si no hay, no hace nada)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
           WHERE command ~* '(uss|wialon)' OR jobname ~* '(uss|wialon)' LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'Quitado el job % (%)', r.jobname, r.jobid;
  END LOOP;
END $$;

-- 2b. Las marca como inactivas en el monitor
UPDATE edge_function_config
SET is_active = false, updated_at = now()
WHERE function_name ~* '(uss|wialon)' OR category ~* '(uss|wialon)';

-- 2c. Comprobación final: la consulta 1a tiene que volver vacía
SELECT count(*) AS jobs_uss_wialon_restantes
FROM cron.job WHERE command ~* '(uss|wialon)' OR jobname ~* '(uss|wialon)';

-- ── 3) OPCIONAL, desde la terminal (no es SQL) ──
-- Para que dejen de existir del todo, borrar las edge functions publicadas:
--   supabase functions delete sync-uss-excesos
--   supabase functions delete sync-uss-kilometraje
--   supabase functions delete sync-wialon-bitacora
--   supabase functions delete sync-wialon-uss
-- y quitar sus filas de edge_function_config.
