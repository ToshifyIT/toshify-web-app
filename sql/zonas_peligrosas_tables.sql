-- SQL para crear tablas de Zonas Peligrosas en Supabase
-- Ejecutar en el SQL Editor de Supabase

-- =====================================================
-- TABLA: zonas_tipos
-- Almacena los tipos de zonas (peligrosa, restringida, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS zonas_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#EF4444',
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datos iniciales para tipos de zona
INSERT INTO zonas_tipos (codigo, nombre, color, descripcion) VALUES
('peligrosa', 'Zona Peligrosa', '#EF4444', 'Area con alto indice de inseguridad'),
('restringida', 'Zona Restringida', '#F59E0B', 'Area con restricciones de acceso'),
('bloqueada', 'Zona Bloqueada', '#7C3AED', 'Area completamente bloqueada para operaciones')
ON CONFLICT (codigo) DO NOTHING;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_zonas_tipos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zonas_tipos_updated_at ON zonas_tipos;
CREATE TRIGGER zonas_tipos_updated_at
  BEFORE UPDATE ON zonas_tipos
  FOR EACH ROW
  EXECUTE FUNCTION update_zonas_tipos_updated_at();

-- =====================================================
-- TABLA: zonas_peligrosas
-- Almacena las zonas geograficas con sus poligonos
-- =====================================================

CREATE TABLE IF NOT EXISTS zonas_peligrosas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  tipo_id UUID REFERENCES zonas_tipos(id) ON DELETE SET NULL,
  poligono JSONB NOT NULL,
  bloquear_asignaciones BOOLEAN DEFAULT false,
  mostrar_advertencia BOOLEAN DEFAULT true,
  mensaje_advertencia TEXT DEFAULT 'Esta zona ha sido marcada como peligrosa',
  activo BOOLEAN DEFAULT true,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para busquedas por tipo
CREATE INDEX IF NOT EXISTS idx_zonas_peligrosas_tipo ON zonas_peligrosas(tipo_id);

-- Indice para busquedas por estado
CREATE INDEX IF NOT EXISTS idx_zonas_peligrosas_activo ON zonas_peligrosas(activo);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_zonas_peligrosas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zonas_peligrosas_updated_at ON zonas_peligrosas;
CREATE TRIGGER zonas_peligrosas_updated_at
  BEFORE UPDATE ON zonas_peligrosas
  FOR EACH ROW
  EXECUTE FUNCTION update_zonas_peligrosas_updated_at();

-- =====================================================
-- RLS (Row Level Security) Policies
-- =====================================================

-- Habilitar RLS
ALTER TABLE zonas_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas_peligrosas ENABLE ROW LEVEL SECURITY;

-- Politicas para zonas_tipos (lectura para todos los autenticados)
DROP POLICY IF EXISTS "zonas_tipos_select" ON zonas_tipos;
CREATE POLICY "zonas_tipos_select" ON zonas_tipos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "zonas_tipos_insert" ON zonas_tipos;
CREATE POLICY "zonas_tipos_insert" ON zonas_tipos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "zonas_tipos_update" ON zonas_tipos;
CREATE POLICY "zonas_tipos_update" ON zonas_tipos
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "zonas_tipos_delete" ON zonas_tipos;
CREATE POLICY "zonas_tipos_delete" ON zonas_tipos
  FOR DELETE TO authenticated USING (true);

-- Politicas para zonas_peligrosas
DROP POLICY IF EXISTS "zonas_peligrosas_select" ON zonas_peligrosas;
CREATE POLICY "zonas_peligrosas_select" ON zonas_peligrosas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "zonas_peligrosas_insert" ON zonas_peligrosas;
CREATE POLICY "zonas_peligrosas_insert" ON zonas_peligrosas
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "zonas_peligrosas_update" ON zonas_peligrosas;
CREATE POLICY "zonas_peligrosas_update" ON zonas_peligrosas
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "zonas_peligrosas_delete" ON zonas_peligrosas;
CREATE POLICY "zonas_peligrosas_delete" ON zonas_peligrosas
  FOR DELETE TO authenticated USING (true);

-- =====================================================
-- SUBMENU en la BD (ejecutar manualmente)
-- Necesitas el menu_id de 'administracion' y un parent_id si aplica
-- =====================================================

-- Ejemplo (ajustar IDs segun tu BD):
-- INSERT INTO submenus (name, label, route, menu_id, parent_id, order_index, is_active)
-- VALUES ('zonas-peligrosas', 'Zonas Peligrosas', '/administracion/zonas', '<menu_id_administracion>', NULL, 10, true);
