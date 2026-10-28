-- =====================================================
-- Conductores: de qué pauta / anuncio vino (copiado del lead)
-- =====================================================
-- Al convertir un lead en conductor se copian:
--   fuente_pauta   canal de la pauta: Facebook, Instagram, TikTok, Estado
--   id_fuente      link del anuncio (el "id" de la fuente)
--   lead_origen_id el lead del que salió
-- El frontend (conversionLeadAConductor.ts) ya los manda: ejecutar ESTE SQL ANTES
-- de desplegar ese cambio, si no la conversión falla por columnas inexistentes.
-- Se puede ejecutar más de una vez.

ALTER TABLE conductores ADD COLUMN IF NOT EXISTS fuente_pauta text;
ALTER TABLE conductores ADD COLUMN IF NOT EXISTS id_fuente text;
ALTER TABLE conductores ADD COLUMN IF NOT EXISTS lead_origen_id uuid;

COMMENT ON COLUMN conductores.fuente_pauta IS 'Canal de la pauta del lead de origen (Facebook, Instagram, TikTok, Estado)';
COMMENT ON COLUMN conductores.id_fuente IS 'Link del anuncio del lead de origen';
COMMENT ON COLUMN conductores.lead_origen_id IS 'Lead del que salió el conductor';

-- Conductores que ya existen: se completan desde su lead (por DNI). Si la persona
-- tiene varios leads, se toma el último creado antes de ser conductor que tenga
-- datos de pauta; si ninguno tiene, el último antes de ser conductor.
-- Solo se completan los campos vacíos.
WITH candidatos AS (
  SELECT DISTINCT ON (c.id)
    c.id AS conductor_id, l.id AS lead_id,
    NULLIF(btrim(l.fuente_pauta), '') AS fuente_pauta,
    NULLIF(btrim(l.id_fuente), '') AS id_fuente
  FROM conductores c
  JOIN leads l
    ON regexp_replace(COALESCE(l.dni, ''), '\D', '', 'g') = regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g')
   AND regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g') <> ''
   AND l.created_at <= c.created_at + interval '1 day'
  WHERE c.fuente_pauta IS NULL OR c.id_fuente IS NULL OR c.lead_origen_id IS NULL
  ORDER BY c.id,
    (NULLIF(btrim(l.fuente_pauta), '') IS NOT NULL OR NULLIF(btrim(l.id_fuente), '') IS NOT NULL) DESC,
    l.created_at DESC
)
UPDATE conductores c
SET fuente_pauta = COALESCE(c.fuente_pauta, k.fuente_pauta),
    id_fuente = COALESCE(c.id_fuente, k.id_fuente),
    lead_origen_id = COALESCE(c.lead_origen_id, k.lead_id)
FROM candidatos k
WHERE c.id = k.conductor_id;

-- Comprobar: cuántos conductores quedaron con canal y con anuncio
SELECT COUNT(*) AS conductores,
       COUNT(*) FILTER (WHERE fuente_pauta IS NOT NULL) AS con_canal,
       COUNT(*) FILTER (WHERE id_fuente IS NOT NULL) AS con_anuncio,
       COUNT(*) FILTER (WHERE lead_origen_id IS NOT NULL) AS con_lead
FROM conductores;
