-- Permitir conductor_id NULL en facturacion_conductores
-- Esto es necesario para importar histórico de conductores que ya no existen en la BD

ALTER TABLE facturacion_conductores
  ALTER COLUMN conductor_id DROP NOT NULL;

-- Verificar el cambio
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'facturacion_conductores'
  AND column_name = 'conductor_id';
