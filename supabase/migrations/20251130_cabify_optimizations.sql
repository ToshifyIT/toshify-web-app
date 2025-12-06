-- Migración: Optimizaciones para sistema Cabify
-- Fecha: 2025-11-30
-- Descripción: Índices, constraints y tabla de log para mejorar rendimiento

-- =====================================================
-- 1. CREAR TABLA DE LOG DE SINCRONIZACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS cabify_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('realtime', 'weekly', 'manual', 'backfill')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'running')),
  error_message TEXT,
  execution_time_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas eficientes de log
CREATE INDEX idx_sync_log_period ON cabify_sync_log(period_start DESC, period_end DESC);
CREATE INDEX idx_sync_log_status ON cabify_sync_log(status, created_at DESC);
CREATE INDEX idx_sync_log_type ON cabify_sync_log(sync_type, created_at DESC);

-- Habilitar RLS
ALTER TABLE cabify_sync_log ENABLE ROW LEVEL SECURITY;

-- Política: Solo lectura para usuarios autenticados
CREATE POLICY "Allow read access to cabify_sync_log" ON cabify_sync_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Comentarios
COMMENT ON TABLE cabify_sync_log IS 'Registro de sincronizaciones de datos Cabify';
COMMENT ON COLUMN cabify_sync_log.sync_type IS 'Tipo de sincronización: realtime (cada 10 min), weekly (semanal), manual, backfill';
COMMENT ON COLUMN cabify_sync_log.period_start IS 'Inicio del período sincronizado';
COMMENT ON COLUMN cabify_sync_log.period_end IS 'Fin del período sincronizado';
COMMENT ON COLUMN cabify_sync_log.records_synced IS 'Cantidad de registros guardados';
COMMENT ON COLUMN cabify_sync_log.execution_time_ms IS 'Tiempo de ejecución en milisegundos';

-- =====================================================
-- 2. MEJORAR TABLA cabify_historico
-- =====================================================

-- Agregar columnas de control si no existen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cabify_historico' AND column_name = 'data_version'
  ) THEN
    ALTER TABLE cabify_historico ADD COLUMN data_version INTEGER DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cabify_historico' AND column_name = 'last_updated_at'
  ) THEN
    ALTER TABLE cabify_historico ADD COLUMN last_updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Comentarios en nuevas columnas
COMMENT ON COLUMN cabify_historico.data_version IS 'Versión de los datos (para tracking de cambios)';
COMMENT ON COLUMN cabify_historico.last_updated_at IS 'Última actualización del registro';

-- =====================================================
-- 3. CREAR ÍNDICES DE ALTO RENDIMIENTO
-- =====================================================

-- Índice compuesto para búsquedas por período (MÁS IMPORTANTE)
CREATE INDEX IF NOT EXISTS idx_historico_periodo
  ON cabify_historico(fecha_inicio DESC, fecha_fin DESC);

-- Índice para búsquedas por conductor y período
CREATE INDEX IF NOT EXISTS idx_historico_driver_periodo
  ON cabify_historico(cabify_driver_id, fecha_inicio DESC);

-- Índice para búsquedas por compañía y período
CREATE INDEX IF NOT EXISTS idx_historico_company_periodo
  ON cabify_historico(cabify_company_id, fecha_inicio DESC);

-- Índice para búsquedas por fecha de guardado (útil para auditoría)
CREATE INDEX IF NOT EXISTS idx_historico_guardado
  ON cabify_historico(fecha_guardado DESC);

-- Índice parcial: Solo registros activos (si agregamos soft delete en futuro)
-- CREATE INDEX idx_historico_activos ON cabify_historico(fecha_inicio DESC)
--   WHERE deleted_at IS NULL;

-- =====================================================
-- 4. CONSTRAINT ÚNICO PARA EVITAR DUPLICADOS
-- =====================================================

-- Crear constraint único para combinación conductor + período
-- Esto previene guardar el mismo conductor para el mismo período múltiples veces
CREATE UNIQUE INDEX IF NOT EXISTS idx_historico_unique_period
  ON cabify_historico(cabify_driver_id, cabify_company_id, fecha_inicio, fecha_fin);

COMMENT ON INDEX idx_historico_unique_period IS 'Previene duplicados del mismo conductor en el mismo período';

-- =====================================================
-- 5. FUNCIONES ÚTILES
-- =====================================================

-- Función: Verificar si un período ya está sincronizado
CREATE OR REPLACE FUNCTION check_period_synced(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  is_synced BOOLEAN,
  total_records INTEGER,
  last_sync_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) > 0 as is_synced,
    COUNT(*)::INTEGER as total_records,
    MAX(fecha_guardado) as last_sync_date
  FROM cabify_historico
  WHERE fecha_inicio = p_start_date
    AND fecha_fin = p_end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_period_synced IS 'Verifica si un período específico ya fue sincronizado';

-- Función: Obtener estadísticas de cobertura histórica
CREATE OR REPLACE FUNCTION get_historical_coverage_stats()
RETURNS TABLE (
  periodo VARCHAR,
  conductores_unicos INTEGER,
  total_registros INTEGER,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(h.fecha_inicio, 'YYYY-MM') as periodo,
    COUNT(DISTINCT h.cabify_driver_id)::INTEGER as conductores_unicos,
    COUNT(*)::INTEGER as total_registros,
    MIN(h.fecha_inicio) as fecha_inicio,
    MAX(h.fecha_fin) as fecha_fin
  FROM cabify_historico h
  GROUP BY TO_CHAR(h.fecha_inicio, 'YYYY-MM')
  ORDER BY periodo DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_historical_coverage_stats IS 'Estadísticas de cobertura histórica por mes';

-- Función: Limpiar registros duplicados (usar con cuidado)
CREATE OR REPLACE FUNCTION clean_duplicate_historical_records()
RETURNS TABLE (
  deleted_count INTEGER
) AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Eliminar duplicados, manteniendo el más reciente
  WITH duplicates AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY cabify_driver_id, cabify_company_id, fecha_inicio, fecha_fin
        ORDER BY fecha_guardado DESC
      ) as rn
    FROM cabify_historico
  )
  DELETE FROM cabify_historico
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clean_duplicate_historical_records IS 'Elimina registros duplicados, manteniendo el más reciente';

-- =====================================================
-- 6. VISTAS ÚTILES
-- =====================================================

-- Vista: Resumen de salud del sistema de sync
CREATE OR REPLACE VIEW cabify_sync_health AS
SELECT
  DATE_TRUNC('day', created_at)::DATE as sync_date,
  sync_type,
  COUNT(*) as total_syncs,
  COUNT(*) FILTER (WHERE status = 'success') as successful_syncs,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
  COUNT(*) FILTER (WHERE status = 'partial') as partial_syncs,
  SUM(records_synced) as total_records_synced,
  AVG(execution_time_ms)::INTEGER as avg_execution_time_ms,
  MAX(execution_time_ms) as max_execution_time_ms
FROM cabify_sync_log
GROUP BY DATE_TRUNC('day', created_at), sync_type
ORDER BY sync_date DESC, sync_type;

COMMENT ON VIEW cabify_sync_health IS 'Resumen diario de salud de sincronizaciones Cabify';

-- Vista: Últimas sincronizaciones
CREATE OR REPLACE VIEW cabify_recent_syncs AS
SELECT
  id,
  sync_type,
  TO_CHAR(period_start, 'YYYY-MM-DD HH24:MI') as period_start,
  TO_CHAR(period_end, 'YYYY-MM-DD HH24:MI') as period_end,
  records_synced,
  status,
  error_message,
  execution_time_ms,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM cabify_sync_log
ORDER BY created_at DESC
LIMIT 50;

COMMENT ON VIEW cabify_recent_syncs IS 'Últimas 50 sincronizaciones de Cabify';

-- Vista: Cobertura histórica por semana
CREATE OR REPLACE VIEW cabify_weekly_coverage AS
SELECT
  DATE_TRUNC('week', fecha_inicio)::DATE as week_start,
  DATE_TRUNC('week', fecha_inicio)::DATE + INTERVAL '6 days' as week_end,
  COUNT(DISTINCT cabify_driver_id) as conductores_unicos,
  COUNT(*) as total_registros,
  SUM(viajes_finalizados) as total_viajes,
  SUM(ganancia_total) as ganancia_total,
  AVG(score) as score_promedio,
  AVG(tasa_aceptacion) as tasa_aceptacion_promedio
FROM cabify_historico
GROUP BY DATE_TRUNC('week', fecha_inicio)
ORDER BY week_start DESC;

COMMENT ON VIEW cabify_weekly_coverage IS 'Resumen de datos Cabify por semana';

-- =====================================================
-- 7. GRANTS Y PERMISOS
-- =====================================================

-- Asegurar que usuarios autenticados puedan leer las vistas
GRANT SELECT ON cabify_sync_health TO authenticated;
GRANT SELECT ON cabify_recent_syncs TO authenticated;
GRANT SELECT ON cabify_weekly_coverage TO authenticated;

-- =====================================================
-- 8. ANÁLISIS Y VACUUM (MANTENIMIENTO)
-- =====================================================

-- Analizar estadísticas de las tablas para el query planner
ANALYZE cabify_historico;
ANALYZE cabify_sync_log;

-- =====================================================
-- FINALIZACIÓN
-- =====================================================

-- Mensaje de confirmación (visible en logs)
DO $$
BEGIN
  RAISE NOTICE '✅ Migración de optimizaciones Cabify completada exitosamente';
  RAISE NOTICE '📊 Índices creados: 5';
  RAISE NOTICE '🔒 Constraint único agregado';
  RAISE NOTICE '📋 Tabla cabify_sync_log creada';
  RAISE NOTICE '⚡ Vistas de monitoreo creadas: 3';
  RAISE NOTICE '🔧 Funciones útiles creadas: 3';
END $$;
