-- =====================================================
-- Conductores: un solo registro por DNI (2026-11-17)
-- =====================================================
-- Candado en la base: aunque una pantalla falle (doble clic, dos pestañas, una
-- importación), Postgres rechaza un segundo conductor con el mismo DNI.
-- Compara solo los dígitos (ignora puntos, espacios y guiones).
--
-- Correr DESPUÉS de unificar los duplicados que quedan (Achaval 32841857 y
-- Fea 31445696); si todavía hay repetidos, el CREATE INDEX falla y no cambia nada.

-- Para revisar antes si quedan repetidos:
-- SELECT regexp_replace(numero_dni, '\D', '', 'g') AS dni, count(*), array_agg(nombres || ' ' || apellidos)
-- FROM conductores
-- WHERE regexp_replace(coalesce(numero_dni, ''), '\D', '', 'g') <> ''
-- GROUP BY 1 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS conductores_dni_unico
  ON conductores ((regexp_replace(numero_dni, '\D', '', 'g')))
  WHERE regexp_replace(coalesce(numero_dni, ''), '\D', '', 'g') <> '';
