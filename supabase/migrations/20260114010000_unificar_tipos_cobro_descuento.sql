-- =====================================================
-- UNIFICACIÓN DE TIPOS DE COBRO/DESCUENTO
-- Fecha: 2026-01-14
-- 
-- Unifica los tipos de incidencia de cobro y tipos de penalidad
-- en una sola tabla para mantener consistencia
-- =====================================================

-- Crear tabla unificada de tipos de cobro/descuento
CREATE TABLE IF NOT EXISTS tipos_cobro_descuento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(50), -- P004 (Tickets a Favor), P006 (Exceso KM), P007 (Multas/Penalidades)
  es_a_favor BOOLEAN DEFAULT false, -- true = conductor recibe, false = conductor paga
  orden INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar tipos de cobro/descuento unificados
INSERT INTO tipos_cobro_descuento (codigo, nombre, categoria, es_a_favor, orden) VALUES
  -- P006 - Exceso de Kilometraje
  ('EXCESO_KM', 'Exceso de kilometraje', 'P006', false, 1),
  
  -- P004 - Tickets a Favor (conductor recibe)
  ('BONO_5_VENTAS', 'Bono 5% ventas', 'P004', true, 10),
  ('BONO_EVENTO_TOSHIFY', 'Bono por evento Toshify', 'P004', true, 11),
  ('TICKETS_PEAJES', 'Tickets de peajes', 'P004', true, 12),
  ('COMISION_REFERIDOS', 'Comisión referidos', 'P004', true, 13),
  
  -- P007 - Multas/Penalidades (conductor paga)
  ('ENTREGA_TARDIA', 'Entrega tardía del vehículo', 'P007', false, 20),
  ('LLEGADA_TARDE_REVISION', 'Llegada tarde o inasistencia a revisión técnica', 'P007', false, 21),
  ('INGRESO_ZONAS_RESTRINGIDAS', 'Ingreso a zonas restringidas', 'P007', false, 22),
  ('FALTA_LAVADO', 'Falta de lavado', 'P007', false, 23),
  ('FALTA_RESTITUCION_UNIDAD', 'Falta de restitución de la unidad', 'P007', false, 24),
  ('PERDIDA_DANO_SEGURIDAD', 'Pérdida o daño de elementos de seguridad', 'P007', false, 25),
  ('FALTA_RESTITUCION_GNC', 'Falta restitución de GNC', 'P007', false, 26),
  ('FALTA_RESTITUCION_NAFTA', 'Falta restitución de Nafta', 'P007', false, 27),
  ('MORA_CANON', 'Mora en canon', 'P007', false, 28),
  ('IBUTTON', 'iButton', 'P007', false, 29),
  ('MULTA_TRANSITO', 'Multa de tránsito', 'P007', false, 30),
  ('REPARACION_SINIESTRO', 'Reparación Siniestro', 'P007', false, 31),
  ('MANIPULACION_GPS', 'Manipulación no autorizada de GPS', 'P007', false, 32),
  ('ABANDONO_VEHICULO', 'Abandono del vehículo', 'P007', false, 33),
  ('SIN_LUGAR_GUARDA', 'No disponer de lugar seguro para guarda', 'P007', false, 34),
  
  -- Otros
  ('OTRO_COBRO', 'Otro cobro/descuento', NULL, false, 99),
  ('OTRO_FAVOR', 'Otro a favor', NULL, true, 100)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  categoria = EXCLUDED.categoria,
  es_a_favor = EXCLUDED.es_a_favor,
  orden = EXCLUDED.orden;

-- Agregar columna tipo_cobro_descuento_id a incidencias (para incidencias tipo=cobro)
ALTER TABLE incidencias 
ADD COLUMN IF NOT EXISTS tipo_cobro_descuento_id UUID REFERENCES tipos_cobro_descuento(id);

-- Agregar columna tipo_cobro_descuento_id a penalidades
-- Mantener tipo_penalidad_id por compatibilidad, pero preferir el nuevo campo
ALTER TABLE penalidades 
ADD COLUMN IF NOT EXISTS tipo_cobro_descuento_id UUID REFERENCES tipos_cobro_descuento(id);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_tipos_cobro_descuento_categoria ON tipos_cobro_descuento(categoria);
CREATE INDEX IF NOT EXISTS idx_tipos_cobro_descuento_activo ON tipos_cobro_descuento(is_active);
CREATE INDEX IF NOT EXISTS idx_incidencias_tipo_cobro ON incidencias(tipo_cobro_descuento_id);
CREATE INDEX IF NOT EXISTS idx_penalidades_tipo_cobro ON penalidades(tipo_cobro_descuento_id);

-- RLS
ALTER TABLE tipos_cobro_descuento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_cobro_descuento_select" ON tipos_cobro_descuento FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_cobro_descuento_service" ON tipos_cobro_descuento FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Actualizar vista de incidencias completas para incluir tipo de cobro
DROP VIEW IF EXISTS v_incidencias_completas;
CREATE VIEW v_incidencias_completas AS
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
  tcd.codigo as tipo_cobro_codigo,
  tcd.nombre as tipo_cobro_nombre,
  tcd.categoria as tipo_cobro_categoria,
  tcd.es_a_favor as tipo_cobro_es_a_favor,
  (SELECT COUNT(*) FROM penalidades p WHERE p.incidencia_id = i.id) as total_penalidades,
  (SELECT COALESCE(SUM(p.monto), 0) FROM penalidades p WHERE p.incidencia_id = i.id) as monto_penalidades
FROM incidencias i
LEFT JOIN incidencias_estados e ON i.estado_id = e.id
LEFT JOIN vehiculos v ON i.vehiculo_id = v.id
LEFT JOIN conductores c ON i.conductor_id = c.id
LEFT JOIN tipos_cobro_descuento tcd ON i.tipo_cobro_descuento_id = tcd.id;

-- Actualizar vista de penalidades completas
DROP VIEW IF EXISTS v_penalidades_completas;
CREATE VIEW v_penalidades_completas AS
SELECT
  p.*,
  -- Preferir nuevo tipo, fallback a tipo_penalidad
  COALESCE(tcd.codigo, tp.codigo) as tipo_codigo,
  COALESCE(tcd.nombre, tp.nombre) as tipo_nombre,
  tcd.categoria as tipo_categoria,
  tcd.es_a_favor as tipo_es_a_favor,
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
LEFT JOIN tipos_cobro_descuento tcd ON p.tipo_cobro_descuento_id = tcd.id
LEFT JOIN tipos_penalidad tp ON p.tipo_penalidad_id = tp.id
LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
LEFT JOIN conductores c ON p.conductor_id = c.id
LEFT JOIN incidencias i ON p.incidencia_id = i.id
LEFT JOIN incidencias_estados ie ON i.estado_id = ie.id;

-- Comentarios de documentación
COMMENT ON TABLE tipos_cobro_descuento IS 'Tabla unificada de tipos de cobro/descuento para incidencias y penalidades';
COMMENT ON COLUMN tipos_cobro_descuento.categoria IS 'P004=Tickets a Favor, P006=Exceso KM, P007=Multas/Penalidades';
COMMENT ON COLUMN tipos_cobro_descuento.es_a_favor IS 'true=conductor recibe dinero, false=conductor paga';
