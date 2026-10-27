-- =====================================================
-- Dashboard KPI v2 — corrección de kpi_flota_estimada (26/10/2026)
-- Una asignación o un conductor cuenta un día solo si seguía asignado al
-- cierre del día (23:55 hora Argentina, la hora de la foto). Antes contaban
-- también las devoluciones hechas durante ese día.
--
-- Pegar TODO este archivo en el SQL Editor y ejecutarlo. Después:
--   SELECT kpi_reconstruir_flota('2026-09-01', CURRENT_DATE - 1);
-- =====================================================

-- ─────────────────────────────────────────────────────
-- Reconstrucción de días pasados (ver REGLAS > Estimado). Solo lectura.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_flota_estimada(p_desde date, p_hasta date)
RETURNS TABLE (
  fecha date,
  sede_id uuid,
  total_flota integer,
  en_uso integer,
  vehiculos_asignados integer,
  pkg_on_libres integer,
  turnos_totales integer,
  turnos_ocupados integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
dias AS (
  SELECT d::date AS fecha
  FROM generate_series(p_desde, p_hasta, interval '1 day') d
),
veh AS (
  SELECT v.id, v.sede_id,
         UPPER(COALESCE(ve.codigo, '')) AS codigo_actual,
         ve.descripcion AS descr_actual,
         (v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS creado,
         (v.deleted_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS borrado
  FROM vehiculos v
  LEFT JOIN vehiculos_estados ve ON ve.id = v.estado_id
),
asig AS (
  SELECT a.id, a.vehiculo_id, a.sede_id, a.horario,
         (COALESCE(a.fecha_inicio_real, a.fecha_inicio) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS inicio,
         (a.fecha_fin AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fin,
         a.fecha_fin AS fin_ts,
         a.estado IN ('activo', 'activa') AS abierta
  FROM asignaciones a
  WHERE COALESCE(a.fecha_inicio_real, a.fecha_inicio) IS NOT NULL
    AND COALESCE(a.estado, '') NOT ILIKE 'cancel%'
    AND COALESCE(a.estado, '') NOT ILIKE 'program%'
    AND COALESCE(a.estado, '') NOT ILIKE 'pendient%'
),
-- Vigente un día = seguía asignada al CIERRE del día (23:55 hora Argentina,
-- el momento de la foto). Una devolución durante el día ya no cuenta ese día.
-- Un vehículo cuenta con una sola asignación por día: si hay dos, la más reciente.
asig_dia AS (
  SELECT DISTINCT ON (d.fecha, COALESCE(a.vehiculo_id, a.id)) d.fecha, a.*
  FROM dias d
  JOIN asig a
    ON a.inicio <= d.fecha
   AND (a.fin_ts >= ((d.fecha + time '23:55') AT TIME ZONE 'America/Argentina/Buenos_Aires')
        OR (a.fin_ts IS NULL AND a.abierta))
  ORDER BY d.fecha, COALESCE(a.vehiculo_id, a.id), a.inicio DESC, a.id
),
-- Estado según historial_vehiculos; el corte es el fin del día en hora Argentina.
veh_estado AS (
  SELECT d.fecha, v.id, v.sede_id, v.codigo_actual, v.descr_actual,
         COALESCE(
           (SELECT h.estado_nuevo FROM historial_vehiculos h
             WHERE h.vehiculo_id = v.id AND h.estado_nuevo IS NOT NULL
               AND h.created_at < ((d.fecha + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
             ORDER BY h.created_at DESC LIMIT 1),
           (SELECT h.estado_anterior FROM historial_vehiculos h
             WHERE h.vehiculo_id = v.id AND h.estado_anterior IS NOT NULL
               AND h.created_at >= ((d.fecha + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
             ORDER BY h.created_at ASC LIMIT 1)
         ) AS estado_hist
  FROM dias d
  JOIN veh v
    ON (v.creado IS NULL OR v.creado <= d.fecha)
   AND (v.borrado IS NULL OR v.borrado > d.fecha)
),
-- historial_vehiculos guarda el CÓDIGO del estado (TALLER_AXIS, EN_USO...).
-- Se traduce con vehiculos_estados para clasificar igual que la foto:
-- flota por la descripción, en uso / PKG ON por el código.
veh_estado_dia AS (
  SELECT ve.fecha, ve.id, ve.sede_id, ve.estado_hist,
         CASE WHEN ve.estado_hist IS NULL THEN ve.codigo_actual
              ELSE UPPER(COALESCE(est.codigo, ve.estado_hist)) END AS codigo,
         CASE WHEN ve.estado_hist IS NULL THEN ve.descr_actual
              ELSE COALESCE(est.descripcion, ve.estado_hist) END AS descr
  FROM veh_estado ve
  LEFT JOIN LATERAL (
    SELECT e.codigo, e.descripcion
    FROM vehiculos_estados e
    WHERE ve.estado_hist IS NOT NULL
      AND (UPPER(e.codigo) = UPPER(btrim(ve.estado_hist))
           OR lower(btrim(e.descripcion)) = lower(btrim(ve.estado_hist)))
    LIMIT 1
  ) est ON true
),
-- Sin historial para ese día se usa el estado actual, salvo entre EN_USO y
-- PKG_ON_BASE: ahí decide si el vehículo tenía una asignación vigente ese día
-- (un vehículo hoy en uso estaba en PKG ON antes de su primera asignación).
veh_dia AS (
  SELECT ve.fecha, ve.id, ve.sede_id,
         (va.vehiculo_id IS NOT NULL) AS asignado,
         kpi_estado_bucket(ve.descr) IS NOT NULL AS en_flota,
         CASE
           WHEN ve.estado_hist IS NULL AND ve.codigo IN ('EN_USO', 'PKG_ON_BASE')
             THEN CASE WHEN va.vehiculo_id IS NOT NULL THEN 'EN_USO' ELSE 'PKG_ON_BASE' END
           ELSE ve.codigo
         END AS codigo
  FROM veh_estado_dia ve
  LEFT JOIN (SELECT DISTINCT fecha, vehiculo_id FROM asig_dia WHERE vehiculo_id IS NOT NULL) va
    ON va.fecha = ve.fecha AND va.vehiculo_id = ve.id
),
cond AS (
  SELECT ac.asignacion_id,
         CASE
           WHEN ac.horario IN ('diurno', 'DIURNO', 'D') THEN 'D'
           WHEN ac.horario IN ('nocturno', 'NOCTURNO', 'N') THEN 'N'
         END AS turno,
         (ac.fecha_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS inicio,
         ac.fecha_fin AS fin_ts,
         COALESCE(ac.estado, '') NOT IN ('completado', 'finalizado') AS abierto
  FROM asignaciones_conductores ac
  WHERE ac.conductor_id IS NOT NULL
    AND COALESCE(ac.estado, '') NOT ILIKE 'cancel%'
),
-- Por asignación por turno y día: si el turno diurno y el nocturno tenían conductor
turno_dia AS (
  SELECT ad.fecha, ad.sede_id, ad.id,
         COALESCE(bool_or(c.turno = 'D'), false) AS tiene_d,
         COALESCE(bool_or(c.turno = 'N'), false) AS tiene_n
  FROM asig_dia ad
  LEFT JOIN cond c
    ON c.asignacion_id = ad.id
   AND COALESCE(c.inicio, ad.inicio) <= ad.fecha
   AND (COALESCE(c.fin_ts, ad.fin_ts) >= ((ad.fecha + time '23:55') AT TIME ZONE 'America/Argentina/Buenos_Aires')
        OR (COALESCE(c.fin_ts, ad.fin_ts) IS NULL AND c.abierto))
  WHERE ad.horario = 'turno'
  GROUP BY ad.fecha, ad.sede_id, ad.id
),
veh_agg AS (
  SELECT fecha, sede_id,
         COUNT(*) FILTER (WHERE en_flota)::int AS total_flota,
         COUNT(*) FILTER (WHERE codigo = 'EN_USO')::int AS en_uso,
         COUNT(*) FILTER (WHERE codigo = 'PKG_ON_BASE' AND NOT asignado)::int AS pkg_on_libres
  FROM veh_dia
  GROUP BY fecha, sede_id
),
asig_agg AS (
  SELECT fecha, sede_id, COUNT(DISTINCT vehiculo_id)::int AS vehiculos_asignados
  FROM asig_dia
  WHERE vehiculo_id IS NOT NULL
  GROUP BY fecha, sede_id
),
turno_agg AS (
  SELECT fecha, sede_id,
         (COUNT(*) FILTER (WHERE NOT tiene_d) + COUNT(*) FILTER (WHERE NOT tiene_n))::int AS vacantes
  FROM turno_dia
  GROUP BY fecha, sede_id
),
claves AS (
  SELECT fecha, sede_id FROM veh_agg
  UNION
  SELECT fecha, sede_id FROM asig_agg
),
por_dia AS (
  SELECT k.fecha, k.sede_id,
         COALESCE(v.total_flota, 0) AS total_flota,
         COALESCE(v.en_uso, 0) AS en_uso,
         COALESCE(a.vehiculos_asignados, 0) AS vehiculos_asignados,
         COALESCE(v.pkg_on_libres, 0) AS pkg_on_libres,
         COALESCE(t.vacantes, 0) AS vacantes
  FROM claves k
  LEFT JOIN veh_agg v ON v.fecha = k.fecha AND v.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN asig_agg a ON a.fecha = k.fecha AND a.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN turno_agg t ON t.fecha = k.fecha AND t.sede_id IS NOT DISTINCT FROM k.sede_id
)
SELECT
  p.fecha,
  p.sede_id,
  p.total_flota,
  p.en_uso,
  p.vehiculos_asignados,
  p.pkg_on_libres,
  (p.vehiculos_asignados + p.pkg_on_libres) * 2 AS turnos_totales,
  GREATEST((p.vehiculos_asignados + p.pkg_on_libres) * 2 - (p.vacantes + p.pkg_on_libres * 2), 0) AS turnos_ocupados
FROM por_dia p
$$;

REVOKE EXECUTE ON FUNCTION kpi_flota_estimada(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kpi_flota_estimada(date, date) TO authenticated;

-- Control: tiene que devolver true
SELECT position('23:55' IN pg_get_functiondef('kpi_flota_estimada(date,date)'::regprocedure)) > 0 AS version_nueva;
