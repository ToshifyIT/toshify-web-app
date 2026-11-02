-- =====================================================
-- Cabify: sync de cada 10 min solo HOY + cierre nocturno (ITCODE-432) — 2026-11-02
-- =====================================================
-- Con dos cuentas, traer hoy + 2 días cada 10 min tardaba ~20 min y el servidor lo cortaba
-- a los 15 (timeout): el día de hoy de 44 Dreams no llegaba a guardarse y no quedaba registro.
-- Ahora:
--   * "Cabify por cuentas"  cada 10 min, solo HOY (~7 min con las dos cuentas).
--   * "Cabify cierre nocturno"  todos los días 02:10 (hora Argentina), re-sincroniza
--     los 2 días anteriores + hoy (peajes y viajes que Cabify cierra tarde).
-- Se puede correr más de una vez.

UPDATE public.cron_jobs SET
  descripcion = 'Cada 10 minutos trae los viajes de HOY de cada cuenta activa en Parámetros › Grupos de flota › Cuentas de Cabify (Grupo CG y 44 Dreams → Buenos Aires) y los guarda en cabify_historico.',
  updated_at = now()
WHERE nombre = 'Cabify por cuentas' AND tipo = 'script';

INSERT INTO public.cron_jobs (nombre, descripcion, schedule, comando, tipo, integracion, activo, metadata)
SELECT 'Cabify cierre nocturno',
       'Todas las noches vuelve a traer los 2 días anteriores + hoy de cada cuenta activa, para completar peajes y viajes que Cabify cierra tarde.',
       '10 6 * * *', 'run-cabify-cierre.sh', 'script', 'cabify_ba', false,
       '{"sync_type": "backfill-cuentas"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.cron_jobs WHERE nombre = 'Cabify cierre nocturno');

UPDATE public.cron_jobs SET
  descripcion = 'Reemplazado por "Cabify cierre nocturno". Para recargar días viejos a mano: sync-cabify-cuentas.ts --dias N.',
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"desactivado": true}'::jsonb,
  updated_at = now()
WHERE nombre = 'Cabify BA Backfill' AND tipo = 'script';

SELECT refrescar_cron_jobs();
