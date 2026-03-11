-- =====================================================
-- RPC: get_cabify_datos_por_semanas
-- Obtiene cobro_app y cobro_efectivo de cabify_historico
-- para un conjunto de conductores y semanas.
--
-- Lógica:
--   - Semana actual: busca el registro del día de hoy
--   - Semanas anteriores: busca el registro del domingo de esa semana
--   - Match por DNI (principal), fallback por nombre+apellido
--   - Si hay duplicados por día, toma el de fecha_guardado más reciente
--   - Las columnas app/efectivo/total de guias_historial_semanal
--     se mantienen como fallback manual (Opción A)
--
-- Uso desde frontend:
--   supabase.rpc('get_cabify_datos_por_semanas', {
--     p_conductor_ids: ['uuid1', 'uuid2'],
--     p_semanas: ['2025-W10', '2025-W09']
--   })
-- =====================================================

CREATE OR REPLACE FUNCTION get_cabify_datos_por_semanas(
  p_conductor_ids UUID[],
  p_semanas TEXT[]
)
RETURNS TABLE(
  id_conductor UUID,
  semana TEXT,
  cobro_app NUMERIC,
  cobro_efectivo NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_semana TEXT;
  v_fecha_objetivo DATE;
  v_current_week TEXT;
  v_year INT;
  v_week INT;
  v_monday_w1 DATE;
  v_monday DATE;
BEGIN
  -- Calcular semana ISO actual para comparación
  v_current_week := to_char(CURRENT_DATE, 'IYYY') || '-W' || lpad(to_char(CURRENT_DATE, 'IW')::TEXT, 2, '0');

  -- Tabla temporal para acumular resultados
  CREATE TEMP TABLE IF NOT EXISTS _cabify_semana_results (
    id_conductor UUID,
    semana TEXT,
    cobro_app NUMERIC,
    cobro_efectivo NUMERIC
  ) ON COMMIT DROP;

  DELETE FROM _cabify_semana_results;

  FOREACH v_semana IN ARRAY p_semanas
  LOOP
    -- Parsear semana: "2025-W10" → year=2025, week=10
    v_year := split_part(v_semana, '-W', 1)::INT;
    v_week := split_part(v_semana, '-W', 2)::INT;

    -- Calcular fecha objetivo
    IF v_semana = v_current_week THEN
      -- Semana actual: buscar el registro de HOY
      v_fecha_objetivo := CURRENT_DATE;
    ELSE
      -- Semana anterior: buscar el registro del DOMINGO de esa semana
      -- date_trunc('week', ...) retorna el lunes en PostgreSQL
      v_monday_w1 := date_trunc('week', make_date(v_year, 1, 4))::DATE;
      v_monday := v_monday_w1 + ((v_week - 1) * 7);
      v_fecha_objetivo := v_monday + 6; -- Domingo
    END IF;

    -- =========================================================
    -- PASS 1: Match por DNI (normalizado, sin puntos ni guiones)
    -- DISTINCT ON toma el registro con fecha_guardado más reciente
    -- =========================================================
    INSERT INTO _cabify_semana_results
    SELECT DISTINCT ON (c.id)
      c.id,
      v_semana,
      COALESCE(ch.cobro_app, 0),
      COALESCE(ch.cobro_efectivo, 0)
    FROM unnest(p_conductor_ids) AS cid(id)
    JOIN conductores c ON c.id = cid.id
    JOIN cabify_historico ch ON
      REPLACE(REPLACE(ch.dni, '.', ''), '-', '') = REPLACE(REPLACE(c.numero_dni::TEXT, '.', ''), '-', '')
      AND ch.fecha_inicio::DATE = v_fecha_objetivo
    WHERE c.numero_dni IS NOT NULL
      AND TRIM(c.numero_dni::TEXT) != ''
    ORDER BY c.id, ch.fecha_guardado DESC NULLS LAST;

    -- =========================================================
    -- PASS 2: Fallback por nombre+apellido para los no encontrados
    -- =========================================================
    INSERT INTO _cabify_semana_results
    SELECT DISTINCT ON (c.id)
      c.id,
      v_semana,
      COALESCE(ch.cobro_app, 0),
      COALESCE(ch.cobro_efectivo, 0)
    FROM unnest(p_conductor_ids) AS cid(id)
    JOIN conductores c ON c.id = cid.id
    JOIN cabify_historico ch ON
      LOWER(TRIM(ch.nombre)) = LOWER(TRIM(c.nombres))
      AND LOWER(TRIM(ch.apellido)) = LOWER(TRIM(c.apellidos))
      AND ch.fecha_inicio::DATE = v_fecha_objetivo
    WHERE NOT EXISTS (
      SELECT 1 FROM _cabify_semana_results r
      WHERE r.id_conductor = c.id AND r.semana = v_semana
    )
    ORDER BY c.id, ch.fecha_guardado DESC NULLS LAST;

  END LOOP;

  RETURN QUERY SELECT r.id_conductor, r.semana, r.cobro_app, r.cobro_efectivo FROM _cabify_semana_results r;

  DROP TABLE IF EXISTS _cabify_semana_results;
END;
$$;
