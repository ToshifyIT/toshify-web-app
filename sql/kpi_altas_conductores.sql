-- sql/kpi_altas_conductores.sql
-- Altas de conductores una por una (día del primer turno + conductor), para poder
-- filtrar el Dashboard General por guía. Misma regla que el CTE "altas" de
-- get_dashboard_kpis_v2 (sql/dashboard_kpis_v2.sql): alta = día del primer turno
-- del conductor, sin internos ni asignaciones canceladas/programadas/pendientes.
--
--   supabase.rpc('kpi_altas_conductores', { p_sede_id, p_desde, p_hasta })
--
-- Se puede correr más de una vez.

CREATE OR REPLACE FUNCTION kpi_altas_conductores(
  p_sede_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (fecha date, conductor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH turnos_cond AS (
    SELECT ac.conductor_id, c.sede_id,
           (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio)
             AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS inicio
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
    JOIN conductores c ON c.id = ac.conductor_id
    WHERE COALESCE(c.apellidos, '') NOT ILIKE '%interno%'
      AND COALESCE(ac.estado, '') NOT ILIKE 'cancel%'
      AND COALESCE(a.estado, '') NOT ILIKE 'cancel%'
      AND COALESCE(a.estado, '') NOT ILIKE 'program%'
      AND COALESCE(a.estado, '') NOT ILIKE 'pendient%'
      AND COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) IS NOT NULL
  )
  SELECT x.inicio AS fecha, x.conductor_id
  FROM (
    SELECT t.conductor_id, t.sede_id, MIN(t.inicio) AS inicio
    FROM turnos_cond t
    GROUP BY t.conductor_id, t.sede_id
  ) x
  WHERE (p_sede_id IS NULL OR x.sede_id = p_sede_id)
    AND (p_desde IS NULL OR x.inicio >= p_desde)
    AND (p_hasta IS NULL OR x.inicio <= p_hasta)
  ORDER BY 1
$fn$;

GRANT EXECUTE ON FUNCTION kpi_altas_conductores(uuid, date, date) TO authenticated;
