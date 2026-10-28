-- =====================================================
-- Foto diaria de las tarjetas de métricas (traza para comparar vs semana anterior)
-- =====================================================
-- Cada módulo (Conductores, Vehículos, Leads, Asignaciones, Multas) guarda una vez
-- por día y por sede el valor de cada tarjeta, tal cual se ve en pantalla. Con eso:
--   · cada tarjeta muestra "▲ 3 vs sem. ant." comparando con la foto de hace 7 días
--   · queda la historia de todos los indicadores para usarla después (reportes)
-- Si un día nadie abrió el módulo, se compara con la foto más cercana anterior
-- (hasta 10 días atrás). Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS kpi_foto_tarjetas (
  fecha date NOT NULL,
  sede_id uuid,                 -- NULL = "Todas las sedes"
  modulo text NOT NULL,
  metrica text NOT NULL,
  valor numeric NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kpi_foto_tarjetas_uq
  ON kpi_foto_tarjetas (fecha, modulo, metrica, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS kpi_foto_tarjetas_modulo_fecha ON kpi_foto_tarjetas (modulo, fecha);

ALTER TABLE kpi_foto_tarjetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kpi_foto_tarjetas_select ON kpi_foto_tarjetas;
CREATE POLICY kpi_foto_tarjetas_select ON kpi_foto_tarjetas FOR SELECT TO authenticated USING (true);
-- Escritura solo por la función de abajo (valida módulo y valores)

CREATE OR REPLACE FUNCTION guardar_foto_tarjetas(p_modulo text, p_sede_id uuid, p_valores jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_n integer := 0;
  k text;
  v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  IF p_modulo IS NULL OR p_modulo !~ '^[a-z_]{2,40}$' THEN RETURN 0; END IF;
  IF p_valores IS NULL OR jsonb_typeof(p_valores) <> 'object' THEN RETURN 0; END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_valores) LOOP
    CONTINUE WHEN k !~ '^[a-zA-Z0-9_:.-]{1,80}$' OR jsonb_typeof(v) <> 'number';
    INSERT INTO kpi_foto_tarjetas (fecha, sede_id, modulo, metrica, valor, actualizado_en)
    VALUES (v_hoy, p_sede_id, p_modulo, k, (v #>> '{}')::numeric, now())
    ON CONFLICT (fecha, modulo, metrica, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now();
    v_n := v_n + 1;
    EXIT WHEN v_n >= 200;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Valores de la foto de hace 7 días (o la más cercana anterior, hasta 10 días atrás)
CREATE OR REPLACE FUNCTION leer_foto_semana_anterior(p_modulo text, p_sede_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ref AS (
    SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 7 AS d
  ), dia AS (
    SELECT max(f.fecha) AS fecha
    FROM kpi_foto_tarjetas f, ref
    WHERE f.modulo = p_modulo
      AND f.sede_id IS NOT DISTINCT FROM p_sede_id
      AND f.fecha <= ref.d AND f.fecha >= ref.d - 3
  )
  SELECT CASE WHEN dia.fecha IS NULL THEN NULL ELSE jsonb_build_object(
    'fecha', dia.fecha,
    'valores', (SELECT jsonb_object_agg(f.metrica, f.valor) FROM kpi_foto_tarjetas f
                WHERE f.modulo = p_modulo AND f.sede_id IS NOT DISTINCT FROM p_sede_id AND f.fecha = dia.fecha)
  ) END
  FROM dia;
$$;

REVOKE ALL ON FUNCTION guardar_foto_tarjetas(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION leer_foto_semana_anterior(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_foto_tarjetas(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION leer_foto_semana_anterior(text, uuid) TO authenticated;

-- Comprobar (debería existir la tabla, vacía la primera vez)
SELECT count(*) AS fotos FROM kpi_foto_tarjetas;
