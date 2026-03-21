-- Agregar columna de cambio de vehículo a programaciones_onboarding
ALTER TABLE programaciones_onboarding
  ADD COLUMN IF NOT EXISTS cambio_vehiculo boolean DEFAULT false;

-- Comentario descriptivo
COMMENT ON COLUMN programaciones_onboarding.cambio_vehiculo IS 'Indica si la programación es un cambio de vehículo (el conductor pasa de un vehículo a otro)';
