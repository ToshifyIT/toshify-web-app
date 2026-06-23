-- Agrega columnas de auditoría de edición a la tabla titulares
ALTER TABLE titulares
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_name text;
