-- Leads: el teléfono principal (phone) ES el WhatsApp. whatsapp_number deja de usarse.
-- 1) Pasa a phone el whatsapp_number de los leads que no tienen phone.
-- 2) Trigger: si algún sistema externo (Sellium, chatbot, API) sigue escribiendo
--    solo whatsapp_number, se copia a phone automáticamente.
-- La columna whatsapp_number NO se borra todavía: primero hay que confirmar que
-- ningún sistema externo la lee. Cuando esté confirmado: ver el paso 3 al final.
-- Correr completo en el SQL Editor de Supabase.

-- ── 0) Vista previa (opcional) ──
-- SELECT
--   count(*) FILTER (WHERE COALESCE(btrim(phone), '') = '' AND COALESCE(btrim(whatsapp_number), '') <> '') AS se_completan,
--   count(*) FILTER (WHERE COALESCE(btrim(phone), '') <> '' AND COALESCE(btrim(whatsapp_number), '') <> ''
--                    AND regexp_replace(phone, '\D', '', 'g') <> regexp_replace(whatsapp_number, '\D', '', 'g')) AS distintos
-- FROM leads;

-- Los "distintos" tienen un número en cada columna. Para no perder el segundo número,
-- pasa a telefono_secundario cuando ese campo está vacío:
UPDATE leads
SET telefono_secundario = whatsapp_number
WHERE COALESCE(btrim(phone), '') <> ''
  AND COALESCE(btrim(whatsapp_number), '') <> ''
  AND COALESCE(btrim(telefono_secundario), '') = ''
  AND regexp_replace(phone, '\D', '', 'g') <> regexp_replace(whatsapp_number, '\D', '', 'g');

-- ── 1) Completa phone con whatsapp_number ──
UPDATE leads
SET phone = whatsapp_number
WHERE COALESCE(btrim(phone), '') = ''
  AND COALESCE(btrim(whatsapp_number), '') <> '';

-- ── 2) Trigger para lo que siga llegando solo con whatsapp_number ──
CREATE OR REPLACE FUNCTION public.trg_leads_whatsapp_a_phone()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(btrim(NEW.phone), '') = '' AND COALESCE(btrim(NEW.whatsapp_number), '') <> '' THEN
    NEW.phone := NEW.whatsapp_number;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_whatsapp_a_phone ON leads;
CREATE TRIGGER leads_whatsapp_a_phone
  BEFORE INSERT OR UPDATE OF phone, whatsapp_number ON leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_whatsapp_a_phone();

-- ── 3) MÁS ADELANTE (no correr ahora): cuando se confirme que nadie usa la columna ──
-- DROP TRIGGER IF EXISTS leads_whatsapp_a_phone ON leads;
-- DROP FUNCTION IF EXISTS public.trg_leads_whatsapp_a_phone();
-- ALTER TABLE leads DROP COLUMN whatsapp_number;
