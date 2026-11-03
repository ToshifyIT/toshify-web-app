-- =====================================================
-- cron_jobs con el estado REAL del servidor — 2026-11-02
-- =====================================================
-- Desde ahora /opt/toshify-sync/estado-cron.sh (cada 5 min) lee el crontab y los logs y
-- completa cron_jobs: si está programado, cada cuánto, cuándo corrió y si falló.
-- refrescar_cron_jobs() sigue tomando la última ejecución de Cabify desde cabify_sync_log,
-- pero ya no decide si un job está "activo" (eso lo dice el crontab) ni toca los que
-- se miden por su log (metadata.fuente = 'log').
-- Se puede correr más de una vez.

-- Nombres de comando = nombre del script (así los encuentra estado-cron.sh)
UPDATE public.cron_jobs SET comando = 'geotab_resync_runner.py' WHERE comando LIKE '%/geotab_resync_runner.py';
UPDATE public.cron_jobs SET comando = 'geotab_secuencia_conductores.py' WHERE comando LIKE '%/geotab_secuencia_conductores.py';
UPDATE public.cron_jobs SET comando = 'run-cabify-weekly-email.sh', tipo = 'script',
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"fuente":"log"}'::jsonb
WHERE nombre = 'Email Cabify Semanal';

-- Procesos del servidor que no figuraban
INSERT INTO public.cron_jobs (nombre, descripcion, schedule, comando, tipo, integracion, activo, metadata)
SELECT v.nombre, v.descripcion, v.schedule, v.comando, 'script', v.integracion, true, '{"fuente":"log","ubicacion":"servidor"}'::jsonb
FROM (VALUES
  ('Multas de tránsito', 'Todos los días a las 13:00 busca multas de tránsito de la flota en los portales y las carga en Multas/Telepase › Multas.', '0 13 * * *', 'py-multas-generales/main.py', 'sistema'),
  ('Peajes Telepase', 'Todos los días a las 15:00 trae los peajes de Telepase de la flota y los carga en Multas/Telepase › Telepase.', '0 15 * * *', 'py-telepase/main.py', 'sistema'),
  ('Cabify: desactivar efectivo', 'Los sábados a las 06:00 apaga el cobro en efectivo en Cabify a los conductores que corresponde, en cada cuenta de Cabify.', '0 6 * * 6', 'py-cabify-efectivo/main.py --desactivar', 'cabify_ba'),
  ('Cabify: activar efectivo', 'Los lunes a las 06:00 vuelve a activar el cobro en efectivo en Cabify, en cada cuenta de Cabify.', '0 6 * * 1', 'py-cabify-efectivo/main.py --activar', 'cabify_ba'),
  ('Geotab secuencia de conductores (PR)', 'Segunda versión de la secuencia de conductores por vehículo (quién tuvo cada auto y en qué horario). Comparte log con la otra.', '7-59/30 * * * *', 'geotab_secuencia_conductores_pr.py', 'geotab')
) AS v(nombre, descripcion, schedule, comando, integracion)
WHERE NOT EXISTS (SELECT 1 FROM public.cron_jobs c WHERE c.tipo = 'script' AND c.comando = v.comando);

-- Lo que se mide por su log no lo pisa refrescar_cron_jobs
UPDATE public.cron_jobs SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"fuente":"log"}'::jsonb
WHERE tipo = 'script' AND comando NOT IN ('run-cabify-cuentas.sh', 'run-cabify-cierre.sh');
