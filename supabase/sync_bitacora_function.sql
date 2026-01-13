-- Función para sincronizar uss_historico -> wialon_bitacora
-- Ejecutar este SQL en Supabase SQL Editor

CREATE OR REPLACE FUNCTION sync_bitacora_from_uss(days_back INTEGER DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date DATE := CURRENT_DATE - (days_back || ' days')::INTERVAL;
  v_end_date DATE := CURRENT_DATE;
  v_count INTEGER := 0;
  v_result jsonb;
BEGIN
  -- Insertar/actualizar turnos agrupados por patente+fecha
  INSERT INTO wialon_bitacora (
    patente,
    patente_normalizada,
    conductor_wialon,
    ibutton,
    fecha_turno,
    hora_inicio,
    hora_cierre,
    kilometraje,
    estado,
    synced_at,
    updated_at
  )
  SELECT
    MIN(patente) as patente,
    UPPER(REPLACE(patente, ' ', '')) as patente_normalizada,
    (array_agg(conductor ORDER BY fecha_hora_inicio) FILTER (WHERE conductor IS NOT NULL AND conductor != '-----' AND conductor != '-' AND conductor != ''))[1] as conductor_wialon,
    (array_agg(ibutton::text ORDER BY fecha_hora_inicio) FILTER (WHERE ibutton IS NOT NULL AND ibutton::text != ''))[1] as ibutton,
    fecha_hora_inicio::date as fecha_turno,
    MIN(TO_CHAR(fecha_hora_inicio, 'HH24:MI')) as hora_inicio,
    MAX(TO_CHAR(fecha_hora_final, 'HH24:MI')) as hora_cierre,
    ROUND(SUM(COALESCE(kilometraje::numeric, 0))::numeric, 2) as kilometraje,
    CASE
      WHEN MAX(fecha_hora_final) IS NULL THEN 'En Curso'
      WHEN SUM(COALESCE(kilometraje::numeric, 0)) < 100 THEN 'Poco Km'
      ELSE 'Turno Finalizado'
    END as estado,
    NOW() as synced_at,
    NOW() as updated_at
  FROM uss_historico
  WHERE fecha_hora_inicio::date BETWEEN v_start_date AND v_end_date
  GROUP BY UPPER(REPLACE(patente, ' ', '')), fecha_hora_inicio::date
  ON CONFLICT (patente_normalizada, fecha_turno, hora_inicio)
  DO UPDATE SET
    conductor_wialon = COALESCE(EXCLUDED.conductor_wialon, wialon_bitacora.conductor_wialon),
    ibutton = COALESCE(EXCLUDED.ibutton, wialon_bitacora.ibutton),
    hora_cierre = COALESCE(EXCLUDED.hora_cierre, wialon_bitacora.hora_cierre),
    kilometraje = EXCLUDED.kilometraje,
    estado = EXCLUDED.estado,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true,
    'rows_affected', v_count,
    'start_date', v_start_date,
    'end_date', v_end_date,
    'sync_date', NOW()
  );

  RETURN v_result;
END;
$$;

-- Dar permisos
GRANT EXECUTE ON FUNCTION sync_bitacora_from_uss(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_bitacora_from_uss(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION sync_bitacora_from_uss(INTEGER) TO anon;

-- Crear cron job para ejecutar cada 5 minutos (requiere pg_cron)
-- SELECT cron.schedule('sync-bitacora', '*/5 * * * *', 'SELECT sync_bitacora_from_uss(1)');

-- Para probar manualmente:
-- SELECT sync_bitacora_from_uss(7);
