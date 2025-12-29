-- ============================================
-- MIGRACIÓN: Agregar pais_id a tablas existentes
-- Fecha: 2024-12-27
-- Descripción: Agrega columna pais_id a todas las tablas core
-- ============================================

DO $$
DECLARE
  arg_pais_id UUID;
BEGIN
  -- Obtener ID de Argentina
  SELECT id INTO arg_pais_id FROM paises WHERE codigo = 'ARG';

  -- ==========================================
  -- TABLAS CATÁLOGO
  -- ==========================================

  -- vehiculos_tipos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehiculos_tipos' AND column_name = 'pais_id') THEN
    ALTER TABLE vehiculos_tipos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE vehiculos_tipos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- vehiculos_estados
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehiculos_estados' AND column_name = 'pais_id') THEN
    ALTER TABLE vehiculos_estados ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE vehiculos_estados SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- combustibles_tipos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'combustibles_tipos' AND column_name = 'pais_id') THEN
    ALTER TABLE combustibles_tipos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE combustibles_tipos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- gps_tipos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gps_tipos' AND column_name = 'pais_id') THEN
    ALTER TABLE gps_tipos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE gps_tipos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- licencias_categorias
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'licencias_categorias' AND column_name = 'pais_id') THEN
    ALTER TABLE licencias_categorias ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE licencias_categorias SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- licencias_estados
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'licencias_estados' AND column_name = 'pais_id') THEN
    ALTER TABLE licencias_estados ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE licencias_estados SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- licencias_tipos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'licencias_tipos' AND column_name = 'pais_id') THEN
    ALTER TABLE licencias_tipos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE licencias_tipos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- categorias (inventario)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categorias' AND column_name = 'pais_id') THEN
    ALTER TABLE categorias ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE categorias SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- unidades_medida
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unidades_medida' AND column_name = 'pais_id') THEN
    ALTER TABLE unidades_medida ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE unidades_medida SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- productos_estados
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos_estados' AND column_name = 'pais_id') THEN
    ALTER TABLE productos_estados ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE productos_estados SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- horarios_conduccion
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'horarios_conduccion' AND column_name = 'pais_id') THEN
    ALTER TABLE horarios_conduccion ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE horarios_conduccion SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- TABLAS PRINCIPALES
  -- ==========================================

  -- vehiculos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehiculos' AND column_name = 'pais_id') THEN
    ALTER TABLE vehiculos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE vehiculos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- conductores
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conductores' AND column_name = 'pais_id') THEN
    ALTER TABLE conductores ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE conductores SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- proveedores
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proveedores' AND column_name = 'pais_id') THEN
    ALTER TABLE proveedores ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE proveedores SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- productos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'pais_id') THEN
    ALTER TABLE productos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE productos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- TABLAS OPERACIONALES
  -- ==========================================

  -- asignaciones
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asignaciones' AND column_name = 'pais_id') THEN
    ALTER TABLE asignaciones ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE asignaciones SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- inventario
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventario' AND column_name = 'pais_id') THEN
    ALTER TABLE inventario ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE inventario SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- movimientos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'pais_id') THEN
    ALTER TABLE movimientos ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE movimientos SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- pedidos_inventario
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos_inventario' AND column_name = 'pais_id') THEN
    ALTER TABLE pedidos_inventario ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE pedidos_inventario SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- asignaciones_conductores
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asignaciones_conductores' AND column_name = 'pais_id') THEN
    ALTER TABLE asignaciones_conductores ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE asignaciones_conductores SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

END $$;

-- ==========================================
-- ÍNDICES PARA TABLAS PRINCIPALES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_vehiculos_pais ON vehiculos(pais_id);
CREATE INDEX IF NOT EXISTS idx_conductores_pais ON conductores(pais_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_pais ON asignaciones(pais_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_pais ON proveedores(pais_id);
CREATE INDEX IF NOT EXISTS idx_productos_pais ON productos(pais_id);
CREATE INDEX IF NOT EXISTS idx_inventario_pais ON inventario(pais_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_pais ON movimientos(pais_id);

COMMENT ON COLUMN vehiculos.pais_id IS 'País donde está registrado el vehículo';
COMMENT ON COLUMN conductores.pais_id IS 'País donde opera el conductor';
COMMENT ON COLUMN proveedores.pais_id IS 'País del proveedor';
COMMENT ON COLUMN productos.pais_id IS 'País donde está disponible el producto';
COMMENT ON COLUMN asignaciones.pais_id IS 'País de la operación';
