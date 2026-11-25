-- =====================================================
-- leads.verificacion_documentos — 2026-11-24
-- =====================================================
-- Resultado del bot de documentos (scripts/leads-documentos, servidor): por cada uno de los
-- 4 documentos pedidos (DNI, licencia, antecedentes penales, certificado de domicilio) si se
-- encontró en la carpeta de Sellium Docs del lead y sus observaciones. Lo muestra la pestaña
-- "Verificación documentos" del detalle del lead. El bot la reemplaza en cada revisión.
--   { "actualizado": "...", "carpeta": "https://drive...",
--     "documentos": { "dni": { "encontrado": true, "observaciones": ["..."] }, "licencia": {...},
--                     "antecedentes": {...}, "certificado": {...} },
--     "generales": ["..."] }
-- Se puede correr más de una vez.

BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verificacion_documentos jsonb;

COMMENT ON COLUMN public.leads.verificacion_documentos IS
  'Bot de documentos: por documento (dni, licencia, antecedentes, certificado) si se encontró en la carpeta de Sellium Docs y observaciones.';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'verificacion_documentos';

COMMIT;
