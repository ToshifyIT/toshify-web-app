-- ============================================
-- MIGRACIÓN: Estructura Multi-País
-- Fecha: 2024-12-27
-- Descripción: Crea tabla paises y user_paises
-- ============================================

-- 1. Crear tabla paises
CREATE TABLE IF NOT EXISTS paises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(3) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  codigo_telefono VARCHAR(5),
  moneda VARCHAR(3),
  timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
  configuracion JSONB DEFAULT '{
    "formato_patente": "AA 000 AA",
    "formato_documento": "DNI",
    "api_cabify_enabled": true,
    "api_wialon_enabled": true,
    "api_uss_enabled": true
  }'::jsonb,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Crear tabla user_paises (relación usuarios-países)
CREATE TABLE IF NOT EXISTS user_paises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pais_id UUID NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
  es_pais_default BOOLEAN DEFAULT false,
  permisos JSONB DEFAULT '{"read": true, "write": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pais_id)
);

-- 3. Insertar Argentina como país inicial
INSERT INTO paises (codigo, nombre, codigo_telefono, moneda, timezone, configuracion)
VALUES (
  'ARG',
  'Argentina',
  '+54',
  'ARS',
  'America/Argentina/Buenos_Aires',
  '{
    "formato_patente": "AA 000 AA",
    "formato_documento": "DNI",
    "api_cabify_enabled": true,
    "api_wialon_enabled": true,
    "api_uss_enabled": true,
    "tipo_documento_proveedor": ["CUIT", "CUIL", "DNI"]
  }'::jsonb
) ON CONFLICT (codigo) DO NOTHING;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_paises_codigo ON paises(codigo);
CREATE INDEX IF NOT EXISTS idx_paises_activo ON paises(activo);
CREATE INDEX IF NOT EXISTS idx_user_paises_user ON user_paises(user_id);
CREATE INDEX IF NOT EXISTS idx_user_paises_pais ON user_paises(pais_id);
CREATE INDEX IF NOT EXISTS idx_user_paises_default ON user_paises(user_id, es_pais_default) WHERE es_pais_default = true;

-- 5. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_paises_updated_at ON paises;
CREATE TRIGGER update_paises_updated_at
  BEFORE UPDATE ON paises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_paises_updated_at ON user_paises;
CREATE TRIGGER update_user_paises_updated_at
  BEFORE UPDATE ON user_paises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS para paises (todos pueden leer países activos)
ALTER TABLE paises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paises_select_all" ON paises
  FOR SELECT USING (activo = true);

CREATE POLICY "paises_admin_all" ON paises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid() AND r.name = 'admin'
    )
  );

-- 7. RLS para user_paises
ALTER TABLE user_paises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_paises_own" ON user_paises
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_paises_admin" ON user_paises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid() AND r.name = 'admin'
    )
  );

-- 8. Función helper: obtener países del usuario actual
CREATE OR REPLACE FUNCTION get_user_paises()
RETURNS UUID[] AS $$
BEGIN
  RETURN COALESCE(
    ARRAY(SELECT pais_id FROM user_paises WHERE user_id = auth.uid()),
    ARRAY[]::UUID[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 9. Función helper: obtener país default del usuario
CREATE OR REPLACE FUNCTION get_user_default_pais()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT pais_id FROM user_paises
    WHERE user_id = auth.uid() AND es_pais_default = true
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 10. Asignar Argentina a todos los usuarios existentes
INSERT INTO user_paises (user_id, pais_id, es_pais_default)
SELECT
  u.id,
  (SELECT id FROM paises WHERE codigo = 'ARG'),
  true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_paises up WHERE up.user_id = u.id
);

COMMENT ON TABLE paises IS 'Países donde opera el sistema';
COMMENT ON TABLE user_paises IS 'Relación usuarios-países con permisos';
