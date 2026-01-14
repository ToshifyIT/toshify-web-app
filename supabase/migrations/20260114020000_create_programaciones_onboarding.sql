-- =====================================================
-- MÓDULO DE PROGRAMACIONES ONBOARDING (KANBAN)
-- Fecha: 2026-01-14
-- 
-- Tabla para gestionar el flujo de onboarding antes
-- de crear la asignación formal en el sistema
-- =====================================================

-- Tabla principal de programaciones
CREATE TABLE IF NOT EXISTS programaciones_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Estado del Kanban
  estado VARCHAR(50) NOT NULL DEFAULT 'por_agendar',
  -- Estados: por_agendar, agendado, en_curso, completado, cancelado
  
  -- Datos del conductor
  conductor_id UUID REFERENCES conductores(id),
  conductor_nombre VARCHAR(200), -- Si no está en sistema
  conductor_dni VARCHAR(20),
  tipo_candidato VARCHAR(50), -- nuevo, antiguo, reingreso
  turno VARCHAR(20), -- diurno, nocturno
  
  -- Datos del vehículo a entregar
  vehiculo_entregar_id UUID REFERENCES vehiculos(id),
  vehiculo_entregar_patente VARCHAR(20),
  vehiculo_entregar_modelo VARCHAR(100),
  vehiculo_entregar_color VARCHAR(50),
  
  -- Datos del vehículo a cambio (si aplica)
  vehiculo_cambio_id UUID REFERENCES vehiculos(id),
  vehiculo_cambio_patente VARCHAR(20),
  vehiculo_cambio_modelo VARCHAR(100),
  
  -- Tipo de asignación
  tipo_asignacion VARCHAR(50), -- entrega_auto, cambio_auto, asignacion_companero
  modalidad VARCHAR(20), -- TURNO, CARGO
  
  -- Cita
  fecha_cita DATE,
  hora_cita TIME,
  zona VARCHAR(50), -- norte, sur, caba, oeste
  distancia_minutos INTEGER,
  direccion TEXT,
  
  -- Documentación
  tipo_documento VARCHAR(50), -- contrato, anexo, na
  documento_listo BOOLEAN DEFAULT false,
  
  -- Checklist de seguimiento
  grupo_whatsapp BOOLEAN DEFAULT false,
  citado_ypf BOOLEAN DEFAULT false,
  confirmacion_asistencia VARCHAR(50), -- confirmo, no_confirmo, reprogramar, sin_confirmar
  estado_cabify VARCHAR(50), -- pendiente, listo_cabify, asignar_auto, crear_cuenta
  
  -- Especialista asignado
  especialista_id UUID REFERENCES auth.users(id),
  especialista_nombre VARCHAR(100),
  
  -- Observaciones
  observaciones TEXT,
  
  -- Relación con asignación final (se llena cuando se completa)
  asignacion_id UUID REFERENCES asignaciones(id),
  fecha_asignacion_creada TIMESTAMPTZ,
  
  -- Auditoría
  created_by UUID REFERENCES auth.users(id),
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Multi-país
  pais_id UUID REFERENCES paises(id)
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_prog_onb_estado ON programaciones_onboarding(estado);
CREATE INDEX IF NOT EXISTS idx_prog_onb_fecha_cita ON programaciones_onboarding(fecha_cita);
CREATE INDEX IF NOT EXISTS idx_prog_onb_conductor ON programaciones_onboarding(conductor_id);
CREATE INDEX IF NOT EXISTS idx_prog_onb_vehiculo ON programaciones_onboarding(vehiculo_entregar_id);
CREATE INDEX IF NOT EXISTS idx_prog_onb_especialista ON programaciones_onboarding(especialista_id);
CREATE INDEX IF NOT EXISTS idx_prog_onb_asignacion ON programaciones_onboarding(asignacion_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_prog_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prog_onboarding_updated_at ON programaciones_onboarding;
CREATE TRIGGER trigger_prog_onboarding_updated_at
  BEFORE UPDATE ON programaciones_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION update_prog_onboarding_updated_at();

-- Vista con datos completos
CREATE OR REPLACE VIEW v_programaciones_onboarding AS
SELECT
  p.*,
  c.nombres as conductor_nombres,
  c.apellidos as conductor_apellidos,
  c.numero_dni as conductor_dni_sistema,
  COALESCE(p.conductor_nombre, CONCAT(c.nombres, ' ', c.apellidos)) as conductor_display,
  ve.patente as vehiculo_entregar_patente_sistema,
  ve.marca as vehiculo_entregar_marca,
  ve.modelo as vehiculo_entregar_modelo_sistema,
  vc.patente as vehiculo_cambio_patente_sistema,
  vc.marca as vehiculo_cambio_marca,
  vc.modelo as vehiculo_cambio_modelo_sistema,
  u.raw_user_meta_data->>'full_name' as especialista_nombre_sistema,
  a.codigo as asignacion_codigo,
  a.estado as asignacion_estado
FROM programaciones_onboarding p
LEFT JOIN conductores c ON p.conductor_id = c.id
LEFT JOIN vehiculos ve ON p.vehiculo_entregar_id = ve.id
LEFT JOIN vehiculos vc ON p.vehiculo_cambio_id = vc.id
LEFT JOIN auth.users u ON p.especialista_id = u.id
LEFT JOIN asignaciones a ON p.asignacion_id = a.id;

-- RLS
ALTER TABLE programaciones_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prog_onboarding_select" ON programaciones_onboarding 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prog_onboarding_insert" ON programaciones_onboarding 
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prog_onboarding_update" ON programaciones_onboarding 
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "prog_onboarding_delete" ON programaciones_onboarding 
  FOR DELETE TO authenticated USING (true);

-- Política para service_role
CREATE POLICY "prog_onboarding_service" ON programaciones_onboarding 
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comentarios
COMMENT ON TABLE programaciones_onboarding IS 'Gestión de programaciones de onboarding antes de crear asignación formal';
COMMENT ON COLUMN programaciones_onboarding.estado IS 'Estados Kanban: por_agendar, agendado, en_curso, completado, cancelado';
COMMENT ON COLUMN programaciones_onboarding.tipo_asignacion IS 'entrega_auto, cambio_auto, asignacion_companero';
COMMENT ON COLUMN programaciones_onboarding.asignacion_id IS 'FK a asignaciones, se llena cuando se completa el flujo';
