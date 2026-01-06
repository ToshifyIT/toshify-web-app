-- ============================================
-- MIGRACIÓN: Configurar cron job para sincronización de bitácora
-- Requiere extensión pg_cron habilitada en Supabase
-- ============================================

-- Habilitar extensión pg_cron (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eliminar job existente si existe
SELECT cron.unschedule('sync-wialon-bitacora') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-wialon-bitacora'
);

-- Crear job que se ejecuta cada 15 minutos
-- Este job llama a la Edge Function de sincronización
SELECT cron.schedule(
  'sync-wialon-bitacora',           -- nombre del job
  '*/15 * * * *',                   -- cada 15 minutos
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sync-wialon-bitacora',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"daysBack": 1}'::jsonb
  );
  $$
);

-- Mostrar jobs configurados
-- SELECT * FROM cron.job;
