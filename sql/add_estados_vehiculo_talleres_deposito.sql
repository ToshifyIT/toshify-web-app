-- Alta de nuevos estados de vehiculo en el catalogo vehiculos_estados
-- Talleres mecanicos: MJ, Autodoc
-- Talleres de chapa y pintura: Paint Cars, Andrada
-- Deposito: RDA
--
-- IMPORTANTE: vehiculos_estados.codigo es varchar(20). Todo codigo nuevo debe
-- respetar ese limite (TALLER_CP_PAINT_CARS usa exactamente 20 caracteres).
--
-- Idempotente: si el codigo ya existe solo actualiza la descripcion y lo reactiva.
-- Requiere que vehiculos_estados.codigo tenga indice/constraint UNIQUE.
-- Si no lo tuviera, ejecutar antes:
--   CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_estados_codigo_key ON vehiculos_estados (codigo);

INSERT INTO vehiculos_estados (codigo, descripcion, activo)
VALUES
  ('TALLER_MJ',            'Taller Mecánico - MJ',              true),
  ('TALLER_AUTODOC',       'Taller Mecánico - Autodoc',         true),
  ('TALLER_CP_PAINT_CARS', 'Taller Chapa&Pintura - Paint Cars', true),
  ('TALLER_CP_ANDRADA',    'Taller Chapa&Pintura - Andrada',    true),
  ('DEPOSITO_RDA',         'Depósito RDA',                      true)
ON CONFLICT (codigo) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      activo      = true;

-- Verificacion
SELECT codigo, descripcion, activo
FROM vehiculos_estados
WHERE codigo IN (
  'TALLER_MJ',
  'TALLER_AUTODOC',
  'TALLER_CP_PAINT_CARS',
  'TALLER_CP_ANDRADA',
  'DEPOSITO_RDA'
)
ORDER BY codigo;
