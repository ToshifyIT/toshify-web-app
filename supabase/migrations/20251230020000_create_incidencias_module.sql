-- =====================================================
-- MÓDULO DE INCIDENCIAS V1
-- Fecha: 2025-12-30
-- Base de datos: SELFHOSTED (supabase.toshify.com.ar)
-- =====================================================

-- Tabla: Estados de incidencia
CREATE TABLE IF NOT EXISTS incidencias_estados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT 'gray',
  orden INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar estados por defecto
INSERT INTO incidencias_estados (codigo, nombre, color, orden) VALUES
  ('PENDIENTE', 'Pendiente', 'yellow', 1),
  ('SEGUIMIENTO', 'Seguimiento', 'blue', 2),
  ('RESUELTO', 'Resuelto', 'green', 3),
  ('SIN_NOVEDADES', 'Sin novedades', 'gray', 4)
ON CONFLICT (codigo) DO NOTHING;

-- Tabla: Tipos de penalidad
CREATE TABLE IF NOT EXISTS tipos_penalidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar tipos de penalidad por defecto
INSERT INTO tipos_penalidad (codigo, nombre, orden) VALUES
  ('TURNO', 'Turno', 1),
  ('IBUTTON', 'iButton', 2),
  ('GNC_NAFTA', 'GNC/Nafta', 3),
  ('LAVADO', 'Lavado', 4),
  ('REPARACION', 'Reparación', 5),
  ('MULTAS', 'Multas', 6),
  ('EXCESO_KM', 'Exceso de Km', 7),
  ('INCIDENCIAS_GUIAS', 'Incidencias Guías', 8),
  ('BONO_VENTAS', 'Bono 5% Ventas', 9),
  ('BONO_EVENTO', 'Bono por evento Toshify', 10),
  ('PENALIDAD', 'Penalidad', 11),
  ('A_FAVOR', 'A favor', 12)
ON CONFLICT (codigo) DO NOTHING;

-- Tabla: Incidencias
CREATE TABLE IF NOT EXISTS incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID REFERENCES vehiculos(id),
  conductor_id UUID REFERENCES conductores(id),
  estado_id UUID REFERENCES incidencias_estados(id) NOT NULL,
  semana INTEGER,
  fecha DATE NOT NULL,
  turno VARCHAR(20), -- Diurno, Nocturno
  area VARCHAR(50), -- Logística, Data Entry
  estado_vehiculo VARCHAR(100), -- En uso, Parking-Disponible, Taller, etc.
  descripcion TEXT,
  accion_ejecutada TEXT,
  registrado_por VARCHAR(100),
  -- Para conductor no registrado en sistema
  conductor_nombre VARCHAR(200),
  -- Para vehículo no registrado (patente texto)
  vehiculo_patente VARCHAR(20),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: Penalidades (Cobros/Descuentos)
CREATE TABLE IF NOT EXISTS penalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidencia_id UUID REFERENCES incidencias(id) ON DELETE SET NULL,
  vehiculo_id UUID REFERENCES vehiculos(id),
  conductor_id UUID REFERENCES conductores(id),
  tipo_penalidad_id UUID REFERENCES tipos_penalidad(id),
  semana INTEGER,
  fecha DATE NOT NULL,
  turno VARCHAR(20),
  area_responsable VARCHAR(50), -- LOGISTICA, DATA ENTRY, GUIAS, VENTAS
  detalle VARCHAR(50), -- Descuento, Cobro, Sin cargo, A favor
  monto DECIMAL(12, 2), -- En pesos argentinos
  observaciones TEXT,
  aplicado BOOLEAN DEFAULT false,
  fecha_aplicacion DATE,
  nota_administrativa TEXT,
  -- Para conductor no registrado
  conductor_nombre VARCHAR(200),
  -- Para vehículo no registrado
  vehiculo_patente VARCHAR(20),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_incidencias_fecha ON incidencias(fecha);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias(estado_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_vehiculo ON incidencias(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_conductor ON incidencias(conductor_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_semana ON incidencias(semana);

CREATE INDEX IF NOT EXISTS idx_penalidades_incidencia ON penalidades(incidencia_id);
CREATE INDEX IF NOT EXISTS idx_penalidades_aplicado ON penalidades(aplicado);
CREATE INDEX IF NOT EXISTS idx_penalidades_conductor ON penalidades(conductor_id);
CREATE INDEX IF NOT EXISTS idx_penalidades_fecha ON penalidades(fecha);

-- Vista: Incidencias completas con joins
CREATE OR REPLACE VIEW v_incidencias_completas AS
SELECT
  i.*,
  e.codigo as estado_codigo,
  e.nombre as estado_nombre,
  e.color as estado_color,
  v.patente as vehiculo_patente_sistema,
  v.marca as vehiculo_marca,
  v.modelo as vehiculo_modelo,
  c.nombres as conductor_nombres,
  c.apellidos as conductor_apellidos,
  COALESCE(i.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) as conductor_display,
  COALESCE(i.vehiculo_patente, v.patente) as patente_display,
  (SELECT COUNT(*) FROM penalidades p WHERE p.incidencia_id = i.id) as total_penalidades,
  (SELECT COALESCE(SUM(p.monto), 0) FROM penalidades p WHERE p.incidencia_id = i.id) as monto_penalidades
FROM incidencias i
LEFT JOIN incidencias_estados e ON i.estado_id = e.id
LEFT JOIN vehiculos v ON i.vehiculo_id = v.id
LEFT JOIN conductores c ON i.conductor_id = c.id;

-- Vista: Penalidades completas con joins
CREATE OR REPLACE VIEW v_penalidades_completas AS
SELECT
  p.*,
  tp.codigo as tipo_codigo,
  tp.nombre as tipo_nombre,
  v.patente as vehiculo_patente_sistema,
  v.marca as vehiculo_marca,
  v.modelo as vehiculo_modelo,
  c.nombres as conductor_nombres,
  c.apellidos as conductor_apellidos,
  COALESCE(p.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) as conductor_display,
  COALESCE(p.vehiculo_patente, v.patente) as patente_display,
  i.descripcion as incidencia_descripcion,
  ie.nombre as incidencia_estado
FROM penalidades p
LEFT JOIN tipos_penalidad tp ON p.tipo_penalidad_id = tp.id
LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
LEFT JOIN conductores c ON p.conductor_id = c.id
LEFT JOIN incidencias i ON p.incidencia_id = i.id
LEFT JOIN incidencias_estados ie ON i.estado_id = ie.id;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_incidencias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_incidencias_updated_at ON incidencias;
CREATE TRIGGER trigger_incidencias_updated_at
  BEFORE UPDATE ON incidencias
  FOR EACH ROW
  EXECUTE FUNCTION update_incidencias_updated_at();

DROP TRIGGER IF EXISTS trigger_penalidades_updated_at ON penalidades;
CREATE TRIGGER trigger_penalidades_updated_at
  BEFORE UPDATE ON penalidades
  FOR EACH ROW
  EXECUTE FUNCTION update_incidencias_updated_at();

-- RLS Policies
ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencias_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_penalidad ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados
CREATE POLICY "incidencias_select" ON incidencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "incidencias_insert" ON incidencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "incidencias_update" ON incidencias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "incidencias_delete" ON incidencias FOR DELETE TO authenticated USING (true);

CREATE POLICY "penalidades_select" ON penalidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "penalidades_insert" ON penalidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "penalidades_update" ON penalidades FOR UPDATE TO authenticated USING (true);
CREATE POLICY "penalidades_delete" ON penalidades FOR DELETE TO authenticated USING (true);

CREATE POLICY "incidencias_estados_select" ON incidencias_estados FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_penalidad_select" ON tipos_penalidad FOR SELECT TO authenticated USING (true);

-- Políticas para service_role (bypass RLS)
CREATE POLICY "incidencias_service" ON incidencias FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "penalidades_service" ON penalidades FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "incidencias_estados_service" ON incidencias_estados FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tipos_penalidad_service" ON tipos_penalidad FOR ALL TO service_role USING (true) WITH CHECK (true);
