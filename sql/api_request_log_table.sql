-- Tabla de auditoria de la API REST publica (GET /api/v1/*)
-- Ejecutar en el SQL Editor de Supabase.
--
-- Registra cada request de un tercero: que key, que endpoint, con que filtros,
-- que devolvio. Es lo que permite detectar un uso anomalo de una API key
-- (las keys se guardan en texto plano y no expiran).
--
-- El servidor escribe aca en fire-and-forget: si esta tabla no existe todavia,
-- la API igual funciona.

CREATE TABLE IF NOT EXISTS api_request_log (
  id           BIGSERIAL PRIMARY KEY,
  api_key_id   UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  api_key_name VARCHAR(100),
  endpoint     VARCHAR(200) NOT NULL,
  query        JSONB DEFAULT '{}'::jsonb,
  status       INTEGER NOT NULL,
  filas        INTEGER,
  ip           VARCHAR(64),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_log_key     ON api_request_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_request_log_fecha   ON api_request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_status  ON api_request_log(status);

-- =====================================================
-- RLS
-- Se activa en la MISMA migracion que crea la tabla, a proposito: sin esto,
-- el rol anon hereda los grants por defecto de Supabase y podria leer y
-- escribir el log con la clave publica del bundle.
-- Escribe solo el servidor (service_role, que bypasea RLS).
-- Lee cualquier usuario autenticado de la app.
-- =====================================================

ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_request_log_select ON api_request_log;
CREATE POLICY api_request_log_select ON api_request_log
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON api_request_log FROM anon, authenticated;

COMMENT ON TABLE api_request_log IS
  'Auditoria de la API REST publica de Toshify (mcp/routes/*). Lo escribe el servicio MCP con service_role.';
