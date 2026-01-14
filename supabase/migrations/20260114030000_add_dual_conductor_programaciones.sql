-- =====================================================
-- AGREGAR CAMPOS PARA CONDUCTORES DUALES (TURNO)
-- Fecha: 2026-01-14
--
-- Añade soporte para asignar dos conductores por
-- programación (diurno y nocturno) en modalidad TURNO
-- =====================================================

-- Agregar campos para conductor DIURNO
ALTER TABLE programaciones_onboarding
ADD COLUMN IF NOT EXISTS conductor_diurno_id UUID REFERENCES conductores(id),
ADD COLUMN IF NOT EXISTS conductor_diurno_nombre VARCHAR(200),
ADD COLUMN IF NOT EXISTS conductor_diurno_dni VARCHAR(20),
ADD COLUMN IF NOT EXISTS tipo_candidato_diurno VARCHAR(50),
ADD COLUMN IF NOT EXISTS documento_diurno VARCHAR(50),
ADD COLUMN IF NOT EXISTS zona_diurno VARCHAR(100),
ADD COLUMN IF NOT EXISTS distancia_diurno INTEGER;

-- Agregar campos para conductor NOCTURNO
ALTER TABLE programaciones_onboarding
ADD COLUMN IF NOT EXISTS conductor_nocturno_id UUID REFERENCES conductores(id),
ADD COLUMN IF NOT EXISTS conductor_nocturno_nombre VARCHAR(200),
ADD COLUMN IF NOT EXISTS conductor_nocturno_dni VARCHAR(20),
ADD COLUMN IF NOT EXISTS tipo_candidato_nocturno VARCHAR(50),
ADD COLUMN IF NOT EXISTS documento_nocturno VARCHAR(50),
ADD COLUMN IF NOT EXISTS zona_nocturno VARCHAR(100),
ADD COLUMN IF NOT EXISTS distancia_nocturno INTEGER;

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_prog_onb_conductor_diurno ON programaciones_onboarding(conductor_diurno_id);
CREATE INDEX IF NOT EXISTS idx_prog_onb_conductor_nocturno ON programaciones_onboarding(conductor_nocturno_id);

-- Eliminar vista existente para poder recrearla con nuevas columnas
DROP VIEW IF EXISTS v_programaciones_onboarding;

-- Crear vista con datos completos incluyendo conductores duales
CREATE VIEW v_programaciones_onboarding AS
SELECT
  p.*,
  -- Conductor legacy
  c.nombres as conductor_nombres,
  c.apellidos as conductor_apellidos,
  c.numero_dni as conductor_dni_sistema,
  COALESCE(p.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) as conductor_display,
  -- Conductor diurno
  cd.nombres as conductor_diurno_nombres_sistema,
  cd.apellidos as conductor_diurno_apellidos_sistema,
  cd.numero_dni as conductor_diurno_dni_sistema,
  -- Conductor nocturno
  cn.nombres as conductor_nocturno_nombres_sistema,
  cn.apellidos as conductor_nocturno_apellidos_sistema,
  cn.numero_dni as conductor_nocturno_dni_sistema,
  -- Vehículo a entregar
  ve.patente as vehiculo_entregar_patente_sistema,
  ve.marca as vehiculo_entregar_marca,
  ve.modelo as vehiculo_entregar_modelo_sistema,
  -- Vehículo a cambio
  vc.patente as vehiculo_cambio_patente_sistema,
  vc.marca as vehiculo_cambio_marca,
  vc.modelo as vehiculo_cambio_modelo_sistema,
  -- Especialista
  u.raw_user_meta_data->>'full_name' as especialista_nombre_sistema,
  -- Asignación
  a.codigo as asignacion_codigo,
  a.estado as asignacion_estado
FROM programaciones_onboarding p
LEFT JOIN conductores c ON p.conductor_id = c.id
LEFT JOIN conductores cd ON p.conductor_diurno_id = cd.id
LEFT JOIN conductores cn ON p.conductor_nocturno_id = cn.id
LEFT JOIN vehiculos ve ON p.vehiculo_entregar_id = ve.id
LEFT JOIN vehiculos vc ON p.vehiculo_cambio_id = vc.id
LEFT JOIN auth.users u ON p.especialista_id = u.id
LEFT JOIN asignaciones a ON p.asignacion_id = a.id;

-- Comentarios
COMMENT ON COLUMN programaciones_onboarding.conductor_diurno_id IS 'Conductor asignado al turno diurno';
COMMENT ON COLUMN programaciones_onboarding.conductor_nocturno_id IS 'Conductor asignado al turno nocturno';
