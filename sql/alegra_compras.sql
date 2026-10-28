-- =====================================================
-- Integraciones > Alegra: comprobantes recibidos de ARCA -> Alegra
-- =====================================================
-- Se sube el Excel de ARCA "Mis Comprobantes Recibidos" tal cual, con una columna
-- más a la derecha con el NOMBRE de la cuenta contable de Alegra. Cada comprobante
-- queda guardado acá con su estado en Alegra (qué se creó, con qué número y cuenta,
-- o por qué no se cargó).
--   - Facturas A y C          -> factura de proveedor (bill)
--   - Notas de crédito A y C  -> nota débito de la empresa, asociada a la factura
--                                (mismo criterio que la carga masiva de octubre)
--
-- 1) alegra_importaciones: cada Excel subido.
-- 2) alegra_comprobantes: un registro por comprobante (único por empresa + CUIT +
--    tipo + punto de venta + número: volver a subir el mismo Excel no duplica).
-- 3) Menú: Integraciones > Alegra (grupo) con 44 Dreams y Grupo CG.
--    Los names DEBEN coincidir con el submenuName de HomePage.tsx
--    ('alegra-compras-44dreams' y 'alegra-compras-grupocg').
--
-- Permisos (Administración > Menú por rol): ver = can_view; subir el Excel y
-- cargar en Alegra = can_edit. Al crearlos solo los ven los admin.
-- Las tablas solo las escribe el servidor (server-alegra.js, service role).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS alegra_importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- '44dreams' | 'grupocg'
  empresa TEXT NOT NULL,
  archivo TEXT,
  comprobantes INTEGER NOT NULL DEFAULT 0,
  -- Encabezado de la columna con la cuenta contable
  columna_cuenta TEXT,
  -- Rango de fechas de los comprobantes del archivo
  desde DATE,
  hasta DATE,
  creado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alegra_imp_empresa ON alegra_importaciones(empresa, created_at DESC);

CREATE TABLE IF NOT EXISTS alegra_comprobantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL,
  -- Última importación que trajo este comprobante
  importacion_id UUID REFERENCES alegra_importaciones(id) ON DELETE SET NULL,
  fila INTEGER,

  -- Datos de ARCA
  fecha DATE,
  -- Código ARCA: 1 Factura A, 11 Factura C, 3 NC A, 13 NC C, ...
  tipo_cod TEXT NOT NULL,
  tipo TEXT,
  punto_venta INTEGER NOT NULL,
  numero BIGINT NOT NULL,
  cae TEXT,
  cuit TEXT NOT NULL,
  proveedor TEXT,
  moneda TEXT,
  tipo_cambio NUMERIC(16, 6),
  neto_gravado NUMERIC(16, 2),
  iva NUMERIC(16, 2),
  no_gravado NUMERIC(16, 2),
  exentas NUMERIC(16, 2),
  otros_tributos NUMERIC(16, 2),
  total NUMERIC(16, 2),
  -- Fila completa del Excel
  raw JSONB,

  -- Cuenta contable: como vino en el Excel y la de Alegra que se usa
  cuenta_excel TEXT,
  alegra_categoria_id TEXT,
  alegra_categoria_nombre TEXT,

  -- 'pendiente' | 'cargado' | 'error' | 'ignorado'
  estado TEXT NOT NULL DEFAULT 'pendiente',
  -- Pendiente con algo para revisar antes de cargar (null = listo para cargar)
  revisar TEXT,

  -- Resultado en Alegra
  -- 'bill' (factura de proveedor) | 'debit-note' (nota débito por la NC)
  alegra_tipo TEXT,
  alegra_id TEXT,
  alegra_numero TEXT,
  alegra_total NUMERIC(16, 2),
  alegra_proveedor_id TEXT,
  proveedor_creado BOOLEAN NOT NULL DEFAULT false,
  -- NC: factura de Alegra a la que se aplicó
  alegra_factura_asociada TEXT,
  -- Texto de cómo quedó: "Factura A 3-1234 · Otros gastos generales · $ 12.100,00"
  alegra_detalle TEXT,
  alegra_error TEXT,
  cargado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  cargado_en TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, cuit, tipo_cod, punto_venta, numero)
);

CREATE INDEX IF NOT EXISTS idx_alegra_comp_importacion ON alegra_comprobantes(importacion_id);
CREATE INDEX IF NOT EXISTS idx_alegra_comp_empresa_fecha ON alegra_comprobantes(empresa, fecha);
CREATE INDEX IF NOT EXISTS idx_alegra_comp_estado ON alegra_comprobantes(empresa, estado);

ALTER TABLE alegra_importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE alegra_comprobantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alegra_importaciones_select_autenticados" ON alegra_importaciones;
CREATE POLICY "alegra_importaciones_select_autenticados"
  ON alegra_importaciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "alegra_comprobantes_select_autenticados" ON alegra_comprobantes;
CREATE POLICY "alegra_comprobantes_select_autenticados"
  ON alegra_comprobantes FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON alegra_importaciones FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON alegra_comprobantes FROM anon, authenticated;

-- =====================================================
-- MENÚ: Integraciones > Alegra > 44 Dreams / Grupo CG
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
  -- Se ubica después de Cresium (o de 2Chat)
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus WHERE name = 'cresium' LIMIT 1;

  IF v_ref_id IS NULL THEN
    SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
    INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
    FROM submenus WHERE name = 'twochat' LIMIT 1;
  END IF;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú cresium ni twochat (referencia para ubicar Alegra en Integraciones).';
  END IF;

  -- Grupo "Alegra"
  SELECT id INTO v_grupo_id FROM submenus WHERE name = 'alegra-compras' LIMIT 1;
  IF v_grupo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('alegra-compras', 'Alegra', '/integraciones/alegra', v_menu_id, v_parent_id, v_level, v_order + 1, true)
    RETURNING id INTO v_grupo_id;
  ELSE
    UPDATE submenus
    SET label = 'Alegra', route = '/integraciones/alegra', menu_id = v_menu_id,
        parent_id = v_parent_id, level = v_level, order_index = v_order + 1, is_active = true
    WHERE id = v_grupo_id;
  END IF;

  -- 44 Dreams
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'alegra-compras-44dreams' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('alegra-compras-44dreams', '44 Dreams', '/integraciones/alegra/44dreams',
            v_menu_id, v_grupo_id, v_level + 1, 1, true);
  ELSE
    UPDATE submenus
    SET label = '44 Dreams', route = '/integraciones/alegra/44dreams', menu_id = v_menu_id,
        parent_id = v_grupo_id, level = v_level + 1, order_index = 1, is_active = true
    WHERE id = v_hijo_id;
  END IF;

  -- Grupo CG
  v_hijo_id := NULL;
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'alegra-compras-grupocg' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('alegra-compras-grupocg', 'Grupo CG', '/integraciones/alegra/grupocg',
            v_menu_id, v_grupo_id, v_level + 1, 2, true);
  ELSE
    UPDATE submenus
    SET label = 'Grupo CG', route = '/integraciones/alegra/grupocg', menu_id = v_menu_id,
        parent_id = v_grupo_id, level = v_level + 1, order_index = 2, is_active = true
    WHERE id = v_hijo_id;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
