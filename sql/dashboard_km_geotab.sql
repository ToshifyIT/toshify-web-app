-- =====================================================
-- RPC: dashboard_km_geotab
-- Km recorridos según la bitácora de Geotab (km por turno), para Dashboard KPI's.
--
-- El dashboard suma este valor al de sum_kilometraje_range / sum_kilometraje_total
-- (acumulado histórico de USS), que se mantienen sin cambios.
--
-- Rango en hora Argentina: [p_start 00:00, p_end + 1 día 00:00). Sin fechas =
-- todo el histórico. Se excluyen los turnos "Sin Actividad" (mismo criterio que
-- el control de exceso de km). Sede: por la patente del vehículo.
--
-- Solo lectura (STABLE, SECURITY INVOKER).
--
-- Para quitarla:
--   DROP FUNCTION IF EXISTS dashboard_km_geotab(date, date, uuid);
-- =====================================================

CREATE OR REPLACE FUNCTION dashboard_km_geotab(
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_sede_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(gb.kilometraje), 0)::numeric
  FROM geotab_bitacora gb
  WHERE gb.estado IS DISTINCT FROM 'Sin Actividad'
    AND (p_start IS NULL OR gb.periodo_inicio >= (p_start::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
    AND (p_end IS NULL OR gb.periodo_inicio < ((p_end + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
    AND (
      p_sede_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM vehiculos v
        WHERE v.sede_id = p_sede_id
          AND upper(regexp_replace(COALESCE(v.patente, ''), '[\s\-.%]', '', 'g'))
            = upper(regexp_replace(COALESCE(gb.patente_normalizada, ''), '[\s\-.%]', '', 'g'))
      )
    )
$$;

GRANT EXECUTE ON FUNCTION dashboard_km_geotab(date, date, uuid) TO authenticated;
