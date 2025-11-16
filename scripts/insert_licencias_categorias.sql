-- Script para reemplazar/insertar las categorías de licencias
-- Primero actualiza los códigos existentes, luego inserta los nuevos

-- Actualizar categorías existentes con los nuevos códigos
UPDATE licencias_categorias SET codigo = 'A1.2', descripcion = 'Licencia categoría A1.2', updated_at = NOW() WHERE id = 'e1d6a162-be9b-486e-b756-2f787e98a05d';
UPDATE licencias_categorias SET codigo = 'A1.3', descripcion = 'Licencia categoría A1.3', updated_at = NOW() WHERE id = '9ed61fe8-7949-451c-b86d-ce884ffb9222';
UPDATE licencias_categorias SET codigo = 'A1.4', descripcion = 'Licencia categoría A1.4', updated_at = NOW() WHERE id = '83f91827-b308-4f76-99c9-97c5fe18fa41';
UPDATE licencias_categorias SET codigo = 'A3', descripcion = 'Licencia categoría A3', updated_at = NOW() WHERE id = 'b1c88aa7-bd90-46ea-8a70-7da816316a77';
UPDATE licencias_categorias SET codigo = 'B1', descripcion = 'Licencia categoría B1', updated_at = NOW() WHERE id = 'f947afb9-514f-448f-92c9-4327651c1eeb';
UPDATE licencias_categorias SET codigo = 'B2', descripcion = 'Licencia categoría B2', updated_at = NOW() WHERE id = 'bc4c90b1-f3b9-4116-96dc-a2daedbef02c';
UPDATE licencias_categorias SET codigo = 'C3', descripcion = 'Licencia categoría C3', updated_at = NOW() WHERE id = '6361ff1c-f281-4190-9e1c-237dbff97dba';
UPDATE licencias_categorias SET codigo = 'D1', descripcion = 'Licencia categoría D1', updated_at = NOW() WHERE id = '194b0e57-d478-4068-944f-e49c62b5557b';

-- Insertar las categorías que faltan (D2, D3, D4, D2.1, E1, E2)
INSERT INTO licencias_categorias (codigo, descripcion, activo, created_at, updated_at)
VALUES
  ('D2', 'Licencia categoría D2', true, NOW(), NOW()),
  ('D3', 'Licencia categoría D3', true, NOW(), NOW()),
  ('D4', 'Licencia categoría D4', true, NOW(), NOW()),
  ('D2.1', 'Licencia categoría D2.1', true, NOW(), NOW()),
  ('E1', 'Licencia categoría E1', true, NOW(), NOW()),
  ('E2', 'Licencia categoría E2', true, NOW(), NOW())
ON CONFLICT (codigo)
DO UPDATE SET
  descripcion = EXCLUDED.descripcion,
  updated_at = NOW();
