-- =====================================================
-- MIGRACIÓN: Configuración de todos los CRON Jobs
-- Fecha: 2026-01-09
-- Descripción: Configura pg_cron para sincronización automática
-- =====================================================

-- Verificar que pg_cron está habilitado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'La extensión pg_cron no está instalada. Ejecute: CREATE EXTENSION pg_cron;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'La extensión pg_net no está instalada. Ejecute: CREATE EXTENSION pg_net;';
  END IF;
END $$;

-- =====================================================
-- JOB 1: Sincronización de Bitácora Wialon (cada 15 min)
-- =====================================================

-- Eliminar job existente si existe
DO $$ BEGIN
  PERFORM cron.unschedule('sync-wialon-bitacora');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Crear job
SELECT cron.schedule(
  'sync-wialon-bitacora',
  '*/15 * * * *',
  $body$
  SELECT net.http_post(
    url := 'https://supabase.toshify.com.ar/functions/v1/sync-wialon-bitacora',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjY4OTgwMDAsImV4cCI6MTkyNDY2NDQwMH0.xE9wF8DvNU5QbnqeZ_lqR9HmzIRrE0QqMfURKDAuGnQ"}'::jsonb,
    body := '{"daysBack": 1}'::jsonb
  ) AS request_id;
  $body$
);

-- =====================================================
-- JOB 2: Sincronización de Kilometraje USS (cada 30 min)
-- =====================================================

-- Eliminar job existente si existe
DO $$ BEGIN
  PERFORM cron.unschedule('sync-uss-kilometraje');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Crear job
SELECT cron.schedule(
  'sync-uss-kilometraje',
  '*/30 * * * *',
  $body$
  SELECT net.http_post(
    url := 'https://supabase.toshify.com.ar/functions/v1/sync-uss-kilometraje',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjY4OTgwMDAsImV4cCI6MTkyNDY2NDQwMH0.xE9wF8DvNU5QbnqeZ_lqR9HmzIRrE0QqMfURKDAuGnQ"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $body$
);

-- =====================================================
-- VERIFICACIÓN: Mostrar todos los jobs configurados
-- =====================================================

DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname IN ('sync-wialon-bitacora', 'sync-uss-kilometraje');

  IF job_count < 2 THEN
    RAISE WARNING 'Solo se configuraron % de 2 jobs esperados', job_count;
  ELSE
    RAISE NOTICE '✅ Todos los cron jobs configurados correctamente (% jobs)', job_count;
  END IF;
END $$;

-- Mostrar estado final
SELECT
  jobid,
  jobname,
  schedule,
  active,
  'Cada ' ||
    CASE
      WHEN schedule LIKE '*/15%' THEN '15 minutos'
      WHEN schedule LIKE '*/30%' THEN '30 minutos'
      ELSE schedule
    END AS frecuencia
FROM cron.job
WHERE jobname IN ('sync-wialon-bitacora', 'sync-uss-kilometraje')
ORDER BY jobname;
