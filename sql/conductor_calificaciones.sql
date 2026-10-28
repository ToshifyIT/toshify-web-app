-- =====================================================
-- Historial de calificaciones (1 a 5 estrellas) por conductor y semana
-- =====================================================
-- Seguimiento de Conductores calcula la calificación de cada conductor
-- (aprovechamiento del auto, ingresos Cabify, deuda y multas). Acá se guarda la de
-- cada SEMANA CERRADA (lunes a domingo), una vez por conductor:
--   · el lunes, la primera persona que abre el panel dispara el cálculo de la
--     semana que terminó y se guarda para todos los conductores
--   · se puede volver a calcular (reemplaza la de esa semana)
-- Deuda y multas son las del momento del cálculo (el lunes); aprovechamiento e
-- ingresos son los de la semana cerrada.
-- Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS conductor_calificaciones (
  semana_inicio date NOT NULL CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1),
  conductor_id uuid NOT NULL,
  estrellas numeric(2, 1) NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  puntaje numeric(5, 4) NOT NULL CHECK (puntaje BETWEEN 0 AND 1),
  parcial boolean NOT NULL DEFAULT false,
  factores jsonb NOT NULL DEFAULT '[]'::jsonb,   -- detalle de cada factor (para el "por qué")
  calculado_por uuid,
  calculado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (semana_inicio, conductor_id)
);

CREATE INDEX IF NOT EXISTS conductor_calificaciones_conductor
  ON conductor_calificaciones (conductor_id, semana_inicio DESC);

ALTER TABLE conductor_calificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conductor_calificaciones_select ON conductor_calificaciones;
CREATE POLICY conductor_calificaciones_select ON conductor_calificaciones
  FOR SELECT TO authenticated USING (true);
-- Escritura solo por la función de abajo

CREATE OR REPLACE FUNCTION guardar_calificaciones_semana(p_semana date, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_n integer := 0;
  f jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  -- Solo semanas cerradas que empiezan en lunes, de hasta 8 semanas atrás
  IF p_semana IS NULL OR EXTRACT(ISODOW FROM p_semana) <> 1 THEN RETURN 0; END IF;
  IF p_semana + 7 > v_hoy OR p_semana < v_hoy - 56 THEN RETURN 0; END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN RETURN 0; END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    CONTINUE WHEN f->>'conductor_id' IS NULL
      OR f->>'conductor_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(f->'estrellas') <> 'number' OR jsonb_typeof(f->'puntaje') <> 'number';
    CONTINUE WHEN (f->>'estrellas')::numeric NOT BETWEEN 1 AND 5 OR (f->>'puntaje')::numeric NOT BETWEEN 0 AND 1;
    INSERT INTO conductor_calificaciones (semana_inicio, conductor_id, estrellas, puntaje, parcial, factores, calculado_por, calculado_en)
    VALUES (
      p_semana,
      (f->>'conductor_id')::uuid,
      (f->>'estrellas')::numeric,
      (f->>'puntaje')::numeric,
      COALESCE((f->>'parcial')::boolean, false),
      CASE WHEN jsonb_typeof(f->'factores') = 'array' THEN f->'factores' ELSE '[]'::jsonb END,
      auth.uid(),
      now()
    )
    ON CONFLICT (semana_inicio, conductor_id) DO UPDATE SET
      estrellas = EXCLUDED.estrellas,
      puntaje = EXCLUDED.puntaje,
      parcial = EXCLUDED.parcial,
      factores = EXCLUDED.factores,
      calculado_por = EXCLUDED.calculado_por,
      calculado_en = now();
    v_n := v_n + 1;
    EXIT WHEN v_n >= 3000;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION guardar_calificaciones_semana(date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_calificaciones_semana(date, jsonb) TO authenticated;

-- Comprobar
SELECT semana_inicio, count(*) AS conductores, round(avg(estrellas), 2) AS promedio
FROM conductor_calificaciones GROUP BY semana_inicio ORDER BY semana_inicio DESC LIMIT 8;
