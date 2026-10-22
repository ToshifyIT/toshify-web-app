-- =====================================================
-- Cuentas Cabify y DiDi: columnas nuevas y conversión de estados
-- Fecha: 2026-10-22
--
-- Cabify y DiDi son dos cuentas independientes de la persona, cada una con
-- tres estados:
--   leads.cuenta_cabify / leads.cuenta_didi            -> 'Crear cuenta' | 'Pendiente' | 'Confirmada'
--   programaciones_onboarding.estado_<app>_<turno>     -> 'crear_cuenta' | 'pendiente' | 'confirmada'
-- (en Programación, si el turno lo ocupa un lead se usa el dato del lead;
--  la columna de la programación sólo se usa cuando el turno es un conductor)
--
-- Ejecutar EN ORDEN en el editor SQL de Supabase.
--   PASO 1 y 3 y 5: solo lectura.
--   PASO 2: agrega columnas (no modifica datos). Correrlo ANTES de publicar el
--           código nuevo: el formulario de Leads ya guarda cuenta_didi.
--   PASO 4: convierte los datos, con respaldo para revertir.
-- =====================================================


-- -----------------------------------------------------
-- PASO 1 · Diagnóstico (solo lectura)
-- -----------------------------------------------------

-- 1a. Tipo de las columnas de estado Cabify de la programación. Si data_type
--     NO es 'text' / 'character varying' (por ejemplo 'USER-DEFINED' = enum),
--     NO seguir: avisar antes de correr el paso 4.
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'programaciones_onboarding'
  AND column_name IN ('estado_cabify', 'estado_cabify_diurno', 'estado_cabify_nocturno');

-- 1b. Restricciones CHECK sobre esas columnas. Si aparece alguna que liste los
--     valores viejos, NO seguir: avisar antes de correr el paso 4.
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'programaciones_onboarding'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%cabify%';

-- 1c. Valores actuales de Cta. Cabify en Leads.
SELECT cuenta_cabify, COUNT(*) AS leads
FROM leads
WHERE NULLIF(btrim(cuenta_cabify), '') IS NOT NULL
GROUP BY cuenta_cabify
ORDER BY COUNT(*) DESC;

-- 1d. Valores actuales de estado Cabify en Programación.
SELECT 'diurno' AS turno, estado_cabify_diurno AS estado, COUNT(*) AS programaciones
FROM programaciones_onboarding GROUP BY estado_cabify_diurno
UNION ALL
SELECT 'nocturno', estado_cabify_nocturno, COUNT(*)
FROM programaciones_onboarding GROUP BY estado_cabify_nocturno
ORDER BY 1, 3 DESC;


-- -----------------------------------------------------
-- PASO 2 · Columnas nuevas (no modifica datos existentes)
-- -----------------------------------------------------
BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cuenta_didi TEXT;

COMMENT ON COLUMN leads.cuenta_didi
  IS 'Estado de la cuenta DiDi: Crear cuenta | Pendiente | Confirmada. Independiente de cuenta_cabify.';

ALTER TABLE programaciones_onboarding
  ADD COLUMN IF NOT EXISTS estado_didi_diurno   TEXT,
  ADD COLUMN IF NOT EXISTS estado_didi_nocturno TEXT;

COMMENT ON COLUMN programaciones_onboarding.estado_didi_diurno
  IS 'Cuenta DiDi del conductor del turno diurno (o A cargo): crear_cuenta | pendiente | confirmada. Si el turno es un lead se usa leads.cuenta_didi.';
COMMENT ON COLUMN programaciones_onboarding.estado_didi_nocturno
  IS 'Cuenta DiDi del conductor del turno nocturno: crear_cuenta | pendiente | confirmada. Si el turno es un lead se usa leads.cuenta_didi.';

COMMIT;


-- -----------------------------------------------------
-- PASO 3 · Vista previa de la conversión (solo lectura)
-- -----------------------------------------------------

-- 3a. Leads
WITH mapa(origen, cabify_nuevo, didi_nuevo) AS (
  VALUES
    ('no tiene',              'Crear cuenta', NULL),
    ('crear cuenta',          'Crear cuenta', NULL),
    ('en proceso',            'Pendiente',    NULL),
    ('en revision',           'Pendiente',    NULL),
    ('verificar activa',      'Pendiente',    NULL),
    ('pendiente',             'Pendiente',    NULL),
    ('activa',                'Confirmada',   NULL),
    ('confirmada',            'Confirmada',   NULL),
    ('cuenta de didi activa', NULL,           'Confirmada')
)
SELECT
  l.cuenta_cabify       AS cabify_actual,
  m.cabify_nuevo,
  m.didi_nuevo,
  COUNT(*)              AS leads
FROM leads l
JOIN mapa m
  ON translate(lower(btrim(l.cuenta_cabify)), 'áéíóú', 'aeiou') = m.origen
WHERE l.cuenta_cabify IS DISTINCT FROM m.cabify_nuevo
   OR (m.didi_nuevo IS NOT NULL AND l.cuenta_didi IS NULL)
GROUP BY l.cuenta_cabify, m.cabify_nuevo, m.didi_nuevo
ORDER BY leads DESC;

-- 3b. Programación (por turno)
SELECT 'diurno' AS turno, estado_cabify_diurno AS actual, COUNT(*) AS programaciones
FROM programaciones_onboarding
WHERE estado_cabify_diurno IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi')
GROUP BY estado_cabify_diurno
UNION ALL
SELECT 'nocturno', estado_cabify_nocturno, COUNT(*)
FROM programaciones_onboarding
WHERE estado_cabify_nocturno IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi')
GROUP BY estado_cabify_nocturno;
--   listo_cabify      -> Cabify 'confirmada'
--   asignar_auto      -> Cabify 'pendiente' (para revisar a mano)
--   confirmacion_didi -> Cabify sin dato, DiDi 'confirmada'


-- -----------------------------------------------------
-- PASO 4 · Conversión (MODIFICA DATOS) — todo o nada, con respaldo
-- -----------------------------------------------------
BEGIN;

-- Respaldo de Leads
CREATE TABLE leads_cuentas_respaldo_20261022 AS
SELECT id, cuenta_cabify, cuenta_didi, now() AS respaldado_en
FROM leads
WHERE NULLIF(btrim(cuenta_cabify), '') IS NOT NULL;

-- Respaldo de Programación
CREATE TABLE prog_cuentas_respaldo_20261022 AS
SELECT id, estado_cabify_diurno, estado_cabify_nocturno,
       estado_didi_diurno, estado_didi_nocturno, now() AS respaldado_en
FROM programaciones_onboarding
WHERE estado_cabify_diurno   IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi')
   OR estado_cabify_nocturno IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi');

-- Leads: "Cuenta de DIDI activa" es la cuenta DiDi; Cabify queda sin dato.
UPDATE leads
SET cuenta_didi   = COALESCE(cuenta_didi, 'Confirmada'),
    cuenta_cabify = NULL
WHERE translate(lower(btrim(cuenta_cabify)), 'áéíóú', 'aeiou') = 'cuenta de didi activa';

-- Leads: estados de Cabify
UPDATE leads
SET cuenta_cabify = CASE translate(lower(btrim(cuenta_cabify)), 'áéíóú', 'aeiou')
    WHEN 'no tiene'         THEN 'Crear cuenta'
    WHEN 'crear cuenta'     THEN 'Crear cuenta'
    WHEN 'en proceso'       THEN 'Pendiente'
    WHEN 'en revision'      THEN 'Pendiente'
    WHEN 'verificar activa' THEN 'Pendiente'
    WHEN 'pendiente'        THEN 'Pendiente'
    WHEN 'activa'           THEN 'Confirmada'
    WHEN 'confirmada'       THEN 'Confirmada'
  END
WHERE translate(lower(btrim(cuenta_cabify)), 'áéíóú', 'aeiou') IN
  ('no tiene', 'crear cuenta', 'en proceso', 'en revision', 'verificar activa',
   'pendiente', 'activa', 'confirmada');

-- Programación: DiDi primero (antes de vaciar el valor de Cabify)
UPDATE programaciones_onboarding
SET estado_didi_diurno   = CASE WHEN estado_cabify_diurno   = 'confirmacion_didi' THEN COALESCE(estado_didi_diurno, 'confirmada')   ELSE estado_didi_diurno END,
    estado_didi_nocturno = CASE WHEN estado_cabify_nocturno = 'confirmacion_didi' THEN COALESCE(estado_didi_nocturno, 'confirmada') ELSE estado_didi_nocturno END
WHERE estado_cabify_diurno = 'confirmacion_didi' OR estado_cabify_nocturno = 'confirmacion_didi';

UPDATE programaciones_onboarding
SET estado_cabify_diurno = CASE estado_cabify_diurno
      WHEN 'listo_cabify'      THEN 'confirmada'
      WHEN 'asignar_auto'      THEN 'pendiente'
      WHEN 'confirmacion_didi' THEN NULL
      ELSE estado_cabify_diurno
    END,
    estado_cabify_nocturno = CASE estado_cabify_nocturno
      WHEN 'listo_cabify'      THEN 'confirmada'
      WHEN 'asignar_auto'      THEN 'pendiente'
      WHEN 'confirmacion_didi' THEN NULL
      ELSE estado_cabify_nocturno
    END
WHERE estado_cabify_diurno   IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi')
   OR estado_cabify_nocturno IN ('listo_cabify', 'asignar_auto', 'confirmacion_didi');

COMMIT;


-- -----------------------------------------------------
-- PASO 5 · Verificación (solo lectura)
-- Deben quedar solo: Crear cuenta / Pendiente / Confirmada (Leads) y
-- crear_cuenta / pendiente / confirmada (Programación), más los vacíos.
-- Cualquier otro valor no estaba en la regla y no se tocó.
-- -----------------------------------------------------
SELECT 'leads.cuenta_cabify' AS campo, cuenta_cabify AS valor, COUNT(*) FROM leads GROUP BY cuenta_cabify
UNION ALL
SELECT 'leads.cuenta_didi', cuenta_didi, COUNT(*) FROM leads GROUP BY cuenta_didi
UNION ALL
SELECT 'prog.estado_cabify_diurno', estado_cabify_diurno, COUNT(*) FROM programaciones_onboarding GROUP BY estado_cabify_diurno
UNION ALL
SELECT 'prog.estado_cabify_nocturno', estado_cabify_nocturno, COUNT(*) FROM programaciones_onboarding GROUP BY estado_cabify_nocturno
UNION ALL
SELECT 'prog.estado_didi_diurno', estado_didi_diurno, COUNT(*) FROM programaciones_onboarding GROUP BY estado_didi_diurno
UNION ALL
SELECT 'prog.estado_didi_nocturno', estado_didi_nocturno, COUNT(*) FROM programaciones_onboarding GROUP BY estado_didi_nocturno
ORDER BY 1, 3 DESC;


-- -----------------------------------------------------
-- REVERSIÓN del paso 4 (solo si hace falta)
-- -----------------------------------------------------
-- UPDATE leads l
--   SET cuenta_cabify = r.cuenta_cabify, cuenta_didi = r.cuenta_didi
--   FROM leads_cuentas_respaldo_20261022 r WHERE l.id = r.id;
-- UPDATE programaciones_onboarding p
--   SET estado_cabify_diurno = r.estado_cabify_diurno, estado_cabify_nocturno = r.estado_cabify_nocturno,
--       estado_didi_diurno = r.estado_didi_diurno, estado_didi_nocturno = r.estado_didi_nocturno
--   FROM prog_cuentas_respaldo_20261022 r WHERE p.id = r.id;
--
-- Cuando ya no se necesiten los respaldos:
-- DROP TABLE leads_cuentas_respaldo_20261022;
-- DROP TABLE prog_cuentas_respaldo_20261022;
