-- sql/vehiculos_estado_historial.sql
-- Historial de estados de cada vehículo, por períodos, con motivo (2026-11-06).
--
-- Cada fila es un período: el auto estuvo en `estado_codigo` desde `desde` hasta
-- `hasta` (hasta NULL = sigue hoy). Lo llena un trigger sobre vehiculos.estado_id,
-- así que queda registrado TODO cambio, venga de donde venga (Vehículos,
-- asignaciones, siniestros, bajas de conductor, scripts...). historial_vehiculos
-- (lo que escribe la app) dejaba cambios sin anotar.
--
-- Motivo: quien cambia el estado manda el texto en vehiculos.motivo_cambio_estado
-- en el MISMO update. El trigger lo guarda en el período nuevo y deja la columna
-- en NULL, así nunca se arrastra un motivo viejo al cambio siguiente.
--
-- Lo de antes se reconstruye con historial_vehiculos (desde 2026-02-25): esos
-- períodos quedan con origen = 'historial_anterior' y pueden tener huecos.
--
-- Se puede correr más de una vez (la reconstrucción solo corre si la tabla está vacía).

BEGIN;

ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS motivo_cambio_estado text;

CREATE TABLE IF NOT EXISTS public.vehiculos_estado_historial (
  id             bigserial   PRIMARY KEY,
  vehiculo_id    uuid        NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  estado_id      uuid,
  estado_codigo  text,
  desde          timestamptz NOT NULL DEFAULT now(),
  hasta          timestamptz,
  motivo         text,
  -- 'trigger' (registrado en vivo), 'historial_anterior' (reconstruido),
  -- 'inicio_registro' (estado que tenía al empezar, sin fecha real de inicio)
  origen         text        NOT NULL DEFAULT 'trigger',
  cambiado_por   uuid,
  usuario_nombre text,
  CHECK (hasta IS NULL OR hasta >= desde)
);

CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_estado_historial_abierto
  ON public.vehiculos_estado_historial (vehiculo_id) WHERE hasta IS NULL;
CREATE INDEX IF NOT EXISTS vehiculos_estado_historial_vehiculo
  ON public.vehiculos_estado_historial (vehiculo_id, desde);

ALTER TABLE public.vehiculos_estado_historial ENABLE ROW LEVEL SECURITY;
-- Solo lectura desde la app: escribe únicamente el trigger
DROP POLICY IF EXISTS vehiculos_estado_historial_select ON public.vehiculos_estado_historial;
CREATE POLICY vehiculos_estado_historial_select ON public.vehiculos_estado_historial
  FOR SELECT TO authenticated USING (true);

-- Cierra el período abierto y abre uno nuevo con el estado actual.
CREATE OR REPLACE FUNCTION registrar_periodo_estado_vehiculo(
  p_vehiculo_id uuid, p_estado_id uuid, p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_nombre text;
BEGIN
  SELECT codigo INTO v_codigo FROM vehiculos_estados WHERE id = p_estado_id;
  SELECT full_name INTO v_nombre FROM user_profiles WHERE id = auth.uid();

  UPDATE vehiculos_estado_historial
     SET hasta = now()
   WHERE vehiculo_id = p_vehiculo_id AND hasta IS NULL;

  IF p_estado_id IS NOT NULL THEN
    INSERT INTO vehiculos_estado_historial
      (vehiculo_id, estado_id, estado_codigo, desde, motivo, origen, cambiado_por, usuario_nombre)
    VALUES
      (p_vehiculo_id, p_estado_id, v_codigo, now(), nullif(trim(p_motivo), ''), 'trigger',
       auth.uid(), v_nombre);
  END IF;
END;
$$;

-- UPDATE: BEFORE, para poder limpiar el motivo en la misma fila.
CREATE OR REPLACE FUNCTION trg_vehiculos_estado_historial_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_id IS DISTINCT FROM OLD.estado_id THEN
    PERFORM registrar_periodo_estado_vehiculo(NEW.id, NEW.estado_id, NEW.motivo_cambio_estado);
  END IF;
  NEW.motivo_cambio_estado := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_estado_historial_upd ON public.vehiculos;
CREATE TRIGGER vehiculos_estado_historial_upd
  BEFORE UPDATE OF estado_id, motivo_cambio_estado ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_estado_historial_upd();

-- INSERT: AFTER (la fila tiene que existir por la FK).
CREATE OR REPLACE FUNCTION trg_vehiculos_estado_historial_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM registrar_periodo_estado_vehiculo(NEW.id, NEW.estado_id,
    coalesce(nullif(trim(NEW.motivo_cambio_estado), ''), 'Alta del vehículo'));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_estado_historial_ins ON public.vehiculos;
CREATE TRIGGER vehiculos_estado_historial_ins
  AFTER INSERT ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_estado_historial_ins();

-- Reconstrucción del pasado (solo la primera vez)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vehiculos_estado_historial) THEN
    RETURN;
  END IF;

  -- 1) Períodos desde historial_vehiculos: cada cambio abre un período que dura
  --    hasta el cambio siguiente. Se juntan los cambios seguidos al mismo estado.
  WITH ev AS (
    SELECT h.vehiculo_id, h.estado_nuevo AS codigo, h.created_at, h.usuario_id, h.usuario_nombre,
           lag(h.estado_nuevo) OVER (PARTITION BY h.vehiculo_id ORDER BY h.created_at) AS previo
    FROM historial_vehiculos h
    JOIN vehiculos v ON v.id = h.vehiculo_id
    WHERE h.tipo_evento = 'cambio_estado'
      AND h.estado_nuevo IS NOT NULL
      AND h.estado_nuevo <> 'SIN_ESTADO'
  ), cambios AS (
    SELECT * FROM ev WHERE previo IS DISTINCT FROM codigo
  ), periodos AS (
    SELECT c.*,
           lead(c.created_at) OVER (PARTITION BY c.vehiculo_id ORDER BY c.created_at) AS siguiente
    FROM cambios c
  )
  INSERT INTO vehiculos_estado_historial
    (vehiculo_id, estado_id, estado_codigo, desde, hasta, motivo, origen, cambiado_por, usuario_nombre)
  SELECT p.vehiculo_id, e.id, p.codigo, p.created_at,
         -- el último queda abierto solo si coincide con el estado de hoy
         CASE
           WHEN p.siguiente IS NOT NULL THEN p.siguiente
           WHEN e.id IS NOT DISTINCT FROM v.estado_id THEN NULL
           ELSE now()
         END,
         NULL, 'historial_anterior', p.usuario_id, p.usuario_nombre
  FROM periodos p
  JOIN vehiculos v ON v.id = p.vehiculo_id
  LEFT JOIN vehiculos_estados e ON e.codigo = p.codigo;

  -- 2) Autos sin período abierto (sin historial o con un último estado distinto
  --    del actual): se abre el estado de hoy, sin fecha real de inicio.
  INSERT INTO vehiculos_estado_historial
    (vehiculo_id, estado_id, estado_codigo, desde, motivo, origen)
  SELECT v.id, v.estado_id, e.codigo, now(), NULL, 'inicio_registro'
  FROM vehiculos v
  LEFT JOIN vehiculos_estados e ON e.id = v.estado_id
  WHERE v.estado_id IS NOT NULL
    AND v.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM vehiculos_estado_historial h
      WHERE h.vehiculo_id = v.id AND h.hasta IS NULL
    );
END $$;

COMMIT;

-- Comprobar
SELECT origen, count(*) AS periodos, count(*) FILTER (WHERE hasta IS NULL) AS abiertos
FROM vehiculos_estado_historial
GROUP BY 1 ORDER BY 1;
