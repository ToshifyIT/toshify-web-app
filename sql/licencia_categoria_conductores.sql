-- =====================================================
-- Licencia del conductor: categoría única (B1 / D1 / Otros) + fecha de obtención
-- =====================================================
-- Mismo criterio que leads (sql/licencia_categoria_leads.sql), regla 2026-11-11 por la
-- Cyber Toshi Promo: un conductor con B1 paga por día hasta obtener la D1, así que hay
-- que saber qué categoría tiene y desde cuándo.
--
--   · tiene_licencia             = '¿Tiene licencia?' ('Si' / 'No')
--   · categoria_licencia         = 'B1', 'D1' u 'Otros' (selección única)
--   · categoria_licencia_otra    = texto libre cuando la categoría es 'Otros' (ej. "D3")
--   · fecha_licencia_b1          = fecha en que obtuvo la B1 (obligatoria con B1, opcional con D1)
--   · fecha_licencia_d1          = fecha en que obtuvo la D1 (obligatoria con D1)
--   · fecha_categoria_licencia   = fecha de la categoría actual (con Otros se carga a mano;
--                                  con B1 / D1 la app copia la de esa categoría)
--
-- conductores_licencias_categorias (selección múltiple) queda como HISTÓRICO: la app ya no
-- borra filas; solo agrega la categoría actual para que Guías, Asignaciones y los filtros
-- que la leen sigan viendo la licencia.
--
-- conductores_licencia_historial: una fila por cada cambio de categoría o de sus fechas,
-- la escribe un trigger (auditoría: qué cambió, cuándo y quién). Las fechas de B1 y D1
-- para reportes están en las columnas de conductores.
--
-- Se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS tiene_licencia text;
ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS categoria_licencia text;
ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS categoria_licencia_otra text;
ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS fecha_categoria_licencia date;
ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS fecha_licencia_b1 date;
ALTER TABLE public.conductores ADD COLUMN IF NOT EXISTS fecha_licencia_d1 date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conductores_tiene_licencia_check') THEN
    ALTER TABLE public.conductores ADD CONSTRAINT conductores_tiene_licencia_check
      CHECK (tiene_licencia IS NULL OR tiene_licencia IN ('Si', 'No'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conductores_categoria_licencia_check') THEN
    ALTER TABLE public.conductores ADD CONSTRAINT conductores_categoria_licencia_check
      CHECK (categoria_licencia IS NULL OR categoria_licencia IN ('B1', 'D1', 'Otros'));
  END IF;
END $$;

COMMENT ON COLUMN public.conductores.tiene_licencia IS '¿Tiene licencia? (Si / No).';
COMMENT ON COLUMN public.conductores.categoria_licencia IS 'Categoría de licencia actual: B1, D1 u Otros (selección única).';
COMMENT ON COLUMN public.conductores.categoria_licencia_otra IS 'Detalle de la licencia cuando categoria_licencia = Otros.';
COMMENT ON COLUMN public.conductores.fecha_categoria_licencia IS 'Fecha en que obtuvo la categoría de licencia actual.';
COMMENT ON COLUMN public.conductores.fecha_licencia_b1 IS 'Fecha en que obtuvo la licencia B1.';
COMMENT ON COLUMN public.conductores.fecha_licencia_d1 IS 'Fecha en que obtuvo la licencia D1.';

-- ---------- Historial de categoría ----------
CREATE TABLE IF NOT EXISTS public.conductores_licencia_historial (
  id                       bigserial   PRIMARY KEY,
  conductor_id             uuid        NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  categoria_licencia       text,
  categoria_licencia_otra  text,
  fecha_categoria_licencia date,
  fecha_licencia_b1        date,
  fecha_licencia_d1        date,
  categoria_anterior       text,
  registrado_at            timestamptz NOT NULL DEFAULT now(),
  -- 'trigger' (cambio en vivo) o 'inicio_registro' (lo que tenía al crear la tabla)
  origen                   text        NOT NULL DEFAULT 'trigger',
  cambiado_por             uuid,
  usuario_nombre           text
);

-- Por si la tabla se creó con una versión anterior de este script
ALTER TABLE public.conductores_licencia_historial ADD COLUMN IF NOT EXISTS fecha_licencia_b1 date;
ALTER TABLE public.conductores_licencia_historial ADD COLUMN IF NOT EXISTS fecha_licencia_d1 date;

CREATE INDEX IF NOT EXISTS conductores_licencia_historial_conductor
  ON public.conductores_licencia_historial (conductor_id, registrado_at);

ALTER TABLE public.conductores_licencia_historial ENABLE ROW LEVEL SECURITY;
-- Solo lectura desde la app: escribe únicamente el trigger
DROP POLICY IF EXISTS conductores_licencia_historial_select ON public.conductores_licencia_historial;
CREATE POLICY conductores_licencia_historial_select ON public.conductores_licencia_historial
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION trg_conductores_licencia_historial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.categoria_licencia IS NOT DISTINCT FROM OLD.categoria_licencia
     AND NEW.categoria_licencia_otra IS NOT DISTINCT FROM OLD.categoria_licencia_otra
     AND NEW.fecha_categoria_licencia IS NOT DISTINCT FROM OLD.fecha_categoria_licencia
     AND NEW.fecha_licencia_b1 IS NOT DISTINCT FROM OLD.fecha_licencia_b1
     AND NEW.fecha_licencia_d1 IS NOT DISTINCT FROM OLD.fecha_licencia_d1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.categoria_licencia IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_nombre FROM user_profiles WHERE id = auth.uid();
  INSERT INTO conductores_licencia_historial
    (conductor_id, categoria_licencia, categoria_licencia_otra, fecha_categoria_licencia,
     fecha_licencia_b1, fecha_licencia_d1, categoria_anterior, cambiado_por, usuario_nombre)
  VALUES
    (NEW.id, NEW.categoria_licencia, NEW.categoria_licencia_otra, NEW.fecha_categoria_licencia,
     NEW.fecha_licencia_b1, NEW.fecha_licencia_d1,
     CASE WHEN TG_OP = 'UPDATE' THEN OLD.categoria_licencia END, auth.uid(), v_nombre);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conductores_licencia_historial_trg ON public.conductores;
CREATE TRIGGER conductores_licencia_historial_trg
  AFTER INSERT OR UPDATE OF categoria_licencia, categoria_licencia_otra, fecha_categoria_licencia,
                            fecha_licencia_b1, fecha_licencia_d1
  ON public.conductores
  FOR EACH ROW EXECUTE FUNCTION trg_conductores_licencia_historial();

-- ---------- Completar lo que ya existe (solo conductores sin categoría) ----------
-- Regla (la de src/modules/leads/licenciaLead.ts):
--   · tiene D1 en el histórico                  → D1 (aunque también tenga B1)
--   · tiene B1 y no D1                           → B1
--   · otras clases                               → Otros (detalle con esas clases, ej. "D3, E1")
-- tiene_licencia = 'Si' si tiene número de licencia o alguna categoría.
-- Vista previa al 2026-11-11 (940 conductores): 432 → D1, 52 → B1, 50 → Otros.
-- 406 no tienen ninguna categoría cargada (sí número): quedan con tiene_licencia = 'Si'
-- y sin categoría, para completar a mano al editarlos.
-- Se desactiva el trigger para que el relleno no cuente como "cambio"; después se
-- registra como 'inicio_registro'.
ALTER TABLE public.conductores DISABLE TRIGGER conductores_licencia_historial_trg;

WITH clases AS (
  SELECT clc.conductor_id, array_agg(DISTINCT upper(lc.codigo) ORDER BY upper(lc.codigo)) AS codigos
  FROM conductores_licencias_categorias clc
  JOIN licencias_categorias lc ON lc.id = clc.licencia_categoria_id
  GROUP BY clc.conductor_id
)
UPDATE conductores c
SET categoria_licencia = CASE
      WHEN 'D1' = ANY(cl.codigos) THEN 'D1'
      WHEN 'B1' = ANY(cl.codigos) THEN 'B1'
      ELSE 'Otros'
    END,
    categoria_licencia_otra = CASE
      WHEN 'D1' = ANY(cl.codigos) OR 'B1' = ANY(cl.codigos) THEN NULL
      ELSE array_to_string(cl.codigos, ', ')
    END
FROM clases cl
WHERE cl.conductor_id = c.id
  AND c.categoria_licencia IS NULL;

UPDATE conductores
SET tiene_licencia = 'Si'
WHERE tiene_licencia IS NULL
  AND (nullif(trim(numero_licencia), '') IS NOT NULL OR categoria_licencia IS NOT NULL);

ALTER TABLE public.conductores ENABLE TRIGGER conductores_licencia_historial_trg;

INSERT INTO conductores_licencia_historial
  (conductor_id, categoria_licencia, categoria_licencia_otra, fecha_categoria_licencia, origen)
SELECT c.id, c.categoria_licencia, c.categoria_licencia_otra, c.fecha_categoria_licencia, 'inicio_registro'
FROM conductores c
WHERE c.categoria_licencia IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM conductores_licencia_historial h WHERE h.conductor_id = c.id);

COMMIT;

-- Comprobar
SELECT categoria_licencia, count(*) FROM conductores GROUP BY 1 ORDER BY 2 DESC;
SELECT tiene_licencia, count(*) FROM conductores GROUP BY 1 ORDER BY 2 DESC;
