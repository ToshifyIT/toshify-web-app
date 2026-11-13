-- =====================================================
-- Promoción PRM02 (licencia B1 con pago diario) — Facturación > Licencia B1
-- =====================================================
-- Los conductores que entran con licencia B1 pagan $15.000 por día (todos los días, desde
-- su primer día de turno hasta que obtienen la D1). Lo pagado es saldo a favor de su semana.
--
-- Los depósitos se toman SOLOS de cresium_movimientos (44 Dreams y Grupo CG) cuando el
-- CUIT/CUIL de quien envía es el del conductor (o contiene su DNI). Esta tabla guarda lo que
-- se carga a mano desde el modal del conductor:
--   origen 'manual'   → pago cargado a mano (ej. lo pagó un familiar por otro medio)
--   origen 'cresium'  → depósito de Cresium elegido a mano (lo envió un tercero: el CUIT no coincide)
--   origen 'excluido' → depósito que se tomó solo pero NO es de la promoción (se quita)
-- Nada se borra: quitar un registro lo anula (anulado_at / anulado_by_name). Editarlo deja
-- quién y cuándo (editado_at / editado_by_name).
--
-- Estos pagos NO se cargan en Saldos ("Registrar Pago"): ya restan en la facturación de la
-- semana como línea de la promoción (código PRM02).
--
-- También crea la pestaña facturacion:licencia_b1 con los mismos permisos por rol que
-- facturacion:saldos.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.promocion_b1_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('manual', 'cresium', 'excluido')),
  -- Día al que se imputa el pago (para 'cresium' arranca con la fecha del depósito)
  fecha date NOT NULL,
  monto numeric(16, 2) NOT NULL DEFAULT 0,
  cresium_movimiento_id uuid REFERENCES public.cresium_movimientos(id) ON DELETE CASCADE,
  -- Quién pagó (familiar, etc.) y CUIT si se conoce
  pagador text,
  cuit text,
  nota text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  anulado_at timestamptz,
  anulado_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  anulado_by_name text,
  -- Nombre distinto al CHECK automático de la columna origen (promocion_b1_pagos_origen_check)
  CONSTRAINT promocion_b1_pagos_datos_check CHECK (
    (origen = 'manual' AND cresium_movimiento_id IS NULL AND monto > 0)
    OR (origen IN ('cresium', 'excluido') AND cresium_movimiento_id IS NOT NULL)
  )
);

-- Última edición (fecha, monto, quién pagó, nota) desde el detalle del pago
ALTER TABLE public.promocion_b1_pagos ADD COLUMN IF NOT EXISTS editado_at timestamptz;
ALTER TABLE public.promocion_b1_pagos ADD COLUMN IF NOT EXISTS editado_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.promocion_b1_pagos ADD COLUMN IF NOT EXISTS editado_by_name text;

CREATE INDEX IF NOT EXISTS promocion_b1_pagos_conductor
  ON public.promocion_b1_pagos (conductor_id, fecha);

-- Un depósito de Cresium se asigna a un solo conductor
CREATE UNIQUE INDEX IF NOT EXISTS promocion_b1_pagos_cresium_unico
  ON public.promocion_b1_pagos (cresium_movimiento_id)
  WHERE origen = 'cresium' AND anulado_at IS NULL;

-- Y se excluye una sola vez por conductor
CREATE UNIQUE INDEX IF NOT EXISTS promocion_b1_pagos_excluido_unico
  ON public.promocion_b1_pagos (conductor_id, cresium_movimiento_id)
  WHERE origen = 'excluido' AND anulado_at IS NULL;

ALTER TABLE public.promocion_b1_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promocion_b1_pagos_select ON public.promocion_b1_pagos;
CREATE POLICY promocion_b1_pagos_select ON public.promocion_b1_pagos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS promocion_b1_pagos_insert ON public.promocion_b1_pagos;
CREATE POLICY promocion_b1_pagos_insert ON public.promocion_b1_pagos
  FOR INSERT TO authenticated WITH CHECK (anulado_at IS NULL);

-- Para editar y anular (no se borra)
DROP POLICY IF EXISTS promocion_b1_pagos_update ON public.promocion_b1_pagos;
CREATE POLICY promocion_b1_pagos_update ON public.promocion_b1_pagos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

REVOKE DELETE ON public.promocion_b1_pagos FROM anon, authenticated;

-- =====================================================
-- PESTAÑA: Facturación > Licencia B1
-- =====================================================
DO $$
DECLARE
  v_saldos_id uuid;
  v_submenu_id uuid;
  v_tab_id uuid;
BEGIN
  SELECT id, submenu_id INTO v_saldos_id, v_submenu_id
  FROM tabs WHERE name = 'facturacion:saldos' LIMIT 1;

  IF v_saldos_id IS NULL THEN
    RAISE EXCEPTION 'No existe la pestaña facturacion:saldos (referencia para la de Licencia B1).';
  END IF;

  SELECT id INTO v_tab_id FROM tabs WHERE name = 'facturacion:licencia_b1' LIMIT 1;

  IF v_tab_id IS NULL THEN
    INSERT INTO tabs (name, label, submenu_id, order_index, is_active)
    VALUES ('facturacion:licencia_b1', 'Licencia B1', v_submenu_id, 6, true)
    RETURNING id INTO v_tab_id;
  ELSE
    UPDATE tabs SET label = 'Licencia B1', submenu_id = v_submenu_id, order_index = 6, is_active = true
    WHERE id = v_tab_id;
  END IF;

  -- Mismos permisos por rol que Saldos
  INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_tab_id, can_view, can_create, can_edit, can_delete
  FROM role_tab_permissions
  WHERE tab_id = v_saldos_id
  ON CONFLICT (role_id, tab_id) DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;
END $$;

COMMIT;
