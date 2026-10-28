-- =====================================================
-- Cron jobs reales (Administración > Integraciones & Tokens > Cron Jobs)
-- =====================================================
-- La tabla cron_jobs era un registro cargado a mano: nadie escribía cuándo corría
-- cada job, por eso todos decían "Sin ejecución" y Wialon/USS figuraban activos.
--
-- refrescar_cron_jobs() la pone al día con lo que realmente pasa:
--   1. Jobs del servidor (toshify-sync): toma la última corrida de su tabla de log
--      (cabify_sync_log, uss_sync_log, wialon_bitacora_sync_log) y marca el job como
--      activo solo si corrió dentro de lo esperable para su frecuencia.
--   2. Jobs de la base (pg_cron): los lista tal cual están programados en Supabase,
--      con su última corrida y si salió bien o con error.
-- La pantalla la llama cada vez que se abre la pestaña. Se puede ejecutar más de una vez.

CREATE OR REPLACE FUNCTION refrescar_cron_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_tabla text;
  v_ultima timestamptz;
  v_estado text;
  v_error text;
  v_tolerancia interval;
  v_col_fecha text;
  v_col_estado text;
  v_col_error text;
  v_cambios integer := 0;
BEGIN
  -- 1. Jobs del servidor: última actividad según su tabla de log
  FOR r IN SELECT id, integracion, schedule FROM cron_jobs WHERE tipo = 'script' LOOP
    v_tabla := CASE r.integracion
      WHEN 'wialon' THEN 'wialon_bitacora_sync_log'
      WHEN 'uss' THEN 'uss_sync_log'
      WHEN 'cabify_ba' THEN 'cabify_sync_log'
      WHEN 'cabify_bari' THEN 'cabify_sync_log'
      ELSE NULL END;
    CONTINUE WHEN v_tabla IS NULL OR to_regclass('public.' || v_tabla) IS NULL;

    -- Cada tabla de log tiene sus propios nombres de columna: se detectan
    SELECT c.column_name INTO v_col_fecha
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_tabla
      AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')
    ORDER BY array_position(ARRAY['started_at', 'created_at', 'sync_started_at', 'inserted_at',
      'completed_at', 'finished_at', 'fecha', 'executed_at', 'run_at'], c.column_name::text) NULLS LAST,
      c.ordinal_position
    LIMIT 1;
    CONTINUE WHEN v_col_fecha IS NULL;

    SELECT c.column_name INTO v_col_estado
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_tabla
      AND c.column_name IN ('status', 'estado', 'result', 'resultado')
    LIMIT 1;

    SELECT c.column_name INTO v_col_error
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_tabla
      AND c.column_name IN ('error_message', 'error', 'errors', 'mensaje_error', 'message')
    LIMIT 1;

    EXECUTE format(
      'SELECT %I::timestamptz, %s, %s FROM %I WHERE %I IS NOT NULL ORDER BY %I DESC LIMIT 1',
      v_col_fecha,
      CASE WHEN v_col_estado IS NULL THEN 'NULL::text' ELSE format('%I::text', v_col_estado) END,
      CASE WHEN v_col_error IS NULL THEN 'NULL::text' ELSE format('%I::text', v_col_error) END,
      v_tabla, v_col_fecha, v_col_fecha)
      INTO v_ultima, v_estado, v_error;

    -- Cuánto puede pasar sin correr antes de considerarlo detenido
    v_tolerancia := CASE
      WHEN r.schedule LIKE '*/%' THEN interval '1 hour'          -- cada N minutos
      WHEN r.schedule ~ '^\S+ \* ' THEN interval '6 hours'        -- cada hora
      WHEN r.schedule ~ '^\S+ \S+ \* \* \*$' THEN interval '2 days' -- diario
      ELSE interval '9 days' END;                                 -- semanal u otro

    UPDATE cron_jobs SET
      ultima_ejecucion = v_ultima,
      ultimo_estado = CASE
        WHEN v_ultima IS NULL THEN NULL
        WHEN lower(COALESCE(v_estado, '')) IN ('error', 'failed', 'fail') THEN 'error'
        ELSE 'ok' END,
      ultimo_error = CASE WHEN lower(COALESCE(v_estado, '')) IN ('error', 'failed', 'fail') THEN v_error ELSE NULL END,
      activo = (v_ultima IS NOT NULL AND v_ultima >= now() - v_tolerancia),
      updated_at = now()
    WHERE id = r.id;
    v_cambios := v_cambios + 1;
  END LOOP;

  -- 2. Jobs de la base (pg_cron): se reemplazan por lo que está programado hoy
  IF to_regclass('cron.job') IS NOT NULL THEN
    DELETE FROM cron_jobs WHERE tipo = 'pg_cron';
    INSERT INTO cron_jobs (nombre, descripcion, schedule, comando, tipo, integracion, activo,
                           ultima_ejecucion, ultimo_estado, ultimo_error, metadata)
    SELECT
      COALESCE(j.jobname, 'Job ' || j.jobid),
      'Programado en la base de datos (pg_cron)',
      j.schedule,
      left(j.command, 500),
      'pg_cron',
      'sistema',
      j.active,
      d.start_time,
      CASE WHEN d.status IS NULL THEN NULL WHEN d.status = 'succeeded' THEN 'ok' ELSE 'error' END,
      CASE WHEN d.status = 'failed' THEN left(d.return_message, 500) ELSE NULL END,
      jsonb_build_object('pg_cron_jobid', j.jobid)
    FROM cron.job j
    LEFT JOIN LATERAL (
      SELECT status, start_time, return_message
      FROM cron.job_run_details x
      WHERE x.jobid = j.jobid
      ORDER BY x.start_time DESC
      LIMIT 1
    ) d ON true;
    GET DIAGNOSTICS v_cambios = ROW_COUNT;
  END IF;

  RETURN v_cambios;
END;
$$;

REVOKE ALL ON FUNCTION refrescar_cron_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION refrescar_cron_jobs() TO authenticated;

-- Wialon y USS ya no se usan (se reemplazaron por Geotab): se quitan del registro
DELETE FROM cron_jobs WHERE integracion IN ('wialon', 'uss');

-- Ponerla al día ahora y ver el resultado
SELECT refrescar_cron_jobs();
SELECT nombre, tipo, integracion, schedule, activo, ultima_ejecucion, ultimo_estado
FROM cron_jobs
ORDER BY tipo, integracion, nombre;
