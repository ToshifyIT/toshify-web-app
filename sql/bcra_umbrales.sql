-- =====================================================
-- Parámetros: "Riesgo BCRA" - umbrales y nivel de alerta de los leads (2026-11-20)
-- =====================================================
-- No se exige deuda cero: cada lead consultado en el BCRA (sql/leads_bcra_consulta.sql)
-- queda con un nivel de alerta según estos umbrales, que se editan desde
-- Parámetros > Riesgo BCRA:
--
--   rojo     proceso judicial (si rojo_con_judicial)
--            o cheques rechazados (si rojo_con_cheques)
--            o situación >= situacion_roja_desde
--            o deuda con atraso > deuda_amarilla_max
--   verde    situación 0 o 1, o deuda con atraso <= deuda_verde_max
--   amarillo el resto (tiene atraso, pero dentro de los límites)
--
-- "Deuda con atraso" = suma de las entidades en situación 2 o peor. Un préstamo al
-- día (situación 1) no cuenta para los montos, aunque sea grande.
--
-- El nivel y el motivo se guardan en leads.bcra_nivel / leads.bcra_nivel_motivo.
-- Se recalculan solos cuando llega una consulta nueva y, para todos los leads,
-- cuando se cambian los umbrales.
--
-- Versiones: 2026-11-20 (inicial), 2026-11-20 (montos sobre la deuda con atraso).
-- El name del submenú DEBE ser 'riesgo-bcra' (es el submenuName del ProtectedRoute).
-- Requiere sql/leads_bcra_consulta.sql. Se puede ejecutar más de una vez.

BEGIN;

-- ---------- Umbrales (una sola fila) ----------
CREATE TABLE IF NOT EXISTS public.bcra_umbrales (
  id                    smallint     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  deuda_verde_max       numeric(14, 2) NOT NULL DEFAULT 300000,
  deuda_amarilla_max    numeric(14, 2) NOT NULL DEFAULT 1000000,
  situacion_roja_desde  smallint     NOT NULL DEFAULT 6 CHECK (situacion_roja_desde BETWEEN 2 AND 6),
  rojo_con_judicial     boolean      NOT NULL DEFAULT true,
  rojo_con_cheques      boolean      NOT NULL DEFAULT true,
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  updated_by            uuid,
  updated_by_name       text,
  CHECK (deuda_verde_max >= 0 AND deuda_amarilla_max >= deuda_verde_max)
);

INSERT INTO public.bcra_umbrales (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bcra_umbrales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bcra_umbrales_select ON public.bcra_umbrales;
CREATE POLICY bcra_umbrales_select ON public.bcra_umbrales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bcra_umbrales_update ON public.bcra_umbrales;
CREATE POLICY bcra_umbrales_update ON public.bcra_umbrales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------- Nivel en cada lead ----------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bcra_nivel text CHECK (bcra_nivel IN ('verde', 'amarillo', 'rojo')),
  ADD COLUMN IF NOT EXISTS bcra_nivel_motivo text;

CREATE INDEX IF NOT EXISTS leads_bcra_nivel_idx ON leads (bcra_nivel) WHERE bcra_nivel IS NOT NULL;

-- Nivel y motivo para un resultado del BCRA. NULL si no hay consulta válida.
CREATE OR REPLACE FUNCTION public.bcra_calcular_nivel(
  p_consultado_at timestamptz,
  p_error text,
  p_situacion smallint,
  p_deuda numeric,
  p_cheques integer,
  p_detalle jsonb,
  OUT nivel text,
  OUT motivo text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  u public.bcra_umbrales;
  v_sit smallint := COALESCE(p_situacion, 0);
  v_deuda numeric;
  v_judicial boolean;
  v_fmt text;
BEGIN
  IF p_consultado_at IS NULL OR p_error IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT * INTO u FROM public.bcra_umbrales WHERE id = 1;

  -- Deuda con atraso: entidades en situación 2 o peor (p_deuda queda como total informativo)
  SELECT COALESCE(sum((e ->> 'monto')::numeric), 0) INTO v_deuda
  FROM jsonb_array_elements(COALESCE(p_detalle -> 'entidades', '[]'::jsonb)) e
  WHERE (e ->> 'situacion')::int >= 2;

  v_judicial := EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_detalle -> 'entidades', '[]'::jsonb)) e
    WHERE (e ->> 'proceso_judicial')::boolean
  );

  IF u.rojo_con_judicial AND v_judicial THEN
    nivel := 'rojo'; motivo := 'Tiene proceso judicial';
  ELSIF u.rojo_con_cheques AND COALESCE(p_cheques, 0) > 0 THEN
    nivel := 'rojo'; motivo := 'Tiene cheques rechazados';
  ELSIF v_sit >= u.situacion_roja_desde THEN
    nivel := 'rojo'; motivo := format('Situación %s', v_sit);
  ELSIF v_deuda > u.deuda_amarilla_max THEN
    v_fmt := to_char(u.deuda_amarilla_max, 'FM999G999G999G990');
    nivel := 'rojo'; motivo := format('Deuda con atraso mayor a $%s', replace(v_fmt, ',', '.'));
  ELSIF v_sit <= 1 THEN
    nivel := 'verde'; motivo := CASE WHEN v_sit = 0 THEN 'Sin deudas' ELSE 'Deudas al día' END;
  ELSIF v_deuda <= u.deuda_verde_max THEN
    v_fmt := to_char(u.deuda_verde_max, 'FM999G999G999G990');
    nivel := 'verde'; motivo := format('Situación %s con deuda con atraso hasta $%s', v_sit, replace(v_fmt, ',', '.'));
  ELSE
    nivel := 'amarillo'; motivo := format('Situación %s dentro de los límites', v_sit);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_bcra_nivel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.bcra_calcular_nivel(NEW.bcra_consultado_at, NEW.bcra_error,
    NEW.bcra_situacion, NEW.bcra_deuda_total, NEW.bcra_cheques, NEW.bcra_detalle);
  NEW.bcra_nivel := r.nivel;
  NEW.bcra_nivel_motivo := r.motivo;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_bcra_nivel ON leads;
CREATE TRIGGER leads_bcra_nivel
  BEFORE INSERT OR UPDATE OF bcra_consultado_at, bcra_error, bcra_situacion, bcra_deuda_total,
                             bcra_cheques, bcra_detalle
  ON leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_bcra_nivel();

-- Al cambiar los umbrales: guarda quién fue y recalcula el nivel de todos los leads consultados
CREATE OR REPLACE FUNCTION public.bcra_umbrales_cambio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  SELECT full_name INTO NEW.updated_by_name FROM user_profiles WHERE id = auth.uid();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bcra_umbrales_recalcular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leads l
  SET bcra_nivel = n.nivel, bcra_nivel_motivo = n.motivo
  FROM leads x
  CROSS JOIN LATERAL public.bcra_calcular_nivel(x.bcra_consultado_at, x.bcra_error, x.bcra_situacion,
                                               x.bcra_deuda_total, x.bcra_cheques, x.bcra_detalle) n
  WHERE l.id = x.id
    AND x.bcra_consultado_at IS NOT NULL
    AND (l.bcra_nivel IS DISTINCT FROM n.nivel OR l.bcra_nivel_motivo IS DISTINCT FROM n.motivo);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bcra_umbrales_cambio ON public.bcra_umbrales;
CREATE TRIGGER bcra_umbrales_cambio
  BEFORE UPDATE ON public.bcra_umbrales
  FOR EACH ROW EXECUTE FUNCTION public.bcra_umbrales_cambio();

DROP TRIGGER IF EXISTS bcra_umbrales_recalcular ON public.bcra_umbrales;
CREATE TRIGGER bcra_umbrales_recalcular
  AFTER UPDATE ON public.bcra_umbrales
  FOR EACH STATEMENT EXECUTE FUNCTION public.bcra_umbrales_recalcular();

-- Nivel de los leads que ya se consultaron
UPDATE leads l
SET bcra_nivel = n.nivel, bcra_nivel_motivo = n.motivo
FROM leads x
CROSS JOIN LATERAL public.bcra_calcular_nivel(x.bcra_consultado_at, x.bcra_error, x.bcra_situacion,
                                             x.bcra_deuda_total, x.bcra_cheques, x.bcra_detalle) n
WHERE l.id = x.id AND x.bcra_consultado_at IS NOT NULL;

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
  WHERE menu_id = v_menu_id AND parent_id IS NULL AND name <> 'riesgo-bcra';

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'riesgo-bcra' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('riesgo-bcra', 'Riesgo BCRA', '/parametros/riesgo-bcra', v_menu_id, NULL, 1, v_order + 1, true)
    RETURNING id INTO v_nuevo_id;
  ELSE
    UPDATE submenus
    SET label = 'Riesgo BCRA', route = '/parametros/riesgo-bcra', menu_id = v_menu_id,
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
SELECT * FROM public.bcra_umbrales;
SELECT bcra_nivel, count(*) FROM leads WHERE bcra_consultado_at IS NOT NULL GROUP BY 1 ORDER BY 1;
SELECT s.name, s.label, s.route, s.is_active FROM submenus s WHERE s.name = 'riesgo-bcra';

-- Quitarlo: DELETE FROM submenus WHERE name = 'riesgo-bcra';
