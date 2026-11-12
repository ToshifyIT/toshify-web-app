-- =====================================================
-- Parámetros: submenú "Promociones" (2026-11-11)
-- =====================================================
-- Las promociones se definen en el código (src/modules/promociones/catalogoPromociones.ts):
-- nadie las crea desde la pantalla. En la base se guarda lo que se edita desde ahí:
--   · clave         = identificador interno FIJO, el del catálogo del código (no se edita)
--   · codigo        = código visible (PRM01, PRM02...), editable y único
--   · descripcion   = texto de la promoción (editable; arranca con el del código)
--   · activa        = interruptor activar / desactivar
--   · fecha_inicio  = desde cuándo aplica (inclusive)
--   · fecha_fin     = hasta cuándo aplica (inclusive)
-- Una promoción aplica en una fecha si está activa y la fecha cae entre inicio y fin.
--
-- promociones_historial: una fila por cada cambio de código, activa, fechas o descripción;
-- la escribe un trigger: qué cambió (columna cambio), quién y cuándo. Se enlaza por
-- promocion_id; promocion_codigo es el código que tenía en ese momento.
--
-- Versiones: 2026-11-11 (inicial), 2026-11-12 (descripción editable, columna cambio,
-- código PRM01..., código editable con clave interna). Este script deja cualquiera de esas
-- versiones al día sin perder lo cargado: volver a ejecutarlo ANTES de subir el código.
--
-- El name del submenú DEBE ser 'promociones' (es el submenuName del ProtectedRoute).
-- Se puede ejecutar más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.promociones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clave            text,
  codigo           text        NOT NULL UNIQUE,
  nombre           text        NOT NULL,
  descripcion      text,
  activa           boolean     NOT NULL DEFAULT false,
  fecha_inicio     date,
  fecha_fin        date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  updated_by_name  text,
  CONSTRAINT promociones_fechas_check CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
  -- Para activarla tiene que estar programada (desde / hasta)
  CONSTRAINT promociones_activa_fechas_check CHECK (NOT activa OR (fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.promociones_historial (
  id               bigserial   PRIMARY KEY,
  promocion_id     uuid        REFERENCES public.promociones(id) ON DELETE CASCADE,
  promocion_codigo text        NOT NULL,
  -- Qué cambió: 'alta', 'codigo', 'activada', 'desactivada', 'fechas', 'descripcion' (separados por coma)
  cambio           text,
  activa           boolean     NOT NULL,
  descripcion      text,
  fecha_inicio     date,
  fecha_fin        date,
  registrado_at    timestamptz NOT NULL DEFAULT now(),
  cambiado_por     uuid,
  usuario_nombre   text
);

-- Columnas que no existían en versiones anteriores
ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS clave text;
ALTER TABLE public.promociones ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE public.promociones_historial ADD COLUMN IF NOT EXISTS promocion_id uuid REFERENCES public.promociones(id) ON DELETE CASCADE;
ALTER TABLE public.promociones_historial ADD COLUMN IF NOT EXISTS cambio text;
ALTER TABLE public.promociones_historial ADD COLUMN IF NOT EXISTS descripcion text;

-- Duplicados: si la pantalla con códigos PRM se usó antes de correr este script, dio de
-- alta PRM01 / PRM02 aparte de las filas CYBER_TOSHI_* originales. Se queda la original
-- (tiene el historial); si la duplicada se editó después, se le copia ese estado. Después
-- se borran la duplicada y sus filas de historial (solo el alta y lo que se haya cambiado ahí).
DO $$
DECLARE
  par record;
  v_orig public.promociones%ROWTYPE;
  v_dup  public.promociones%ROWTYPE;
BEGIN
  FOR par IN SELECT * FROM (VALUES ('CYBER_TOSHI_DESCUENTO_10', 'PRM01'), ('CYBER_TOSHI_LICENCIA_B1', 'PRM02')) AS t(original, duplicada)
  LOOP
    SELECT * INTO v_orig FROM public.promociones WHERE codigo = par.original;
    SELECT * INTO v_dup  FROM public.promociones WHERE codigo = par.duplicada;
    IF v_orig.id IS NULL OR v_dup.id IS NULL THEN
      CONTINUE;
    END IF;
    DELETE FROM public.promociones_historial WHERE promocion_codigo = par.duplicada;
    DELETE FROM public.promociones WHERE id = v_dup.id;
    IF v_dup.updated_at > v_orig.updated_at THEN
      UPDATE public.promociones
      SET activa = v_dup.activa, fecha_inicio = v_dup.fecha_inicio, fecha_fin = v_dup.fecha_fin,
          descripcion = COALESCE(v_dup.descripcion, descripcion),
          updated_at = v_dup.updated_at, updated_by = v_dup.updated_by, updated_by_name = v_dup.updated_by_name
      WHERE id = v_orig.id;
    END IF;
  END LOOP;
END $$;

-- Clave interna de las promociones que ya existen (por su código de cualquier versión)
UPDATE public.promociones SET clave = 'CYBER_DESCUENTO_10'
WHERE clave IS NULL AND codigo IN ('CYBER_TOSHI_DESCUENTO_10', 'PRM01');
UPDATE public.promociones SET clave = 'CYBER_LICENCIA_B1'
WHERE clave IS NULL AND codigo IN ('CYBER_TOSHI_LICENCIA_B1', 'PRM02');

-- Código visible de la primera versión → PRM01 / PRM02
UPDATE public.promociones SET codigo = 'PRM01'
WHERE codigo = 'CYBER_TOSHI_DESCUENTO_10' AND NOT EXISTS (SELECT 1 FROM public.promociones WHERE codigo = 'PRM01');
UPDATE public.promociones SET codigo = 'PRM02'
WHERE codigo = 'CYBER_TOSHI_LICENCIA_B1' AND NOT EXISTS (SELECT 1 FROM public.promociones WHERE codigo = 'PRM02');

-- Historial: enlazar por id (antes se enlazaba por código)
UPDATE public.promociones_historial h
SET promocion_id = p.id
FROM public.promociones p
WHERE h.promocion_id IS NULL
  AND (h.promocion_codigo = p.codigo
       OR (p.clave = 'CYBER_DESCUENTO_10' AND h.promocion_codigo = 'CYBER_TOSHI_DESCUENTO_10')
       OR (p.clave = 'CYBER_LICENCIA_B1' AND h.promocion_codigo = 'CYBER_TOSHI_LICENCIA_B1'));
UPDATE public.promociones_historial SET promocion_codigo = 'PRM01' WHERE promocion_codigo = 'CYBER_TOSHI_DESCUENTO_10';
UPDATE public.promociones_historial SET promocion_codigo = 'PRM02' WHERE promocion_codigo = 'CYBER_TOSHI_LICENCIA_B1';

-- Restricciones: clave obligatoria y única; código editable con formato simple
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promociones WHERE clave IS NULL) THEN
    RAISE EXCEPTION 'Hay promociones sin clave interna: revisar la tabla promociones.';
  END IF;
  ALTER TABLE public.promociones ALTER COLUMN clave SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promociones_clave_key') THEN
    ALTER TABLE public.promociones ADD CONSTRAINT promociones_clave_key UNIQUE (clave);
  END IF;
  -- La versión anterior exigía PRM + número; ahora el código se edita: mayúsculas, números y guion
  ALTER TABLE public.promociones DROP CONSTRAINT IF EXISTS promociones_codigo_formato_check;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promociones_codigo_check') THEN
    ALTER TABLE public.promociones ADD CONSTRAINT promociones_codigo_check
      CHECK (codigo ~ '^[A-Z0-9-]{2,20}$');
  END IF;
END $$;

COMMENT ON TABLE public.promociones IS 'Promociones definidas en el código (catalogoPromociones.ts): código visible, descripción, activa y vigencia.';
COMMENT ON COLUMN public.promociones.clave IS 'Identificador interno fijo (el del catálogo del código). No cambiar.';
COMMENT ON COLUMN public.promociones.codigo IS 'Código visible de la promoción (PRM01, PRM02...). Editable desde la pantalla.';

DROP INDEX IF EXISTS promociones_historial_codigo;
CREATE INDEX IF NOT EXISTS promociones_historial_promocion
  ON public.promociones_historial (promocion_id, registrado_at);

ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promociones_select ON public.promociones;
CREATE POLICY promociones_select ON public.promociones FOR SELECT TO authenticated USING (true);
-- Insert: la pantalla da de alta las promociones nuevas del catálogo del código
DROP POLICY IF EXISTS promociones_insert ON public.promociones;
CREATE POLICY promociones_insert ON public.promociones FOR INSERT TO authenticated WITH CHECK (NOT activa);
DROP POLICY IF EXISTS promociones_update ON public.promociones;
CREATE POLICY promociones_update ON public.promociones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- Sin política de DELETE: no se borran desde la app

ALTER TABLE public.promociones_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promociones_historial_select ON public.promociones_historial;
CREATE POLICY promociones_historial_select ON public.promociones_historial
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION trg_promociones_historial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_cambios text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_cambios := ARRAY['alta'];
  ELSE
    IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
      v_cambios := v_cambios || 'codigo'::text;
    END IF;
    IF NEW.activa IS DISTINCT FROM OLD.activa THEN
      v_cambios := v_cambios || CASE WHEN NEW.activa THEN 'activada' ELSE 'desactivada' END;
    END IF;
    IF NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin THEN
      v_cambios := v_cambios || 'fechas'::text;
    END IF;
    IF NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
      v_cambios := v_cambios || 'descripcion'::text;
    END IF;
    IF cardinality(v_cambios) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT full_name INTO v_nombre FROM user_profiles WHERE id = auth.uid();
  INSERT INTO promociones_historial
    (promocion_id, promocion_codigo, cambio, activa, descripcion, fecha_inicio, fecha_fin, cambiado_por, usuario_nombre)
  VALUES
    (NEW.id, NEW.codigo, array_to_string(v_cambios, ', '), NEW.activa, NEW.descripcion, NEW.fecha_inicio, NEW.fecha_fin,
     auth.uid(), COALESCE(v_nombre, NEW.updated_by_name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promociones_historial_trg ON public.promociones;
CREATE TRIGGER promociones_historial_trg
  AFTER INSERT OR UPDATE OF codigo, activa, fecha_inicio, fecha_fin, descripcion
  ON public.promociones
  FOR EACH ROW EXECUTE FUNCTION trg_promociones_historial();

-- Promociones del catálogo al 2026-11-12 (desactivadas; se activan desde la pantalla).
-- Las fechas son las del documento de la Cyber Toshi Promo.
-- Si ya existen no se pisa nada (solo se completa la descripción si está vacía).
INSERT INTO public.promociones (clave, codigo, nombre, descripcion, fecha_inicio, fecha_fin)
VALUES
  ('CYBER_DESCUENTO_10', 'PRM01', 'Cyber Toshi: 10% en turno y ToshiPass',
   'Descuento del 10% en el turno y en ToshiPass para los conductores nuevos o que reingresan dentro del período, con licencia B1 o D1.',
   '2026-11-06', '2026-11-30'),
  ('CYBER_LICENCIA_B1', 'PRM02', 'Cyber Toshi: licencia B1 con pago diario',
   'Habilita el ingreso de conductores nuevos o que reingresan con licencia B1 (provisorio). Pagan $15.000 por día como saldo a favor hasta tener la D1.',
   '2026-11-06', '2027-01-03')
ON CONFLICT (clave) DO UPDATE
  SET descripcion = EXCLUDED.descripcion
  WHERE promociones.descripcion IS NULL;

-- ---------- Submenú en Parámetros ----------
DO $$
DECLARE
  v_menu_id uuid;
  v_order integer;
  v_nuevo_id uuid;
BEGIN
  SELECT id INTO v_menu_id FROM menus WHERE name = 'parametros' LIMIT 1;
  IF v_menu_id IS NULL THEN
    RAISE EXCEPTION 'No existe el menú parametros.';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM submenus
  WHERE menu_id = v_menu_id AND parent_id IS NULL AND name <> 'promociones';

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'promociones' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('promociones', 'Promociones', '/parametros/promociones', v_menu_id, NULL, 1, v_order + 1, true)
    RETURNING id INTO v_nuevo_id;
  ELSE
    UPDATE submenus
    SET label = 'Promociones', route = '/parametros/promociones', menu_id = v_menu_id,
        parent_id = NULL, level = 1, is_active = true
    WHERE id = v_nuevo_id;
  END IF;

  -- admin la ve y la edita (además, admin siempre tiene todo); directivo solo la ve.
  -- Para dar acceso a otro rol: Gestor de menús.
  INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT r.id, v_nuevo_id, true, false, r.name = 'admin', false
  FROM roles r
  WHERE r.name IN ('admin', 'directivo')
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET can_view = true;
END $$;

COMMIT;

-- Comprobar
SELECT clave, codigo, nombre, activa, fecha_inicio, fecha_fin, descripcion FROM promociones ORDER BY codigo;
SELECT s.name, s.label, s.route, s.order_index, s.is_active,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_submenu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.submenu_id = s.id AND p.can_view) AS roles_que_lo_ven
FROM submenus s
WHERE s.name = 'promociones';

-- Quitarlo: DELETE FROM submenus WHERE name = 'promociones';
