-- sql/vehiculos_notas.sql
-- Bitácora de notas de cada vehículo (2026-11-06).
--
-- Antes había un solo campo vehiculos.notas que se pisaba al editar. Ahora cada
-- nota es una fila con fecha y quién la escribió; no se editan ni se borran
-- desde la app (es una bitácora).
--
-- vehiculos.notas queda como copia de la última nota (la usa el Excel de
-- Vehículos y lo que lea ese campo). La actualiza un trigger.
--
-- Las notas que ya existían pasan como primera entrada de cada auto, con la
-- fecha de la última actualización del vehículo (no hay fecha real).
--
-- Se puede correr más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vehiculos_notas (
  id             bigserial   PRIMARY KEY,
  vehiculo_id    uuid        NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  nota           text        NOT NULL CHECK (length(trim(nota)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid        DEFAULT auth.uid(),
  usuario_nombre text,
  -- 'app' (cargada en la bitácora) o 'nota_anterior' (migrada del campo viejo)
  origen         text        NOT NULL DEFAULT 'app'
);

CREATE INDEX IF NOT EXISTS vehiculos_notas_vehiculo
  ON public.vehiculos_notas (vehiculo_id, created_at DESC);

ALTER TABLE public.vehiculos_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehiculos_notas_select ON public.vehiculos_notas;
CREATE POLICY vehiculos_notas_select ON public.vehiculos_notas
  FOR SELECT TO authenticated USING (true);

-- Solo agregar, y a nombre propio
DROP POLICY IF EXISTS vehiculos_notas_insert ON public.vehiculos_notas;
CREATE POLICY vehiculos_notas_insert ON public.vehiculos_notas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Completa el nombre de quien escribe y copia la nota a vehiculos.notas
CREATE OR REPLACE FUNCTION trg_vehiculos_notas_nombre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.usuario_nombre IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT full_name INTO NEW.usuario_nombre FROM user_profiles WHERE id = NEW.created_by;
  END IF;
  NEW.nota := trim(NEW.nota);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_notas_nombre ON public.vehiculos_notas;
CREATE TRIGGER vehiculos_notas_nombre
  BEFORE INSERT ON public.vehiculos_notas
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_notas_nombre();

CREATE OR REPLACE FUNCTION trg_vehiculos_notas_ultima()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen = 'app' THEN
    UPDATE vehiculos SET notas = NEW.nota
     WHERE id = NEW.vehiculo_id AND notas IS DISTINCT FROM NEW.nota;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_notas_ultima ON public.vehiculos_notas;
CREATE TRIGGER vehiculos_notas_ultima
  AFTER INSERT ON public.vehiculos_notas
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_notas_ultima();

-- Alta de vehículo con nota (el asistente de Crear vehículo la manda en vehiculos.notas)
CREATE OR REPLACE FUNCTION trg_vehiculos_nota_alta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(trim(NEW.notas), '') IS NOT NULL THEN
    INSERT INTO vehiculos_notas (vehiculo_id, nota, created_by, origen)
    VALUES (NEW.id, NEW.notas, auth.uid(), 'app');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_nota_alta ON public.vehiculos;
CREATE TRIGGER vehiculos_nota_alta
  AFTER INSERT ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_nota_alta();

-- Migración de las notas que ya había (solo autos que todavía no tienen bitácora)
INSERT INTO vehiculos_notas (vehiculo_id, nota, created_at, created_by, usuario_nombre, origen)
SELECT v.id, trim(v.notas), coalesce(v.updated_at, v.created_at, now()), NULL, NULL, 'nota_anterior'
FROM vehiculos v
WHERE nullif(trim(v.notas), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM vehiculos_notas n WHERE n.vehiculo_id = v.id);

COMMIT;

-- Comprobar
SELECT origen, count(*) AS notas, count(DISTINCT vehiculo_id) AS vehiculos
FROM vehiculos_notas GROUP BY 1 ORDER BY 1;
