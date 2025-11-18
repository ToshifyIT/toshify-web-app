-- Renombrar columna numero_asignacion a codigo en tabla asignaciones
ALTER TABLE asignaciones
RENAME COLUMN numero_asignacion TO codigo;

-- Agregar comentario para documentar
COMMENT ON COLUMN asignaciones.codigo IS 'Código único de asignación de 6 dígitos (formato: ASG-XXXXXX)';
