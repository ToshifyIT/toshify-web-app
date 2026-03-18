-- Agregar columnas de devolución de vehículo a programaciones_onboarding
ALTER TABLE programaciones_onboarding
  ADD COLUMN IF NOT EXISTS devolucion_vehiculo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_dia_cobro text;

-- Comentarios descriptivos
COMMENT ON COLUMN programaciones_onboarding.devolucion_vehiculo IS 'Indica si la programación es una devolución de vehículo';
COMMENT ON COLUMN programaciones_onboarding.ultimo_dia_cobro IS 'Último día de cobro: dia_entrega o fecha_baja. Solo aplica cuando es devolución de vehículo';
