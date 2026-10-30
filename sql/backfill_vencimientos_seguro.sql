-- Crea en Registro de Vencimientos un registro "Seguro" por cada vehículo que ya
-- tiene vencimiento de seguro cargado en Vehículos y todavía no tiene ese registro.
-- Excluye autos eliminados y patentes de prueba (PRUEBA…, PRB…). Se puede correr
-- más de una vez: no duplica.

-- 1) Vista previa: qué se va a crear
SELECT upper(btrim(v.patente)) AS patente, v.titular, v.vencimiento_seguro::date AS fecha_vencimiento
FROM vehiculos v
WHERE v.vencimiento_seguro IS NOT NULL
  AND v.deleted_at IS NULL
  AND coalesce(v.patente, '') <> ''
  AND regexp_replace(v.patente, '\s+', '', 'g') !~* '^(PRUEBA|PRB)'
  AND NOT EXISTS (
    SELECT 1 FROM vencimientos ve
    WHERE upper(btrim(ve.patente)) = upper(btrim(v.patente))
      AND ve.documento = 'Seguro'
  )
ORDER BY 3;

-- 2) Crear los registros
INSERT INTO vencimientos (patente, titular, documento, fecha_vencimiento, solicitado, usuario_creacion)
SELECT upper(btrim(v.patente)), coalesce(v.titular, ''), 'Seguro', v.vencimiento_seguro::date, false, 'Sistema (carga inicial seguros)'
FROM vehiculos v
WHERE v.vencimiento_seguro IS NOT NULL
  AND v.deleted_at IS NULL
  AND coalesce(v.patente, '') <> ''
  AND regexp_replace(v.patente, '\s+', '', 'g') !~* '^(PRUEBA|PRB)'
  AND NOT EXISTS (
    SELECT 1 FROM vencimientos ve
    WHERE upper(btrim(ve.patente)) = upper(btrim(v.patente))
      AND ve.documento = 'Seguro'
  );
