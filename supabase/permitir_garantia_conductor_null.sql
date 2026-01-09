-- Permitir conductor_id NULL en garantias_conductores
-- Esto es necesario para importar histórico de conductores que ya no existen en la BD

-- Eliminar constraint de FK existente
ALTER TABLE garantias_conductores
  DROP CONSTRAINT IF EXISTS garantias_conductores_conductor_id_fkey;

-- Permitir NULL
ALTER TABLE garantias_conductores
  ALTER COLUMN conductor_id DROP NOT NULL;

-- Eliminar constraint UNIQUE sobre conductor_id (para permitir múltiples garantías por conductor)
ALTER TABLE garantias_conductores
  DROP CONSTRAINT IF EXISTS garantias_conductores_conductor_id_key;

-- Agregar índice para búsquedas por nombre
CREATE INDEX IF NOT EXISTS idx_garantias_conductores_nombre
  ON garantias_conductores(conductor_nombre);

-- Verificar el cambio
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'garantias_conductores'
  AND column_name = 'conductor_id';
