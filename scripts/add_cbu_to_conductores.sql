-- Script para agregar columna CBU y monotributo a la tabla conductores
-- El CBU es un campo de texto de 22 caracteres
-- monotributo es un campo booleano

ALTER TABLE conductores
ADD COLUMN IF NOT EXISTS cbu VARCHAR(22),
ADD COLUMN IF NOT EXISTS monotributo BOOLEAN DEFAULT false;

COMMENT ON COLUMN conductores.cbu IS 'CBU (Clave Bancaria Uniforme) del conductor - 22 dígitos';
COMMENT ON COLUMN conductores.monotributo IS 'Indica si el conductor está en régimen de monotributo';
