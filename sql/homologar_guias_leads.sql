-- =====================================================
-- Homologación de guías de leads (leads.entrevistador_asignado)
-- Fecha: 2026-10-22
--
-- Regla acordada:
--   Ali, Camila, Sara         -> Ali Verenzuela
--   Carla, Carla Noguera      -> Carla Noguera
--   Eunice                    -> Eunice D'Urso
--   Manuel, Marina            -> sin cambios
--
-- La comparación ignora mayúsculas y espacios sobrantes ("carla ", "CARLA").
-- Ejecutar los pasos EN ORDEN en el editor SQL de Supabase. Los pasos 1, 2 y 4
-- son solo lectura. El paso 3 modifica datos y deja un respaldo para revertir.
-- =====================================================


-- -----------------------------------------------------
-- PASO 1 · Diagnóstico (solo lectura)
-- Todos los valores de guía que existen hoy, con su cantidad de leads.
-- Revisar si aparece alguna variante no contemplada (p. ej. "Eunice Durso").
-- -----------------------------------------------------
SELECT
  entrevistador_asignado AS guia_actual,
  COUNT(*)               AS leads
FROM leads
WHERE NULLIF(btrim(entrevistador_asignado), '') IS NOT NULL
GROUP BY entrevistador_asignado
ORDER BY lower(btrim(entrevistador_asignado));


-- -----------------------------------------------------
-- PASO 2 · Vista previa (solo lectura)
-- Qué valores van a cambiar, a qué valor y cuántos leads afecta cada uno.
-- -----------------------------------------------------
WITH mapa(origen, destino) AS (
  VALUES
    ('ali',             'Ali Verenzuela'),
    ('camila',          'Ali Verenzuela'),
    ('sara',            'Ali Verenzuela'),
    ('ali verenzuela',  'Ali Verenzuela'),
    ('carla',           'Carla Noguera'),
    ('carla noguera',   'Carla Noguera'),
    ('eunice',          'Eunice D''Urso'),
    ('eunice d''urso',  'Eunice D''Urso')
)
SELECT
  l.entrevistador_asignado AS guia_actual,
  m.destino                AS guia_nuevo,
  COUNT(*)                 AS leads
FROM leads l
JOIN mapa m
  ON regexp_replace(lower(btrim(l.entrevistador_asignado)), '\s+', ' ', 'g') = m.origen
WHERE l.entrevistador_asignado IS DISTINCT FROM m.destino
GROUP BY l.entrevistador_asignado, m.destino
ORDER BY m.destino, l.entrevistador_asignado;


-- -----------------------------------------------------
-- PASO 3 · Respaldo + actualización (MODIFICA DATOS)
-- Todo en una transacción: si algo falla, no se aplica nada.
-- El respaldo guarda id y valor original de cada lead que cambia.
-- -----------------------------------------------------
BEGIN;

CREATE TABLE leads_guia_respaldo_20261022 AS
WITH mapa(origen, destino) AS (
  VALUES
    ('ali',             'Ali Verenzuela'),
    ('camila',          'Ali Verenzuela'),
    ('sara',            'Ali Verenzuela'),
    ('ali verenzuela',  'Ali Verenzuela'),
    ('carla',           'Carla Noguera'),
    ('carla noguera',   'Carla Noguera'),
    ('eunice',          'Eunice D''Urso'),
    ('eunice d''urso',  'Eunice D''Urso')
)
SELECT
  l.id,
  l.entrevistador_asignado AS guia_original,
  m.destino                AS guia_nuevo,
  now()                    AS respaldado_en
FROM leads l
JOIN mapa m
  ON regexp_replace(lower(btrim(l.entrevistador_asignado)), '\s+', ' ', 'g') = m.origen
WHERE l.entrevistador_asignado IS DISTINCT FROM m.destino;

UPDATE leads l
SET entrevistador_asignado = r.guia_nuevo
FROM leads_guia_respaldo_20261022 r
WHERE l.id = r.id;

-- Debe coincidir con el total de la vista previa (paso 2).
SELECT COUNT(*) AS leads_actualizados FROM leads_guia_respaldo_20261022;

COMMIT;


-- -----------------------------------------------------
-- PASO 4 · Verificación (solo lectura)
-- Deben quedar solo: Ali Verenzuela, Carla Noguera, Eunice D'Urso, Manuel,
-- Marina (y cualquier otro guía que no estaba en la regla).
-- -----------------------------------------------------
SELECT
  entrevistador_asignado AS guia,
  COUNT(*)               AS leads
FROM leads
WHERE NULLIF(btrim(entrevistador_asignado), '') IS NOT NULL
GROUP BY entrevistador_asignado
ORDER BY entrevistador_asignado;


-- -----------------------------------------------------
-- REVERSIÓN (solo si hace falta deshacer el paso 3)
-- -----------------------------------------------------
-- UPDATE leads l
-- SET entrevistador_asignado = r.guia_original
-- FROM leads_guia_respaldo_20261022 r
-- WHERE l.id = r.id;
--
-- Cuando ya no se necesite el respaldo:
-- DROP TABLE leads_guia_respaldo_20261022;
