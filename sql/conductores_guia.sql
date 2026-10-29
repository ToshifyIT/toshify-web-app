-- sql/conductores_guia.sql
-- Guía de cada conductor (nombre), guardado en el conductor para tener control.
--
-- Regla (la misma que usa la conversión de lead a conductor, src/modules/leads/guias.ts):
--   * Si el lead tiene guía (leads.entrevistador_asignado) y es Ali, Manuel, Marina,
--     Carla o Eunice -> ese guía.
--   * Si no tiene guía o tiene otro valor -> el usuario que convirtió el lead (leads.usuario).
-- El lead se busca por conductores.lead_origen_id; si no hay, por DNI (el lead más reciente).
-- Solo completa conductores que todavía no tienen guía: no pisa lo que se edite a mano.
-- Se puede correr más de una vez.

ALTER TABLE conductores ADD COLUMN IF NOT EXISTS guia text;
COMMENT ON COLUMN conductores.guia IS
  'Guía del lead de origen (Ali, Manuel, Marina, Carla o Eunice) o, si no tenía, el usuario que lo convirtió a conductor. Editable desde Conductores.';

CREATE INDEX IF NOT EXISTS idx_conductores_guia ON conductores (guia);

WITH lead_de AS (
  SELECT c.id AS conductor_id,
         COALESCE(lo.entrevistador_asignado, ld.entrevistador_asignado) AS guia_lead,
         COALESCE(lo.usuario, ld.usuario) AS usuario
  FROM conductores c
  LEFT JOIN leads lo ON lo.id = c.lead_origen_id
  LEFT JOIN LATERAL (
    SELECT l.entrevistador_asignado, l.usuario
    FROM leads l
    WHERE c.lead_origen_id IS NULL
      AND c.numero_dni IS NOT NULL
      AND l.dni = c.numero_dni
    ORDER BY l.created_at DESC NULLS LAST
    LIMIT 1
  ) ld ON true
  WHERE c.guia IS NULL
    AND (lo.id IS NOT NULL OR ld.usuario IS NOT NULL OR ld.entrevistador_asignado IS NOT NULL)
),
calculado AS (
  SELECT conductor_id,
         CASE
           WHEN lower(split_part(btrim(guia_lead), ' ', 1)) IN ('ali', 'manuel', 'marina', 'carla', 'eunice')
             THEN regexp_replace(btrim(guia_lead), '\s+', ' ', 'g')
           WHEN NULLIF(btrim(usuario), '') IS NOT NULL AND lower(btrim(usuario)) <> 'sistema'
             THEN regexp_replace(btrim(usuario), '\s+', ' ', 'g')
         END AS guia
  FROM lead_de
)
UPDATE conductores c
SET guia = calculado.guia
FROM calculado
WHERE c.id = calculado.conductor_id
  AND calculado.guia IS NOT NULL;

-- Para revisar cómo quedó:
-- SELECT guia, count(*) FROM conductores GROUP BY guia ORDER BY 2 DESC;
