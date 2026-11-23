-- =====================================================
-- Consumo herramientas: consumo real día a día y saldo prepago (2026-11-20)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql y sql/consumo_herramientas_monedas.sql.
-- Idempotente (se puede correr más de una vez).
--
-- Para las herramientas "Por uso" que tienen API, el consumo se trae solo:
--   · 2Chat: costo de cada llamada (ya se guarda en twochat_llamadas.costo_usd).
--            Lo suma por día herramientas_actualizar_consumo_2chat(); la llaman la
--            pantalla al abrir y el script diario del servidor.
--   · Google Cloud (Maps, Gemini, etc.): costo por servicio desde la exportación de
--            facturación a BigQuery. Lo carga el script del servidor
--            (scripts/alertas-herramientas/main.py) con la service role.
--
-- Ninguna de las dos API entrega la factura ni el saldo prepago: el saldo se carga
-- a mano desde la pantalla (lo que muestra la consola de la herramienta y a qué
-- fecha) y de ahí se descuenta el consumo de los días siguientes.
-- En Google el prepago de Gemini (AI Studio) es una billetera aparte de la cuenta
-- de facturación donde se cobra Maps: por eso el saldo puede aplicarse a un solo
-- concepto (saldo_prepago_concepto).
--
-- 1) herramientas: de dónde sale el consumo y el saldo prepago cargado a mano.
-- 2) herramientas_consumo: una fila por herramienta, día y concepto.
-- 3) herramientas_actualizar_consumo_2chat(): suma las llamadas por día.

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1) Origen del consumo y saldo prepago
-- ─────────────────────────────────────────────────────
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS fuente_consumo TEXT;
-- Saldo que mostraba la herramienta al cierre de saldo_prepago_fecha (en la moneda de la herramienta)
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS saldo_prepago NUMERIC(14, 2) CHECK (saldo_prepago >= 0);
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS saldo_prepago_fecha DATE;
-- A qué concepto del consumo se le descuenta el saldo ('Gemini', 'Google Maps'...). NULL = a todo.
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS saldo_prepago_concepto TEXT;

ALTER TABLE herramientas DROP CONSTRAINT IF EXISTS herramientas_fuente_consumo_check;
ALTER TABLE herramientas
  ADD CONSTRAINT herramientas_fuente_consumo_check CHECK (fuente_consumo IN ('2chat', 'google_cloud'));

UPDATE herramientas SET fuente_consumo = '2chat' WHERE nombre = '2Chat' AND fuente_consumo IS NULL;
UPDATE herramientas SET fuente_consumo = 'google_cloud' WHERE nombre = 'Google Cloud (APIs)' AND fuente_consumo IS NULL;

-- 2Chat cobra las llamadas en dólares y por uso (si todavía no tenía moneda ni periodicidad)
UPDATE herramientas SET moneda = 'USD' WHERE fuente_consumo = '2chat' AND moneda IS NULL;
UPDATE herramientas SET periodicidad = 'Por uso' WHERE fuente_consumo = '2chat' AND periodicidad IS NULL;

-- ─────────────────────────────────────────────────────
-- 2) Consumo por día
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS herramientas_consumo (
  herramienta_id UUID NOT NULL REFERENCES herramientas(id) ON DELETE CASCADE,
  -- Día del consumo (hora Argentina)
  fecha DATE NOT NULL,
  -- 'Llamadas', 'Google Maps', 'Gemini', ...
  concepto TEXT NOT NULL,
  monto NUMERIC(14, 4) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'ARS', 'EUR', 'PEN')),
  -- Volumen que explica el monto (minutos de llamada, etc.); opcional
  cantidad NUMERIC(16, 2),
  unidad TEXT,
  -- '2chat' | 'bigquery'
  fuente TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (herramienta_id, fecha, concepto)
);

CREATE INDEX IF NOT EXISTS idx_herr_consumo_fecha ON herramientas_consumo(fecha);

ALTER TABLE herramientas_consumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS herramientas_consumo_select ON herramientas_consumo;
CREATE POLICY herramientas_consumo_select ON herramientas_consumo FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));
-- Sin políticas de escritura: escriben la función de abajo y la service role (servidor).
REVOKE ALL ON herramientas_consumo FROM anon;

-- ─────────────────────────────────────────────────────
-- 3) 2Chat: costo de las llamadas sumado por día
--    Rehace desde p_desde (por defecto, el primer día del mes anterior).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION herramientas_actualizar_consumo_2chat(p_desde date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_desde date := COALESCE(p_desde, (date_trunc('month', v_hoy) - interval '1 month')::date);
  v_id uuid;
  v_n integer := 0;
BEGIN
  -- Desde la web solo quien puede ver el módulo; el servidor (service role) sin usuario
  IF auth.uid() IS NOT NULL AND NOT herramientas_puede('ver') THEN
    RAISE EXCEPTION 'Sin permiso para Consumo herramientas';
  END IF;

  SELECT id INTO v_id FROM herramientas WHERE fuente_consumo = '2chat' ORDER BY created_at LIMIT 1;
  -- Sin la herramienta o sin el historial de llamadas (sql/twochat_llamadas.sql) no hay nada que sumar
  IF v_id IS NULL OR to_regclass('public.twochat_llamadas') IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE '
    INSERT INTO herramientas_consumo (herramienta_id, fecha, concepto, monto, moneda, cantidad, unidad, fuente, actualizado_en)
    SELECT $1, (l.fecha AT TIME ZONE ''America/Argentina/Buenos_Aires'')::date, ''Llamadas'',
           SUM(l.costo_usd), ''USD'', ROUND(SUM(l.duracion) / 60.0, 2), ''min'', ''2chat'', now()
    FROM twochat_llamadas l
    WHERE l.fecha >= ($2::timestamp AT TIME ZONE ''America/Argentina/Buenos_Aires'')
    GROUP BY 2
    HAVING SUM(l.costo_usd) > 0
    ON CONFLICT (herramienta_id, fecha, concepto) DO UPDATE
      SET monto = EXCLUDED.monto, cantidad = EXCLUDED.cantidad, actualizado_en = now()'
    USING v_id, v_desde;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION herramientas_actualizar_consumo_2chat(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION herramientas_actualizar_consumo_2chat(date) TO authenticated;

-- Carga inicial: todo el historial de llamadas
SELECT herramientas_actualizar_consumo_2chat('2020-01-01');

-- Descripción del script en Integraciones & Tokens
UPDATE cron_jobs
SET descripcion = 'Todos los días a las 9 actualiza las cotizaciones (ARS, EUR, PEN contra USD), trae el consumo real de las herramientas por uso (llamadas de 2Chat y Google Cloud desde BigQuery) y avisa por correo (y Slack si está configurado) los cobros que vencen en los próximos días, los pagos vencidos sin marcar, los saldos prepago por agotarse y las herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada. Destinatarios y días en las variables HERRAMIENTAS_ALERTAS_*.',
    updated_at = now()
WHERE tipo = 'script' AND comando = 'alertas-herramientas/main.py';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para revisar:
-- SELECT h.nombre, to_char(c.fecha, 'YYYY-MM') AS mes, c.concepto, SUM(c.monto) AS monto, c.moneda
-- FROM herramientas_consumo c JOIN herramientas h ON h.id = c.herramienta_id
-- GROUP BY 1, 2, 3, 5 ORDER BY 2 DESC, 1, 3;
