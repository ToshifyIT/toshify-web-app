-- =====================================================
-- Licencia del lead: categoría única (B1 / D1 / Otros) + fecha de obtención
-- =====================================================
-- Cyber Toshi Promo (2026-11): se habilita B1 de forma provisoria. Hay que saber qué
-- categoría tiene cada lead y desde cuándo, para después controlar el paso de B1 a D1.
--
--   · licencia                   = '¿Tiene licencia?' ('Si' / 'No'). Ya existía.
--   · categoria_licencia         = 'B1', 'D1' u 'Otros' (selección única)
--   · categoria_licencia_otra    = texto libre cuando la categoría es 'Otros' (ej. "D3")
--   · fecha_licencia_b1          = fecha en que obtuvo la B1 (obligatoria con B1, opcional con D1)
--   · fecha_licencia_d1          = fecha en que obtuvo la D1 (obligatoria con D1)
--   · fecha_categoria_licencia   = fecha de la categoría actual (con Otros se carga a mano;
--                                  con B1 / D1 la app copia la de esa categoría)
--
-- categorias_licencia (array, selección múltiple) NO se toca: queda como histórico.
-- Se puede ejecutar más de una vez.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS categoria_licencia text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS categoria_licencia_otra text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fecha_categoria_licencia date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fecha_licencia_b1 date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fecha_licencia_d1 date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_categoria_licencia_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_categoria_licencia_check
      CHECK (categoria_licencia IS NULL OR categoria_licencia IN ('B1', 'D1', 'Otros'));
  END IF;
END $$;

COMMENT ON COLUMN leads.categoria_licencia IS 'Categoría de licencia actual: B1, D1 u Otros (selección única).';
COMMENT ON COLUMN leads.categoria_licencia_otra IS 'Detalle de la licencia cuando categoria_licencia = Otros.';
COMMENT ON COLUMN leads.fecha_categoria_licencia IS 'Fecha en que obtuvo la categoría de licencia actual.';
COMMENT ON COLUMN leads.fecha_licencia_b1 IS 'Fecha en que obtuvo la licencia B1.';
COMMENT ON COLUMN leads.fecha_licencia_d1 IS 'Fecha en que obtuvo la licencia D1.';
COMMENT ON COLUMN leads.categorias_licencia IS 'HISTÓRICO: categorías de selección múltiple cargadas antes de 2026-11. Usar categoria_licencia.';

-- Comprobar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('licencia', 'categoria_licencia', 'categoria_licencia_otra', 'fecha_categoria_licencia',
                      'fecha_licencia_b1', 'fecha_licencia_d1');
