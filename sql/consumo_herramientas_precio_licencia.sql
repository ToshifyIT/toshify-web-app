-- =====================================================
-- Consumo herramientas: precio por licencia y cantidad traída sola (2026-11-21)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql y sql/consumo_herramientas_licencias.sql.
-- Idempotente.
--
-- Para las herramientas que cobran por usuario (Slack, Google Workspace):
--   monto del período = licencias × precio_licencia
-- El precio por licencia se carga una vez en la ficha (ninguna API lo entrega).
-- La cantidad de licencias la trae el script diario del servidor
-- (scripts/alertas-herramientas/main.py) desde la API de cada herramienta; cuando
-- cambia, actualiza licencias, el monto y los pagos pendientes, y avisa por correo.
-- Es una estimación: no incluye impuestos ni los ajustes por altas o bajas a mitad de mes.

BEGIN;

-- Precio de una licencia por período, en la moneda de la herramienta
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS precio_licencia NUMERIC(12, 2) CHECK (precio_licencia >= 0);
-- De dónde trae el script la cantidad de licencias. NULL = se carga a mano.
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS fuente_licencias TEXT;
-- Última vez que el script leyó la cantidad en la herramienta
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS licencias_actualizadas_en TIMESTAMPTZ;

ALTER TABLE herramientas DROP CONSTRAINT IF EXISTS herramientas_fuente_licencias_check;
ALTER TABLE herramientas
  ADD CONSTRAINT herramientas_fuente_licencias_check CHECK (fuente_licencias IN ('slack', 'google_workspace'));

UPDATE herramientas SET fuente_licencias = 'slack' WHERE nombre = 'Slack' AND fuente_licencias IS NULL;
UPDATE herramientas SET fuente_licencias = 'google_workspace'
  WHERE nombre = 'Google Workspace' AND fuente_licencias IS NULL;

-- Slack plan Pro mensual: USD 8,75 por usuario (12 usuarios = USD 105, relevado el 21/11/2026)
UPDATE herramientas SET precio_licencia = 8.75 WHERE nombre = 'Slack' AND precio_licencia IS NULL;
-- Google Workspace: cargar el precio por licencia desde la ficha (Editar herramienta).

-- El monto pasa a ser licencias × precio donde ya están los dos datos
UPDATE herramientas SET monto = ROUND(licencias * precio_licencia, 2)
WHERE precio_licencia IS NOT NULL AND licencias IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para revisar:
-- SELECT nombre, licencias, precio_licencia, monto, moneda, fuente_licencias, licencias_actualizadas_en
-- FROM herramientas WHERE precio_licencia IS NOT NULL OR fuente_licencias IS NOT NULL;
