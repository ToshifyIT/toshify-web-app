-- sql/vehiculos_guia_reparto_turnos.sql
-- Reparto de vehículos entre agentes por TURNOS (2026-11-04). Reemplaza el reparto
-- "misma cantidad de autos" de sql/vehiculos_guia_responsable.sql (correr ese antes).
--
-- Idea: cada auto son 2 turnos (D y N; un auto a cargo también cuenta 2). A cada agente
-- le toca la misma parte de los turnos de su sede, y lo que ya llenó con sus conductores
-- cuenta dentro de esa parte. Ejemplo: 3 autos = 6 turnos, 2 por agente; si Eunice ya
-- llenó un auto (2 turnos), ese auto es suyo y ya cumplió; los otros dos van a las demás.
-- Los autos que no dan exacto van a quien MÁS llenó (hoy: Ali, 19 autos = 38 turnos).
--
-- Primera asignación (PASO 2 y 3):
--   * Cada agente queda con su cantidad de autos.
--   * Sus turnos por llenar quedan lo más cerca posible de "su parte − lo que ya llenó"
--     (Ali, que llenó más, recibe pocos turnos libres; Carla, que llenó menos, más).
--   * Después, cada auto queda con la agente que onboardeó a sus conductores siempre que
--     se pueda sin mover más de 1 turno por llenar de cada agente, y se mueve lo menos
--     posible.
--   Se parte del reparto actual, se pasan los autos que sobran a quien le faltan y
--   después se intercambian autos entre agentes mientras mejore el resultado.
--
-- Después (PASO 3 instala la regla): un auto nuevo o que vuelve a estar activo (taller,
-- robo...) va a la agente con MENOS turnos por llenar en ese momento. Si un auto sale no
-- se reacomoda nada. Los cambios a mano desde Vehículos se respetan.
--
-- Cómo usarlo:
--   PASO 1: crear las funciones (no cambia ningún dato).
--   PASO 2: correr la VISTA PREVIA y el RESUMEN y revisar.
--   PASO 3: guardar el reparto e instalar la regla nueva.

-- ───────────── PASO 1: funciones (no cambia datos) ─────────────

-- Quién ocupa cada turno de un vehículo hoy. Mismo criterio que vehiculo_turnos_libres.
-- guia: agente del conductor (solo Ali, Carla o Eunice; NULL si es de otro o está libre).
CREATE OR REPLACE FUNCTION vehiculo_turnos_ocupacion(p_vehiculo_id uuid)
RETURNS TABLE (turno text, guia text, ocupado boolean)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_asig record;
  v_guia text;
  v_ocupado boolean;
BEGIN
  SELECT a.id, a.horario INTO v_asig
  FROM asignaciones a
  WHERE a.vehiculo_id = p_vehiculo_id AND a.estado IN ('activo', 'activa')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY VALUES ('D'::text, NULL::text, false), ('N'::text, NULL::text, false);
    RETURN;
  END IF;

  IF v_asig.horario = 'turno' THEN
    RETURN QUERY
    SELECT t.turno,
           (SELECT guia_homologado_activo(c.guia)
              FROM asignaciones_conductores ac
              JOIN conductores c ON c.id = ac.conductor_id
             WHERE ac.asignacion_id = v_asig.id
               AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado')
               AND lower(ac.horario) = ANY (t.codigos)
             ORDER BY ac.id
             LIMIT 1),
           EXISTS (SELECT 1 FROM asignaciones_conductores ac
                    WHERE ac.asignacion_id = v_asig.id
                      AND ac.conductor_id IS NOT NULL
                      AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado')
                      AND lower(ac.horario) = ANY (t.codigos))
    FROM (VALUES ('D'::text, ARRAY['diurno', 'd']), ('N'::text, ARRAY['nocturno', 'n'])) AS t(turno, codigos);
    RETURN;
  END IF;

  -- A cargo: un conductor ocupa los dos turnos
  SELECT guia_homologado_activo(c.guia), true INTO v_guia, v_ocupado
  FROM asignaciones_conductores ac
  JOIN conductores c ON c.id = ac.conductor_id
  WHERE ac.asignacion_id = v_asig.id
    AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado')
  ORDER BY ac.id
  LIMIT 1;
  v_ocupado := coalesce(v_ocupado, false);
  RETURN QUERY VALUES ('D'::text, v_guia, v_ocupado), ('N'::text, v_guia, v_ocupado);
END;
$$;

-- Turnos de un auto que ocupan conductores de la agente g.
CREATE OR REPLACE FUNCTION rp_turnos_de(p_d_ocupado boolean, p_d_guia text, p_n_ocupado boolean, p_n_guia text, p_guia text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_d_ocupado AND p_d_guia = p_guia, false)::int
       + coalesce(p_n_ocupado AND p_n_guia = p_guia, false)::int
$$;

-- Cuánto "es de" la agente g un auto: sus turnos ocupados por conductores de g, más 1
-- si TODOS sus conductores son de g (así un auto solo suyo pesa más que uno compartido).
CREATE OR REPLACE FUNCTION rp_afinidad(p_d_ocupado boolean, p_d_guia text, p_n_ocupado boolean, p_n_guia text, p_guia text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT rp_turnos_de(p_d_ocupado, p_d_guia, p_n_ocupado, p_n_guia, p_guia)
       + CASE WHEN (p_d_ocupado OR p_n_ocupado)
               AND (NOT p_d_ocupado OR p_d_guia IS NOT DISTINCT FROM p_guia)
               AND (NOT p_n_ocupado OR p_n_guia IS NOT DISTINCT FROM p_guia)
              THEN 1 ELSE 0 END
$$;

-- Calcula el reparto por turnos de una sede, SIN guardarlo. Una fila por vehículo.
-- Puntaje que se minimiza (los pesos ordenan las prioridades):
--   1. + 1000 × diferencia entre los turnos por llenar de cada agente y su objetivo
--      (lo primero: que los turnos por llenar queden lo más parejos posible)
--   2. − 10 × afinidad: turnos que quedan en autos de la agente que onboardeó a sus
--      conductores, +1 si todos los conductores del auto son suyos (sin desarmar el
--      punto 1, cada auto queda con la agente de sus conductores)
--   3. + 1 × autos que cambian de agente
CREATE OR REPLACE FUNCTION plan_reparto_guias_turnos(p_sede_id uuid)
RETURNS TABLE (
  patente text,
  guia_actual text,
  guia_nuevo text,
  cambia boolean,
  turnos text,
  motivo text,
  libres integer,
  llenados_por_ella integer,
  vehiculo_id uuid
)
LANGUAGE plpgsql VOLATILE AS $$
#variable_conflict use_column
DECLARE
  v_guias text[] := guias_responsables_activos();
  v_n int := array_length(v_guias, 1);
  v_autos int;
  v_id uuid;
  v_id2 uuid;
  v_destino text;
  v_delta int;
  v_vueltas int := 0;
BEGIN
  DROP TABLE IF EXISTS _rp_autos;
  DROP TABLE IF EXISTS _rp_carga;
  DROP TABLE IF EXISTS _rp_base;

  CREATE TEMP TABLE _rp_autos AS
  SELECT v.id, v.patente::text AS patente, v.guia_responsable AS guia_actual,
         o.d_guia, o.d_ocupado, o.n_guia, o.n_ocupado,
         (NOT o.d_ocupado)::int + (NOT o.n_ocupado)::int AS libres,
         CASE WHEN v.guia_responsable = ANY (v_guias) THEN v.guia_responsable END AS asignada
  FROM vehiculos v
  CROSS JOIN LATERAL (
    SELECT max(x.guia) FILTER (WHERE x.turno = 'D') AS d_guia,
           coalesce(bool_or(x.ocupado) FILTER (WHERE x.turno = 'D'), false) AS d_ocupado,
           max(x.guia) FILTER (WHERE x.turno = 'N') AS n_guia,
           coalesce(bool_or(x.ocupado) FILTER (WHERE x.turno = 'N'), false) AS n_ocupado
    FROM vehiculo_turnos_ocupacion(v.id) x
  ) o
  WHERE v.deleted_at IS NULL
    AND v.sede_id = p_sede_id
    AND vehiculo_es_operativo(v.estado_id);

  v_autos := (SELECT count(*) FROM _rp_autos)::int;

  -- Cada agente: turnos que ya llenó (en cualquier auto), cuántos autos le tocan (los que
  -- no dan exacto, a quien más llenó) y su objetivo de turnos por llenar.
  CREATE TEMP TABLE _rp_carga AS
  SELECT g.guia,
         (SELECT coalesce(sum(rp_turnos_de(a.d_ocupado, a.d_guia, a.n_ocupado, a.n_guia, g.guia)), 0)
            FROM _rp_autos a)::int AS llenados,
         0 AS cupo_autos,
         0 AS objetivo
  FROM unnest(v_guias) AS g(guia);

  UPDATE _rp_carga c
  SET cupo_autos = v_autos / v_n + CASE WHEN x.rn <= v_autos % v_n THEN 1 ELSE 0 END
  FROM (SELECT guia, row_number() OVER (ORDER BY llenados DESC, guia) AS rn FROM _rp_carga) x
  WHERE x.guia = c.guia;
  UPDATE _rp_carga SET objetivo = 2 * cupo_autos - llenados;

  -- 1) Que cada agente tenga sus autos: pasar los que sobran (o sin agente) a quien le
  --    faltan, eligiendo cada vez el pase que mejor deja el puntaje.
  LOOP
    WITH est AS (
      SELECT c.guia, c.cupo_autos, c.objetivo,
             count(a.id)::int AS autos, coalesce(sum(a.libres), 0)::int AS libres
      FROM _rp_carga c LEFT JOIN _rp_autos a ON a.asignada = c.guia
      GROUP BY c.guia, c.cupo_autos, c.objetivo
    )
    SELECT a.id, d.guia,
           1000 * (abs(d.libres + a.libres - d.objetivo) - abs(d.libres - d.objetivo)
                  + coalesce(abs(o.libres - a.libres - o.objetivo) - abs(o.libres - o.objetivo), 0))
           - 10 * (rp_afinidad(a.d_ocupado, a.d_guia, a.n_ocupado, a.n_guia, d.guia)
                  - coalesce(rp_afinidad(a.d_ocupado, a.d_guia, a.n_ocupado, a.n_guia, o.guia), 0))
           + ((a.guia_actual IS DISTINCT FROM d.guia)::int - (a.guia_actual IS DISTINCT FROM a.asignada)::int)
    INTO v_id, v_destino, v_delta
    FROM _rp_autos a
    LEFT JOIN est o ON o.guia = a.asignada
    JOIN est d ON d.autos < d.cupo_autos AND d.guia IS DISTINCT FROM a.asignada
    WHERE a.asignada IS NULL OR o.autos > o.cupo_autos
    ORDER BY 3, a.patente, d.guia
    LIMIT 1;

    EXIT WHEN NOT FOUND;
    UPDATE _rp_autos SET asignada = v_destino WHERE id = v_id;
  END LOOP;

  -- 2) Intercambiar autos entre agentes (cada una mantiene su cantidad) mientras baje
  --    el puntaje.
  LOOP
    v_vueltas := v_vueltas + 1;
    EXIT WHEN v_vueltas > 500;

    WITH est AS (
      SELECT c.guia, c.objetivo, coalesce(sum(a.libres), 0)::int AS libres
      FROM _rp_carga c LEFT JOIN _rp_autos a ON a.asignada = c.guia
      GROUP BY c.guia, c.objetivo
    )
    SELECT p.id, q.id,
           1000 * (abs(gp.libres - p.libres + q.libres - gp.objetivo) - abs(gp.libres - gp.objetivo)
                  + abs(gq.libres - q.libres + p.libres - gq.objetivo) - abs(gq.libres - gq.objetivo))
           - 10 * (rp_afinidad(p.d_ocupado, p.d_guia, p.n_ocupado, p.n_guia, q.asignada)
                  + rp_afinidad(q.d_ocupado, q.d_guia, q.n_ocupado, q.n_guia, p.asignada)
                  - rp_afinidad(p.d_ocupado, p.d_guia, p.n_ocupado, p.n_guia, p.asignada)
                  - rp_afinidad(q.d_ocupado, q.d_guia, q.n_ocupado, q.n_guia, q.asignada))
           + ((p.guia_actual IS DISTINCT FROM q.asignada)::int + (q.guia_actual IS DISTINCT FROM p.asignada)::int
              - (p.guia_actual IS DISTINCT FROM p.asignada)::int - (q.guia_actual IS DISTINCT FROM q.asignada)::int)
    INTO v_id, v_id2, v_delta
    FROM _rp_autos p
    JOIN _rp_autos q ON q.asignada > p.asignada
    JOIN est gp ON gp.guia = p.asignada
    JOIN est gq ON gq.guia = q.asignada
    ORDER BY 3, p.patente, q.patente
    LIMIT 1;

    EXIT WHEN NOT FOUND OR v_delta >= 0;
    UPDATE _rp_autos x
    SET asignada = CASE WHEN x.id = v_id THEN (SELECT asignada FROM _rp_autos WHERE id = v_id2)
                        ELSE (SELECT asignada FROM _rp_autos WHERE id = v_id) END
    WHERE x.id IN (v_id, v_id2);
  END LOOP;

  -- 3) Con los turnos por llenar ya parejos, cambiar autos para que queden con la agente
  --    de sus conductores, aunque eso mueva hasta 1 turno por llenar de cada agente
  --    (TOLERANCIA_TURNOS). Ej.: un auto con conductores de Carla que tenía Eunice, por
  --    uno con conductores de Eunice que tenía Carla.
  CREATE TEMP TABLE _rp_base AS
  SELECT c.guia, coalesce(sum(a.libres), 0)::int AS libres
  FROM _rp_carga c LEFT JOIN _rp_autos a ON a.asignada = c.guia
  GROUP BY c.guia;
  v_vueltas := 0;
  LOOP
    v_vueltas := v_vueltas + 1;
    EXIT WHEN v_vueltas > 200;

    WITH est AS (
      SELECT b.guia, b.libres AS base, coalesce(sum(a.libres), 0)::int AS libres
      FROM _rp_base b LEFT JOIN _rp_autos a ON a.asignada = b.guia
      GROUP BY b.guia, b.libres
    )
    SELECT p.id, q.id,
           rp_afinidad(p.d_ocupado, p.d_guia, p.n_ocupado, p.n_guia, q.asignada)
             + rp_afinidad(q.d_ocupado, q.d_guia, q.n_ocupado, q.n_guia, p.asignada)
             - rp_afinidad(p.d_ocupado, p.d_guia, p.n_ocupado, p.n_guia, p.asignada)
             - rp_afinidad(q.d_ocupado, q.d_guia, q.n_ocupado, q.n_guia, q.asignada)
    INTO v_id, v_id2, v_delta
    FROM _rp_autos p
    JOIN _rp_autos q ON q.asignada > p.asignada
    JOIN est gp ON gp.guia = p.asignada
    JOIN est gq ON gq.guia = q.asignada
    WHERE abs(gp.libres - p.libres + q.libres - gp.base) <= 1   -- TOLERANCIA_TURNOS
      AND abs(gq.libres - q.libres + p.libres - gq.base) <= 1
    ORDER BY 3 DESC, p.patente, q.patente
    LIMIT 1;

    EXIT WHEN NOT FOUND OR v_delta <= 0;
    UPDATE _rp_autos x
    SET asignada = CASE WHEN x.id = v_id THEN (SELECT asignada FROM _rp_autos WHERE id = v_id2)
                        ELSE (SELECT asignada FROM _rp_autos WHERE id = v_id) END
    WHERE x.id IN (v_id, v_id2);
  END LOOP;

  RETURN QUERY
  SELECT a.patente,
         a.guia_actual,
         a.asignada,
         a.guia_actual IS DISTINCT FROM a.asignada,
         'D: ' || CASE WHEN a.d_ocupado THEN coalesce(split_part(a.d_guia, ' ', 1), 'otro') ELSE 'libre' END
           || ' · N: ' || CASE WHEN a.n_ocupado THEN coalesce(split_part(a.n_guia, ' ', 1), 'otro') ELSE 'libre' END,
         CASE
           WHEN a.guia_actual IS NOT DISTINCT FROM a.asignada THEN 'Sin cambio'
           WHEN rp_turnos_de(a.d_ocupado, a.d_guia, a.n_ocupado, a.n_guia, a.asignada) > 0 THEN 'Conductores suyos'
           WHEN a.d_guia IS NOT NULL OR a.n_guia IS NOT NULL THEN 'Conductores de otras agentes, que ya completaron sus autos'
           WHEN a.libres = 2 THEN 'Vacío: para emparejar turnos por llenar'
           ELSE 'Para emparejar turnos por llenar'
         END,
         a.libres,
         rp_turnos_de(a.d_ocupado, a.d_guia, a.n_ocupado, a.n_guia, a.asignada),
         a.id
  FROM _rp_autos a
  ORDER BY (a.guia_actual IS DISTINCT FROM a.asignada) DESC, a.asignada, a.patente;
END;
$$;

-- Resumen por agente del reparto calculado (no guarda nada).
CREATE OR REPLACE FUNCTION resumen_reparto_guias_turnos(p_sede_id uuid)
RETURNS TABLE (
  agente text,
  autos_hoy integer,
  autos integer,
  turnos integer,
  ya_lleno integer,
  objetivo_por_llenar integer,
  por_llenar integer,
  por_llenar_d integer,
  por_llenar_n integer,
  recibe integer,
  entrega integer
)
LANGUAGE plpgsql VOLATILE AS $$
#variable_conflict use_column
BEGIN
  PERFORM count(*) FROM plan_reparto_guias_turnos(p_sede_id);
  RETURN QUERY
  SELECT c.guia,
         (SELECT count(*) FROM _rp_autos a WHERE a.guia_actual = c.guia)::int,
         (SELECT count(*) FROM _rp_autos a WHERE a.asignada = c.guia)::int,
         c.cupo_autos * 2,
         c.llenados,
         c.objetivo,
         (SELECT coalesce(sum(a.libres), 0) FROM _rp_autos a WHERE a.asignada = c.guia)::int,
         (SELECT count(*) FROM _rp_autos a WHERE a.asignada = c.guia AND NOT a.d_ocupado)::int,
         (SELECT count(*) FROM _rp_autos a WHERE a.asignada = c.guia AND NOT a.n_ocupado)::int,
         (SELECT count(*) FROM _rp_autos a WHERE a.asignada = c.guia AND a.guia_actual IS DISTINCT FROM c.guia)::int,
         (SELECT count(*) FROM _rp_autos a WHERE a.guia_actual = c.guia AND a.asignada IS DISTINCT FROM c.guia)::int
  FROM _rp_carga c
  ORDER BY c.guia;
END;
$$;

-- Guarda el reparto calculado por plan_reparto_guias_turnos. Devuelve cuántos cambió.
CREATE OR REPLACE FUNCTION aplicar_reparto_guias_turnos(p_sede_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cambiados int;
BEGIN
  PERFORM set_config('toshify.repartiendo_guias', 'on', true);
  UPDATE vehiculos v
  SET guia_responsable = p.guia_nuevo
  FROM plan_reparto_guias_turnos(p_sede_id) p
  WHERE v.id = p.vehiculo_id AND p.cambia;
  GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  PERFORM set_config('toshify.repartiendo_guias', 'off', true);
  RETURN v_cambiados;
END;
$$;


-- ───────────── PASO 2: VISTA PREVIA (no cambia nada) ─────────────
-- Auto por auto (primero los que cambian de agente):
SELECT patente, guia_actual, guia_nuevo, cambia, turnos, motivo
FROM plan_reparto_guias_turnos((SELECT id FROM sedes WHERE codigo = 'BSAS'));

-- Resumen por agente: autos hoy y después, turnos que ya llenó, su objetivo de turnos por
-- llenar y cuántos le quedarían (D y N).
SELECT * FROM resumen_reparto_guias_turnos((SELECT id FROM sedes WHERE codigo = 'BSAS'));


-- ───────────── PASO 3: GUARDAR (después de revisar la vista previa) ─────────────
BEGIN;

SELECT aplicar_reparto_guias_turnos((SELECT id FROM sedes WHERE codigo = 'BSAS')) AS autos_cambiados;

-- Regla nueva para los autos que entran (nuevos o que vuelven de taller, robo...):
-- van a la agente con MENOS turnos por llenar en su sede. Empate: la de los conductores
-- del auto, después la que tiene menos autos.
-- OJO (2026-11-06): reemplazada por sql/vehiculos_guia_por_cantidad.sql (va a la guía
-- con MENOS AUTOS). Si se vuelve a correr este paso, correr ese archivo después.
CREATE OR REPLACE FUNCTION elegir_guia_vehiculo(p_vehiculo_id uuid, p_sede_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT g.guia
  FROM unnest(guias_responsables_activos()) AS g(guia)
  CROSS JOIN LATERAL (
    SELECT count(*) AS autos, coalesce(sum(t.libres_d + t.libres_n), 0) AS por_llenar
    FROM vehiculos v
    CROSS JOIN LATERAL vehiculo_turnos_libres(v.id) t
    WHERE v.deleted_at IS NULL
      AND v.id <> p_vehiculo_id
      AND v.guia_responsable = g.guia
      AND v.sede_id IS NOT DISTINCT FROM p_sede_id
      AND vehiculo_es_operativo(v.estado_id)
  ) c
  ORDER BY c.por_llenar,
           (g.guia = ANY (vehiculo_guias_conductores(p_vehiculo_id))) DESC,
           c.autos,
           g.guia
  LIMIT 1
$$;

-- Botón "Repartir responsables" de Vehículos: "Solo sin responsable" usa la regla de
-- arriba auto por auto; "Reacomodar por turnos" (p_rehacer) recalcula el reparto por
-- turnos de cada sede, moviendo lo menos posible (los cambios a mano pueden moverse).
CREATE OR REPLACE FUNCTION repartir_guias_vehiculos(p_sede_id uuid DEFAULT NULL, p_rehacer boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
  v_total int := 0;
BEGIN
  -- Sólo administradores (o el editor SQL de Supabase, sin usuario logueado)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION 'Sólo un administrador puede repartir los responsables';
  END IF;

  IF p_rehacer THEN
    FOR v IN
      SELECT DISTINCT ve.sede_id
      FROM vehiculos ve
      WHERE ve.deleted_at IS NULL AND ve.sede_id IS NOT NULL
        AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
        AND vehiculo_es_operativo(ve.estado_id)
    LOOP
      v_total := v_total + aplicar_reparto_guias_turnos(v.sede_id);
    END LOOP;
    RETURN v_total;
  END IF;

  PERFORM set_config('toshify.repartiendo_guias', 'on', true);
  FOR v IN
    SELECT ve.id, ve.sede_id
    FROM vehiculos ve
    WHERE ve.deleted_at IS NULL
      AND ve.guia_responsable IS NULL
      AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
      AND vehiculo_es_operativo(ve.estado_id)
    ORDER BY ve.id
  LOOP
    UPDATE vehiculos SET guia_responsable = elegir_guia_vehiculo(v.id, v.sede_id) WHERE id = v.id;
    v_total := v_total + 1;
  END LOOP;
  PERFORM set_config('toshify.repartiendo_guias', 'off', true);
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION repartir_guias_vehiculos(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION repartir_guias_vehiculos(uuid, boolean) FROM PUBLIC, anon;
-- Funciones internas: sólo las llama repartir_guias_vehiculos (no desde la web)
REVOKE EXECUTE ON FUNCTION aplicar_reparto_guias_turnos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION plan_reparto_guias_turnos(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Para revisar cómo quedó:
-- SELECT v.guia_responsable, count(*) AS autos, sum(t.libres_d) AS libres_d, sum(t.libres_n) AS libres_n
-- FROM vehiculos v CROSS JOIN LATERAL vehiculo_turnos_libres(v.id) t
-- WHERE v.deleted_at IS NULL AND vehiculo_es_operativo(v.estado_id)
--   AND v.sede_id = (SELECT id FROM sedes WHERE codigo = 'BSAS')
-- GROUP BY 1 ORDER BY 1;
