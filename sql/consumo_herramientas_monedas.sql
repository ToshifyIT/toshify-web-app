-- =====================================================
-- Consumo herramientas: monedas, equivalente en USD y estado Activa/Inactiva (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
--
-- 1) Moneda PEN (Google Cloud factura en soles) además de USD / ARS / EUR.
-- 2) Cotizaciones para mostrar el equivalente en USD de cada monto (cada importe
--    sigue en su moneda original; el USD es solo para tener un total estándar).
--    Las actualiza todos los días el script del servidor (alertas-herramientas)
--    y se pueden corregir a mano desde la pantalla (permiso editar).
-- 3) Estado: "Dada de baja" pasa a "Inactiva" (Activa / Inactiva).
-- 4) enlace_gestor: enlace a la entrada del gestor de contraseñas (la contraseña
--    NUNCA se guarda en Toshibase).

BEGIN;

-- 1) y 3) Reemplazar los CHECK de moneda y estado
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabla, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('herramientas'::regclass, 'herramientas_pagos'::regclass)
      AND (pg_get_constraintdef(c.oid) ILIKE '%moneda%'
           OR (c.conrelid = 'herramientas'::regclass AND pg_get_constraintdef(c.oid) ILIKE '%Dada de baja%'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
  END LOOP;
END $$;

UPDATE herramientas SET estado = 'Inactiva' WHERE estado = 'Dada de baja';

ALTER TABLE herramientas
  ADD CONSTRAINT herramientas_moneda_check CHECK (moneda IN ('USD', 'ARS', 'EUR', 'PEN')),
  ADD CONSTRAINT herramientas_estado_check CHECK (estado IN ('Activa', 'Inactiva'));
ALTER TABLE herramientas_pagos
  ADD CONSTRAINT herramientas_pagos_moneda_check CHECK (moneda IN ('USD', 'ARS', 'EUR', 'PEN'));

-- 4) Enlace al gestor de contraseñas
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS enlace_gestor TEXT;

-- 2) Cotizaciones: cuántas unidades de la moneda equivalen a 1 USD
CREATE TABLE IF NOT EXISTS herramientas_cotizaciones (
  moneda TEXT PRIMARY KEY CHECK (moneda IN ('USD', 'ARS', 'EUR', 'PEN')),
  unidades_por_usd NUMERIC(18, 6) NOT NULL CHECK (unidades_por_usd > 0),
  fuente TEXT,
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- Valores iniciales (open.er-api.com, 17/11/2026). El script del servidor los actualiza a diario.
INSERT INTO herramientas_cotizaciones (moneda, unidades_por_usd, fuente) VALUES
  ('USD', 1, 'fija'),
  ('ARS', 1549.6732, 'open.er-api.com'),
  ('EUR', 0.908584, 'open.er-api.com'),
  ('PEN', 3.411033, 'open.er-api.com')
ON CONFLICT (moneda) DO NOTHING;

ALTER TABLE herramientas_cotizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS herramientas_cotizaciones_select ON herramientas_cotizaciones;
CREATE POLICY herramientas_cotizaciones_select ON herramientas_cotizaciones FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));
DROP POLICY IF EXISTS herramientas_cotizaciones_update ON herramientas_cotizaciones;
CREATE POLICY herramientas_cotizaciones_update ON herramientas_cotizaciones FOR UPDATE TO authenticated
  USING (herramientas_puede('editar')) WITH CHECK (herramientas_puede('editar') AND moneda <> 'USD');
REVOKE ALL ON herramientas_cotizaciones FROM anon;

-- Descripción del script en Integraciones & Tokens
UPDATE cron_jobs
SET descripcion = 'Todos los días a las 9 actualiza las cotizaciones (ARS, EUR, PEN contra USD) y avisa por correo (y Slack si está configurado) los cobros de herramientas que vencen en los próximos días, los pagos vencidos sin marcar y las herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada. Destinatarios y días en las variables HERRAMIENTAS_ALERTAS_*.',
    updated_at = now()
WHERE tipo = 'script' AND comando = 'alertas-herramientas/main.py';

COMMIT;

-- Para revisar:
-- SELECT * FROM herramientas_cotizaciones ORDER BY moneda;
-- SELECT nombre, estado FROM herramientas ORDER BY estado, nombre;
