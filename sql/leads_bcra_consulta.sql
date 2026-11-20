-- =====================================================
-- Leads: consulta automática a la Central de Deudores del BCRA (2026-11-20)
-- =====================================================
-- El servidor (server-bcra.js, arrancado por server.js) revisa cada 5 minutos
-- los leads con CUIT o DNI que todavía no se consultaron y le pregunta al BCRA
-- (api.bcra.gob.ar, pública, sin clave). Sin CUIT, arma el CUIL desde el DNI
-- (prefijos 20, 27, 23 y 24). En los dos casos el nombre que devuelve el BCRA
-- tiene que coincidir con el del lead; si no, la consulta no se acepta.
-- Con la respuesta completa:
--
--   bcra_consultado_at  cuándo se consultó (NULL = pendiente)
--   bcra_situacion      peor situación actual: 0 sin deudas, 1 normal ... 6
--   bcra_deuda_total    suma de la deuda actual, en pesos
--   bcra_cheques        cheques rechazados informados
--   bcra_nombre         nombre que tiene el BCRA para ese CUIT (para cotejar)
--   bcra_resumen        texto corto con el resultado
--   bcra_detalle        respuesta del BCRA por entidad (jsonb)
--   bcra_error          por qué no se pudo consultar (CUIT inválido, etc.)
--   bcra_intentos       fallas de red seguidas (a las 5 se deja de intentar)
--   bcra_cuil           CUIT/CUIL con el que se consultó (11 dígitos)
--   bcra_cuil_origen    'cuit' (el cargado en el lead) o 'dni' (armado desde el DNI)
--
-- La columna `bcra` (texto que se carga a mano) se completa con el resumen solo
-- si está vacía o si tenía el resumen automático anterior: lo escrito a mano
-- no se pisa.
--
-- Si se cambia el CUIT o el DNI de un lead, el trigger lo vuelve a dejar pendiente.
-- Si la consulta falló (p. ej. el nombre no coincidía) y se corrige el nombre, también.
-- Se puede ejecutar más de una vez.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bcra_consultado_at timestamptz,
  ADD COLUMN IF NOT EXISTS bcra_situacion smallint,
  ADD COLUMN IF NOT EXISTS bcra_deuda_total numeric(14, 2),
  ADD COLUMN IF NOT EXISTS bcra_cheques integer,
  ADD COLUMN IF NOT EXISTS bcra_nombre text,
  ADD COLUMN IF NOT EXISTS bcra_resumen text,
  ADD COLUMN IF NOT EXISTS bcra_detalle jsonb,
  ADD COLUMN IF NOT EXISTS bcra_error text,
  ADD COLUMN IF NOT EXISTS bcra_intentos smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bcra_cuil text,
  ADD COLUMN IF NOT EXISTS bcra_cuil_origen text;

-- Pendientes de consulta (lo que busca el servidor cada 5 minutos)
DROP INDEX IF EXISTS leads_bcra_pendientes_idx;
CREATE INDEX leads_bcra_pendientes_idx
  ON leads (created_at)
  WHERE bcra_consultado_at IS NULL AND (cuit IS NOT NULL OR dni IS NOT NULL);

-- Al cambiar el CUIT o el DNI la consulta anterior deja de valer; al corregir el
-- nombre, se reintenta la que había fallado
CREATE OR REPLACE FUNCTION leads_bcra_reset_por_cuit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cuit IS DISTINCT FROM OLD.cuit
     OR NEW.dni IS DISTINCT FROM OLD.dni
     OR (NEW.nombre_completo IS DISTINCT FROM OLD.nombre_completo AND OLD.bcra_error IS NOT NULL) THEN
    NEW.bcra_consultado_at := NULL;
    NEW.bcra_error := NULL;
    NEW.bcra_intentos := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_bcra_reset_por_cuit ON leads;
CREATE TRIGGER leads_bcra_reset_por_cuit
  BEFORE UPDATE OF cuit, dni, nombre_completo ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_bcra_reset_por_cuit();

-- Ver cómo va:
--   SELECT bcra_situacion, count(*) FROM leads
--   WHERE bcra_consultado_at IS NOT NULL GROUP BY 1 ORDER BY 1;
