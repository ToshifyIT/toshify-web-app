-- Sincronización de multas con los conductores de Geotab (2026-10-29)
--
-- 1. public.sincronizar_multas_geotab(desde, hasta, sede): para las multas activas con hora
--    de infracción en ese rango, busca el viaje de Geotab (geotab_historico) de la patente
--    que contiene la hora. Si hay UN solo conductor y la multa está vacía o tiene otro,
--    completa conductor_responsable e iButton y agrega una nota al final de observaciones.
--    No toca:
--      - multas que modificó una persona (updated_by_name distinto de los procesos
--        automáticos de abajo);
--      - multas que ya tienen una incidencia (ya se le cobró a alguien): se informan
--        en "omitidas_con_incidencia" para revisarlas a mano;
--      - multas sin hora (00:00) o con más de un conductor en ese momento.
-- 2. Trigger en geotab_resync_solicitudes: cuando el botón "Actualizar desde Geotab" de la
--    Bitácora termina (el runner del servidor pasa el pedido a 'terminado'), se sincronizan
--    las multas de esa semana y sede, y el resultado queda en resumen->'multas'.
--    No cambia el runner (/root/GeoTab-Pro/geotab_resync_runner.py).
-- 3. Corrida única sobre todas las multas (con backup). Hoy corrige la 9109 (AF802BY,
--    06/10 05:56 -> SERGIO GABRIEL GALARZA). La 8856 queda omitida: tiene incidencia.
--
-- Rollback de la corrida única:
--   UPDATE multas_historico m SET conductor_responsable = b.conductor_responsable,
--     ibutton = b.ibutton, observaciones = b.observaciones,
--     updated_by_name = b.updated_by_name, origen_actualizacion = b.origen_actualizacion
--   FROM backup_multas_sync_geotab_20261029 b WHERE b.id = m.id;
-- Quitar la automatización:
--   DROP TRIGGER trg_geotab_resync_multas ON geotab_resync_solicitudes;
--
-- Ejecutar como supabase_admin (dueño de multas_historico).

BEGIN;

CREATE OR REPLACE FUNCTION public.sincronizar_multas_geotab(
  p_desde date,
  p_hasta date,
  p_sede_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- "Modificado" de procesos automáticos: las demás multas las tocó una persona.
  c_sistema constant text[] := array['', 'Auditoría automática', 'Bot multas (reintento PDF)',
                                      'Corrección cruce GPS', 'Sincronización Geotab'];
  c_tz constant text := 'America/Argentina/Buenos_Aires';
  v_actualizadas jsonb;
  v_omitidas jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_sync_multas (
    id bigint, patente text, fecha timestamp, antes text, conductor text,
    ibutton text, ini timestamp, fin timestamp, con_incidencia boolean
  ) ON COMMIT DROP;
  TRUNCATE tmp_sync_multas;

  INSERT INTO tmp_sync_multas
  WITH cand AS (
    SELECT m.id, m.patente, m.fecha_infraccion,
           nullif(nullif(trim(m.conductor_responsable), ''), '-') AS cond
    FROM multas_historico m
    WHERE m.deleted_at IS NULL AND m.desestimada_at IS NULL
      AND m.fecha_infraccion >= p_desde AND m.fecha_infraccion < p_hasta + 1
      AND m.fecha_infraccion::time <> '00:00'
      AND (p_sede_id IS NULL OR m.sede_id = p_sede_id)
      AND coalesce(trim(m.updated_by_name), '') = ANY (c_sistema)
  ), gps AS (
    SELECT c.id,
           count(DISTINCT upper(translate(trim(g.conductor), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))) AS n,
           min(trim(g.conductor)) AS conductor,
           min(nullif(trim(g.ibutton), '')) AS ibutton,
           min(g.fecha_hora_inicio_gmt3) AS ini,
           max(g.fecha_hora_fin_gmt3) AS fin
    FROM cand c
    JOIN geotab_historico g
      ON replace(g.patente, ' ', '') = c.patente
     AND c.fecha_infraccion BETWEEN g.fecha_hora_inicio_gmt3 AND g.fecha_hora_fin_gmt3
     AND nullif(trim(g.conductor), '') IS NOT NULL
    GROUP BY c.id
  )
  SELECT c.id, c.patente, c.fecha_infraccion, c.cond, g.conductor, g.ibutton, g.ini, g.fin,
         EXISTS (SELECT 1 FROM incidencias i WHERE i.multa_id = c.id)
  FROM cand c JOIN gps g ON g.id = c.id
  WHERE g.n = 1
    AND (c.cond IS NULL
         OR upper(translate(c.cond, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
            <> upper(translate(g.conductor, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')));

  UPDATE multas_historico m
  SET conductor_responsable = t.conductor,
      ibutton = t.ibutton,
      observaciones = coalesce(nullif(trim(m.observaciones), '') || ' | ', '')
        || format('Conductor sincronizado con Geotab (viaje %s-%s)%s - %s',
                  to_char(t.ini, 'HH24:MI'), to_char(t.fin, 'HH24:MI'),
                  CASE WHEN t.antes IS NOT NULL THEN ' (antes: ' || t.antes || ')' ELSE '' END,
                  to_char(now() AT TIME ZONE c_tz, 'DD/MM/YYYY')),
      updated_by_name = 'Sincronización Geotab',
      origen_actualizacion = 'sync_geotab'
  FROM tmp_sync_multas t
  WHERE m.id = t.id AND NOT t.con_incidencia;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'patente', patente, 'fecha', to_char(fecha, 'DD/MM/YYYY HH24:MI'),
           'conductor', conductor, 'antes', antes) ORDER BY fecha), '[]')
    INTO v_actualizadas FROM tmp_sync_multas WHERE NOT con_incidencia;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'patente', patente, 'fecha', to_char(fecha, 'DD/MM/YYYY HH24:MI'),
           'conductor_gps', conductor, 'actual', antes) ORDER BY fecha), '[]')
    INTO v_omitidas FROM tmp_sync_multas WHERE con_incidencia;

  RETURN jsonb_build_object(
    'actualizadas', jsonb_array_length(v_actualizadas),
    'detalle', v_actualizadas,
    'omitidas_con_incidencia', v_omitidas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_multas_geotab(date, date, uuid) FROM public, anon, authenticated;

-- Al terminar un pedido de "Actualizar desde Geotab", sincroniza las multas de esa semana.
-- Si la sincronización falla, el pedido igual termina bien y el error queda en el resumen.
CREATE OR REPLACE FUNCTION public.trg_geotab_resync_multas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'terminado' AND OLD.estado IS DISTINCT FROM 'terminado' THEN
    BEGIN
      NEW.resumen := coalesce(NEW.resumen, '{}'::jsonb)
        || jsonb_build_object('multas', public.sincronizar_multas_geotab(NEW.desde, NEW.hasta, NEW.sede_id));
    EXCEPTION WHEN others THEN
      NEW.resumen := coalesce(NEW.resumen, '{}'::jsonb)
        || jsonb_build_object('multas', jsonb_build_object('error', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_geotab_resync_multas() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_geotab_resync_multas ON geotab_resync_solicitudes;
CREATE TRIGGER trg_geotab_resync_multas
  BEFORE UPDATE OF estado ON geotab_resync_solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.trg_geotab_resync_multas();

-- Corrida única sobre todas las multas, con backup de las que va a tocar.
CREATE TABLE backup_multas_sync_geotab_20261029 AS
SELECT *, now() AS backup_at FROM multas_historico WHERE id IN (9109);

DO $$
DECLARE
  r jsonb := public.sincronizar_multas_geotab(DATE '2020-01-01', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, NULL);
BEGIN
  RAISE NOTICE 'Resultado: %', r;
  IF (r->>'actualizadas')::int <> 1 OR r->'detalle'->0->>'id' <> '9109' THEN
    RAISE EXCEPTION 'Se esperaba actualizar solo la multa 9109; resultado: %', r;
  END IF;
END $$;

SELECT id, patente, fecha_infraccion, conductor_responsable, ibutton, updated_by_name,
       right(observaciones, 90) AS obs
FROM multas_historico WHERE id IN (9109, 8856) ORDER BY id;

COMMIT;
