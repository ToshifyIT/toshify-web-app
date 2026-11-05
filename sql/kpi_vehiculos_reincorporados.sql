-- sql/kpi_vehiculos_reincorporados.sql
-- Vehículos que VOLVIERON a estar operativos (PKG ON o En uso) en un rango de fechas:
-- salieron de taller, se recuperaron de un robo, pasaron de PKG OFF a PKG ON, etc.
-- Cada uno habilita 2 turnos nuevos, igual que un auto nuevo (Dashboard General,
-- tarjeta "Turnos por vehículos habilitados").
--
-- Sale de historial_vehiculos: cada cambio con estado_nuevo operativo cuyo estado
-- anterior NO era operativo. El estado anterior es estado_anterior si se guardó; si no,
-- el estado_nuevo del registro anterior de ese vehículo (misma lógica que usa
-- sql/dashboard_kpis_v2.sql para reconstruir la flota). Acepta códigos o descripciones
-- (EN_USO / "En uso"). Pasar de PKG ON a En uso (o al revés) no cuenta: ya estaba
-- operativo. Uno por vehículo y día.
--
--   supabase.rpc('kpi_vehiculos_reincorporados', { p_sede_id, p_desde, p_hasta })
--
-- Se puede correr más de una vez.

CREATE OR REPLACE FUNCTION kpi_estado_es_operativo(p_estado text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT d = 'en uso' OR d LIKE 'pkg on%'
  FROM (
    SELECT btrim(regexp_replace(
      translate(lower(replace(COALESCE(p_estado, ''), '_', ' ')), 'áéíóúüñ', 'aeiouun'),
      '\s+', ' ', 'g')) AS d
  ) x
$$;

CREATE OR REPLACE FUNCTION kpi_vehiculos_reincorporados(
  p_sede_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (fecha date, vehiculo_id uuid, patente text, estado_anterior text, estado_nuevo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH cambios AS (
    SELECT h.vehiculo_id,
           (h.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
           h.created_at,
           h.estado_nuevo,
           COALESCE(
             NULLIF(btrim(h.estado_anterior), ''),
             LAG(h.estado_nuevo) OVER (PARTITION BY h.vehiculo_id ORDER BY h.created_at)
           ) AS estado_previo
    FROM historial_vehiculos h
    WHERE NULLIF(btrim(h.estado_nuevo), '') IS NOT NULL
  ),
  vueltas AS (
    SELECT DISTINCT ON (c.vehiculo_id, c.fecha)
           c.fecha, c.vehiculo_id, c.estado_previo, c.estado_nuevo
    FROM cambios c
    WHERE kpi_estado_es_operativo(c.estado_nuevo)
      AND c.estado_previo IS NOT NULL
      AND NOT kpi_estado_es_operativo(c.estado_previo)
      AND (p_desde IS NULL OR c.fecha >= p_desde)
      AND (p_hasta IS NULL OR c.fecha <= p_hasta)
    ORDER BY c.vehiculo_id, c.fecha, c.created_at DESC
  )
  SELECT v.fecha, v.vehiculo_id, ve.patente, v.estado_previo, v.estado_nuevo
  FROM vueltas v
  JOIN vehiculos ve ON ve.id = v.vehiculo_id
  WHERE ve.deleted_at IS NULL
    AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
    AND ve.patente !~* '^PRB'
  ORDER BY v.fecha, ve.patente
$fn$;

GRANT EXECUTE ON FUNCTION kpi_vehiculos_reincorporados(uuid, date, date) TO authenticated;
