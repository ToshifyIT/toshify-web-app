-- =====================================================
-- Dashboard KPI v2 (Reportes > Dashboard KPI v2)
-- Los cuatro indicadores que mueven el negocio, comparados contra el
-- forecast y contra el período anterior:
--   1. % Ocupación      turnos ocupados / turnos totales
--   2. % Operatividad   vehículos EN USO / total flota
--   3. Facturación      facturado neto de la semana (facturacion_conductores)
--   4. Cobranza         cobrado / facturado neto
--
-- PIEZAS
--   kpi_estado_bucket(text)          helper: estado de vehículo -> grupo de flota
--   kpi_flota_diaria (tabla)         una fila por día y sede con la flota y los turnos
--   kpi_flota_actual()               foto de HOY (mismas reglas que Estado de Flota)
--   kpi_flota_estimada(desde, hasta) reconstrucción de días pasados
--   kpi_capturar_foto_flota()        guarda la foto de hoy (correr una vez por día)
--   kpi_reconstruir_flota(desde, hasta) guarda las estimaciones (correr una vez)
--   kpi_forecast (tabla)             objetivos por semana que carga dirección
--   kpi_guardar_forecast(...)        guarda el archivo de forecast que se sube desde la pantalla
--   get_dashboard_kpis_v2(sede, desde, hasta)  lo que lee la pantalla
--
-- PUESTA EN MARCHA (SQL Editor de Supabase, en este orden)
--   1. Ejecutar este archivo completo.
--   2. Reconstruir el histórico una sola vez (ajustar la fecha de inicio):
--        SELECT kpi_reconstruir_flota('2026-09-01', CURRENT_DATE - 1);
--   3. Guardar la foto de hoy y programarla todos los días (sección PROGRAMACIÓN
--      al final del archivo).
--   4. Menú: sql/dashboard_kpis_v2_menu.sql.
--
-- REGLAS
--   Foto (origen 'foto'): exacta, igual que la tarjeta de Estado de Flota.
--     Total flota  = vehículos en uso, PKG ON, PKG OFF (Base y Francia), taller
--                    mecánico o de chapa y pintura y retenidos en comisaría.
--     Turnos       = (vehículos con asignación activa + PKG ON sin asignación) x 2.
--     Disponibles  = vacantes diurnas y nocturnas de asignaciones por turno
--                    + PKG ON sin asignación x 2. Ocupados = turnos - disponibles.
--     Operatividad = vehículos EN USO / total flota.
--   Estimado (origen 'estimado'): los días anteriores a la primera foto no
--     tienen registro, así que se reconstruyen con los datos que sí tienen fecha:
--     - Estado del vehículo ese día: último estado_nuevo de historial_vehiculos
--       hasta ese día; si no hay, el estado_anterior del primer cambio posterior;
--       si tampoco, el estado actual. Entre "en uso" y "PKG ON" decide siempre
--       si tenía una asignación vigente al cierre del día. Solo vehículos ya
--       creados y no borrados.
--     - Asignación vigente ese día: no cancelada ni solo programada, con inicio
--       (fecha_inicio_real o fecha_inicio) hasta ese día y que seguía al cierre
--       del día (fecha_fin a partir de las 23:55 hora Argentina, la hora de la
--       foto) o todavía abierta. Una devolución durante el día no cuenta ese día.
--     - Conductor en el turno ese día: no cancelado, con inicio hasta ese día y
--       que seguía al cierre del día o abierto.
--     Una estimación nunca pisa una foto.
--   Facturación: períodos de facturación de la semana (abiertos o cerrados).
--     Facturado = alquiler (subtotal_alquiler) + garantía (subtotal_garantia)
--     + Toshipass (detalle P027). No incluye peajes, multas ni otros cargos,
--     ni saldo anterior ni mora.
--     Cobrado = pagos de facturación semanal vinculados a esas facturaciones
--     (pagos_conductores.referencia_id), sean Cabify o manuales. Se usa el
--     vínculo y no la columna semana porque los pagos de Cabify guardan la
--     semana en que se cobra, no la facturada.
--     Para la vista mensual, cada semana se reparte en partes iguales entre sus
--     días (fecha_inicio a fecha_fin del período).
--   Todas las sedes: excluye las sedes solo_admin (p. ej. "Pruebas"), igual que
--     el selector de sede.
--
-- Para quitarlo:
--   DROP FUNCTION IF EXISTS get_dashboard_kpis_v2(uuid, date, date);
--   DROP FUNCTION IF EXISTS kpi_actualizar();
--   DROP FUNCTION IF EXISTS kpi_recalcular(date, date);
--   DROP TABLE IF EXISTS kpi_bajas;
--   DROP TABLE IF EXISTS kpi_diario;
--   (y SELECT cron.unschedule('kpi-actualizar');)
--   DROP FUNCTION IF EXISTS kpi_guardar_forecast(uuid, jsonb, text[], text);
--   DROP FUNCTION IF EXISTS kpi_puede_editar_forecast();
--   DROP FUNCTION IF EXISTS kpi_reconstruir_flota(date, date);
--   DROP FUNCTION IF EXISTS kpi_capturar_foto_flota();
--   DROP FUNCTION IF EXISTS kpi_flota_estimada(date, date);
--   DROP FUNCTION IF EXISTS kpi_flota_actual();
--   DROP FUNCTION IF EXISTS kpi_estado_bucket(text);
--   DROP TABLE IF EXISTS kpi_forecast;
--   DROP TABLE IF EXISTS kpi_flota_diaria;
--   (y la tarea programada, si se creó con pg_cron: SELECT cron.unschedule('kpi-foto-flota');)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- Helper: grupo de flota a partir del estado del vehículo.
-- Acepta el código (EN_USO, PKG_ON_BASE) o la descripción ("En uso",
-- "PKG ON Base"), porque historial_vehiculos puede guardar cualquiera de los dos.
-- Devuelve en_uso | pkg_on | pkg_off | taller | retenido | NULL (fuera de flota).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_estado_bucket(p_estado text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d = 'en uso' THEN 'en_uso'
    WHEN d LIKE 'pkg on%' THEN 'pkg_on'
    WHEN d LIKE '%pkg off%' AND (d LIKE '%base%' OR d LIKE '%franc%') THEN 'pkg_off'
    WHEN d LIKE '%taller%' AND (d LIKE '%mecanic%' OR d LIKE '%chapa%' OR d LIKE '%pintura%') THEN 'taller'
    WHEN d LIKE '%retenido%' OR d LIKE '%comisar%' THEN 'retenido'
  END
  FROM (
    SELECT btrim(regexp_replace(
      translate(lower(replace(COALESCE(p_estado, ''), '_', ' ')), 'áéíóúüñ', 'aeiouun'),
      '\s+', ' ', 'g')) AS d
  ) x
$$;

-- ─────────────────────────────────────────────────────
-- Tabla: flota y turnos por día y sede
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_flota_diaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  sede_id uuid,
  total_flota integer NOT NULL DEFAULT 0,
  en_uso integer NOT NULL DEFAULT 0,
  vehiculos_asignados integer NOT NULL DEFAULT 0,
  pkg_on_libres integer NOT NULL DEFAULT 0,
  turnos_totales integer NOT NULL DEFAULT 0,
  turnos_ocupados integer NOT NULL DEFAULT 0,
  origen text NOT NULL CHECK (origen IN ('foto', 'estimado')),
  capturado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kpi_flota_diaria_fecha_sede_uq
  ON kpi_flota_diaria (fecha, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)));

ALTER TABLE kpi_flota_diaria ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios logueados; la escritura es solo por las funciones de
-- captura y reconstrucción (SECURITY DEFINER, sin acceso desde el navegador).
DROP POLICY IF EXISTS kpi_flota_diaria_select ON kpi_flota_diaria;
CREATE POLICY kpi_flota_diaria_select ON kpi_flota_diaria
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────
-- Tabla: forecast semanal (lo carga dirección desde la pantalla)
-- semana_inicio = lunes de la semana. sede_id NULL = objetivo de todas las sedes.
-- Porcentajes en 0-100. facturacion = facturado neto esperado de la semana (ARS).
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1),
  sede_id uuid,
  flota integer CHECK (flota IS NULL OR flota >= 0),
  ocupacion numeric(5, 2) CHECK (ocupacion IS NULL OR ocupacion BETWEEN 0 AND 100),
  operatividad numeric(5, 2) CHECK (operatividad IS NULL OR operatividad BETWEEN 0 AND 100),
  facturacion numeric(14, 2) CHECK (facturacion IS NULL OR facturacion >= 0),
  cobranza numeric(5, 2) CHECK (cobranza IS NULL OR cobranza BETWEEN 0 AND 200),
  actualizado_por text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kpi_forecast_semana_sede_uq
  ON kpi_forecast (semana_inicio, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)));

ALTER TABLE kpi_forecast ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_forecast_select ON kpi_forecast;
CREATE POLICY kpi_forecast_select ON kpi_forecast
  FOR SELECT TO authenticated USING (true);

-- Escribir el forecast: solo admin o quien puede editar el submenú
-- dashboard-kpis-v2 (mismo criterio que el botón de la pantalla).
-- Sin política de DELETE: no se borra desde la app.
CREATE OR REPLACE FUNCTION kpi_puede_editar_forecast()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Admin por rol
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.name = 'admin'
  ) INTO v_ok;
  IF v_ok THEN RETURN true; END IF;

  -- Permiso de editar el submenú por rol
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles up
    JOIN role_submenu_permissions rsp ON rsp.role_id = up.role_id
    JOIN submenus s ON s.id = rsp.submenu_id
    WHERE up.id = auth.uid() AND s.name = 'dashboard-kpis-v2' AND rsp.can_edit
  ) INTO v_ok;
  IF v_ok THEN RETURN true; END IF;

  -- Permiso por usuario (si la tabla existe)
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1 FROM user_submenu_permissions usp
        JOIN submenus s ON s.id = usp.submenu_id
        WHERE usp.user_id = $1 AND s.name = ''dashboard-kpis-v2'' AND usp.can_edit
      )' INTO v_ok USING auth.uid();
  END IF;
  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION kpi_puede_editar_forecast() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kpi_puede_editar_forecast() TO authenticated;

DROP POLICY IF EXISTS kpi_forecast_write ON kpi_forecast;
DROP POLICY IF EXISTS kpi_forecast_insert ON kpi_forecast;
CREATE POLICY kpi_forecast_insert ON kpi_forecast
  FOR INSERT TO authenticated WITH CHECK (kpi_puede_editar_forecast());
DROP POLICY IF EXISTS kpi_forecast_update ON kpi_forecast;
CREATE POLICY kpi_forecast_update ON kpi_forecast
  FOR UPDATE TO authenticated USING (kpi_puede_editar_forecast()) WITH CHECK (kpi_puede_editar_forecast());

-- ─────────────────────────────────────────────────────
-- Guarda el forecast que se sube desde la pantalla (todo o nada).
-- p_filas: [{semana_inicio, flota, ocupacion, operatividad, facturacion, cobranza}]
-- p_columnas: columnas que trae el archivo. Solo esas se actualizan; una celda
-- vacía no borra lo cargado. Las demás columnas quedan como estaban.
-- SECURITY INVOKER: respeta las políticas de kpi_forecast.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_guardar_forecast(
  p_sede_id uuid,
  p_filas jsonb,
  p_columnas text[],
  p_usuario text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_filas integer;
  v_usuario text;
BEGIN
  IF NOT kpi_puede_editar_forecast() THEN
    RAISE EXCEPTION 'Sin permiso para cargar el forecast (editar el submenú Dashboard KPI v2).'
      USING ERRCODE = '42501';
  END IF;

  -- Quién cargó: del perfil del usuario logueado, no de lo que mande el navegador.
  SELECT COALESCE(up.full_name, up.email, p_usuario) INTO v_usuario
  FROM user_profiles up WHERE up.id = auth.uid();
  v_usuario := COALESCE(v_usuario, p_usuario);

  INSERT INTO kpi_forecast AS k (
    semana_inicio, sede_id, flota, ocupacion, operatividad, facturacion, cobranza,
    actualizado_por, updated_at
  )
  SELECT x.semana_inicio, p_sede_id, x.flota, x.ocupacion, x.operatividad, x.facturacion, x.cobranza,
         v_usuario, now()
  FROM jsonb_to_recordset(p_filas) AS x(
    semana_inicio date,
    flota integer,
    ocupacion numeric,
    operatividad numeric,
    facturacion numeric,
    cobranza numeric
  )
  ON CONFLICT (semana_inicio, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  DO UPDATE SET
    flota = CASE WHEN 'flota' = ANY (p_columnas) THEN COALESCE(EXCLUDED.flota, k.flota) ELSE k.flota END,
    ocupacion = CASE WHEN 'ocupacion' = ANY (p_columnas) THEN COALESCE(EXCLUDED.ocupacion, k.ocupacion) ELSE k.ocupacion END,
    operatividad = CASE WHEN 'operatividad' = ANY (p_columnas) THEN COALESCE(EXCLUDED.operatividad, k.operatividad) ELSE k.operatividad END,
    facturacion = CASE WHEN 'facturacion' = ANY (p_columnas) THEN COALESCE(EXCLUDED.facturacion, k.facturacion) ELSE k.facturacion END,
    cobranza = CASE WHEN 'cobranza' = ANY (p_columnas) THEN COALESCE(EXCLUDED.cobranza, k.cobranza) ELSE k.cobranza END,
    actualizado_por = EXCLUDED.actualizado_por,
    updated_at = now();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;

-- ─────────────────────────────────────────────────────
-- Foto de HOY por sede (misma regla que Estado de Flota y que hoy_snapshot
-- del Dashboard Directivo). Solo lectura, respeta RLS.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_flota_actual()
RETURNS TABLE (
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
veh AS (
  SELECT v.id, v.sede_id,
         UPPER(COALESCE(ve.codigo, '')) AS codigo,
         kpi_estado_bucket(ve.descripcion) AS bucket
  FROM vehiculos v
  LEFT JOIN vehiculos_estados ve ON ve.id = v.estado_id
  WHERE v.deleted_at IS NULL
),
asig AS (
  SELECT a.id, a.vehiculo_id, a.horario, a.sede_id
  FROM asignaciones a
  WHERE a.estado IN ('activo', 'activa')
),
asig_turno AS (
  SELECT a.sede_id,
         EXISTS (SELECT 1 FROM asignaciones_conductores ac
                 WHERE ac.asignacion_id = a.id
                   AND ac.conductor_id IS NOT NULL
                   AND ac.horario IN ('diurno', 'DIURNO', 'D')
                   AND COALESCE(ac.estado, '') NOT IN ('cancelado', 'completado', 'finalizado')) AS tiene_d,
         EXISTS (SELECT 1 FROM asignaciones_conductores ac
                 WHERE ac.asignacion_id = a.id
                   AND ac.conductor_id IS NOT NULL
                   AND ac.horario IN ('nocturno', 'NOCTURNO', 'N')
                   AND COALESCE(ac.estado, '') NOT IN ('cancelado', 'completado', 'finalizado')) AS tiene_n
  FROM asig a
  WHERE a.horario = 'turno'
),
sedes_x AS (
  SELECT sede_id FROM veh
  UNION
  SELECT sede_id FROM asig
),
por_sede AS (
  SELECT
    s.sede_id,
    (SELECT COUNT(*) FROM veh v WHERE v.sede_id IS NOT DISTINCT FROM s.sede_id AND v.bucket IS NOT NULL)::int AS total_flota,
    (SELECT COUNT(*) FROM veh v WHERE v.sede_id IS NOT DISTINCT FROM s.sede_id AND v.codigo = 'EN_USO')::int AS en_uso,
    (SELECT COUNT(DISTINCT a.vehiculo_id) FROM asig a
      WHERE a.sede_id IS NOT DISTINCT FROM s.sede_id AND a.vehiculo_id IS NOT NULL)::int AS vehiculos_asignados,
    (SELECT COUNT(*) FROM veh v
      WHERE v.sede_id IS NOT DISTINCT FROM s.sede_id
        AND v.codigo = 'PKG_ON_BASE'
        AND NOT EXISTS (SELECT 1 FROM asig a WHERE a.vehiculo_id = v.id))::int AS pkg_on_libres,
    (SELECT COUNT(*) FILTER (WHERE NOT t.tiene_d) + COUNT(*) FILTER (WHERE NOT t.tiene_n)
       FROM asig_turno t WHERE t.sede_id IS NOT DISTINCT FROM s.sede_id)::int AS vacantes
  FROM sedes_x s
)
SELECT
  p.sede_id,
  p.total_flota,
  p.en_uso,
  p.vehiculos_asignados,
  p.pkg_on_libres,
  (p.vehiculos_asignados + p.pkg_on_libres) * 2 AS turnos_totales,
  GREATEST((p.vehiculos_asignados + p.pkg_on_libres) * 2 - (p.vacantes + p.pkg_on_libres * 2), 0) AS turnos_ocupados
FROM por_sede p
$$;

-- Índice que acelera la reconstrucción: NO se crea acá para no bloquear
-- historial_vehiculos. Correrlo aparte, solo, fuera de una transacción:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS historial_vehiculos_vehiculo_fecha_idx
--     ON historial_vehiculos (vehiculo_id, created_at);

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
-- Entre EN_USO y PKG_ON_BASE decide si el vehículo tenía una asignación
-- vigente al cierre del día: no siempre queda registrado en el historial el
-- cambio de estado al asignar o al devolver.
veh_dia AS (
  SELECT ve.fecha, ve.id, ve.sede_id,
         (va.vehiculo_id IS NOT NULL) AS asignado,
         kpi_estado_bucket(ve.descr) IS NOT NULL AS en_flota,
         CASE
           WHEN ve.codigo IN ('EN_USO', 'PKG_ON_BASE')
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

-- ─────────────────────────────────────────────────────
-- Guarda la foto de HOY (hora Argentina). Si ya había una del día, la
-- reemplaza (queda la última captura). Pisa una estimación del mismo día.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_capturar_foto_flota()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_filas integer;
BEGIN
  INSERT INTO kpi_flota_diaria AS k (
    fecha, sede_id, total_flota, en_uso, vehiculos_asignados, pkg_on_libres,
    turnos_totales, turnos_ocupados, origen, capturado_en
  )
  SELECT v_hoy, f.sede_id, f.total_flota, f.en_uso, f.vehiculos_asignados, f.pkg_on_libres,
         f.turnos_totales, f.turnos_ocupados, 'foto', now()
  FROM kpi_flota_actual() f
  ON CONFLICT (fecha, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  DO UPDATE SET
    total_flota = EXCLUDED.total_flota,
    en_uso = EXCLUDED.en_uso,
    vehiculos_asignados = EXCLUDED.vehiculos_asignados,
    pkg_on_libres = EXCLUDED.pkg_on_libres,
    turnos_totales = EXCLUDED.turnos_totales,
    turnos_ocupados = EXCLUDED.turnos_ocupados,
    origen = 'foto',
    capturado_en = now();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;

-- ─────────────────────────────────────────────────────
-- Guarda estimaciones para días pasados sin foto. Nunca pisa una foto; si el
-- día ya tenía una estimación, la recalcula. Devuelve las filas escritas.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_reconstruir_flota(p_desde date, p_hasta date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_hasta date := LEAST(p_hasta, v_hoy - 1);
  v_filas integer;
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > v_hasta THEN
    RAISE EXCEPTION 'Rango inválido: desde % hasta % (el día de hoy se guarda con la foto).', p_desde, p_hasta;
  END IF;

  -- Estimaciones previas del rango que la nueva no vuelva a producir
  DELETE FROM kpi_flota_diaria
  WHERE origen = 'estimado' AND fecha BETWEEN p_desde AND v_hasta;

  INSERT INTO kpi_flota_diaria AS k (
    fecha, sede_id, total_flota, en_uso, vehiculos_asignados, pkg_on_libres,
    turnos_totales, turnos_ocupados, origen, capturado_en
  )
  SELECT e.fecha, e.sede_id, e.total_flota, e.en_uso, e.vehiculos_asignados, e.pkg_on_libres,
         e.turnos_totales, e.turnos_ocupados, 'estimado', now()
  FROM kpi_flota_estimada(p_desde, v_hasta) e
  ON CONFLICT (fecha, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  DO UPDATE SET
    total_flota = EXCLUDED.total_flota,
    en_uso = EXCLUDED.en_uso,
    vehiculos_asignados = EXCLUDED.vehiculos_asignados,
    pkg_on_libres = EXCLUDED.pkg_on_libres,
    turnos_totales = EXCLUDED.turnos_totales,
    turnos_ocupados = EXCLUDED.turnos_ocupados,
    capturado_en = now()
  WHERE k.origen = 'estimado';

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;

-- Las funciones que escriben no se pueden llamar desde el navegador.
REVOKE ALL ON FUNCTION kpi_capturar_foto_flota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION kpi_reconstruir_flota(date, date) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────
-- Tablas de resultados precalculados (la pantalla solo lee estas tablas).
-- kpi_diario: facturación, cobranza, conductores e ingresos por día y sede.
-- kpi_bajas:  una fila por conductor dado de baja, con su motivo.
-- Las llena kpi_recalcular (tarea programada cada hora).
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_diario (
  fecha date NOT NULL,
  sede_id uuid,
  vi integer NOT NULL DEFAULT 0,   -- vehículos ingresados
  fn numeric,                      -- facturado (alquiler + garantía + Toshipass), repartido por día
  ac numeric,                      -- a cobrar (total a pagar), repartido por día
  co numeric,                      -- cobrado (Cabify + manual), repartido por día
  cc numeric,                      -- cobrado por Cabify
  fa numeric,                      -- alquiler
  fg numeric,                      -- garantía
  ft numeric,                      -- Toshipass
  pe text,                         -- estado del período de facturación (abierto | cerrado)
  cd integer,                      -- conductores manejando al cierre del día
  al integer NOT NULL DEFAULT 0,   -- altas (primer turno)
  ba integer NOT NULL DEFAULT 0,   -- bajas
  calculado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kpi_diario_fecha_sede_uq
  ON kpi_diario (fecha, (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)));

CREATE TABLE IF NOT EXISTS kpi_bajas (
  fecha date NOT NULL,
  sede_id uuid,
  conductor_id uuid NOT NULL,
  motivo text
);

CREATE INDEX IF NOT EXISTS kpi_bajas_fecha_idx ON kpi_bajas (fecha);

ALTER TABLE kpi_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_bajas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_diario_select ON kpi_diario;
CREATE POLICY kpi_diario_select ON kpi_diario FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS kpi_bajas_select ON kpi_bajas;
CREATE POLICY kpi_bajas_select ON kpi_bajas FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────
-- Recalcula kpi_diario y kpi_bajas para un rango de días (todas las sedes).
-- Reemplaza lo que había en ese rango. Corre en la tarea programada.
-- Se excluyen los conductores comodín del equipo (apellido INTERNO).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_recalcular(p_desde date, p_hasta date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_desde date := p_desde;
  v_hasta date := LEAST(p_hasta, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
  v_filas integer;
BEGIN
  IF v_desde IS NULL OR v_hasta IS NULL OR v_desde > v_hasta THEN
    RAISE EXCEPTION 'Rango inválido: % a %', p_desde, p_hasta;
  END IF;

  DELETE FROM kpi_diario WHERE fecha BETWEEN v_desde AND v_hasta;
  DELETE FROM kpi_bajas WHERE fecha BETWEEN v_desde AND v_hasta;

  -- Bajas: historial de bajas; si un conductor no tiene historial, su fecha de
  -- terminación. Una por conductor y día.
  INSERT INTO kpi_bajas (fecha, sede_id, conductor_id, motivo)
  SELECT DISTINCT ON (b.conductor_id, b.fecha) b.fecha, b.sede_id, b.conductor_id, b.motivo
  FROM (
    SELECT hb.conductor_id, c.sede_id,
           COALESCE(hb.fecha_terminacion_nueva, (hb.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS fecha,
           NULLIF(btrim(hb.motivo_baja), '') AS motivo,
           hb.created_at AS orden
    FROM conductores_historial_bajas hb
    JOIN conductores c ON c.id = hb.conductor_id
    WHERE hb.tipo_evento = 'baja'
      AND COALESCE(c.apellidos, '') NOT ILIKE '%interno%'
    UNION ALL
    SELECT c.id, c.sede_id, c.fecha_terminacion, NULLIF(btrim(c.motivo_baja), ''), '-infinity'::timestamptz
    FROM conductores c
    WHERE c.fecha_terminacion IS NOT NULL
      AND COALESCE(c.apellidos, '') NOT ILIKE '%interno%'
      AND NOT EXISTS (SELECT 1 FROM conductores_historial_bajas hb
                      WHERE hb.conductor_id = c.id AND hb.tipo_evento = 'baja')
  ) b
  WHERE b.fecha BETWEEN v_desde AND v_hasta
  ORDER BY b.conductor_id, b.fecha, b.orden DESC;

  INSERT INTO kpi_diario (fecha, sede_id, vi, fn, ac, co, cc, fa, fg, ft, pe, cd, al, ba, calculado_en)
  WITH
  ingresos AS (
    SELECT (v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha, v.sede_id,
           COUNT(*)::int AS vi
    FROM vehiculos v
    WHERE v.deleted_at IS NULL
      AND (v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN v_desde AND v_hasta
    GROUP BY 1, 2
  ),
  periodos AS (
    SELECT pf.id, pf.estado, pf.sede_id, pf.fecha_inicio::date AS inicio, pf.fecha_fin::date AS fin
    FROM periodos_facturacion pf
    WHERE pf.estado IN ('abierto', 'procesando', 'cerrado')
      AND pf.fecha_inicio::date <= v_hasta
      AND pf.fecha_fin::date >= v_desde
  ),
  fact AS (
    SELECT fc.periodo_id, fc.id,
           COALESCE(fc.total_a_pagar, 0) AS a_cobrar,
           COALESCE(fc.subtotal_alquiler, 0) AS alquiler,
           COALESCE(fc.subtotal_garantia, 0) AS garantia
    FROM facturacion_conductores fc
    WHERE fc.periodo_id IN (SELECT id FROM periodos)
  ),
  detalle AS (
    SELECT fd.facturacion_id::text AS fact_id,
           SUM(fd.total) FILTER (WHERE upper(btrim(fd.concepto_codigo)) = 'P027') AS toshipass
    FROM facturacion_detalle fd
    JOIN fact f ON f.id::text = fd.facturacion_id::text
    GROUP BY fd.facturacion_id::text
  ),
  cobros AS (
    SELECT pc.referencia_id::text AS fact_id,
           SUM(COALESCE(pc.monto, 0)) AS cobrado,
           SUM(COALESCE(pc.monto, 0)) FILTER (WHERE COALESCE(pc.referencia, '') ILIKE '%cabify%') AS cabify
    FROM pagos_conductores pc
    JOIN fact f ON f.id::text = pc.referencia_id::text
    WHERE pc.tipo_cobro = 'facturacion_semanal'
      AND COALESCE(pc.referencia_tabla, 'facturacion_conductores') = 'facturacion_conductores'
    GROUP BY pc.referencia_id::text
  ),
  por_periodo AS (
    SELECT pe.id, pe.estado, pe.sede_id, pe.inicio, pe.fin,
           GREATEST(pe.fin - pe.inicio + 1, 1) AS n_dias,
           COALESCE(SUM(f.a_cobrar), 0) AS a_cobrar,
           COALESCE(SUM(c.cobrado), 0) AS cobrado,
           COALESCE(SUM(c.cabify), 0) AS cabify,
           COALESCE(SUM(f.alquiler), 0) AS alquiler,
           COALESCE(SUM(f.garantia), 0) AS garantia,
           COALESCE(SUM(dt.toshipass), 0) AS toshipass
    FROM periodos pe
    LEFT JOIN fact f ON f.periodo_id = pe.id
    LEFT JOIN cobros c ON c.fact_id = f.id::text
    LEFT JOIN detalle dt ON dt.fact_id = f.id::text
    GROUP BY pe.id, pe.estado, pe.sede_id, pe.inicio, pe.fin
  ),
  -- Cada semana de facturación se reparte en partes iguales entre sus días
  fact_dia AS (
    SELECT g.fecha::date AS fecha, pp.sede_id,
           SUM((pp.alquiler + pp.garantia + pp.toshipass) / pp.n_dias) AS fn,
           SUM(pp.a_cobrar / pp.n_dias) AS ac,
           SUM(pp.cobrado / pp.n_dias) AS co,
           SUM(pp.cabify / pp.n_dias) AS cc,
           SUM(pp.alquiler / pp.n_dias) AS fa,
           SUM(pp.garantia / pp.n_dias) AS fg,
           SUM(pp.toshipass / pp.n_dias) AS ft,
           MIN(CASE WHEN pp.estado = 'cerrado' THEN 'cerrado' ELSE 'abierto' END) AS pe
    FROM por_periodo pp
    CROSS JOIN LATERAL generate_series(GREATEST(pp.inicio, v_desde), LEAST(pp.fin, v_hasta), interval '1 day') AS g(fecha)
    GROUP BY 1, 2
  ),
  cond_ok AS (
    SELECT c.id, c.sede_id
    FROM conductores c
    WHERE COALESCE(c.apellidos, '') NOT ILIKE '%interno%'
  ),
  turnos_cond AS (
    SELECT ac.conductor_id, co.sede_id,
           (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio)
             AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS inicio,
           COALESCE(ac.fecha_fin, a.fecha_fin) AS fin_ts,
           COALESCE(ac.estado, '') NOT IN ('completado', 'finalizado')
             AND a.estado IN ('activo', 'activa') AS abierto
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
    JOIN cond_ok co ON co.id = ac.conductor_id
    WHERE COALESCE(ac.estado, '') NOT ILIKE 'cancel%'
      AND COALESCE(a.estado, '') NOT ILIKE 'cancel%'
      AND COALESCE(a.estado, '') NOT ILIKE 'program%'
      AND COALESCE(a.estado, '') NOT ILIKE 'pendient%'
      AND COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) IS NOT NULL
  ),
  -- Conductores manejando al cierre de cada día (23:55, como la foto de la flota)
  en_calle AS (
    SELECT g.fecha::date AS fecha, t.sede_id, COUNT(DISTINCT t.conductor_id)::int AS cd
    FROM turnos_cond t
    CROSS JOIN LATERAL generate_series(
      GREATEST(t.inicio, v_desde),
      LEAST(
        v_hasta,
        CASE
          WHEN t.fin_ts IS NOT NULL
            THEN ((t.fin_ts AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '23 hours 55 minutes')::date
          WHEN t.abierto THEN v_hasta
          ELSE t.inicio - 1
        END
      ),
      interval '1 day'
    ) AS g(fecha)
    GROUP BY 1, 2
  ),
  -- Alta = día del primer turno del conductor
  altas AS (
    SELECT x.inicio AS fecha, x.sede_id, COUNT(*)::int AS al
    FROM (SELECT conductor_id, sede_id, MIN(inicio) AS inicio FROM turnos_cond GROUP BY conductor_id, sede_id) x
    WHERE x.inicio BETWEEN v_desde AND v_hasta
    GROUP BY 1, 2
  ),
  bajas_dia AS (
    SELECT fecha, sede_id, COUNT(*)::int AS ba
    FROM kpi_bajas
    WHERE fecha BETWEEN v_desde AND v_hasta
    GROUP BY 1, 2
  ),
  claves AS (
    SELECT fecha, sede_id FROM ingresos
    UNION SELECT fecha, sede_id FROM fact_dia
    UNION SELECT fecha, sede_id FROM en_calle
    UNION SELECT fecha, sede_id FROM altas
    UNION SELECT fecha, sede_id FROM bajas_dia
  )
  SELECT k.fecha, k.sede_id,
         COALESCE(i.vi, 0),
         fd.fn, fd.ac, fd.co, fd.cc, fd.fa, fd.fg, fd.ft, fd.pe,
         ec.cd, COALESCE(al.al, 0), COALESCE(bd.ba, 0),
         now()
  FROM claves k
  LEFT JOIN ingresos i ON i.fecha = k.fecha AND i.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN fact_dia fd ON fd.fecha = k.fecha AND fd.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN en_calle ec ON ec.fecha = k.fecha AND ec.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN altas al ON al.fecha = k.fecha AND al.sede_id IS NOT DISTINCT FROM k.sede_id
  LEFT JOIN bajas_dia bd ON bd.fecha = k.fecha AND bd.sede_id IS NOT DISTINCT FROM k.sede_id;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$fn$;

REVOKE ALL ON FUNCTION kpi_recalcular(date, date) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────
-- Tarea horaria: foto de la flota de hoy + recálculo de los últimos 60 días
-- (los pagos manuales y las bajas se cargan con atraso).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kpi_actualizar()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_foto integer;
  v_dias integer;
BEGIN
  v_foto := kpi_capturar_foto_flota();
  v_dias := kpi_recalcular(v_hoy - 60, v_hoy);
  RETURN format('foto: %s filas · recálculo: %s filas', v_foto, v_dias);
END;
$fn$;

REVOKE ALL ON FUNCTION kpi_actualizar() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────
-- Lo que lee la pantalla: solo tablas ya calculadas (rápido).
-- Devuelve una fila por día del rango (el frontend agrupa por semana o por mes)
-- y el forecast de las semanas del rango.
--   supabase.rpc('get_dashboard_kpis_v2', { p_sede_id, p_desde, p_hasta })
-- Claves cortas para que el JSON sea chico:
--   f fecha · o origen (foto | estimado | vivo | null = sin dato)
--   tf total flota · eu en uso · tt turnos totales · tc turnos ocupados
--   vi vehículos ingresados · fn facturado (alquiler + garantía + Toshipass)
--   ac a cobrar · co cobrado · cc cobrado por Cabify (el resto de co es manual)
--   fa alquiler · fg garantía · ft Toshipass · fd descuentos (no se usa: 0)
--   cd conductores manejando al cierre del día · al altas (primer turno) · ba bajas
--   pe estado del período de facturación (null si no hay período ese día)
--   bajas: [{f fecha, m motivo}] una por conductor dado de baja en el rango
-- ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_dashboard_kpis_v2(uuid, date, date);
CREATE FUNCTION get_dashboard_kpis_v2(
  p_sede_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
h AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS hoy
),
p AS (
  SELECT
    h.hoy,
    COALESCE(p_desde, date_trunc('week', h.hoy)::date - 7 * 11) AS desde,
    LEAST(COALESCE(p_hasta, h.hoy), h.hoy) AS hasta
  FROM h
),
dias AS (
  SELECT d::date AS fecha
  FROM p, generate_series(p.desde, p.hasta, interval '1 day') d
),
-- Sedes que cuentan: la elegida, o todas menos las solo_admin.
sedes_ok AS (
  SELECT s.id
  FROM sedes s
  WHERE (p_sede_id IS NOT NULL AND s.id = p_sede_id)
     OR (p_sede_id IS NULL AND NOT COALESCE((to_jsonb(s) ->> 'solo_admin')::boolean, false))
),
incluye_sin_sede AS (
  SELECT p_sede_id IS NULL AS ok
),
flota AS (
  SELECT k.fecha,
         MIN(k.origen) AS origen, -- 'estimado' < 'foto': si una sede es estimada, el día también
         SUM(k.total_flota)::int AS tf,
         SUM(k.en_uso)::int AS eu,
         SUM(k.turnos_totales)::int AS tt,
         SUM(k.turnos_ocupados)::int AS tc
  FROM kpi_flota_diaria k, p
  WHERE k.fecha BETWEEN p.desde AND p.hasta
    AND (k.sede_id IN (SELECT id FROM sedes_ok)
         OR (k.sede_id IS NULL AND (SELECT ok FROM incluye_sin_sede)))
  GROUP BY k.fecha
),
diario AS (
  SELECT k.fecha,
         SUM(k.vi)::int AS vi,
         SUM(k.fn) AS fn, SUM(k.ac) AS ac, SUM(k.co) AS co, SUM(k.cc) AS cc,
         SUM(k.fa) AS fa, SUM(k.fg) AS fg, SUM(k.ft) AS ft,
         MIN(k.pe) AS pe, -- 'abierto' < 'cerrado': si una sede sigue abierta, el día es provisorio
         SUM(k.cd)::int AS cd, SUM(k.al)::int AS al, SUM(k.ba)::int AS ba
  FROM kpi_diario k, p
  WHERE k.fecha BETWEEN p.desde AND p.hasta
    AND (k.sede_id IN (SELECT id FROM sedes_ok)
         OR (k.sede_id IS NULL AND (SELECT ok FROM incluye_sin_sede)))
  GROUP BY k.fecha
),
filas AS (
  SELECT d.fecha,
         fl.origen, fl.tf, fl.eu, fl.tt, fl.tc,
         COALESCE(di.vi, 0) AS vi,
         di.fn, di.ac, di.co, di.cc, di.fa, di.fg, di.ft, di.pe,
         di.cd, COALESCE(di.al, 0) AS al, COALESCE(di.ba, 0) AS ba
  FROM dias d
  LEFT JOIN flota fl ON fl.fecha = d.fecha
  LEFT JOIN diario di ON di.fecha = d.fecha
),
bajas AS (
  SELECT b.fecha, b.motivo
  FROM kpi_bajas b, p
  WHERE b.fecha BETWEEN p.desde AND p.hasta
    AND (b.sede_id IN (SELECT id FROM sedes_ok)
         OR (b.sede_id IS NULL AND (SELECT ok FROM incluye_sin_sede)))
),
forecast AS (
  SELECT kf.*
  FROM kpi_forecast kf, p
  WHERE kf.semana_inicio BETWEEN date_trunc('week', p.desde)::date AND p.hasta
    AND kf.sede_id IS NOT DISTINCT FROM p_sede_id
)
SELECT jsonb_build_object(
  'hoy', (SELECT hoy FROM p),
  'desde', (SELECT desde FROM p),
  'hasta', (SELECT hasta FROM p),
  'generado_en', now(),
  'calculado_en', (SELECT MAX(calculado_en) FROM kpi_diario),
  'dias', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'f', x.fecha,
      'o', x.origen,
      'tf', x.tf,
      'eu', x.eu,
      'tt', x.tt,
      'tc', x.tc,
      'vi', x.vi,
      'fn', round(x.fn::numeric, 2),
      'ac', round(x.ac::numeric, 2),
      'co', round(x.co::numeric, 2),
      'cc', round(x.cc::numeric, 2),
      'fa', round(x.fa::numeric, 2),
      'fg', round(x.fg::numeric, 2),
      'ft', round(x.ft::numeric, 2),
      'fd', 0,
      'cd', x.cd,
      'al', x.al,
      'ba', x.ba,
      'pe', x.pe
    ) ORDER BY x.fecha)
    FROM filas x
  ), '[]'::jsonb),
  'bajas', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('f', b.fecha, 'm', b.motivo) ORDER BY b.fecha)
    FROM bajas b
  ), '[]'::jsonb),
  'forecast', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'semana_inicio', fc.semana_inicio,
      'flota', fc.flota,
      'ocupacion', fc.ocupacion,
      'operatividad', fc.operatividad,
      'facturacion', fc.facturacion,
      'cobranza', fc.cobranza,
      'actualizado_por', fc.actualizado_por,
      'updated_at', fc.updated_at
    ) ORDER BY fc.semana_inicio)
    FROM forecast fc
  ), '[]'::jsonb)
)
$$;

-- Lectura solo para usuarios logueados.
REVOKE EXECUTE ON FUNCTION get_dashboard_kpis_v2(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION kpi_flota_actual() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION kpi_flota_estimada(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION kpi_guardar_forecast(uuid, jsonb, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis_v2(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_flota_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_flota_estimada(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_guardar_forecast(uuid, jsonb, text[], text) TO authenticated;

-- =====================================================
-- PROGRAMACIÓN: foto diaria
-- =====================================================
-- La foto de cada día tiene que guardarse ese mismo día: el estado de la flota
-- de hoy no se puede recuperar mañana. Elegir UNA de estas opciones.
--
-- Opción A, pg_cron (Supabase: Database > Extensions > pg_cron):
--   23:55 hora Argentina = 02:55 UTC.
--
--   SELECT cron.schedule('kpi-foto-flota', '55 2 * * *', $$SELECT kpi_capturar_foto_flota()$$);
--
--   Ver que corre:  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--
-- Opción B, el servidor de Toshibase (crontab), con la service role key:
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/kpi_capturar_foto_flota" \
--     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
--   (para eso, además: GRANT EXECUTE ON FUNCTION kpi_capturar_foto_flota() TO service_role;)
--
-- Además, la tarea HORARIA que mantiene al día lo que lee la pantalla
-- (foto de hoy + recálculo de los últimos 60 días), a los 10 minutos de cada hora:
--
--   SELECT cron.schedule('kpi-actualizar', '10 * * * *', $$SELECT kpi_actualizar()$$);
--
-- Carga inicial (una vez, desde marzo):
--   SELECT kpi_recalcular('2026-03-01', CURRENT_DATE);
--
-- Primera foto (hoy), a mano:
--   SELECT kpi_capturar_foto_flota();
--
-- Si un día no se capturó, se puede completar con una estimación:
--   SELECT kpi_reconstruir_flota('2026-11-03', '2026-11-03');
