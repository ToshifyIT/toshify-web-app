-- =====================================================
-- Consumo herramientas: URL de la herramienta (para entrar), aparte de la de facturación (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
-- url_acceso: a dónde se entra (Configuración › Integraciones & Tokens › Accesos herramientas).
-- url_facturacion: dónde se ven facturas y pagos (Administración › Consumo herramientas).

ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS url_acceso TEXT;

-- Valores iniciales (solo si todavía no tiene)
UPDATE herramientas h SET url_acceso = v.url
FROM (VALUES
  ('2Chat', 'https://app.2chat.io/'),
  ('Anticaptcha API', 'https://anti-captcha.com/clients/'),
  ('Apple ID', 'https://account.apple.com/'),
  ('Cabify – 44 Dreams', 'https://partners.cabify.com/'),
  ('Cabify – Bariloche', 'https://partners.cabify.com/'),
  ('Cabify – Partners', 'https://partners.cabify.com/'),
  ('Cloudflare', 'https://dash.cloudflare.com/'),
  ('Contabo PRD', 'https://my.contabo.com/'),
  ('Contabo DEV', 'https://my.contabo.com/'),
  ('Didi – Fleet', 'https://fleetplatform.didiglobal.com/'),
  ('DocuSeal', 'https://docuseal.com/sign_in'),
  ('Docusign – coord.admin', 'https://account.docusign.com/'),
  ('Docusign – Josué', 'https://account.docusign.com/'),
  ('Donweb – Hosting WordPress', 'https://micuenta.donweb.com/'),
  ('Donweb – toshify.com.ar', 'https://micuenta.donweb.com/'),
  ('Donweb – toshify.online', 'https://micuenta.donweb.com/'),
  ('Donweb – toshify.store', 'https://micuenta.donweb.com/'),
  ('GitHub', 'https://github.com/'),
  ('Google Cloud (APIs)', 'https://console.cloud.google.com/'),
  ('Google – info.grupo.cg@gmail.com', 'https://mail.google.com/'),
  ('Google Workspace', 'https://admin.google.com/'),
  ('Hireflix', 'https://admin.hireflix.com/es/login'),
  ('Sellium (Vantegrate)', 'https://toshify-vantegrate.lightning.force.com/lightning/n/Toshify_Consola'),
  ('Slack', 'https://toshify.slack.com/'),
  ('Telepase', 'https://telepase.com.ar/admin/vehiculos-habilitados'),
  ('ToshiBase – admin', 'https://app.toshify.com.ar/login'),
  ('USS – Ecotracker', NULL),
  ('Wialon', NULL),
  ('WordPress – toshbank.com', 'https://toshbank.com/wp-admin'),
  ('WordPress – toshify.com.ar', 'https://toshify.com.ar/wp-admin')
) AS v(nombre, url)
WHERE h.nombre = v.nombre AND h.url_acceso IS NULL AND v.url IS NOT NULL;

-- Para revisar:
-- SELECT nombre, url_acceso, url_facturacion FROM herramientas ORDER BY nombre;
