-- =====================================================
-- MIGRACIÓN: Módulo de Siniestros V1
-- Fecha: 2024-12-30
-- Base de datos: SELFHOSTED (supabase.toshify.com.ar)
-- =====================================================

-- 1. Tabla: siniestros_categorias
CREATE TABLE IF NOT EXISTS siniestros_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  es_robo BOOLEAN DEFAULT false,
  orden INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Datos iniciales de categorías
INSERT INTO siniestros_categorias (codigo, nombre, es_robo, orden) VALUES
('CHOQUE_LEVE', 'Choque leve', false, 1),
('CHOQUE_MODERADO', 'Choque moderado', false, 2),
('CHOQUE_GRAVE', 'Choque grave', false, 3),
('ROBO_PARCIAL', 'Robo parcial', true, 4),
('ROBO_TOTAL', 'Robo', true, 5),
('DESTRUCCION_TOTAL', 'Destrucción total', false, 6),
('INTENTO_ROBO', 'Intento de robo', true, 7),
('PERDIDA_PATENTE', 'Pérdida de patente', false, 8)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Tabla: siniestros_estados
CREATE TABLE IF NOT EXISTS siniestros_estados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL,
  orden INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Datos iniciales de estados
INSERT INTO siniestros_estados (codigo, nombre, color, orden) VALUES
('REGISTRADO', 'Registrado', 'gray', 1),
('EN_GESTION', 'En gestión', 'blue', 2),
('ENVIADO_SEGURO', 'Enviado a seguro', 'orange', 3),
('APROBADO', 'Aprobado por seguro', 'green', 4),
('EN_REPARACION', 'En reparación', 'purple', 5),
('COBRADO', 'Cobrado', 'emerald', 6),
('CERRADO', 'Cerrado', 'slate', 7),
('RECHAZADO', 'Rechazado', 'red', 8)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Tabla: seguros (compañías de seguros)
CREATE TABLE IF NOT EXISTS seguros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(50),
  email VARCHAR(100),
  contacto_nombre VARCHAR(100),
  notas TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Datos iniciales de seguros
INSERT INTO seguros (nombre) VALUES
('Sancor'),
('La Segunda'),
('La Caja')
ON CONFLICT DO NOTHING;

-- 4. Tabla principal: siniestros
CREATE TABLE IF NOT EXISTS siniestros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pais_id UUID REFERENCES paises(id),

  -- Relaciones
  vehiculo_id UUID REFERENCES vehiculos(id),
  conductor_id UUID REFERENCES conductores(id),
  categoria_id UUID REFERENCES siniestros_categorias(id) NOT NULL,
  estado_id UUID REFERENCES siniestros_estados(id) NOT NULL,
  seguro_id UUID REFERENCES seguros(id),

  -- Datos del evento
  fecha_siniestro TIMESTAMPTZ NOT NULL,
  hora_siniestro TIME,
  ubicacion VARCHAR(255),
  responsable VARCHAR(20) CHECK (responsable IN ('tercero','conductor','compartida','sin_info')) DEFAULT 'sin_info',
  hay_lesionados BOOLEAN DEFAULT false,
  descripcion_danos TEXT,
  relato TEXT,

  -- Conductor (cuando no está en sistema)
  conductor_nombre VARCHAR(100),

  -- Datos del tercero
  tercero_nombre VARCHAR(100),
  tercero_dni VARCHAR(20),
  tercero_telefono VARCHAR(50),
  tercero_vehiculo VARCHAR(100),
  tercero_seguro VARCHAR(100),
  tercero_poliza VARCHAR(50),

  -- Gestión interna
  carpeta_drive_url VARCHAR(500),
  enviado_abogada BOOLEAN DEFAULT false,
  enviado_alliance BOOLEAN DEFAULT false,
  fecha_enviado_abogada DATE,
  fecha_enviado_alliance DATE,

  -- Datos del seguro
  nro_siniestro_seguro VARCHAR(50),
  presupuesto_real DECIMAL(12,2),
  presupuesto_enviado_seguro DECIMAL(12,2),
  presupuesto_aprobado_seguro DECIMAL(12,2),
  fecha_pago_estimada DATE,
  total_pagado DECIMAL(12,2),
  porcentaje_abogada DECIMAL(5,2),

  -- Observaciones
  observaciones TEXT,

  -- Auditoría
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para siniestros
CREATE INDEX IF NOT EXISTS idx_siniestros_fecha ON siniestros(fecha_siniestro);
CREATE INDEX IF NOT EXISTS idx_siniestros_vehiculo ON siniestros(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_siniestros_conductor ON siniestros(conductor_id);
CREATE INDEX IF NOT EXISTS idx_siniestros_estado ON siniestros(estado_id);
CREATE INDEX IF NOT EXISTS idx_siniestros_categoria ON siniestros(categoria_id);

-- 5. Tabla: siniestros_seguimiento (timeline/historial)
CREATE TABLE IF NOT EXISTS siniestros_seguimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siniestro_id UUID REFERENCES siniestros(id) ON DELETE CASCADE NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL,
  descripcion TEXT,
  estado_anterior_id UUID REFERENCES siniestros_estados(id),
  estado_nuevo_id UUID REFERENCES siniestros_estados(id),
  monto DECIMAL(12,2),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_siniestro ON siniestros_seguimiento(siniestro_id);

-- 6. Vista: v_siniestros_completos
CREATE OR REPLACE VIEW v_siniestros_completos AS
SELECT
  s.*,
  sc.codigo AS categoria_codigo,
  sc.nombre AS categoria_nombre,
  sc.es_robo AS categoria_es_robo,
  se.codigo AS estado_codigo,
  se.nombre AS estado_nombre,
  se.color AS estado_color,
  seg.nombre AS seguro_nombre,
  v.patente AS vehiculo_patente,
  v.marca AS vehiculo_marca,
  v.modelo AS vehiculo_modelo,
  c.nombres AS conductor_nombre_sistema,
  c.apellidos AS conductor_apellido_sistema,
  COALESCE(s.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) AS conductor_display
FROM siniestros s
LEFT JOIN siniestros_categorias sc ON s.categoria_id = sc.id
LEFT JOIN siniestros_estados se ON s.estado_id = se.id
LEFT JOIN seguros seg ON s.seguro_id = seg.id
LEFT JOIN vehiculos v ON s.vehiculo_id = v.id
LEFT JOIN conductores c ON s.conductor_id = c.id;

-- 7. Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_siniestros_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trigger_siniestros_updated_at ON siniestros;
CREATE TRIGGER trigger_siniestros_updated_at
  BEFORE UPDATE ON siniestros
  FOR EACH ROW
  EXECUTE FUNCTION update_siniestros_updated_at();

-- 8. RLS Policies
ALTER TABLE siniestros ENABLE ROW LEVEL SECURITY;
ALTER TABLE siniestros_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE siniestros_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros ENABLE ROW LEVEL SECURITY;
ALTER TABLE siniestros_seguimiento ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados
CREATE POLICY "Allow all for authenticated users" ON siniestros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON siniestros_categorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON siniestros_estados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON seguros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON siniestros_seguimiento
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para anon (lectura de catálogos)
CREATE POLICY "Allow read for anon" ON siniestros_categorias
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow read for anon" ON siniestros_estados
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow read for anon" ON seguros
  FOR SELECT TO anon USING (true);
