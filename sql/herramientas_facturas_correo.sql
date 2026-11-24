-- =====================================================
-- Consumo herramientas: facturas y pagos leídos del correo (2026-11-24)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
--
-- Lo que tiene API sigue por API (consumo de 2Chat y Google Cloud, licencias de Slack y
-- Google Workspace: scripts/alertas-herramientas/main.py). Para los pagos y las facturas,
-- scripts/alertas-herramientas/facturas_correo.py lee una vez por día las casillas
-- info@ y techspec@ (Gmail, solo lectura) y cruza los correos de cada herramienta:
--   · factura o recibo: marca el pago del mes como Pagado y le adjunta el PDF,
--   · pago rechazado ("no pudimos renovar", "problema de pago"): solo avisa,
--   · lo que no puede cruzar seguro (monto distinto, sin pago, segunda factura del mes): avisa.
--
-- 1) herramientas.remitentes_factura: de quién llegan las facturas (dominio o correo) y,
--    si el mismo remitente factura varias herramientas, qué tiene que decir el asunto.
-- 2) herramientas_facturas_correo: cada correo procesado (para no repetirlo y para revisar).

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1) Remitentes de las facturas
-- ─────────────────────────────────────────────────────
-- Dominios o correos (ej. 'slack.com', 'payments-noreply@google.com')
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS remitentes_factura TEXT[];
-- Texto que tiene que aparecer en el asunto (ej. 'Google Workspace'); NULL = cualquiera
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS asunto_factura TEXT;

-- Valores iniciales (solo si están vacíos), confirmados con los correos de info@, maria.f@ y
-- josue.caride@ el 24/11/2026. Para revisar otros:
--   python3 facturas_correo.py descubrir
-- Slack manda muchos avisos (mensajes, cambios de plan): solo los de pago o renovación
UPDATE herramientas SET remitentes_factura = ARRAY['slack.com'], asunto_factura = 'pago|renovar'
  WHERE nombre = 'Slack' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['2chat.co', '2chat.io']
  WHERE nombre = '2Chat' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['payments-noreply@google.com'], asunto_factura = 'Google Workspace'
  WHERE nombre = 'Google Workspace' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['payments-noreply@google.com'], asunto_factura = 'Google Cloud'
  WHERE nombre = 'Google Cloud (APIs)' AND remitentes_factura IS NULL;
-- Las facturas de Alegra las emite Alanube S.A.U. ("¡Aquí tu Factura Alegra!")
UPDATE herramientas SET remitentes_factura = ARRAY['alegra.com', 'alanube.co'], asunto_factura = 'Factura'
  WHERE nombre = 'Alegra Contabilidad' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['quaderno.io', 'hireflix.com']
  WHERE nombre = 'Hireflix' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['contabo.com']
  WHERE nombre = 'Contabo PRD' AND remitentes_factura IS NULL;
UPDATE herramientas SET remitentes_factura = ARRAY['anti-captcha.com']
  WHERE nombre = 'Anticaptcha API' AND remitentes_factura IS NULL;
-- DocuSeal cobra por Stripe. NO usar docuseal.com: de ahí llegan las cartas oferta firmadas
UPDATE herramientas SET remitentes_factura = ARRAY['stripe.com'], asunto_factura = 'DocuSeal'
  WHERE nombre = 'DocuSeal' AND remitentes_factura IS NULL;

-- ─────────────────────────────────────────────────────
-- 2) Correos procesados
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS herramientas_facturas_correo (
  -- Casilla leída y id del mensaje en Gmail: un correo se procesa una sola vez
  cuenta TEXT NOT NULL,
  mensaje_id TEXT NOT NULL,
  herramienta_id UUID REFERENCES herramientas(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ,
  remitente TEXT,
  asunto TEXT,
  -- 'factura' (factura o recibo de pago) | 'rechazo' (no se pudo cobrar) | 'otro'
  tipo TEXT NOT NULL CHECK (tipo IN ('factura', 'rechazo', 'otro')),
  -- Monto leído del correo (si se pudo)
  monto NUMERIC(14, 2),
  moneda TEXT,
  pago_id UUID REFERENCES herramientas_pagos(id) ON DELETE SET NULL,
  factura_path TEXT,
  -- 'pagado' | 'adjuntada' | 'ya_estaba' | 'revisar' | 'aviso' | 'ignorado'
  resultado TEXT NOT NULL,
  detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta, mensaje_id)
);

CREATE INDEX IF NOT EXISTS idx_herr_fact_correo_herr ON herramientas_facturas_correo(herramienta_id, fecha DESC);

ALTER TABLE herramientas_facturas_correo ENABLE ROW LEVEL SECURITY;
-- Solo lectura desde la pantalla; escribe el script con la service role
DROP POLICY IF EXISTS herramientas_facturas_correo_select ON herramientas_facturas_correo;
CREATE POLICY herramientas_facturas_correo_select ON herramientas_facturas_correo FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));

COMMIT;

-- Comprobar
SELECT nombre, remitentes_factura, asunto_factura FROM herramientas
WHERE remitentes_factura IS NOT NULL ORDER BY nombre;
