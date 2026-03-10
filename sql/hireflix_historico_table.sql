-- SQL para crear tabla de Hireflix Historico en Supabase
-- Ejecutar en el SQL Editor de Supabase

-- =====================================================
-- TABLA: hireflix_historico
-- Almacena el historico de entrevistas Hireflix
-- =====================================================

CREATE TABLE IF NOT EXISTS hireflix_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "nombre" VARCHAR(200),
  "email" VARCHAR(255),
  "fecha" TIMESTAMPTZ,

  -- Campos de sistema
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_hireflix_historico_email ON hireflix_historico("email");
CREATE INDEX IF NOT EXISTS idx_hireflix_historico_fecha ON hireflix_historico("fecha");

-- =====================================================
-- TRIGGER: updated_at automatico
-- =====================================================

CREATE OR REPLACE FUNCTION update_hireflix_historico_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hireflix_historico_updated_at ON hireflix_historico;
CREATE TRIGGER hireflix_historico_updated_at
  BEFORE UPDATE ON hireflix_historico
  FOR EACH ROW
  EXECUTE FUNCTION update_hireflix_historico_updated_at();

-- =====================================================
-- RLS (Row Level Security) Policies
-- =====================================================

ALTER TABLE hireflix_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hireflix_historico_select" ON hireflix_historico;
CREATE POLICY "hireflix_historico_select" ON hireflix_historico
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hireflix_historico_insert" ON hireflix_historico;
CREATE POLICY "hireflix_historico_insert" ON hireflix_historico
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "hireflix_historico_update" ON hireflix_historico;
CREATE POLICY "hireflix_historico_update" ON hireflix_historico
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "hireflix_historico_delete" ON hireflix_historico;
CREATE POLICY "hireflix_historico_delete" ON hireflix_historico
  FOR DELETE TO authenticated USING (true);
