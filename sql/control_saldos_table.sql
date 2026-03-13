-- =====================================================
-- Tabla: control_saldos
-- Kardex de movimientos de saldo por conductor
-- Cada fila = un movimiento (pago, cargo, ajuste, etc.)
-- Creada: 2026-03-13
-- Modificada: 2026-03-13 - Quitar UNIQUE, agregar tipo_movimiento/monto_movimiento/referencia/created_by_name
-- =====================================================

CREATE TABLE control_saldos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conductor_id     UUID NOT NULL REFERENCES conductores(id),
  conductor_nombre TEXT NOT NULL,
  conductor_dni    TEXT,
  conductor_cuit   TEXT,
  semana           INTEGER NOT NULL,              -- Nro semana (1-52)
  anio             INTEGER NOT NULL,              -- Anio (2025, 2026...)
  periodo_id       UUID REFERENCES periodos_facturacion(id),  -- Link al periodo (opcional)
  tipo_movimiento  TEXT DEFAULT 'regularizado',   -- regularizado, pago, pago_cabify, pago_manual, pago_cuota, ajuste_manual, eliminacion_pago, edicion_pago
  monto_movimiento NUMERIC(12,2) DEFAULT 0,      -- Monto del movimiento puntual
  referencia       TEXT,                          -- Texto descriptivo del movimiento
  saldo_adeudado   NUMERIC(12,2) DEFAULT 0,      -- Monto adeudado resultante
  saldo_a_favor    NUMERIC(12,2) DEFAULT 0,      -- Monto a favor resultante
  saldo_pendiente  NUMERIC(12,2) DEFAULT 0,      -- Saldo resultante despues del movimiento. Negativo = deuda, Positivo = a favor
  dias_mora        INTEGER DEFAULT 0,
  interes_mora     NUMERIC(12,2) DEFAULT 0,
  created_by_name  TEXT,                          -- Usuario que registro el movimiento
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
  -- SIN UNIQUE: pueden haber multiples movimientos por conductor por semana
);

-- Indices
CREATE INDEX idx_control_saldos_conductor ON control_saldos(conductor_id);
CREATE INDEX idx_control_saldos_periodo ON control_saldos(anio, semana);

-- RLS
ALTER TABLE control_saldos ENABLE ROW LEVEL SECURITY;

CREATE POLICY control_saldos_select ON control_saldos FOR SELECT TO authenticated USING (true);
CREATE POLICY control_saldos_insert ON control_saldos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY control_saldos_update ON control_saldos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY control_saldos_delete ON control_saldos FOR DELETE TO authenticated USING (true);
CREATE POLICY control_saldos_anon_select ON control_saldos FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON control_saldos TO authenticated;
GRANT SELECT ON control_saldos TO anon;
