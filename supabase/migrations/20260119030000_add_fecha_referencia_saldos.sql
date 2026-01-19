-- Agregar columna fecha_referencia a saldos_conductores
ALTER TABLE saldos_conductores 
ADD COLUMN IF NOT EXISTS fecha_referencia DATE;

-- Comentario
COMMENT ON COLUMN saldos_conductores.fecha_referencia IS 'Fecha desde la cual se considera este saldo para cálculo de mora';
