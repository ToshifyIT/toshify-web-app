-- =====================================================
-- MIGRACIÓN: Actualizaciones Módulo de Siniestros
-- Fecha: 2026-01-02
-- Base de datos: SELFHOSTED (supabase.toshify.com.ar)
-- =====================================================

-- 1. Agregar estado SINIESTRADO a vehiculos_estados
INSERT INTO vehiculos_estados (codigo, descripcion, activo)
VALUES ('SINIESTRADO', 'Vehiculo siniestrado', true)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Desactivar estados viejos de siniestros
UPDATE siniestros_estados SET is_active = false WHERE is_active = true;

-- 3. Insertar nuevos estados de gestión administrativa
INSERT INTO siniestros_estados (codigo, nombre, color, orden, is_active) VALUES
('REGISTRADO', 'Registrado', 'gray', 1, true),
('GESTION_SEGURO_TOSHIFY', 'Gestión seguro Toshify', 'blue', 2, true),
('GESTION_SEGURO_TERCERO', 'Gestión seguro tercero', 'indigo', 3, true),
('PROCESANDO_COBRO', 'Procesando cobro', 'orange', 4, true),
('COBRADO_POR_SEGURO', 'Cobrado por seguro', 'green', 5, true),
('PAGADO_POR_CONDUCTOR', 'Pagado por conductor', 'emerald', 6, true),
('RECHAZADO', 'Rechazado', 'red', 7, true)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  color = EXCLUDED.color,
  orden = EXCLUDED.orden,
  is_active = true;

-- 4. Agregar nuevos campos a tabla siniestros
ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS habilitado_circular BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS costos_reparacion DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS total_reparacion_pagada DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ;

COMMENT ON COLUMN siniestros.habilitado_circular IS 'Indica si el vehiculo esta habilitado para circular';
COMMENT ON COLUMN siniestros.costos_reparacion IS 'Costos de reparacion del vehiculo';
COMMENT ON COLUMN siniestros.total_reparacion_pagada IS 'Total pagado por reparaciones';
COMMENT ON COLUMN siniestros.fecha_cierre IS 'Fecha de cierre del siniestro';

-- 5. Crear tabla de tickets de reparación (1 por siniestro)
CREATE TABLE IF NOT EXISTS siniestros_reparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siniestro_id UUID REFERENCES siniestros(id) ON DELETE CASCADE NOT NULL UNIQUE,
  taller VARCHAR(200),
  fecha_inicio DATE,
  fecha_finalizacion DATE,
  estado VARCHAR(20) CHECK (estado IN ('INICIADO', 'FINALIZADO')) DEFAULT 'INICIADO',
  observaciones TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para búsquedas
CREATE INDEX IF NOT EXISTS idx_siniestros_reparaciones_siniestro ON siniestros_reparaciones(siniestro_id);
CREATE INDEX IF NOT EXISTS idx_siniestros_reparaciones_estado ON siniestros_reparaciones(estado);

-- Trigger para updated_at en reparaciones
DROP TRIGGER IF EXISTS trigger_siniestros_reparaciones_updated_at ON siniestros_reparaciones;
CREATE TRIGGER trigger_siniestros_reparaciones_updated_at
  BEFORE UPDATE ON siniestros_reparaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_siniestros_updated_at();

-- RLS para reparaciones
ALTER TABLE siniestros_reparaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON siniestros_reparaciones;
CREATE POLICY "Allow all for authenticated users" ON siniestros_reparaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Función trigger para actualizar estado vehículo cuando cambia habilitado_circular
CREATE OR REPLACE FUNCTION update_vehiculo_estado_siniestro()
RETURNS TRIGGER AS $$
DECLARE
  estado_siniestrado_id UUID;
  estado_disponible_id UUID;
BEGIN
  -- Obtener IDs de estados de vehículos
  SELECT id INTO estado_siniestrado_id FROM vehiculos_estados WHERE codigo = 'SINIESTRADO' LIMIT 1;
  SELECT id INTO estado_disponible_id FROM vehiculos_estados WHERE codigo = 'DISPONIBLE' LIMIT 1;

  -- Si cambia habilitado_circular y hay vehículo asociado
  IF OLD.habilitado_circular IS DISTINCT FROM NEW.habilitado_circular AND NEW.vehiculo_id IS NOT NULL THEN
    IF NEW.habilitado_circular = false AND estado_siniestrado_id IS NOT NULL THEN
      -- Cambiar vehículo a SINIESTRADO
      UPDATE vehiculos SET estado_id = estado_siniestrado_id, updated_at = now() WHERE id = NEW.vehiculo_id;
    ELSIF NEW.habilitado_circular = true AND estado_disponible_id IS NOT NULL THEN
      -- Volver vehículo a DISPONIBLE
      UPDATE vehiculos SET estado_id = estado_disponible_id, updated_at = now() WHERE id = NEW.vehiculo_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger
DROP TRIGGER IF EXISTS trigger_update_vehiculo_estado_siniestro ON siniestros;
CREATE TRIGGER trigger_update_vehiculo_estado_siniestro
  AFTER UPDATE ON siniestros
  FOR EACH ROW
  EXECUTE FUNCTION update_vehiculo_estado_siniestro();

-- 7. Actualizar vista v_siniestros_completos con nuevos campos
DROP VIEW IF EXISTS v_siniestros_completos;
CREATE VIEW v_siniestros_completos AS
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
  COALESCE(s.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) AS conductor_display,
  -- Días siniestrado (calculado)
  CASE
    WHEN s.fecha_cierre IS NOT NULL THEN
      (s.fecha_cierre::DATE - s.fecha_siniestro::DATE)
    ELSE
      (CURRENT_DATE - s.fecha_siniestro::DATE)
  END AS dias_siniestrado,
  -- Datos de reparación
  sr.id AS reparacion_id,
  sr.taller AS reparacion_taller,
  sr.fecha_inicio AS reparacion_fecha_inicio,
  sr.fecha_finalizacion AS reparacion_fecha_finalizacion,
  sr.estado AS reparacion_estado,
  sr.observaciones AS reparacion_observaciones,
  -- Días en reparación (calculado)
  CASE
    WHEN sr.fecha_finalizacion IS NOT NULL AND sr.fecha_inicio IS NOT NULL THEN
      (sr.fecha_finalizacion - sr.fecha_inicio)
    WHEN sr.fecha_inicio IS NOT NULL THEN
      (CURRENT_DATE - sr.fecha_inicio)
    ELSE NULL
  END AS reparacion_dias
FROM siniestros s
LEFT JOIN siniestros_categorias sc ON s.categoria_id = sc.id
LEFT JOIN siniestros_estados se ON s.estado_id = se.id
LEFT JOIN seguros seg ON s.seguro_id = seg.id
LEFT JOIN vehiculos v ON s.vehiculo_id = v.id
LEFT JOIN conductores c ON s.conductor_id = c.id
LEFT JOIN siniestros_reparaciones sr ON s.id = sr.siniestro_id;
