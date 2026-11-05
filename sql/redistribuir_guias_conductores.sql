-- sql/redistribuir_guias_conductores.sql
-- Reparte entre Ali, Carla y Eunice los conductores ACTIVOS de Buenos Aires cuyo guía
-- (conductores.guia) es Manuel, Manuel Chiesa, Marina o está vacío. Pedido 2026-11-04.
--
-- Reglas, para que sea parejo:
--   1. Misma cantidad para cada guía (como mucho 1 de diferencia). Los que sobran van a
--      quienes hoy tienen MENOS conductores activos.
--   2. Calificación pareja: dentro de cada turno se ordenan por calificación (promedio
--      del puntaje de sus últimas 4 semanas en conductor_calificaciones, de mejor a peor;
--      los que no tienen calificación al final) y se reparten "en serpiente":
--      1-2-3, 3-2-1, 1-2-3... Así ninguno se lleva todos los mejores o todos los peores.
--   3. Turnos parejos: el reparto se hace turno por turno (diurno, nocturno, sin
--      preferencia), continuando la serpiente, así D y N también quedan equilibrados.
--
-- Cómo usarlo:
--   PASO 1: correr solo el SELECT de "VISTA PREVIA" y revisar.
--   PASO 2: correr el bloque BEGIN ... COMMIT para guardar.
-- No toca el guía de Seguimiento de Conductores (id_guia), solo conductores.guia.

-- ───────────── VISTA PREVIA (no cambia nada) ─────────────
WITH guias AS (
  -- Orden de elección: el que hoy tiene menos conductores activos elige primero
  SELECT g.guia, row_number() OVER (ORDER BY coalesce(t.activos, 0), g.guia) - 1 AS orden
  FROM unnest(ARRAY['Ali Verenzuela', 'Carla Noguera', 'Eunice D''Urso']) AS g(guia)
  LEFT JOIN (
    SELECT CASE lower(split_part(btrim(c.guia), ' ', 1))
             WHEN 'ali' THEN 'Ali Verenzuela' WHEN 'carla' THEN 'Carla Noguera' WHEN 'eunice' THEN 'Eunice D''Urso'
           END AS guia,
           count(*) AS activos
    FROM conductores c
    JOIN conductores_estados e ON e.id = c.estado_id AND upper(e.codigo) = 'ACTIVO'
    JOIN sedes s ON s.id = c.sede_id AND s.codigo = 'BSAS'
    GROUP BY 1
  ) t ON t.guia = g.guia
),
candidatos AS (
  SELECT c.id, c.nombres, c.apellidos, c.guia AS guia_anterior,
         CASE lower(coalesce(c.preferencia_turno, ''))
           WHEN 'diurno' THEN 1 WHEN 'nocturno' THEN 2 ELSE 3
         END AS turno_orden,
         coalesce(c.preferencia_turno, 'SIN PREF.') AS turno,
         (SELECT round(avg(x.puntaje), 4)
            FROM (SELECT cc.puntaje FROM conductor_calificaciones cc
                  WHERE cc.conductor_id = c.id
                  ORDER BY cc.semana_inicio DESC LIMIT 4) x) AS calificacion
  FROM conductores c
  JOIN conductores_estados e ON e.id = c.estado_id AND upper(e.codigo) = 'ACTIVO'
  JOIN sedes s ON s.id = c.sede_id AND s.codigo = 'BSAS'
  WHERE (c.guia IS NULL OR btrim(c.guia) = '' OR lower(split_part(btrim(c.guia), ' ', 1)) IN ('manuel', 'marina'))
    AND coalesce(c.apellidos, '') NOT ILIKE '%interno%'
),
orden AS (
  SELECT cand.*,
         row_number() OVER (
           ORDER BY turno_orden, (calificacion IS NULL), calificacion DESC, apellidos, nombres, id
         ) - 1 AS pos
  FROM candidatos cand
)
SELECT o.nombres || ' ' || o.apellidos AS conductor,
       o.turno,
       o.calificacion,
       round(1 + o.calificacion * 4, 1) AS estrellas_aprox,
       o.guia_anterior,
       g.guia AS guia_nuevo
FROM orden o
JOIN guias g ON g.orden = CASE WHEN (o.pos / 3) % 2 = 0 THEN o.pos % 3 ELSE 2 - o.pos % 3 END
ORDER BY g.guia, o.turno_orden, o.calificacion DESC NULLS LAST;

-- Resumen por guía de la vista previa: reemplazar el SELECT final de arriba por
--   SELECT g.guia, count(*) AS conductores,
--          count(*) FILTER (WHERE o.turno_orden = 1) AS diurno,
--          count(*) FILTER (WHERE o.turno_orden = 2) AS nocturno,
--          round(avg(o.calificacion), 3) AS calificacion_promedio,
--          count(*) FILTER (WHERE o.calificacion IS NULL) AS sin_calificacion
--   FROM orden o JOIN guias g ON g.orden = CASE WHEN (o.pos / 3) % 2 = 0 THEN o.pos % 3 ELSE 2 - o.pos % 3 END
--   GROUP BY g.guia ORDER BY g.guia;


-- ───────────── GUARDAR (correr después de revisar la vista previa) ─────────────
BEGIN;

WITH guias AS (
  SELECT g.guia, row_number() OVER (ORDER BY coalesce(t.activos, 0), g.guia) - 1 AS orden
  FROM unnest(ARRAY['Ali Verenzuela', 'Carla Noguera', 'Eunice D''Urso']) AS g(guia)
  LEFT JOIN (
    SELECT CASE lower(split_part(btrim(c.guia), ' ', 1))
             WHEN 'ali' THEN 'Ali Verenzuela' WHEN 'carla' THEN 'Carla Noguera' WHEN 'eunice' THEN 'Eunice D''Urso'
           END AS guia,
           count(*) AS activos
    FROM conductores c
    JOIN conductores_estados e ON e.id = c.estado_id AND upper(e.codigo) = 'ACTIVO'
    JOIN sedes s ON s.id = c.sede_id AND s.codigo = 'BSAS'
    GROUP BY 1
  ) t ON t.guia = g.guia
),
candidatos AS (
  SELECT c.id, c.nombres, c.apellidos,
         CASE lower(coalesce(c.preferencia_turno, ''))
           WHEN 'diurno' THEN 1 WHEN 'nocturno' THEN 2 ELSE 3
         END AS turno_orden,
         (SELECT avg(x.puntaje)
            FROM (SELECT cc.puntaje FROM conductor_calificaciones cc
                  WHERE cc.conductor_id = c.id
                  ORDER BY cc.semana_inicio DESC LIMIT 4) x) AS calificacion
  FROM conductores c
  JOIN conductores_estados e ON e.id = c.estado_id AND upper(e.codigo) = 'ACTIVO'
  JOIN sedes s ON s.id = c.sede_id AND s.codigo = 'BSAS'
  WHERE (c.guia IS NULL OR btrim(c.guia) = '' OR lower(split_part(btrim(c.guia), ' ', 1)) IN ('manuel', 'marina'))
    AND coalesce(c.apellidos, '') NOT ILIKE '%interno%'
),
orden AS (
  SELECT cand.id,
         row_number() OVER (
           ORDER BY turno_orden, (calificacion IS NULL), calificacion DESC, apellidos, nombres, id
         ) - 1 AS pos
  FROM candidatos cand
)
UPDATE conductores c
SET guia = g.guia
FROM orden o
JOIN guias g ON g.orden = CASE WHEN (o.pos / 3) % 2 = 0 THEN o.pos % 3 ELSE 2 - o.pos % 3 END
WHERE c.id = o.id;

COMMIT;
