-- =====================================================
-- Teléfono secundario (opcional) en leads y conductores
-- =====================================================
-- Muchos conductores usan un número para Cabify y otro para DiDi u otra app.
--   · phone / telefono_contacto  = número principal (por donde nos escriben)
--   · telefono_secundario        = otro número que usa (opcional)
-- Al convertir un lead en conductor, el secundario pasa al conductor.
-- Se puede ejecutar más de una vez.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefono_secundario text;
ALTER TABLE conductores ADD COLUMN IF NOT EXISTS telefono_secundario text;

COMMENT ON COLUMN leads.telefono_secundario IS 'Número secundario (ej. el que usa en DiDi u otra app). Opcional.';
COMMENT ON COLUMN conductores.telefono_secundario IS 'Número secundario (ej. el que usa en DiDi u otra app). Opcional.';

-- Comprobar
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name = 'telefono_secundario' AND table_name IN ('leads', 'conductores');
