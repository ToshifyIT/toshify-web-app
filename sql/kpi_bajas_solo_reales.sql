-- =====================================================
-- KPIs / churn: solo bajas reales (2026-11-18)
-- =====================================================
-- Para el churn, una baja es la de un conductor que llegó a tener asignación (un turno
-- que arrancó) y al que se dio de baja a mano. La baja automática por falta de
-- asignación (sql/conductores_baja_sin_asignacion.sql) es una desactivación: no cuenta,
-- igual que un alta no es solo una activación.
--
-- Afecta a kpi_bajas, que leen el Dashboard KPI y Control de gestores / Dashboard de
-- capitanes (churn, bajas por capitán, motivos, últimas bajas).
--
-- Es la misma función kpi_recalcular de sql/dashboard_kpis_v2.sql (de ahí se copió;
-- si se cambia, cambiar las dos). Ejecutar este archivo completo en el SQL Editor.
-- La tarea horaria recalcula solo los últimos 60 días: el final de este archivo
-- recalcula toda la historia para sacar también las bajas viejas (abril, junio).

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
  -- Solo cuentan como baja (churn) las de alguien que llegó a tener asignación
  -- (un turno que arrancó, igual que el alta) y que se dio de baja a mano. La baja
  -- automática por falta de asignación (sql/conductores_baja_sin_asignacion.sql) es una
  -- desactivación, no una baja: no entra.
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
    AND COALESCE(b.motivo, '') NOT ILIKE 'baja automática por falta de asignación%'
    AND EXISTS (
      SELECT 1
      FROM asignaciones_conductores ac
      JOIN asignaciones a ON a.id = ac.asignacion_id
      WHERE ac.conductor_id = b.conductor_id
        AND COALESCE(ac.estado, '') NOT ILIKE 'cancel%'
        AND COALESCE(a.estado, '') NOT ILIKE 'cancel%'
        AND COALESCE(a.estado, '') NOT ILIKE 'program%'
        AND COALESCE(a.estado, '') NOT ILIKE 'pendient%'
        AND (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio)
              AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= b.fecha
    )
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

-- Recalcular toda la historia (desde el primer conductor cargado hasta hoy).
-- Si el SQL Editor corta por tiempo, hacerlo por partes, p. ej. un año por vez:
--   SELECT kpi_recalcular('2025-01-01', '2025-12-31');
SELECT kpi_recalcular(
  (SELECT MIN((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) FROM conductores),
  (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
) AS filas_recalculadas;

-- Comprobar: no queda ninguna baja automática en el churn (debería dar 0)
SELECT COUNT(*) AS bajas_automaticas_en_churn
FROM kpi_bajas
WHERE motivo ILIKE 'baja automática por falta de asignación%';
