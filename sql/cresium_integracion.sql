-- =====================================================
-- Integración Cresium -> Alegra (Integraciones > Cresium)
-- =====================================================
-- 1) Tabla cresium_movimientos: movimientos bancarios de las cuentas Cresium de
--    44 Dreams y Grupo CG (se traen con el botón "Actualizar desde Cresium") y
--    el pago de Alegra que se creó para cada uno, para no cargar nada dos veces.
-- 2) Menú: Integraciones > Cresium (grupo) con dos submenús:
--      ├ 44 Dreams   /integraciones/cresium/44dreams
--      └ Grupo CG    /integraciones/cresium/grupocg
--    Los names DEBEN coincidir con el submenuName de los ProtectedRoute en
--    HomePage.tsx ('cresium-44dreams' y 'cresium-grupocg').
--
-- Permisos (Administración > Menú por rol):
--   - Ver:    can_view del submenú
--   - Cargar en Alegra: can_edit del submenú (lo valida también el servidor)
-- Al crearlos solo los ven los admin.
--
-- La tabla solo la escribe el servidor (server-cresium.js con la service role);
-- desde la app los usuarios autenticados solo la leen.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

-- =====================================================
-- TABLA: cresium_movimientos
-- =====================================================

CREATE TABLE IF NOT EXISTS cresium_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- '44dreams' | 'grupocg'
  empresa TEXT NOT NULL,
  -- id de la transacción en Cresium
  cresium_id BIGINT NOT NULL,
  -- Día del movimiento en Argentina (processedAt en ART)
  fecha DATE,
  procesado_en TIMESTAMPTZ,
  -- DEPOSIT, WITHDRAWAL, YIELD, ...
  tipo TEXT,
  -- SUCCESS, PENDING, FAILED, ...
  estado TEXT,
  -- 'entrada' | 'salida'
  direccion TEXT,
  contraparte TEXT,
  cuit TEXT,
  cuenta_contraparte TEXT,
  banco_contraparte TEXT,
  -- Importe como figura en el extracto: entradas en bruto, salidas sin el impuesto
  importe NUMERIC(16, 2),
  -- Impuesto ley 25.413 cobrado en el movimiento
  impuesto NUMERIC(16, 2) NOT NULL DEFAULT 0,
  tag TEXT,
  nota TEXT,
  external_id TEXT,
  raw JSONB,

  -- Carga en Alegra
  -- 'pendiente' | 'cargado' | 'error' | 'ignorado'
  alegra_estado TEXT NOT NULL DEFAULT 'pendiente',
  alegra_pago_id TEXT,
  alegra_impuesto_pago_id TEXT,
  alegra_ajuste_pago_id TEXT,
  alegra_contacto_id TEXT,
  alegra_categoria_id TEXT,
  alegra_factura_id TEXT,
  -- Texto para la tabla: "Ventas", "Factura 662", "Vinculado a pago existente"...
  alegra_detalle TEXT,
  alegra_error TEXT,
  alegra_cargado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  alegra_cargado_en TIMESTAMPTZ,
  -- Conciliación de Alegra (borrador) en la que quedó incluido
  alegra_conciliacion_id TEXT,
  -- Conciliado en Alegra (se guarda la primera vez que se ve conciliado: no se vuelve a consultar)
  alegra_conciliado BOOLEAN NOT NULL DEFAULT false,
  alegra_conciliado_en TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, cresium_id)
);

-- Para bases creadas con la primera versión de este script
ALTER TABLE cresium_movimientos ADD COLUMN IF NOT EXISTS alegra_conciliacion_id TEXT;
ALTER TABLE cresium_movimientos ADD COLUMN IF NOT EXISTS alegra_conciliado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cresium_movimientos ADD COLUMN IF NOT EXISTS alegra_conciliado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cresium_mov_empresa_fecha ON cresium_movimientos(empresa, fecha);
CREATE INDEX IF NOT EXISTS idx_cresium_mov_alegra_estado ON cresium_movimientos(empresa, alegra_estado);
CREATE INDEX IF NOT EXISTS idx_cresium_mov_cuit ON cresium_movimientos(empresa, cuit);

ALTER TABLE cresium_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cresium_movimientos_select_autenticados" ON cresium_movimientos;
CREATE POLICY "cresium_movimientos_select_autenticados"
  ON cresium_movimientos FOR SELECT
  TO authenticated
  USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE: solo la service role (servidor) escribe.
REVOKE INSERT, UPDATE, DELETE ON cresium_movimientos FROM anon, authenticated;

-- =====================================================
-- MENÚ: Integraciones > Cresium > 44 Dreams / Grupo CG
-- =====================================================

DO $$
DECLARE
  v_ref_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_grupo_id uuid;
  v_hijo_id uuid;
BEGIN
  -- Se ubica después de 2Chat (o de Cabify si 2Chat no existe)
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus WHERE name = 'twochat' LIMIT 1;

  IF v_ref_id IS NULL THEN
    SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
    INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
    FROM submenus WHERE name = 'cabify' LIMIT 1;
  END IF;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú twochat ni cabify (referencia para ubicar Cresium en Integraciones).';
  END IF;

  -- Grupo "Cresium" (solo abre/cierra; su ruta redirige a 44 Dreams)
  SELECT id INTO v_grupo_id FROM submenus WHERE name = 'cresium' LIMIT 1;
  IF v_grupo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('cresium', 'Cresium', '/integraciones/cresium', v_menu_id, v_parent_id, v_level, v_order + 1, true)
    RETURNING id INTO v_grupo_id;
  ELSE
    UPDATE submenus
    SET label = 'Cresium', route = '/integraciones/cresium', menu_id = v_menu_id,
        parent_id = v_parent_id, level = v_level, order_index = v_order + 1, is_active = true
    WHERE id = v_grupo_id;
  END IF;

  -- 44 Dreams
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'cresium-44dreams' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('cresium-44dreams', '44 Dreams', '/integraciones/cresium/44dreams',
            v_menu_id, v_grupo_id, v_level + 1, 1, true);
  ELSE
    UPDATE submenus
    SET label = '44 Dreams', route = '/integraciones/cresium/44dreams', menu_id = v_menu_id,
        parent_id = v_grupo_id, level = v_level + 1, order_index = 1, is_active = true
    WHERE id = v_hijo_id;
  END IF;

  -- Grupo CG
  v_hijo_id := NULL;
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'cresium-grupocg' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('cresium-grupocg', 'Grupo CG', '/integraciones/cresium/grupocg',
            v_menu_id, v_grupo_id, v_level + 1, 2, true);
  ELSE
    UPDATE submenus
    SET label = 'Grupo CG', route = '/integraciones/cresium/grupocg', menu_id = v_menu_id,
        parent_id = v_grupo_id, level = v_level + 1, order_index = 2, is_active = true
    WHERE id = v_hijo_id;
  END IF;
END $$;

COMMIT;

-- Que la API de Supabase (PostgREST) vea la tabla nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
