-- =====================================================
-- Parámetros: submenú "Promociones" (2026-11-11)
-- =====================================================
-- Las promociones se definen en el código (src/modules/promociones/catalogoPromociones.ts):
-- nadie las crea desde la pantalla. En la base solo se guarda el estado de cada una:
--   · activa        = interruptor activar / desactivar
--   · fecha_inicio  = desde cuándo aplica (inclusive)
--   · fecha_fin     = hasta cuándo aplica (inclusive)
-- Una promoción aplica en una fecha si está activa y la fecha cae entre inicio y fin.
--
-- promociones_historial: una fila por cada cambio de activa o de las fechas, la escribe
-- un trigger (quién activó / desactivó / reprogramó y cuándo).
--
-- El name del submenú DEBE ser 'promociones' (es el submenuName del ProtectedRoute).
-- Se puede ejecutar más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.promociones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text        NOT NULL UNIQUE,
  nombre           text        NOT NULL,
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

COMMENT ON TABLE public.promociones IS 'Estado de las promociones definidas en el código (catalogoPromociones.ts): activa y vigencia.';
COMMENT ON COLUMN public.promociones.codigo IS 'Código de la promoción en el catálogo del código. No cambiar.';

CREATE TABLE IF NOT EXISTS public.promociones_historial (
  id               bigserial   PRIMARY KEY,
  promocion_codigo text        NOT NULL,
  activa           boolean     NOT NULL,
  fecha_inicio     date,
  fecha_fin        date,
  registrado_at    timestamptz NOT NULL DEFAULT now(),
  cambiado_por     uuid,
  usuario_nombre   text
);

CREATE INDEX IF NOT EXISTS promociones_historial_codigo
  ON public.promociones_historial (promocion_codigo, registrado_at);

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
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.activa IS NOT DISTINCT FROM OLD.activa
     AND NEW.fecha_inicio IS NOT DISTINCT FROM OLD.fecha_inicio
     AND NEW.fecha_fin IS NOT DISTINCT FROM OLD.fecha_fin THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_nombre FROM user_profiles WHERE id = auth.uid();
  INSERT INTO promociones_historial (promocion_codigo, activa, fecha_inicio, fecha_fin, cambiado_por, usuario_nombre)
  VALUES (NEW.codigo, NEW.activa, NEW.fecha_inicio, NEW.fecha_fin, auth.uid(), v_nombre);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promociones_historial_trg ON public.promociones;
CREATE TRIGGER promociones_historial_trg
  AFTER INSERT OR UPDATE OF activa, fecha_inicio, fecha_fin
  ON public.promociones
  FOR EACH ROW EXECUTE FUNCTION trg_promociones_historial();

-- Promociones del catálogo al 2026-11-11 (desactivadas; se activan desde la pantalla).
-- Las fechas son las del documento de la Cyber Toshi Promo.
INSERT INTO public.promociones (codigo, nombre, fecha_inicio, fecha_fin)
VALUES
  ('CYBER_TOSHI_DESCUENTO_10', 'Cyber Toshi: 10% en turno y ToshiPass', '2026-11-06', '2026-11-30'),
  ('CYBER_TOSHI_LICENCIA_B1',  'Cyber Toshi: licencia B1 con pago diario', '2026-11-06', '2027-01-03')
ON CONFLICT (codigo) DO NOTHING;

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
SELECT codigo, nombre, activa, fecha_inicio, fecha_fin FROM promociones ORDER BY codigo;
SELECT s.name, s.label, s.route, s.order_index, s.is_active,
       (SELECT string_agg(r.name, ', ' ORDER BY r.name)
        FROM role_submenu_permissions p JOIN roles r ON r.id = p.role_id
        WHERE p.submenu_id = s.id AND p.can_view) AS roles_que_lo_ven
FROM submenus s
WHERE s.name = 'promociones';

-- Quitarlo: DELETE FROM submenus WHERE name = 'promociones';
