-- =====================================================
-- Seguimiento de Conductores: carga más rápida (2026-11-02)
-- =====================================================
-- El panel leía TODO el kardex de saldos (control_saldos) para quedarse con el último
-- movimiento de cada conductor. Esta vista devuelve directamente esa última fila.
-- Mismo orden que usaba el panel: año, semana y fecha de carga, de más reciente a más vieja.
-- security_invoker: respeta los permisos (RLS) de quien consulta, igual que la tabla.
-- Si la vista no existe, el panel sigue funcionando como antes (más lento).
-- Se puede ejecutar más de una vez.

CREATE OR REPLACE VIEW v_ultimo_saldo_conductor
WITH (security_invoker = true) AS
SELECT DISTINCT ON (conductor_id)
  conductor_id,
  saldo_pendiente
FROM control_saldos
WHERE conductor_id IS NOT NULL
ORDER BY conductor_id, anio DESC, semana DESC, created_at DESC;

GRANT SELECT ON v_ultimo_saldo_conductor TO authenticated;

-- Índice para que la vista responda rápido
CREATE INDEX IF NOT EXISTS idx_control_saldos_conductor_orden
  ON control_saldos (conductor_id, anio DESC, semana DESC, created_at DESC);

-- Comprobar (una fila por conductor)
-- SELECT count(*), count(DISTINCT conductor_id) FROM v_ultimo_saldo_conductor;
