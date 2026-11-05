-- Monotributo = Sí para los conductores facturados en la S45/2026 (sede BSAS) que
-- tienen CUIT y DNI cargados y figuran sin monotributo (incluye los que ya están
-- de baja pero tienen días en la semana). 2026-11-05.
-- Complementa sql/monotributo_si_activos_con_cuit.sql (que solo tomó ACTIVOS).
-- No toca CUIT/DNI. Respaldo en backup_conductores_monotributo_s45_20261105.

BEGIN;

CREATE TABLE backup_conductores_monotributo_s45_20261105 AS
SELECT c.id, c.numero_dni, c.numero_cuit, c.monotributo, c.updated_at
FROM conductores c
WHERE c.id IN (
    SELECT fc.conductor_id
    FROM facturacion_conductores fc
    JOIN periodos_facturacion pf ON pf.id = fc.periodo_id
    WHERE pf.semana = 45 AND pf.anio = 2026
      AND pf.sede_id = '80587298-b799-4a98-87a9-2f74890da443'
  )
  AND COALESCE(c.monotributo, false) = false
  AND NULLIF(btrim(c.numero_cuit), '') IS NOT NULL
  AND NULLIF(btrim(c.numero_dni), '') IS NOT NULL;

UPDATE conductores c
SET monotributo = true,
    updated_at = now()
FROM backup_conductores_monotributo_s45_20261105 b
WHERE c.id = b.id;

-- Control: actualizados (DNI, CUIT y dígitos del CUIT; sin 11 dígitos sigue en factura B)
SELECT numero_dni, numero_cuit, length(regexp_replace(numero_cuit, '\D', '', 'g')) AS digitos
FROM backup_conductores_monotributo_s45_20261105
ORDER BY numero_dni;

-- Facturados en S45 que quedan sin monotributo (sin CUIT o sin DNI)
SELECT c.numero_dni, c.numero_cuit
FROM facturacion_conductores fc
JOIN periodos_facturacion pf ON pf.id = fc.periodo_id
JOIN conductores c ON c.id = fc.conductor_id
WHERE pf.semana = 45 AND pf.anio = 2026
  AND pf.sede_id = '80587298-b799-4a98-87a9-2f74890da443'
  AND COALESCE(c.monotributo, false) = false;

COMMIT;

-- Reversión (si hiciera falta):
-- UPDATE conductores c SET monotributo = b.monotributo, updated_at = b.updated_at
-- FROM backup_conductores_monotributo_s45_20261105 b WHERE c.id = b.id;
