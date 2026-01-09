-- =====================================================
-- MIGRACIÓN: BLOQUEO DE CONDUCTORES Y LIQUIDACIÓN
-- Fecha: 2026-01-09
-- Descripción: Agrega campo bloqueado a conductores y parámetro de límite
-- =====================================================

-- =====================================================
-- 1. AGREGAR CAMPOS DE BLOQUEO A CONDUCTORES
-- =====================================================
DO $$
BEGIN
  -- Campo bloqueado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'bloqueado'
  ) THEN
    ALTER TABLE conductores ADD COLUMN bloqueado boolean DEFAULT false;
  END IF;

  -- Motivo del bloqueo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'motivo_bloqueo'
  ) THEN
    ALTER TABLE conductores ADD COLUMN motivo_bloqueo text;
  END IF;

  -- Fecha del bloqueo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'fecha_bloqueo'
  ) THEN
    ALTER TABLE conductores ADD COLUMN fecha_bloqueo timestamp with time zone;
  END IF;

  -- Usuario que bloqueó
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'bloqueado_por'
  ) THEN
    ALTER TABLE conductores ADD COLUMN bloqueado_por uuid REFERENCES auth.users(id);
  END IF;

  -- Fecha de baja (para liquidación)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'fecha_baja'
  ) THEN
    ALTER TABLE conductores ADD COLUMN fecha_baja timestamp with time zone;
  END IF;

  -- Motivo de baja
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conductores' AND column_name = 'motivo_baja'
  ) THEN
    ALTER TABLE conductores ADD COLUMN motivo_baja text;
  END IF;
END $$;

-- Índice para búsqueda de bloqueados
CREATE INDEX IF NOT EXISTS idx_conductores_bloqueado ON conductores(bloqueado) WHERE bloqueado = true;

-- =====================================================
-- 2. INSERTAR PARÁMETRO DE LÍMITE DE BLOQUEO
-- =====================================================
INSERT INTO parametros_sistema (modulo, clave, tipo, valor, descripcion, unidad, valor_minimo, activo)
VALUES (
  'facturacion',
  'bloqueo_monto_limite',
  'number',
  '500000',
  'Monto de deuda a partir del cual se sugiere bloquear al conductor',
  'ARS',
  0,
  true
)
ON CONFLICT (modulo, clave) DO NOTHING;

-- Parámetro para días de mora antes de sugerir bloqueo
INSERT INTO parametros_sistema (modulo, clave, tipo, valor, descripcion, unidad, valor_minimo, activo)
VALUES (
  'facturacion',
  'bloqueo_dias_mora',
  'number',
  '14',
  'Días de mora a partir del cual se sugiere bloquear al conductor',
  'días',
  0,
  true
)
ON CONFLICT (modulo, clave) DO NOTHING;

-- =====================================================
-- 3. CREAR TABLA DE LIQUIDACIONES
-- =====================================================
CREATE TABLE IF NOT EXISTS liquidaciones_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conductor
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  conductor_nombre varchar(200),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),

  -- Vehículo al momento de la liquidación
  vehiculo_id uuid REFERENCES vehiculos(id),
  vehiculo_patente varchar(20),
  tipo_alquiler varchar(10), -- CARGO/TURNO

  -- Fechas
  fecha_liquidacion date NOT NULL DEFAULT CURRENT_DATE,
  fecha_inicio_semana date, -- Lunes de la semana parcial
  fecha_corte date NOT NULL, -- Fecha hasta donde se calcula

  -- Días trabajados en semana parcial
  dias_trabajados integer DEFAULT 0,
  turnos_base integer DEFAULT 7,

  -- Montos calculados
  alquiler_proporcional numeric(12,2) DEFAULT 0,
  garantia_proporcional numeric(12,2) DEFAULT 0,
  peajes_pendientes numeric(12,2) DEFAULT 0,
  excesos_km numeric(12,2) DEFAULT 0,
  penalidades numeric(12,2) DEFAULT 0,
  tickets_favor numeric(12,2) DEFAULT 0,
  saldo_anterior numeric(12,2) DEFAULT 0,
  mora_acumulada numeric(12,2) DEFAULT 0,

  -- Garantía acumulada (a devolver si aplica)
  garantia_total_pagada numeric(12,2) DEFAULT 0,
  garantia_cuotas_pagadas integer DEFAULT 0,
  garantia_a_devolver numeric(12,2) DEFAULT 0, -- Si deuda < garantía

  -- Totales
  subtotal_cargos numeric(12,2) DEFAULT 0,
  subtotal_descuentos numeric(12,2) DEFAULT 0,
  total_liquidacion numeric(12,2) DEFAULT 0, -- Positivo = debe, Negativo = a favor

  -- Estado
  estado varchar(20) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'calculado', 'aprobado', 'pagado', 'cancelado')),

  -- Notas
  notas text,

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_by_name varchar(100),
  aprobado_por uuid REFERENCES auth.users(id),
  aprobado_por_name varchar(100),
  fecha_aprobacion timestamp with time zone
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_liquidaciones_conductor ON liquidaciones_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_fecha ON liquidaciones_conductores(fecha_liquidacion);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_estado ON liquidaciones_conductores(estado);

-- RLS
ALTER TABLE liquidaciones_conductores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liquidaciones_select" ON liquidaciones_conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "liquidaciones_insert" ON liquidaciones_conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "liquidaciones_update" ON liquidaciones_conductores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "liquidaciones_delete" ON liquidaciones_conductores FOR DELETE TO authenticated USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_liquidaciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS liquidaciones_updated_at ON liquidaciones_conductores;
CREATE TRIGGER liquidaciones_updated_at
  BEFORE UPDATE ON liquidaciones_conductores
  FOR EACH ROW EXECUTE FUNCTION update_liquidaciones_updated_at();

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
