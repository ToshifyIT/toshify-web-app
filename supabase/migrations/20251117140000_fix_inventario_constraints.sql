-- Agregar índices únicos para la tabla inventario
-- Estos índices son necesarios para que funcione ON CONFLICT en la función procesar_movimiento_inventario

-- Índice único para inventario sin asignaciones (disponible, dañado, perdido, en_transito)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_producto_estado_sin_asignacion
ON inventario (producto_id, estado)
WHERE asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL;

-- Índice único para inventario con asignaciones (en_uso con conductor o vehículo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_producto_estado_con_asignacion
ON inventario (producto_id, estado, asignado_a_conductor_id, asignado_a_vehiculo_id)
WHERE asignado_a_conductor_id IS NOT NULL OR asignado_a_vehiculo_id IS NOT NULL;
