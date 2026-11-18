-- =====================================================
-- Conductores: baja automática por falta de asignación por más de un mes (2026-11-18)
-- =====================================================
-- Un conductor ACTIVO que lleva más de un mes sin asignación pasa a BAJA solo.
--
-- «Sin asignación desde» = la fecha más reciente de:
--   - el fin de su última asignación (asignaciones_conductores.fecha_fin, o el fin
--     de la asignación si la fila del conductor no lo tiene);
--   - su alta o última activación: created_at, fecha_contratacion,
--     fecha_reincorpoaracion, la última reactivación (conductores_historial_bajas)
--     y el último paso a ACTIVO (historial_conductores).
--   Si nunca tuvo asignación, cuenta solo lo segundo.
-- Nunca se toca a un conductor con una asignación vigente o programada (su fila en
-- asignado/activo dentro de una asignación que no terminó ni se canceló).
-- Se excluyen los comodines del equipo (apellido INTERNO).
--
-- Fecha de la baja = el día en que se cumplió el mes (no el día en que corre la tarea).
-- Queda registrada como hecha por «Sistema» en:
--   - conductores (estado BAJA, fecha_terminacion, motivo_baja);
--   - conductores_historial_bajas (pestaña «Bajas» del detalle, churn de los KPIs);
--   - historial_conductores (cambio de estado).
-- No toca cobros fraccionados ni cuotas de penalidades pendientes (la baja manual
-- sí los cancela y los pasa al saldo): el dry run los muestra para revisarlos.
--
-- PASOS (en el SQL Editor de Supabase):
--   1. Ejecutar este archivo completo: crea la función y NO cambia ningún dato.
--   2. Dry run (no cambia nada): quiénes quedarían de baja hoy.
--        SELECT * FROM conductores_baja_sin_asignacion(false) ORDER BY fecha_baja;
--   3. Recién con el OK, aplicar:
--        SELECT * FROM conductores_baja_sin_asignacion(true);
--   4. Tarea diaria a las 00:30 hora Argentina (03:30 UTC), como supabase_admin:
--        SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'conductores-baja-sin-asignacion';
--        SELECT cron.schedule('conductores-baja-sin-asignacion', '30 3 * * *',
--          $$SELECT count(*) FROM public.conductores_baja_sin_asignacion(true)$$);
--
-- Ver las corridas:
--   SELECT start_time, status, return_message FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'conductores-baja-sin-asignacion')
--   ORDER BY start_time DESC LIMIT 10;
-- Se puede ejecutar más de una vez.

-- Texto del motivo. La pantalla y los reportes reconocen la baja automática por
-- este comienzo: no cambiarlo sin cambiar también BAJA_AUTOMATICA_PREFIJO en
-- src/modules/conductores/panel/conductorDetalleService.ts.
CREATE OR REPLACE FUNCTION conductores_baja_sin_asignacion(p_aplicar boolean DEFAULT false)
RETURNS TABLE (
  conductor_id uuid,
  conductor text,
  dni text,
  capitan text,
  sede_id uuid,
  sin_asignacion_desde date,
  origen text,                 -- 'fin de asignación' | 'alta / activación'
  fecha_baja date,
  dias_sin_asignacion integer,
  cobros_fraccionados_pendientes integer,
  cuotas_penalidades_pendientes integer,
  aplicado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  c_tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  c_motivo CONSTANT text := 'Baja automática por falta de asignación por más de un mes';
  v_hoy date := (now() AT TIME ZONE c_tz)::date;
  v_baja_id uuid;
  v_baja_codigo text;
  r record;
BEGIN
  SELECT e.id, e.codigo INTO v_baja_id, v_baja_codigo
  FROM conductores_estados e
  WHERE lower(e.codigo) = 'baja'
  LIMIT 1;
  IF v_baja_id IS NULL THEN
    RAISE EXCEPTION 'No existe el estado BAJA en conductores_estados';
  END IF;

  FOR r IN
    WITH activos AS (
      SELECT c.*, e.codigo AS estado_codigo
      FROM conductores c
      JOIN conductores_estados e ON e.id = c.estado_id
      WHERE lower(e.codigo) = 'activo'
        AND COALESCE(c.apellidos, '') NOT ILIKE '%interno%'
    ),
    con_asignacion AS (
      SELECT DISTINCT ac.conductor_id
      FROM asignaciones_conductores ac
      JOIN asignaciones a ON a.id = ac.asignacion_id
      WHERE ac.estado IN ('asignado', 'activo')
        AND COALESCE(a.estado, '') NOT IN
            ('finalizada', 'finalizado', 'completada', 'completado', 'cancelada', 'cancelado')
    ),
    fin_asignacion AS (
      SELECT ac.conductor_id,
             MAX((COALESCE(ac.fecha_fin, a.fecha_fin) AT TIME ZONE c_tz)::date) AS fecha
      FROM asignaciones_conductores ac
      JOIN asignaciones a ON a.id = ac.asignacion_id
      WHERE COALESCE(ac.fecha_fin, a.fecha_fin) IS NOT NULL
      GROUP BY ac.conductor_id
    ),
    reactivacion AS (
      SELECT hb.conductor_id, MAX((hb.created_at AT TIME ZONE c_tz)::date) AS fecha
      FROM conductores_historial_bajas hb
      WHERE hb.tipo_evento = 'reactivacion'
      GROUP BY hb.conductor_id
    ),
    paso_a_activo AS (
      SELECT hc.conductor_id, MAX((hc.created_at AT TIME ZONE c_tz)::date) AS fecha
      FROM historial_conductores hc
      WHERE lower(COALESCE(hc.estado_nuevo, '')) = 'activo'
      GROUP BY hc.conductor_id
    ),
    calculo AS (
      SELECT a.id, a.nombres, a.apellidos, a.numero_dni, a.guia, a.sede_id,
             a.estado_codigo, a.fecha_terminacion,
             fa.fecha AS fin_asig,
             -- GREATEST ignora los NULL; fechas a futuro no cuentan
             GREATEST(
               (a.created_at AT TIME ZONE c_tz)::date,
               CASE WHEN a.fecha_contratacion <= v_hoy THEN a.fecha_contratacion END,
               CASE WHEN a.fecha_reincorpoaracion <= v_hoy THEN a.fecha_reincorpoaracion END,
               re.fecha,
               pa.fecha
             ) AS activacion
      FROM activos a
      LEFT JOIN fin_asignacion fa ON fa.conductor_id = a.id
      LEFT JOIN reactivacion re ON re.conductor_id = a.id
      LEFT JOIN paso_a_activo pa ON pa.conductor_id = a.id
      WHERE NOT EXISTS (SELECT 1 FROM con_asignacion ca WHERE ca.conductor_id = a.id)
    ),
    candidatos AS (
      SELECT k.*,
             GREATEST(k.fin_asig, k.activacion) AS desde,
             CASE WHEN k.fin_asig IS NOT NULL AND k.fin_asig >= COALESCE(k.activacion, k.fin_asig)
                  THEN 'fin de asignación' ELSE 'alta / activación' END AS origen
      FROM calculo k
    )
    SELECT cd.*,
           (cd.desde + interval '1 month')::date AS f_baja,
           (SELECT count(*)::int FROM cobros_fraccionados cf
             WHERE cf.conductor_id = cd.id AND cf.estado = 'pendiente') AS cobros_pend,
           (SELECT count(*)::int FROM penalidades_cuotas pc
              JOIN penalidades p ON p.id = pc.penalidad_id
             WHERE p.conductor_id = cd.id AND pc.estado = 'pendiente') AS cuotas_pend
    FROM candidatos cd
    WHERE cd.desde IS NOT NULL
      AND (cd.desde + interval '1 month')::date <= v_hoy
    ORDER BY (cd.desde + interval '1 month')::date
  LOOP
    conductor_id := r.id;
    conductor := btrim(COALESCE(r.nombres, '') || ' ' || COALESCE(r.apellidos, ''));
    dni := r.numero_dni;
    capitan := r.guia;
    sede_id := r.sede_id;
    sin_asignacion_desde := r.desde;
    origen := r.origen;
    fecha_baja := r.f_baja;
    dias_sin_asignacion := v_hoy - r.desde;
    cobros_fraccionados_pendientes := r.cobros_pend;
    cuotas_penalidades_pendientes := r.cuotas_pend;
    aplicado := false;

    IF p_aplicar THEN
      UPDATE conductores c
      SET estado_id = v_baja_id,
          fecha_terminacion = r.f_baja,
          motivo_baja = c_motivo,
          updated_at = now(),
          updated_by = 'Sistema'
      WHERE c.id = r.id
        AND c.estado_id IS DISTINCT FROM v_baja_id;

      IF FOUND THEN
        INSERT INTO conductores_historial_bajas (
          conductor_id, conductor_nombre, conductor_dni, tipo_evento,
          estado_anterior, estado_nuevo, fecha_terminacion_anterior, fecha_terminacion_nueva,
          motivo_baja, usuario_id, usuario_nombre, sede_id
        ) VALUES (
          r.id, conductor, COALESCE(r.numero_dni, ''), 'baja',
          r.estado_codigo, v_baja_codigo, r.fecha_terminacion, r.f_baja,
          c_motivo || '. Sin asignación desde el ' || to_char(r.desde, 'DD/MM/YYYY') || '.',
          NULL, 'Sistema', r.sede_id
        );

        INSERT INTO historial_conductores (
          conductor_id, tipo_evento, estado_anterior, estado_nuevo, detalles,
          usuario_id, usuario_nombre, modulo, sede_id
        ) VALUES (
          r.id, 'cambio_estado', r.estado_codigo, v_baja_codigo,
          jsonb_build_object(
            'nombre', conductor,
            'accion', 'baja_automatica_sin_asignacion',
            'motivo_baja', c_motivo,
            'sin_asignacion_desde', r.desde,
            'origen', r.origen,
            'fecha_terminacion', r.f_baja
          ),
          NULL, 'Sistema', 'conductores', r.sede_id
        );

        aplicado := true;
      END IF;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION conductores_baja_sin_asignacion(boolean) FROM PUBLIC, anon, authenticated;

-- Dry run (no cambia nada)
SELECT conductor, dni, capitan, sin_asignacion_desde, origen, fecha_baja, dias_sin_asignacion,
       cobros_fraccionados_pendientes, cuotas_penalidades_pendientes
FROM conductores_baja_sin_asignacion(false)
ORDER BY fecha_baja;
