-- SQL para crear tabla de usuarios de la API externa
-- Ejecutar en el SQL Editor de Supabase

-- =====================================================
-- TABLA: api_users
-- Usuarios que acceden a la API externa (leads, hireflix)
-- Autenticacion propia con JWT, separada de Supabase Auth
-- =====================================================

CREATE TABLE IF NOT EXISTS api_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'reader',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLA: api_permissions
-- Permisos granulares por usuario: que tablas puede leer
-- =====================================================

CREATE TABLE IF NOT EXISTS api_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES api_users(id) ON DELETE CASCADE,
  table_name VARCHAR(100) NOT NULL,
  can_read BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, table_name)
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_api_users_username ON api_users(username);
CREATE INDEX IF NOT EXISTS idx_api_permissions_user ON api_permissions(user_id);

-- =====================================================
-- TRIGGER: updated_at automatico
-- =====================================================

CREATE OR REPLACE FUNCTION update_api_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_users_updated_at ON api_users;
CREATE TRIGGER api_users_updated_at
  BEFORE UPDATE ON api_users
  FOR EACH ROW
  EXECUTE FUNCTION update_api_users_updated_at();

-- =====================================================
-- RLS (Row Level Security)
-- Solo accesible via service_role (server-side)
-- =====================================================

ALTER TABLE api_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_permissions ENABLE ROW LEVEL SECURITY;

-- Sin politicas para anon/authenticated: solo el server
-- con service_role_key puede acceder a estas tablas
