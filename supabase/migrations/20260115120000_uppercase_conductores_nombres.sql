-- =====================================================
-- CONVERTIR NOMBRES Y APELLIDOS DE CONDUCTORES A MAYUSCULAS
-- Fecha: 2026-01-15
-- =====================================================

-- Actualizar todos los conductores existentes
UPDATE conductores
SET 
  nombres = UPPER(nombres),
  apellidos = UPPER(apellidos)
WHERE nombres IS NOT NULL OR apellidos IS NOT NULL;

-- Crear función trigger para convertir a mayúsculas automáticamente
CREATE OR REPLACE FUNCTION uppercase_conductor_nombres()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nombres = UPPER(NEW.nombres);
  NEW.apellidos = UPPER(NEW.apellidos);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para INSERT y UPDATE
DROP TRIGGER IF EXISTS trigger_uppercase_conductor_nombres ON conductores;
CREATE TRIGGER trigger_uppercase_conductor_nombres
  BEFORE INSERT OR UPDATE ON conductores
  FOR EACH ROW
  EXECUTE FUNCTION uppercase_conductor_nombres();

-- Comentario
COMMENT ON FUNCTION uppercase_conductor_nombres() IS 'Convierte nombres y apellidos de conductores a mayúsculas automáticamente';
