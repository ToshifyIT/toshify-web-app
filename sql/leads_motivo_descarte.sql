-- =====================================================
-- Motivo de descarte de leads (categoría fija)
-- =====================================================
-- Antes el motivo era texto libre (causal_de_cierre / Observaciones) y no se podía
-- contar. Ahora, al descartar, se elige una categoría de una lista fija y la nota
-- opcional queda en la bitácora de Observaciones.
--   · motivo_descarte   = categoría (lista en src/modules/leads/motivoDescarte.ts)
--   · causal_de_cierre  = sigue guardando la causal tal como viene de Sellium
--   · observaciones     = detalle libre (bitácora)
--
-- Este script:
--   1) agrega la columna
--   2) completa el motivo de los leads YA descartados, leyendo su causal y sus
--      observaciones (solo los que todavía no tienen motivo)
-- Se puede ejecutar más de una vez.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_descarte text;

COMMENT ON COLUMN leads.motivo_descarte IS
  'Categoría del descarte (lista fija en la app). El detalle libre va en observaciones.';

-- 2) Completar los descartados existentes.
-- Se ignoran las líneas automáticas ("Bot documentos", "Recontacto Sellium") porque
-- no explican el descarte (el bot dice "antecedentes penales" en todos).
-- El orden de los WHEN importa: el primero que coincide gana.
WITH base AS (
  SELECT
    id,
    estado_de_lead,
    coalesce(causal_de_cierre, '') AS causal,
    lower(
      regexp_replace(coalesce(observaciones, ''),
        '^(\[[^]]*Bot documentos\]|Recontacto Sellium)[^\n]*$', '', 'gn')
      || ' ' || coalesce(causal_de_cierre, '')
    ) AS t
  FROM leads
  WHERE estado_de_lead IN ('Descartado', 'No cumple edad')
    AND motivo_descarte IS NULL
),
clasif AS (
  SELECT id,
    CASE
      WHEN estado_de_lead = 'No cumple edad' THEN 'No cumple la edad'
      WHEN t ~ '(duplicad|err[oó]neo|n[uú]mero de empresa|otro pa[ií]s)' THEN 'Duplicado / datos erróneos'
      WHEN t ~ 'deuda' THEN 'Con deuda'
      WHEN t ~ 'antecedentes' THEN 'Antecedentes'
      WHEN t ~ '(perfil no id[oó]neo|no apto|no cumple con el perfil|no re[uú]ne|grosero)' THEN 'Perfil no apto'
      WHEN t ~ '(\mb1\M|no tiene d1|licencia vencida|no tiene licencia|licencia 1\M)' THEN 'Licencia insuficiente'
      WHEN t ~ '(no responde|no contesta|sin [eé]xito|no show|cancel[oó] dos veces|intentando comunicar)' THEN 'No responde / no se presentó'
      WHEN t ~ '(sin cobertura|zona restringida|zona fuera de cobertura|desolada)' THEN 'Zona fuera de cobertura'
      WHEN t ~ 'precio de alquiler' OR causal = 'price' THEN 'Precio del alquiler'
      WHEN t ~ '(0km|ya cuenta con auto)' THEN 'Auto propio'
      WHEN t ~ '(opci[oó]n a compra|alquilar a cargo)' THEN 'A cargo'
      WHEN t ~ '(modelo no aceptado|a[nñ]o fuera de rango)' THEN 'Vehículo no aceptado'
      WHEN t ~ 'desacuerdo con oferta' OR causal = 'disagreement' THEN 'Desacuerdo con la oferta'
      WHEN t ~ '(ya trabaja|consigui[oó] trabajo|no le interesa|no interesado|estafa|reparto)' THEN 'Ya trabaja / no le interesa'
      ELSE 'Otro / sin detalle'
    END AS motivo
  FROM base
)
UPDATE leads l
SET motivo_descarte = c.motivo
FROM clasif c
WHERE l.id = c.id;

-- Comprobar: cantidad por motivo (todas las sedes)
SELECT motivo_descarte, count(*)
FROM leads
WHERE estado_de_lead IN ('Descartado', 'No cumple edad')
GROUP BY motivo_descarte
ORDER BY count(*) DESC;
