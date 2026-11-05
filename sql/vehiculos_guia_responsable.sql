-- sql/vehiculos_guia_responsable.sql
-- Guía (agente de ventas) responsable de llenar los turnos de cada vehículo.
--
-- ACTUALIZADO 2026-11-04: el reparto pasó a ser por TURNOS (cuenta lo que cada agente ya
-- llenó) y los autos que entran van a quien tiene menos turnos por llenar. Ver
-- sql/vehiculos_guia_reparto_turnos.sql, que reemplaza elegir_guia_vehiculo.
--
-- Es solo para ORGANIZAR la flota: dice quién tiene que buscarle conductores a cada
-- auto. NO está relacionado con conductores.guia (el guía que onboardeó al conductor),
-- que es lo que mide el rendimiento individual de cada guía. Un auto de Carla puede
-- tener un conductor de Ali y eso está bien.
--
-- Reglas:
--   * Solo tienen responsable los vehículos en PKG ON (PKG_ON_BASE) o EN USO.
--   * Misma cantidad de vehículos por guía (dentro de cada sede): entre uno y otro
--     nunca hay más de 1 auto de diferencia.
--   * Respetando eso, si el auto tiene conductores se prefiere al guía de esos
--     conductores (solo Ali, Carla o Eunice); si son de guías distintos, al que tenga
--     menos autos.
--   * Los empates se resuelven equilibrando los turnos libres D y N.
--   * Queda guardado y se puede cambiar a mano. Al salir de PKG ON / EN USO (taller,
--     robo, etc.) se libera; al volver (o al crear un vehículo nuevo) se asigna solo,
--     según cómo esté el reparto en ese momento.
--
-- Se puede correr más de una vez. Al final reparte los vehículos que todavía no tienen.

ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS guia_responsable text;
COMMENT ON COLUMN vehiculos.guia_responsable IS
  'Guía de ventas responsable de llenar los turnos del vehículo (organización, no rendimiento). Independiente de conductores.guia.';
CREATE INDEX IF NOT EXISTS idx_vehiculos_guia_responsable ON vehiculos (guia_responsable);

-- Guías activos (mismo listado que GUIAS_ACTIVOS en src/modules/leads/guias.ts).
CREATE OR REPLACE FUNCTION guias_responsables_activos()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Ali Verenzuela', 'Carla Noguera', 'Eunice D''Urso']::text[]
$$;

-- Guía activo de un conductor (por el primer nombre). NULL si no es Ali, Carla o
-- Eunice: acá Sara o Camila NO cuentan como Ali, para no cargarle autos de más.
CREATE OR REPLACE FUNCTION guia_homologado_activo(p_guia text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(split_part(btrim(coalesce(p_guia, '')), ' ', 1))
    WHEN 'ali' THEN 'Ali Verenzuela'
    WHEN 'carla' THEN 'Carla Noguera'
    WHEN 'eunice' THEN 'Eunice D''Urso'
  END
$$;

CREATE OR REPLACE FUNCTION vehiculo_es_operativo(p_estado_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM vehiculos_estados e
    WHERE e.id = p_estado_id AND e.codigo IN ('PKG_ON_BASE', 'EN_USO')
  )
$$;

-- Turnos libres (D y N) de un vehículo hoy. Sin asignación activa = los dos libres.
CREATE OR REPLACE FUNCTION vehiculo_turnos_libres(p_vehiculo_id uuid, OUT libres_d int, OUT libres_n int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_asig record;
  v_d boolean;
  v_n boolean;
BEGIN
  SELECT a.id, a.horario INTO v_asig
  FROM asignaciones a
  WHERE a.vehiculo_id = p_vehiculo_id AND a.estado IN ('activo', 'activa')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    libres_d := 1; libres_n := 1; RETURN;
  END IF;

  IF v_asig.horario = 'turno' THEN
    SELECT
      bool_or(lower(ac.horario) IN ('diurno', 'd')),
      bool_or(lower(ac.horario) IN ('nocturno', 'n'))
    INTO v_d, v_n
    FROM asignaciones_conductores ac
    WHERE ac.asignacion_id = v_asig.id
      AND ac.conductor_id IS NOT NULL
      AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado');
    libres_d := CASE WHEN coalesce(v_d, false) THEN 0 ELSE 1 END;
    libres_n := CASE WHEN coalesce(v_n, false) THEN 0 ELSE 1 END;
  ELSE
    -- A cargo: el auto entero lo ocupa un conductor
    IF EXISTS (
      SELECT 1 FROM asignaciones_conductores ac
      WHERE ac.asignacion_id = v_asig.id AND ac.conductor_id IS NOT NULL
        AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado')
    ) THEN
      libres_d := 0; libres_n := 0;
    ELSE
      libres_d := 1; libres_n := 1;
    END IF;
  END IF;
END;
$$;

-- Guías activos de los conductores que hoy están en el vehículo.
CREATE OR REPLACE FUNCTION vehiculo_guias_conductores(p_vehiculo_id uuid)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT g), ARRAY[]::text[])
  FROM (
    SELECT guia_homologado_activo(c.guia) AS g
    FROM asignaciones a
    JOIN asignaciones_conductores ac ON ac.asignacion_id = a.id
    JOIN conductores c ON c.id = ac.conductor_id
    WHERE a.vehiculo_id = p_vehiculo_id
      AND a.estado IN ('activo', 'activa')
      AND ac.estado NOT IN ('cancelado', 'completado', 'finalizado')
  ) x
  WHERE g IS NOT NULL
$$;

-- Elige el guía para un vehículo según cómo está el reparto ahora en su sede.
-- Con N autos operativos y G guías, cada guía tiene N/G autos (redondeado hacia abajo)
-- y los que sobran van de a uno: nunca más de 1 auto de diferencia entre guías.
-- Entre los guías que todavía tienen lugar: primero el guía de los conductores del
-- auto, después el que menos autos tiene, después el que menos turnos libres tiene en
-- el turno que aporta este auto (D y N por separado).
CREATE OR REPLACE FUNCTION elegir_guia_vehiculo(p_vehiculo_id uuid, p_sede_id uuid)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_guias text[] := guias_responsables_activos();
  v_preferidos text[];
  v_libres record;
  v_total int;
  v_base int;
  v_sobran int;
  v_elegido text;
BEGIN
  v_preferidos := vehiculo_guias_conductores(p_vehiculo_id);
  SELECT t.libres_d, t.libres_n INTO v_libres FROM vehiculo_turnos_libres(p_vehiculo_id) t;

  -- Autos operativos de la sede, contando este (aunque todavía no esté en la tabla)
  SELECT count(*) + 1 INTO v_total
  FROM vehiculos v
  WHERE v.deleted_at IS NULL
    AND v.id <> p_vehiculo_id
    AND v.sede_id IS NOT DISTINCT FROM p_sede_id
    AND vehiculo_es_operativo(v.estado_id);

  v_base := v_total / array_length(v_guias, 1);
  v_sobran := v_total % array_length(v_guias, 1);

  WITH carga AS (
    SELECT g.guia,
           coalesce(c.vehiculos, 0) AS vehiculos,
           coalesce(c.libres_d, 0) AS libres_d,
           coalesce(c.libres_n, 0) AS libres_n
    FROM unnest(v_guias) AS g(guia)
    LEFT JOIN (
      SELECT v.guia_responsable AS guia,
             count(*)::int AS vehiculos,
             sum(t.libres_d)::int AS libres_d,
             sum(t.libres_n)::int AS libres_n
      FROM vehiculos v
      CROSS JOIN LATERAL vehiculo_turnos_libres(v.id) t
      WHERE v.deleted_at IS NULL
        AND v.id <> p_vehiculo_id
        AND v.guia_responsable IS NOT NULL
        AND v.sede_id IS NOT DISTINCT FROM p_sede_id
        AND vehiculo_es_operativo(v.estado_id)
      GROUP BY v.guia_responsable
    ) c ON c.guia = g.guia
  ),
  con_extra AS (
    -- Guías que ya usaron uno de los autos "de sobra"
    SELECT count(*) AS n FROM carga WHERE vehiculos >= v_base + 1
  )
  SELECT c.guia INTO v_elegido
  FROM carga c, con_extra e
  ORDER BY
    -- 1) Que tenga lugar sin romper la igualdad
    (c.vehiculos < v_base OR (c.vehiculos = v_base AND e.n < v_sobran)) DESC,
    -- 2) El guía de los conductores del auto
    (c.guia = ANY (v_preferidos)) DESC,
    -- 3) El que menos autos tiene
    c.vehiculos,
    -- 4) Equilibrar los turnos libres D y N que aporta este auto
    (CASE WHEN v_libres.libres_d > 0 THEN c.libres_d ELSE 0 END
      + CASE WHEN v_libres.libres_n > 0 THEN c.libres_n ELSE 0 END),
    c.libres_d + c.libres_n,
    c.guia
  LIMIT 1;

  RETURN v_elegido;
END;
$$;

-- Trigger: al crear un vehículo o cambiarle el estado.
CREATE OR REPLACE FUNCTION trg_vehiculos_guia_responsable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_era_operativo boolean := false;
  v_cambio_manual boolean := false;
BEGIN
  -- repartir_guias_vehiculos decide el orden del reparto por su cuenta
  IF current_setting('toshify.repartiendo_guias', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NOT vehiculo_es_operativo(NEW.estado_id) THEN
    NEW.guia_responsable := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_era_operativo := OLD.deleted_at IS NULL AND vehiculo_es_operativo(OLD.estado_id);
    v_cambio_manual := NEW.guia_responsable IS DISTINCT FROM OLD.guia_responsable;
  ELSE
    v_cambio_manual := NEW.guia_responsable IS NOT NULL;
  END IF;

  -- Sin responsable, o vuelve a la flota (nuevo, recuperado, sale de taller...):
  -- asignar solo, salvo que el mismo cambio ya traiga un responsable elegido a mano.
  IF NEW.guia_responsable IS NULL OR (NOT v_era_operativo AND NOT v_cambio_manual) THEN
    NEW.guia_responsable := elegir_guia_vehiculo(NEW.id, NEW.sede_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_guia_responsable ON vehiculos;
CREATE TRIGGER vehiculos_guia_responsable
  BEFORE INSERT OR UPDATE OF estado_id, deleted_at, guia_responsable ON vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_guia_responsable();

-- Reparto: asigna los vehículos operativos sin responsable (o todos si p_rehacer).
-- Primero los que tienen conductores de un solo guía, después los de guías mezclados
-- y al final los vacíos, para que estos últimos compensen. Devuelve cuántos asignó.
CREATE OR REPLACE FUNCTION repartir_guias_vehiculos(p_sede_id uuid DEFAULT NULL, p_rehacer boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
  v_total int := 0;
BEGIN
  PERFORM set_config('toshify.repartiendo_guias', 'on', true);

  IF p_rehacer THEN
    UPDATE vehiculos SET guia_responsable = NULL
    WHERE deleted_at IS NULL
      AND (p_sede_id IS NULL OR sede_id = p_sede_id)
      AND guia_responsable IS NOT NULL;
  END IF;

  FOR v IN
    SELECT x.id, x.sede_id
    FROM (
      SELECT ve.id, ve.sede_id,
             coalesce(array_length(vehiculo_guias_conductores(ve.id), 1), 0) AS n_guias,
             t.libres_d + t.libres_n AS libres
      FROM vehiculos ve
      CROSS JOIN LATERAL vehiculo_turnos_libres(ve.id) t
      WHERE ve.deleted_at IS NULL
        AND ve.guia_responsable IS NULL
        AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
        AND vehiculo_es_operativo(ve.estado_id)
    ) x
    ORDER BY CASE x.n_guias WHEN 1 THEN 0 WHEN 0 THEN 2 ELSE 1 END, x.libres DESC, x.id
  LOOP
    UPDATE vehiculos SET guia_responsable = elegir_guia_vehiculo(v.id, v.sede_id) WHERE id = v.id;
    v_total := v_total + 1;
  END LOOP;

  PERFORM set_config('toshify.repartiendo_guias', 'off', true);
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION repartir_guias_vehiculos(uuid, boolean) TO authenticated;

-- Reparto inicial (solo los que no tienen responsable).
SELECT repartir_guias_vehiculos();

-- Para revisar cómo quedó:
-- SELECT v.guia_responsable, count(*) AS vehiculos, sum(t.libres_d) AS libres_d, sum(t.libres_n) AS libres_n
-- FROM vehiculos v CROSS JOIN LATERAL vehiculo_turnos_libres(v.id) t
-- WHERE v.deleted_at IS NULL AND vehiculo_es_operativo(v.estado_id)
-- GROUP BY 1 ORDER BY 1;
