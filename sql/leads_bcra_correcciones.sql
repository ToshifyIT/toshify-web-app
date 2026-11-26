-- Datos del lead desde la consulta al BCRA (2026-11-25). Ver server-bcra.js.
--
-- 1) CUIT vacío: se completa con el CUIL que ya validó el BCRA (mismo número).
--    Se puede correr ya.
UPDATE leads
SET cuit = bcra_cuil
WHERE coalesce(trim(cuit), '') = ''
  AND bcra_cuil IS NOT NULL
  AND bcra_error IS NULL
  AND bcra_consultado_at IS NOT NULL;

-- 2) Volver a consultar los que quedaron "Sin validar", para que la consulta nueva
--    corrija el nombre mal cargado (el apellido del BCRA está en el nombre o el mail)
--    y pruebe con el DNI cuando el CUIT es inválido.
--    Correr DESPUÉS de que server-bcra.js nuevo esté en producción: si no, el
--    servidor viejo los vuelve a dejar igual. La vuelta automática los toma de a 15
--    cada 5 minutos.
UPDATE leads
SET bcra_consultado_at = NULL,
    bcra_intentos = 0
WHERE bcra_error IS NOT NULL;

-- Control
SELECT
  count(*) FILTER (WHERE coalesce(trim(cuit), '') = '' AND bcra_cuil IS NOT NULL AND bcra_error IS NULL) AS cuit_sin_completar,
  count(*) FILTER (WHERE bcra_error IS NOT NULL) AS sin_validar,
  count(*) FILTER (WHERE bcra_consultado_at IS NULL AND (cuit IS NOT NULL OR dni IS NOT NULL)) AS pendientes
FROM leads;
