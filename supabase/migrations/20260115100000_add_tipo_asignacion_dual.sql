-- =====================================================
-- AGREGAR COLUMNAS tipo_asignacion_diurno/nocturno
-- Y ACTUALIZAR VISTA
-- Fecha: 2026-01-15
-- =====================================================

-- Agregar columnas para tipo_asignacion por turno
ALTER TABLE programaciones_onboarding
ADD COLUMN IF NOT EXISTS tipo_asignacion_diurno TEXT,
ADD COLUMN IF NOT EXISTS tipo_asignacion_nocturno TEXT;

-- Recrear la vista para asegurar que incluya todas las columnas
DROP VIEW IF EXISTS v_programaciones_onboarding;

CREATE VIEW v_programaciones_onboarding AS
SELECT
  p.id,
  p.estado,
  p.conductor_id,
  p.conductor_nombre,
  p.conductor_dni,
  p.tipo_candidato,
  p.turno,
  p.vehiculo_entregar_id,
  p.vehiculo_entregar_patente,
  p.vehiculo_entregar_modelo,
  p.vehiculo_entregar_color,
  p.vehiculo_cambio_id,
  p.vehiculo_cambio_patente,
  p.vehiculo_cambio_modelo,
  p.tipo_asignacion,
  p.tipo_asignacion_diurno,
  p.tipo_asignacion_nocturno,
  p.modalidad,
  p.fecha_cita,
  p.hora_cita,
  p.zona,
  p.distancia_minutos,
  p.direccion,
  p.tipo_documento,
  p.documento_listo,
  p.grupo_whatsapp,
  p.citado_ypf,
  p.confirmacion_asistencia,
  p.estado_cabify,
  p.especialista_id,
  p.especialista_nombre,
  p.observaciones,
  p.asignacion_id,
  p.fecha_asignacion_creada,
  p.created_by,
  p.created_by_name,
  p.created_at,
  p.updated_at,
  p.pais_id,
  -- Campos de conductor dual
  p.conductor_diurno_id,
  p.conductor_diurno_nombre,
  p.conductor_diurno_dni,
  p.tipo_candidato_diurno,
  p.documento_diurno,
  p.zona_diurno,
  p.distancia_diurno,
  p.conductor_nocturno_id,
  p.conductor_nocturno_nombre,
  p.conductor_nocturno_dni,
  p.tipo_candidato_nocturno,
  p.documento_nocturno,
  p.zona_nocturno,
  p.distancia_nocturno,
  -- Joins
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
COMMENT ON COLUMN programaciones_onboarding.tipo_asignacion_diurno IS 'Tipo de asignación para conductor diurno en modo TURNO';
COMMENT ON COLUMN programaciones_onboarding.tipo_asignacion_nocturno IS 'Tipo de asignación para conductor nocturno en modo TURNO';
