-- Agregar columna 'cobertura' a la tabla vehiculos
-- Campo de texto para almacenar el tipo de cobertura del seguro

ALTER TABLE vehiculos
ADD COLUMN IF NOT EXISTS cobertura TEXT DEFAULT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN vehiculos.cobertura IS 'Tipo de cobertura del seguro del vehículo';
