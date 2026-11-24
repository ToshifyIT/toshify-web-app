-- =====================================================
-- Conductores: situación en la Central de Deudores del BCRA (2026-11-24)
-- =====================================================
-- Lo mismo que los leads (sql/leads_bcra_consulta.sql y sql/bcra_umbrales.sql), para
-- verlo en Seguimiento de conductores: columnas BCRA y Sit. BCRA, e indicador "BCRA rojo".
--
-- El servidor (server-bcra.js) consulta a los conductores ACTIVOS cuando no tienen
-- consulta o la última tiene más de 30 días (el BCRA informa una vez por mes). Va
-- después de los leads pendientes, en la misma vuelta de 5 minutos.
--
-- El color (verde / amarillo / rojo) sale de los mismos umbrales de
-- Parámetros > Riesgo BCRA; al cambiarlos se recalculan leads y conductores.
--
-- Para no esperar a la primera vuelta, los conductores que entraron como lead y ya se
-- consultaron en los últimos 30 días copian esa consulta (por DNI).
--
-- Requiere sql/bcra_umbrales.sql y sql/bcra_umbrales_situacion.sql.
-- Se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE conductores
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
  ADD COLUMN IF NOT EXISTS bcra_cuil_origen text,
  ADD COLUMN IF NOT EXISTS bcra_nivel text CHECK (bcra_nivel IN ('verde', 'amarillo', 'rojo')),
  ADD COLUMN IF NOT EXISTS bcra_nivel_motivo text;

-- Al cambiar el CUIT, el DNI o el nombre, la consulta anterior deja de valer
CREATE OR REPLACE FUNCTION public.conductores_bcra_reset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero_cuit IS DISTINCT FROM OLD.numero_cuit
     OR NEW.numero_dni IS DISTINCT FROM OLD.numero_dni
     OR ((NEW.nombres IS DISTINCT FROM OLD.nombres OR NEW.apellidos IS DISTINCT FROM OLD.apellidos)
         AND OLD.bcra_error IS NOT NULL) THEN
    NEW.bcra_consultado_at := NULL;
    NEW.bcra_error := NULL;
    NEW.bcra_intentos := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conductores_bcra_reset ON conductores;
CREATE TRIGGER conductores_bcra_reset
  BEFORE UPDATE OF numero_cuit, numero_dni, nombres, apellidos ON conductores
  FOR EACH ROW
  EXECUTE FUNCTION public.conductores_bcra_reset();

-- Nivel y motivo con los umbrales de Parámetros > Riesgo BCRA (misma función que los leads)
CREATE OR REPLACE FUNCTION public.conductores_bcra_nivel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.bcra_calcular_nivel(NEW.bcra_consultado_at, NEW.bcra_error,
    NEW.bcra_situacion, NEW.bcra_deuda_total, NEW.bcra_cheques, NEW.bcra_detalle);
  NEW.bcra_nivel := r.nivel;
  NEW.bcra_nivel_motivo := r.motivo;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conductores_bcra_nivel ON conductores;
CREATE TRIGGER conductores_bcra_nivel
  BEFORE INSERT OR UPDATE OF bcra_consultado_at, bcra_error, bcra_situacion, bcra_deuda_total,
                             bcra_cheques, bcra_detalle
  ON conductores
  FOR EACH ROW
  EXECUTE FUNCTION public.conductores_bcra_nivel();

-- Al cambiar los umbrales se recalculan leads Y conductores
CREATE OR REPLACE FUNCTION public.bcra_umbrales_recalcular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leads l
  SET bcra_nivel = n.nivel, bcra_nivel_motivo = n.motivo
  FROM leads x
  CROSS JOIN LATERAL public.bcra_calcular_nivel(x.bcra_consultado_at, x.bcra_error, x.bcra_situacion,
                                               x.bcra_deuda_total, x.bcra_cheques, x.bcra_detalle) n
  WHERE l.id = x.id
    AND x.bcra_consultado_at IS NOT NULL
    AND (l.bcra_nivel IS DISTINCT FROM n.nivel OR l.bcra_nivel_motivo IS DISTINCT FROM n.motivo);

  UPDATE conductores c
  SET bcra_nivel = n.nivel, bcra_nivel_motivo = n.motivo
  FROM conductores x
  CROSS JOIN LATERAL public.bcra_calcular_nivel(x.bcra_consultado_at, x.bcra_error, x.bcra_situacion,
                                               x.bcra_deuda_total, x.bcra_cheques, x.bcra_detalle) n
  WHERE c.id = x.id
    AND x.bcra_consultado_at IS NOT NULL
    AND (c.bcra_nivel IS DISTINCT FROM n.nivel OR c.bcra_nivel_motivo IS DISTINCT FROM n.motivo);
  RETURN NULL;
END;
$$;

-- Primera carga: copiar la consulta del lead (mismo DNI) si es de los últimos 30 días
UPDATE conductores c
SET bcra_consultado_at = l.bcra_consultado_at,
    bcra_situacion     = l.bcra_situacion,
    bcra_deuda_total   = l.bcra_deuda_total,
    bcra_cheques       = l.bcra_cheques,
    bcra_nombre        = l.bcra_nombre,
    bcra_resumen       = l.bcra_resumen,
    bcra_detalle       = l.bcra_detalle,
    bcra_error         = NULL,
    bcra_intentos      = 0,
    bcra_cuil          = l.bcra_cuil,
    bcra_cuil_origen   = l.bcra_cuil_origen
FROM (
  SELECT DISTINCT ON (regexp_replace(dni, '\D', '', 'g'))
         regexp_replace(dni, '\D', '', 'g') AS dni_norm, *
  FROM leads
  WHERE bcra_consultado_at > now() - interval '30 days'
    AND bcra_error IS NULL
    AND dni IS NOT NULL
  ORDER BY regexp_replace(dni, '\D', '', 'g'), bcra_consultado_at DESC
) l
WHERE c.bcra_consultado_at IS NULL
  AND regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g') = l.dni_norm
  AND l.dni_norm <> '';

COMMIT;

-- Comprobar (conductores activos)
SELECT c.bcra_nivel, count(*)
FROM conductores c
JOIN conductores_estados e ON e.id = c.estado_id
WHERE e.codigo = 'ACTIVO'
GROUP BY 1 ORDER BY 1;
