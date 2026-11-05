-- Monotributo = Sí para los conductores ACTIVOS que tienen CUIT y DNI cargados
-- y hoy figuran sin monotributo (2026-11-05).
-- Motivo: Preview Facturación da factura A solo con monotributo y CUIT de 11
-- dígitos (src/modules/facturacion/utils/tipoFactura.ts); el flag no estaba cargado.
-- No toca conductores de baja ni CUIT/DNI. Respaldo en backup_conductores_monotributo_20261105.

BEGIN;

CREATE TABLE backup_conductores_monotributo_20261105 AS
SELECT c.id, c.numero_dni, c.numero_cuit, c.monotributo, c.updated_at
FROM conductores c
JOIN conductores_estados ce ON ce.id = c.estado_id
WHERE ce.codigo = 'ACTIVO'
  AND COALESCE(c.monotributo, false) = false
  AND NULLIF(btrim(c.numero_cuit), '') IS NOT NULL
  AND NULLIF(btrim(c.numero_dni), '') IS NOT NULL;

UPDATE conductores c
SET monotributo = true,
    updated_at = now()
FROM backup_conductores_monotributo_20261105 b
WHERE c.id = b.id;

-- Control: cantidad actualizada y CUIT que no tienen 11 dígitos (seguirán en factura B)
SELECT count(*) AS actualizados,
       count(*) FILTER (WHERE length(regexp_replace(numero_cuit, '\D', '', 'g')) <> 11) AS cuit_sin_11_digitos
FROM backup_conductores_monotributo_20261105;

SELECT numero_dni, numero_cuit, length(regexp_replace(numero_cuit, '\D', '', 'g')) AS digitos
FROM backup_conductores_monotributo_20261105
WHERE length(regexp_replace(numero_cuit, '\D', '', 'g')) <> 11
ORDER BY numero_dni;

COMMIT;

-- Reversión (si hiciera falta):
-- UPDATE conductores c SET monotributo = b.monotributo, updated_at = b.updated_at
-- FROM backup_conductores_monotributo_20261105 b WHERE c.id = b.id;
