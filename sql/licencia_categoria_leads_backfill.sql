-- =====================================================
-- Completar categoria_licencia en los leads que ya existen (una sola vez)
-- =====================================================
-- Ejecutar DESPUÉS de sql/licencia_categoria_leads.sql.
-- Regla (la misma de src/modules/leads/licenciaLead.ts):
--   · d1 = 'Si' o histórico con D1        → D1 (aunque también tenga B1)
--   · histórico con B1 y sin D1           → B1
--   · histórico con otras clases          → Otros (el detalle con esas clases, ej. "A1.4, D3")
-- Solo toca leads SIN categoria_licencia y que no digan licencia = 'No' (esos 7 casos
-- contradictorios se dejan para revisar a mano). Si licencia estaba vacía pasa a 'Si'.
-- categorias_licencia (histórico) no se modifica. Se puede ejecutar más de una vez.
--
-- Vista previa al 2026-11-11: 532 → D1, 13 → B1, 17 → Otros (357 tenían licencia vacía).

WITH base AS (
  SELECT
    id,
    COALESCE(
      ARRAY(SELECT upper(trim(regexp_replace(c, '^Licencia categor[ií]a\s*', '', 'i')))
            FROM unnest(categorias_licencia) AS c),
      '{}'
    ) AS clases,
    d1 ~* '^s[ií]' AS tiene_d1
  FROM leads
  WHERE categoria_licencia IS NULL
    AND (licencia IS NULL OR licencia !~* '^no$')
),
calculo AS (
  SELECT
    id,
    CASE
      WHEN tiene_d1 OR 'D1' = ANY(clases) THEN 'D1'
      WHEN 'B1' = ANY(clases) THEN 'B1'
      WHEN cardinality(clases) > 0 THEN 'Otros'
    END AS categoria,
    array_to_string(clases, ', ') AS detalle
  FROM base
)
UPDATE leads l
SET categoria_licencia = c.categoria,
    categoria_licencia_otra = CASE WHEN c.categoria = 'Otros' THEN c.detalle END,
    licencia = 'Si',
    d1 = CASE WHEN c.categoria = 'D1' THEN 'Si' ELSE COALESCE(l.d1, 'No') END
FROM calculo c
WHERE l.id = c.id
  AND c.categoria IS NOT NULL;

-- Comprobar
SELECT categoria_licencia, count(*) FROM leads GROUP BY 1 ORDER BY 2 DESC;

-- Casos contradictorios para revisar a mano (licencia = 'No' pero con D1 o categorías)
SELECT id, nombre_completo, licencia, d1, categorias_licencia
FROM leads
WHERE categoria_licencia IS NULL
  AND licencia ~* '^no$'
  AND (d1 ~* '^s[ií]' OR cardinality(categorias_licencia) > 0);
