-- SQL para crear tabla de API keys para acceso al MCP Server
-- Ejecutar en el SQL Editor de Supabase

-- =====================================================
-- TABLA: api_keys
-- Tokens estaticos para acceso al MCP Server de leads
-- Cada chatbot/integracion tiene su propia API key
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  api_key VARCHAR(64) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '["leads:read", "leads:update"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);

-- =====================================================
-- TRIGGER: updated_at automatico
-- =====================================================

CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_keys_updated_at ON api_keys;
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();

-- =====================================================
-- RLS (Row Level Security)
-- Solo accesible via service_role (server-side)
-- =====================================================

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- INSERT: API key inicial para el chatbot
-- =====================================================

INSERT INTO api_keys (name, api_key, permissions)
VALUES (
  'Chatbot Principal',
  encode(gen_random_bytes(32), 'hex'),
  '["leads:read", "leads:update", "hireflix:read"]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Para ver la key generada:
-- SELECT name, api_key FROM api_keys;
