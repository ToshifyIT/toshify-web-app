-- =====================================================
-- ACTUALIZAR CONDUCTORES CON ESTADO NULL A ACTIVO
-- Fecha: 2026-01-15
-- =====================================================

-- Primero verificar si existe el estado 'activo' en la tabla de estados
-- y obtener su ID para actualizar los conductores

-- Actualizar conductores con estado_id NULL a 'activo'
UPDATE conductores c
SET estado_id = (
  SELECT id FROM conductores_estados WHERE codigo = 'activo' LIMIT 1
)
WHERE c.estado_id IS NULL;

-- Si no existe estado con codigo 'activo', intentar con 'ACTIVO'
UPDATE conductores c
SET estado_id = (
  SELECT id FROM conductores_estados WHERE UPPER(codigo) = 'ACTIVO' LIMIT 1
)
WHERE c.estado_id IS NULL;

-- Comentario
COMMENT ON TABLE conductores IS 'Tabla de conductores - estados NULL actualizados a activo';
