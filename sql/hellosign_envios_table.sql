-- SQL para registrar los envios de plantillas de firma (Dropbox Sign)
-- hechos desde los modulos de la app (ej. Onboarding > Asignaciones).
-- Permite saber si a un conductor ya se le envio su plantilla y no duplicar envios.
-- Ejecutar en el SQL Editor de Supabase

-- =====================================================
-- TABLA: hellosign_envios
-- Vincula cada signature_request de Dropbox Sign con la
-- asignacion y el conductor al que se le envio.
-- =====================================================

CREATE TABLE IF NOT EXISTS hellosign_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id TEXT NOT NULL,
  template_id TEXT,
  template_title TEXT,
  asignacion_id UUID REFERENCES asignaciones(id) ON DELETE SET NULL,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  conductor_nombre TEXT,
  enviado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  enviado_por_nombre TEXT,
  test_mode BOOLEAN DEFAULT false,
  estado TEXT DEFAULT 'enviado',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_hellosign_envios_conductor ON hellosign_envios(conductor_id);
CREATE INDEX IF NOT EXISTS idx_hellosign_envios_asignacion ON hellosign_envios(asignacion_id);
CREATE INDEX IF NOT EXISTS idx_hellosign_envios_request ON hellosign_envios(signature_request_id);

-- =====================================================
-- RLS: usuarios autenticados de la app pueden leer y registrar envios
-- =====================================================

ALTER TABLE hellosign_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hellosign_envios_select" ON hellosign_envios;
CREATE POLICY "hellosign_envios_select" ON hellosign_envios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hellosign_envios_insert" ON hellosign_envios;
CREATE POLICY "hellosign_envios_insert" ON hellosign_envios
  FOR INSERT TO authenticated WITH CHECK (true);
