-- =====================================================
-- Consumo herramientas: carpeta de Drive de cada mes (2026-11-24)
-- =====================================================
-- Las facturas de las herramientas se guardan en Drive, en HERRAMIENTAS/<AAAA-MM>
-- (carpeta de maria.f@, compartida con la contadora). En la pantalla, "Ver" abre la
-- carpeta del mes del pago: ahí están todas las facturas de ese mes (plan, recargas, ajustes).
--
-- La llena scripts/alertas-herramientas/facturas_correo.py cuando sube una factura
-- (y `python3 facturas_correo.py carpetas` carga las que ya existen).
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS herramientas_drive_carpetas (
  -- '2026-11'
  periodo TEXT PRIMARY KEY CHECK (periodo ~ '^\d{4}-\d{2}$'),
  carpeta_id TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE herramientas_drive_carpetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS herramientas_drive_carpetas_select ON herramientas_drive_carpetas;
CREATE POLICY herramientas_drive_carpetas_select ON herramientas_drive_carpetas FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));
DROP POLICY IF EXISTS herramientas_drive_carpetas_insert ON herramientas_drive_carpetas;
CREATE POLICY herramientas_drive_carpetas_insert ON herramientas_drive_carpetas FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_drive_carpetas_update ON herramientas_drive_carpetas;
CREATE POLICY herramientas_drive_carpetas_update ON herramientas_drive_carpetas FOR UPDATE TO authenticated
  USING (herramientas_puede('editar')) WITH CHECK (herramientas_puede('editar'));

COMMIT;

SELECT count(*) AS carpetas FROM herramientas_drive_carpetas;
