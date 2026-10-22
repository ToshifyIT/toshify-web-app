-- =====================================================
-- sql/recontacto_sellium_leads.sql
-- Leads que ya existían con otra fuente (Intercom, Web…) y volvieron a entrar por
-- la carga masiva de Sellium ANTES del cambio del 2026-10-22: la carga les movió la
-- fecha de creación pero les dejó la fuente vieja.
--
-- Desde el deploy del 2026-10-22 la carga masiva lo hace sola (fuente SELLIUM,
-- estado de Sellium y marca "Recontacto Sellium" en Observaciones). Orden sugerido:
--   1. Publicar el cambio.
--   2. Volver a subir el reporte de Sellium que cubra desde el 01/10: esos leads se
--      corrigen completos, incluido el estado.
--   3. Correr este script para los que no hayan entrado en ese reporte. Este script
--      NO cambia el estado (no se sabe cuál traía Sellium): solo fuente y marca.
--
-- Cómo se reconocen: fecha_carga desde el 29/09/2026 (inicio de las cargas de
-- Sellium), created_at justo a medianoche de Argentina (la fecha del Excel, sin
-- hora) y fuente distinta de SELLIUM. No se tocan los leads ya convertidos.
-- =====================================================

-- PASO 1 · Vista previa (solo lectura): cuántos por fuente actual
SELECT fuente_de_lead, COUNT(*) AS leads
FROM leads
WHERE fecha_carga >= '2026-09-29'
  AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::time = '00:00'
  AND btrim(COALESCE(fuente_de_lead, '')) <> ''
  AND lower(btrim(fuente_de_lead)) NOT IN ('sellium', 'fuente_sellium')
  AND COALESCE(estado_de_lead, '') <> 'Conductor'
  AND lower(COALESCE(proceso, '')) NOT IN ('convertido', 'conductor')
GROUP BY fuente_de_lead
ORDER BY leads DESC;

-- PASO 2 · Respaldo + actualización (MODIFICA DATOS), todo o nada
BEGIN;

CREATE TABLE IF NOT EXISTS leads_recontacto_respaldo_20261022 (
  id uuid,
  fuente_de_lead text,
  observaciones text,
  respaldado_en timestamptz
);

CREATE TEMP TABLE recontactos ON COMMIT DROP AS
SELECT id, fuente_de_lead, observaciones, fecha_carga
FROM leads
WHERE fecha_carga >= '2026-09-29'
  AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::time = '00:00'
  AND btrim(COALESCE(fuente_de_lead, '')) <> ''
  AND lower(btrim(fuente_de_lead)) NOT IN ('sellium', 'fuente_sellium')
  AND COALESCE(estado_de_lead, '') <> 'Conductor'
  AND lower(COALESCE(proceso, '')) NOT IN ('convertido', 'conductor');

INSERT INTO leads_recontacto_respaldo_20261022 (id, fuente_de_lead, observaciones, respaldado_en)
SELECT id, fuente_de_lead, observaciones, now() FROM recontactos;

UPDATE leads l
SET fuente_de_lead = 'SELLIUM',
    observaciones = concat_ws(E'\n',
      NULLIF(btrim(r.observaciones), ''),
      'Recontacto Sellium (' || to_char(r.fecha_carga, 'DD/MM/YYYY') || '): volvió a contactarse. Fuente anterior: ' || r.fuente_de_lead || '.')
FROM recontactos r
WHERE l.id = r.id;

COMMIT;

-- PASO 3 · Verificación: no deberían quedar (0 filas)
SELECT fuente_de_lead, COUNT(*) AS leads
FROM leads
WHERE fecha_carga >= '2026-09-29'
  AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::time = '00:00'
  AND lower(btrim(COALESCE(fuente_de_lead, ''))) NOT IN ('', 'sellium', 'fuente_sellium')
  AND COALESCE(estado_de_lead, '') <> 'Conductor'
  AND lower(COALESCE(proceso, '')) NOT IN ('convertido', 'conductor')
GROUP BY fuente_de_lead;

-- REVERSIÓN (solo si hace falta): vuelve a la fuente y observaciones respaldadas
-- UPDATE leads l SET fuente_de_lead = r.fuente_de_lead, observaciones = r.observaciones
-- FROM (SELECT DISTINCT ON (id) id, fuente_de_lead, observaciones
--       FROM leads_recontacto_respaldo_20261022 ORDER BY id, respaldado_en) r
-- WHERE l.id = r.id;
