-- =====================================================
-- Conductores: correo personal (2026-11-02)
-- =====================================================
-- Mismos datos de contacto en lead y conductor:
--   · Email app móvil (Cabify): leads.email = conductores.email
--   · Correo personal: leads.mail_de_respaldo = conductores.correo_personal (nuevo)
--   · Teléfono: el WhatsApp es el mismo número que el teléfono
--   · Teléfono secundario (DiDi u otra app): leads/conductores.telefono_secundario
-- Al convertir un lead, el correo personal pasa al conductor.
-- Se puede ejecutar más de una vez.

ALTER TABLE conductores ADD COLUMN IF NOT EXISTS correo_personal text;
COMMENT ON COLUMN conductores.correo_personal IS 'Correo personal (el email principal es el de la app de Cabify)';

-- Completar los conductores que ya vinieron de un lead con mail de respaldo
UPDATE conductores c
SET correo_personal = btrim(l.mail_de_respaldo)
FROM leads l
WHERE l.id = c.lead_origen_id
  AND c.correo_personal IS NULL
  AND NULLIF(btrim(l.mail_de_respaldo), '') IS NOT NULL;

-- Comprobar
-- SELECT count(*) FROM conductores WHERE correo_personal IS NOT NULL;
