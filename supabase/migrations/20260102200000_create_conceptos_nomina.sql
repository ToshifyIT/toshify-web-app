-- Tabla de conceptos para nómina de conductores
CREATE TABLE IF NOT EXISTS conceptos_nomina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(10) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NOT NULL,
  precio_base DECIMAL(12,2) NOT NULL DEFAULT 0,
  iva_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
  precio_final DECIMAL(12,2) NOT NULL DEFAULT 0,
  tipo VARCHAR(50) NOT NULL DEFAULT 'cargo', -- 'cargo', 'descuento', 'fijo', 'variable'
  es_variable BOOLEAN NOT NULL DEFAULT false, -- true si el monto es variable (ej: multas, peajes)
  aplica_turno BOOLEAN NOT NULL DEFAULT false, -- aplica a modalidad TURNO
  aplica_cargo BOOLEAN NOT NULL DEFAULT false, -- aplica a modalidad A CARGO
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar los conceptos del Excel
INSERT INTO conceptos_nomina (codigo, descripcion, precio_base, iva_porcentaje, precio_final, tipo, es_variable, aplica_turno, aplica_cargo, orden) VALUES
  ('P001', 'ALQUILER DE VEHICULO TURNO', 28925.62, 21, 35000.00, 'alquiler', false, true, false, 1),
  ('P002', 'ALQUILER DE VEHICULO A CARGO', 42502.95, 21, 51428.57, 'alquiler', false, false, true, 2),
  ('P003', 'CUOTA DE GARANTIA', 7142.86, 0, 7142.86, 'cargo', false, true, true, 3),
  ('P004', 'TICKETS A FAVOR', 1.00, 0, 1.00, 'descuento', true, true, true, 4),
  ('P005', 'PEAJE', 1.00, 0, 1.00, 'cargo', true, true, true, 5),
  ('P006', 'EXCESO DE KM', 1.00, 21, 1.21, 'cargo', true, true, true, 6),
  ('P007', 'MULTAS/INFRACCIONES', 1.00, 0, 1.00, 'cargo', true, true, true, 7),
  ('P009', 'INTERESES POR MORA', 25000.00, 21, 30250.00, 'penalidad', false, true, true, 8),
  ('P010', 'REPUESTOS/DAÑOS', 1.00, 0, 1.00, 'cargo', true, true, true, 9),
  ('P011', 'PUBLICIDAD CABIFY', 1.00, 0, 1.00, 'ingreso', true, true, true, 10),
  ('P012', 'PUBLICIDAD EN TABLET', 1.00, 0, 1.00, 'ingreso', true, true, true, 11);

-- Índices
CREATE INDEX idx_conceptos_nomina_codigo ON conceptos_nomina(codigo);
CREATE INDEX idx_conceptos_nomina_tipo ON conceptos_nomina(tipo);
CREATE INDEX idx_conceptos_nomina_activo ON conceptos_nomina(activo);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_conceptos_nomina_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conceptos_nomina_updated_at
  BEFORE UPDATE ON conceptos_nomina
  FOR EACH ROW
  EXECUTE FUNCTION update_conceptos_nomina_updated_at();

-- Comentarios
COMMENT ON TABLE conceptos_nomina IS 'Conceptos para cálculo de nómina semanal de conductores';
COMMENT ON COLUMN conceptos_nomina.tipo IS 'Tipo: alquiler, cargo, descuento, ingreso, penalidad';
COMMENT ON COLUMN conceptos_nomina.es_variable IS 'Si es true, el monto se ingresa manualmente';
