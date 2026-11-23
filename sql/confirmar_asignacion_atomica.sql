-- =====================================================================
-- Confirmar / activar una asignación en un solo paso
-- =====================================================================
-- Problemas que resuelve (docs/checklist-revision-facturacion-asignaciones-programaciones.md):
--
--   A2. Confirmar hacía varios pasos sueltos desde la app: confirmaba al
--       conductor, lo cerraba en su auto anterior, cerraba la asignación
--       anterior del auto y recién al final activaba la nueva. Si se cortaba
--       en el medio, el conductor quedaba cerrado en la vieja y sin activar en
--       la nueva: no se facturaba en ninguna. Ahora todo eso pasa dentro de
--       confirmar_asignacion(), en UNA transacción: o se hace todo o nada.
--
--   A3. Al cerrar al conductor en "sus otras asignaciones" no se miraba el
--       estado de la otra: también lo cerraba en asignaciones PROGRAMADAS a
--       futuro (quedaba "completado", con fecha de fin y sin inicio). Ahora las
--       programadas no se tocan y la función las devuelve para avisar.
--
--   A7. Dos usuarios podían confirmar la misma asignación a la vez. La función
--       bloquea la fila de la asignación: el segundo espera y encuentra el
--       estado ya cambiado.
--
-- Lo que NO hace (lo sigue haciendo la app después, como avisos): estado del
-- vehículo, turnos ocupados e historial.
--
-- Ejecutar ANTES de publicar la versión de la app que usa la función: sin la
-- función instalada, Confirmar avisa y no cambia nada.
-- Es idempotente: se puede correr más de una vez.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_asignacion(
  p_asignacion_id uuid,
  p_filas_confirmar uuid[],   -- ids de asignaciones_conductores a confirmar ahora (puede ir vacío)
  p_notas text,               -- notas con las que queda al activarse (NULL = no cambiar)
  p_usuario text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_asig          asignaciones%ROWTYPE;
  v_ahora         timestamptz := now();
  v_hoy           text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
  v_filas         uuid[] := coalesce(p_filas_confirmar, '{}');
  v_debe_activar  boolean;
  v_confirmadas   integer := 0;
  v_conductores   uuid[] := '{}';   -- conductores que entran en vigencia con esta acción
  v_tocadas       uuid[] := '{}';   -- asignaciones activas donde se cerró a alguno de ellos
  v_cerradas      jsonb := '[]'::jsonb;
  v_programadas   jsonb := '[]'::jsonb;
  v_filas_json    jsonb := '[]'::jsonb;
  v_sin_confirmar integer := 0;
  v_traza         text;
  v_nombres       text;
  v_ids           jsonb;
  r               record;
BEGIN
  -- Bloquea la asignación: una segunda confirmación simultánea espera acá.
  SELECT * INTO v_asig FROM asignaciones WHERE id = p_asignacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La asignación ya no existe (puede haber sido eliminada).';
  END IF;
  IF v_asig.estado NOT IN ('programado', 'activa', 'activo') THEN
    RAISE EXCEPTION 'La asignación ya no se puede confirmar: está en estado "%".', v_asig.estado;
  END IF;
  v_debe_activar := (v_asig.estado = 'programado');

  -- 1. Confirmar a los conductores elegidos
  IF array_length(v_filas, 1) IS NOT NULL THEN
    UPDATE asignaciones_conductores
       SET confirmado = true, fecha_confirmacion = v_ahora, fecha_inicio = v_ahora
     WHERE id = ANY(v_filas)
       AND asignacion_id = p_asignacion_id;
    GET DIAGNOSTICS v_confirmadas = ROW_COUNT;
    IF v_confirmadas = 0 THEN
      RAISE EXCEPTION 'No se encontraron los conductores a confirmar en esta asignación.';
    END IF;
  END IF;

  -- Conductores que quedan vigentes por esta acción: los confirmados ahora y,
  -- si la asignación se activa, también los que ya estaban confirmados.
  SELECT coalesce(array_agg(DISTINCT ac.conductor_id), '{}')
    INTO v_conductores
    FROM asignaciones_conductores ac
   WHERE ac.asignacion_id = p_asignacion_id
     AND ac.conductor_id IS NOT NULL
     AND (
       ac.id = ANY(v_filas)
       OR (v_debe_activar AND ac.confirmado IS TRUE AND ac.estado IN ('asignado', 'activo'))
     );

  -- 2. Cerrar a esos conductores en sus otras asignaciones.
  --    No se tocan las PROGRAMADAS a futuro (A3): esas se avisan más abajo.
  WITH cerradas AS (
    UPDATE asignaciones_conductores ac
       SET estado = 'completado', fecha_fin = v_ahora
      FROM asignaciones a
     WHERE a.id = ac.asignacion_id
       AND ac.conductor_id = ANY(v_conductores)
       AND ac.estado IN ('asignado', 'activo')
       AND ac.asignacion_id <> p_asignacion_id
       AND a.estado <> 'programado'
    RETURNING ac.asignacion_id, a.estado AS estado_padre
  )
  SELECT coalesce(array_agg(DISTINCT asignacion_id) FILTER (WHERE estado_padre IN ('activa', 'activo')), '{}')
    INTO v_tocadas
    FROM cerradas;

  IF v_debe_activar THEN
    -- 3. Cerrar las asignaciones activas anteriores del mismo vehículo
    FOR r IN
      SELECT a.id, a.codigo, a.notas
        FROM asignaciones a
       WHERE a.vehiculo_id = v_asig.vehiculo_id
         AND a.estado IN ('activa', 'activo')
         AND a.id <> p_asignacion_id
       FOR UPDATE
    LOOP
      SELECT string_agg(
               coalesce(nullif(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), ''), 'Desconocido')
                 || ' (' || coalesce(ac.horario, 'sin turno') || ')', ', '),
             coalesce(jsonb_agg(ac.conductor_id) FILTER (
               WHERE ac.conductor_id IS NOT NULL AND ac.estado IN ('asignado', 'activo', 'completado')), '[]'::jsonb)
        INTO v_nombres, v_ids
        FROM asignaciones_conductores ac
        LEFT JOIN conductores c ON c.id = ac.conductor_id
       WHERE ac.asignacion_id = r.id;

      UPDATE asignaciones_conductores
         SET estado = 'completado', fecha_fin = v_ahora
       WHERE asignacion_id = r.id
         AND estado IN ('asignado', 'activo');

      v_traza := E'\n[AUTO-CERRADA ' || v_hoy || E'] Nuevo turno activado para el mismo vehículo.\nConductores al cierre: '
                 || coalesce(v_nombres, 'ninguno');
      UPDATE asignaciones
         SET estado = 'finalizada', fecha_fin = v_ahora,
             notas = coalesce(r.notas, '') || v_traza, updated_by = p_usuario
       WHERE id = r.id;

      v_cerradas := v_cerradas || jsonb_build_object('id', r.id, 'codigo', r.codigo, 'conductores', coalesce(v_ids, '[]'::jsonb));
    END LOOP;

    -- 4. Finalizar las asignaciones activas que quedaron sin conductores por el
    --    paso 2 (la del auto anterior en un cambio de auto). Solo las que tocó
    --    esta confirmación, no todas las de la base.
    FOR r IN
      SELECT a.id, a.notas
        FROM asignaciones a
       WHERE a.id = ANY(v_tocadas)
         AND a.estado IN ('activa', 'activo')
         AND NOT EXISTS (
           SELECT 1 FROM asignaciones_conductores ac
            WHERE ac.asignacion_id = a.id AND ac.estado IN ('asignado', 'activo'))
       FOR UPDATE
    LOOP
      SELECT string_agg(
               coalesce(nullif(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), ''), 'Desconocido')
                 || ' (' || coalesce(ac.horario, 'sin turno') || ')', ', ')
        INTO v_nombres
        FROM asignaciones_conductores ac
        LEFT JOIN conductores c ON c.id = ac.conductor_id
       WHERE ac.asignacion_id = r.id
         AND ac.estado IN ('completado', 'finalizado');

      v_traza := E'\n[AUTO-CERRADA ' || v_hoy || E'] Sin conductores activos.\nUltimos conductores: '
                 || coalesce(v_nombres, 'ninguno');
      UPDATE asignaciones
         SET estado = 'finalizada', fecha_fin = v_ahora,
             notas = coalesce(r.notas, '') || v_traza, updated_by = p_usuario
       WHERE id = r.id;
    END LOOP;

    -- 5. Activar la asignación
    UPDATE asignaciones
       SET estado = 'activa', fecha_inicio = v_ahora,
           notas = coalesce(p_notas, notas), updated_by = p_usuario
     WHERE id = p_asignacion_id;

    -- 6. Los turnos que no se confirmaron quedan vacantes
    UPDATE asignaciones_conductores
       SET estado = 'cancelado', fecha_fin = v_ahora
     WHERE asignacion_id = p_asignacion_id
       AND confirmado IS NOT TRUE;
    GET DIAGNOSTICS v_sin_confirmar = ROW_COUNT;
  END IF;

  -- Programadas a futuro donde estos conductores siguen figurando (solo aviso)
  SELECT coalesce(jsonb_agg(
           coalesce(nullif(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), ''), 'Conductor')
             || ' sigue en la asignación programada ' || coalesce(a.codigo, '')
             || coalesce(' (' || v.patente || ')', '')), '[]'::jsonb)
    INTO v_programadas
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
    LEFT JOIN conductores c ON c.id = ac.conductor_id
    LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
   WHERE ac.conductor_id = ANY(v_conductores)
     AND ac.estado IN ('asignado', 'activo')
     AND ac.asignacion_id <> p_asignacion_id
     AND a.estado = 'programado';

  -- Cómo quedaron los conductores de la asignación
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', ac.id, 'conductor_id', ac.conductor_id, 'horario', ac.horario,
           'confirmado', ac.confirmado IS TRUE, 'estado', ac.estado)), '[]'::jsonb)
    INTO v_filas_json
    FROM asignaciones_conductores ac
   WHERE ac.asignacion_id = p_asignacion_id;

  RETURN jsonb_build_object(
    'activada', v_debe_activar,
    'conductores', to_jsonb(v_conductores),
    'filas', v_filas_json,
    'sin_confirmar', v_sin_confirmar,
    'cerradas', v_cerradas,
    'programadas_pendientes', v_programadas
  );
END;
$$;

COMMENT ON FUNCTION public.confirmar_asignacion(uuid, uuid[], text, text) IS
  'Confirma conductores y activa una asignación en una sola transacción: cierra a los conductores en sus otras asignaciones (no en las programadas), cierra las asignaciones activas anteriores del vehículo y activa la nueva. Si algo falla no cambia nada.';

GRANT EXECUTE ON FUNCTION public.confirmar_asignacion(uuid, uuid[], text, text) TO authenticated;

COMMIT;
