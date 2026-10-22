-- =====================================================
-- sql/homologar_turno_leads.sql
-- Homologa el turno "Indiferente" (y variantes) a "Sin Pref." en leads.
--
-- Además, desde el deploy del 2026-10-22, el módulo Leads normaliza solo estos
-- valores a "Sin Pref." al cargar (sincronización de leads). Este script lo
-- hace ya, sin esperar a que alguien abra el módulo, y deja respaldo.
-- Mismo criterio que el código: indiferente / any / ambos / cualquier / sin pref.
-- =====================================================

-- PASO 1 · Diagnóstico (solo lectura): valores de turno y cuántos leads tienen cada uno
SELECT turno, COUNT(*) AS leads
FROM leads
GROUP BY turno
ORDER BY leads DESC;

-- PASO 2 · Vista previa (solo lectura): qué cambia
SELECT turno AS turno_actual, 'Sin Pref.' AS turno_nuevo, COUNT(*) AS leads
FROM leads
WHERE lower(btrim(turno)) ~ '(indiferente|any|ambos|cualquier|sin pref)'
  AND turno IS DISTINCT FROM 'Sin Pref.'
GROUP BY turno
ORDER BY leads DESC;

-- PASO 3 · Respaldo + actualización (MODIFICA DATOS), todo o nada
BEGIN;

CREATE TABLE IF NOT EXISTS leads_turno_respaldo_20261022 (
  id uuid,
  turno text,
  respaldado_en timestamptz
);

INSERT INTO leads_turno_respaldo_20261022 (id, turno, respaldado_en)
SELECT id, turno, now()
FROM leads
WHERE lower(btrim(turno)) ~ '(indiferente|any|ambos|cualquier|sin pref)'
  AND turno IS DISTINCT FROM 'Sin Pref.';

UPDATE leads
SET turno = 'Sin Pref.'
WHERE lower(btrim(turno)) ~ '(indiferente|any|ambos|cualquier|sin pref)'
  AND turno IS DISTINCT FROM 'Sin Pref.';

COMMIT;

-- PASO 4 · Verificación: debería quedar solo "Sin Pref." (además de Diurno / Nocturno)
SELECT turno, COUNT(*) AS leads FROM leads GROUP BY turno ORDER BY leads DESC;

-- REVERSIÓN (solo si hace falta): vuelve al valor más antiguo respaldado
-- UPDATE leads l SET turno = r.turno
-- FROM (SELECT DISTINCT ON (id) id, turno FROM leads_turno_respaldo_20261022 ORDER BY id, respaldado_en) r
-- WHERE l.id = r.id;
