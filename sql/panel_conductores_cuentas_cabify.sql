-- =====================================================
-- Seguimiento de Conductores: cuentas de Cabify sin bajar el histórico (2026-11-24)
-- =====================================================
-- Para la etiqueta «Cabify» de la columna de apps, el panel bajaba TODO cabify_historico
-- de las últimas 9 semanas (unas 11.000 filas, en 11 tandas de 1000 una detrás de otra,
-- unos 7 s) solo para saber qué personas tienen cuenta. Esta función devuelve una fila
-- por cuenta (dni, nombre, apellido) y ya traduce los DNI que llegan como hash
-- (CABIFY_...) con cabify_dni_mapeo, igual que hacía el panel.
-- SECURITY INVOKER: respeta los permisos (RLS) de quien consulta, igual que la tabla.
-- Si la función no existe, el panel sigue funcionando como antes (más lento).
-- Se puede ejecutar más de una vez.

CREATE OR REPLACE FUNCTION public.panel_cuentas_cabify(p_desde timestamptz)
RETURNS TABLE (dni text, nombre text, apellido text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cuentas AS (
    SELECT DISTINCT h.dni, h.nombre, h.apellido
    FROM cabify_historico h
    WHERE h.fecha_inicio >= p_desde
  )
  SELECT
    CASE
      WHEN left(c.dni, 7) = 'CABIFY_'
        THEN (SELECT m.dni_real FROM cabify_dni_mapeo m WHERE m.cabify_hash = c.dni LIMIT 1)
      ELSE c.dni
    END::text AS dni,
    c.nombre::text,
    c.apellido::text
  FROM cuentas c;
$$;

GRANT EXECUTE ON FUNCTION public.panel_cuentas_cabify(timestamptz) TO authenticated;

-- Índice para filtrar por fecha sin recorrer toda la tabla
CREATE INDEX IF NOT EXISTS idx_cabify_historico_fecha_inicio
  ON cabify_historico (fecha_inicio);

-- Comprobar (debería dar unos cientos de filas, no miles)
-- SELECT count(*) FROM panel_cuentas_cabify(now() - interval '63 days');
