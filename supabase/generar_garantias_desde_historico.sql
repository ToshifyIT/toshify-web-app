-- ============================================================
-- SCRIPT: Generar registros de garantias_conductores desde histórico
-- Fecha: 2026-01-09
-- Descripción: Procesa datos históricos de facturación para crear
--              registros de garantía con el tracking de cuotas correcto
-- ============================================================

-- =====================================================
-- PASO 1: Crear tabla temporal para importar Excel
-- =====================================================
-- Esta tabla almacena los datos del Excel "Reporte-Facturacion.xlsx"
-- Importar el Excel a esta tabla usando la función de Supabase o pgAdmin

DROP TABLE IF EXISTS temp_facturacion_historico;
CREATE TABLE temp_facturacion_historico (
  id serial PRIMARY KEY,
  semana varchar(50),           -- "2025 SEMANA 11"
  corte_semana varchar(100),    -- "10 al 16 de Marzo del 2025"
  conductor varchar(255),
  dni varchar(50),
  cuit varchar(50),
  email varchar(255),
  patente varchar(20),
  flota varchar(100),
  turno varchar(20),            -- "TURNO" o "CARGO"
  valor_alquiler numeric DEFAULT 0,
  detalle_turno integer DEFAULT 7,
  cuota_garantia numeric DEFAULT 0,
  numero_cuota varchar(20),     -- "1 de 11", "2 de 11", "NA"
  valor_peaje numeric DEFAULT 0,
  detalle_peaje varchar(255),
  exceso_km numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE temp_facturacion_historico IS 'Tabla temporal para importar datos del Excel de facturación histórica';

-- =====================================================
-- PASO 2: Función para parsear "X de Y" → (X, Y)
-- =====================================================
CREATE OR REPLACE FUNCTION parse_numero_cuota(cuota_str text)
RETURNS TABLE(cuotas_pagadas integer, cuotas_totales integer) AS $$
DECLARE
  parts text[];
BEGIN
  -- Manejar NULL o vacío
  IF cuota_str IS NULL OR cuota_str = '' OR cuota_str = 'NA' OR cuota_str = '-' THEN
    RETURN QUERY SELECT 0::integer, 0::integer;
    RETURN;
  END IF;

  -- Parsear "X de Y" o "X/Y"
  IF position(' de ' in cuota_str) > 0 THEN
    parts := string_to_array(cuota_str, ' de ');
  ELSIF position('/' in cuota_str) > 0 THEN
    parts := string_to_array(cuota_str, '/');
  ELSE
    -- Intentar como número solo
    RETURN QUERY SELECT COALESCE(cuota_str::integer, 0), 20;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    COALESCE(NULLIF(trim(parts[1]), '')::integer, 0),
    COALESCE(NULLIF(trim(parts[2]), '')::integer, 20);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 3: Vista con el último estado de cuota por conductor
-- =====================================================
-- Esta vista obtiene el registro MÁS RECIENTE de cada conductor
-- para tener el estado actual de su garantía

CREATE OR REPLACE VIEW v_ultimo_estado_garantia AS
WITH ranked_records AS (
  SELECT
    h.*,
    c.id as conductor_id,
    (parse_numero_cuota(h.numero_cuota)).*,
    ROW_NUMBER() OVER (
      PARTITION BY h.dni
      ORDER BY
        -- Extraer año y semana para ordenar
        CASE
          WHEN h.semana ~ '^\d{4}' THEN SUBSTRING(h.semana FROM '^\d{4}')::integer
          ELSE 2025
        END DESC,
        CASE
          WHEN h.semana ~ 'SEMANA (\d+)' THEN (REGEXP_MATCH(h.semana, 'SEMANA (\d+)'))[1]::integer
          ELSE 1
        END DESC
    ) as rn
  FROM temp_facturacion_historico h
  LEFT JOIN conductores c ON
    REPLACE(REPLACE(h.dni, '.', ''), '-', '') = REPLACE(REPLACE(c.numero_dni, '.', ''), '-', '')
    OR REPLACE(REPLACE(h.cuit, '.', ''), '-', '') = REPLACE(REPLACE(c.numero_cuit, '.', ''), '-', '')
  WHERE h.numero_cuota IS NOT NULL
    AND h.numero_cuota != 'NA'
    AND h.numero_cuota != ''
    AND h.cuota_garantia > 0
)
SELECT
  r.dni,
  r.cuit,
  r.conductor,
  r.conductor_id,
  r.turno as tipo_alquiler,
  r.cuota_garantia as monto_cuota_semanal,
  r.cuotas_pagadas,
  r.cuotas_totales,
  r.semana as ultima_semana,
  r.numero_cuota as ultimo_numero_cuota
FROM ranked_records r
WHERE r.rn = 1;

-- =====================================================
-- PASO 4: Generar registros de garantias_conductores
-- =====================================================
-- EJECUTAR DESPUÉS DE IMPORTAR EL EXCEL

-- Verificar datos antes de insertar
SELECT
  'Conductores con garantías activas:' as descripcion,
  COUNT(*) as cantidad
FROM v_ultimo_estado_garantia
WHERE cuotas_pagadas > 0;

-- Previsualizar lo que se va a insertar
SELECT
  conductor,
  dni,
  conductor_id,
  tipo_alquiler,
  cuotas_pagadas,
  cuotas_totales,
  cuotas_pagadas * 50000 as monto_pagado_estimado,
  CASE
    WHEN cuotas_pagadas >= cuotas_totales THEN 'completada'
    WHEN cuotas_pagadas > 0 THEN 'en_curso'
    ELSE 'pendiente'
  END as estado
FROM v_ultimo_estado_garantia
WHERE conductor_id IS NOT NULL
ORDER BY conductor
LIMIT 50;

-- =====================================================
-- PASO 5: INSERTAR (descomentar para ejecutar)
-- =====================================================
/*
INSERT INTO garantias_conductores (
  conductor_id,
  conductor_nombre,
  conductor_dni,
  conductor_cuit,
  tipo_alquiler,
  monto_total,
  monto_cuota_semanal,
  cuotas_totales,
  cuotas_pagadas,
  monto_pagado,
  estado,
  created_by_name
)
SELECT
  v.conductor_id,
  v.conductor,
  v.dni,
  v.cuit,
  UPPER(v.tipo_alquiler),
  -- Monto total basado en tipo
  CASE
    WHEN UPPER(v.tipo_alquiler) = 'CARGO' THEN 1000000
    ELSE 800000
  END,
  -- Cuota semanal
  50000,
  -- Cuotas totales
  v.cuotas_totales,
  -- Cuotas pagadas
  v.cuotas_pagadas,
  -- Monto pagado
  v.cuotas_pagadas * 50000,
  -- Estado
  CASE
    WHEN v.cuotas_pagadas >= v.cuotas_totales THEN 'completada'
    WHEN v.cuotas_pagadas > 0 THEN 'en_curso'
    ELSE 'pendiente'
  END,
  'Import desde histórico'
FROM v_ultimo_estado_garantia v
WHERE v.conductor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM garantias_conductores g WHERE g.conductor_id = v.conductor_id
  );
*/

-- =====================================================
-- PASO 6: INSERTAR HISTORIAL DE PAGOS (garantias_pagos)
-- =====================================================
-- Genera un registro por cada cuota pagada usando los datos del Excel

-- Vista para obtener TODOS los pagos históricos (cada semana con cuota)
CREATE OR REPLACE VIEW v_historial_pagos_garantia AS
SELECT
  h.id as historico_id,
  h.dni,
  h.conductor,
  c.id as conductor_id,
  g.id as garantia_id,
  h.semana,
  h.corte_semana,
  h.cuota_garantia as monto,
  (parse_numero_cuota(h.numero_cuota)).cuotas_pagadas as numero_cuota,
  -- Extraer fecha aproximada del corte
  CASE
    WHEN h.corte_semana ~ '\d{2}/\d{2}/\d{4}' THEN
      TO_DATE((REGEXP_MATCH(h.corte_semana, '(\d{2}/\d{2}/\d{4})'))[1], 'DD/MM/YYYY')
    WHEN h.corte_semana ~ '\d{2} al \d{2} de \w+ del \d{4}' THEN
      -- Ejemplo: "10 al 16 de Marzo del 2025"
      CURRENT_DATE -- Fallback
    ELSE CURRENT_DATE
  END as fecha_pago_aprox
FROM temp_facturacion_historico h
LEFT JOIN conductores c ON
  REPLACE(REPLACE(h.dni, '.', ''), '-', '') = REPLACE(REPLACE(c.numero_dni, '.', ''), '-', '')
LEFT JOIN garantias_conductores g ON g.conductor_id = c.id
WHERE h.numero_cuota IS NOT NULL
  AND h.numero_cuota != 'NA'
  AND h.numero_cuota != ''
  AND h.cuota_garantia > 0
  AND c.id IS NOT NULL
  AND g.id IS NOT NULL;

-- Previsualizar pagos a insertar
SELECT
  conductor,
  dni,
  numero_cuota,
  monto,
  semana
FROM v_historial_pagos_garantia
ORDER BY dni, numero_cuota
LIMIT 100;

-- INSERTAR PAGOS (descomentar para ejecutar)
/*
INSERT INTO garantias_pagos (
  garantia_id,
  conductor_id,
  numero_cuota,
  monto,
  fecha_pago,
  referencia
)
SELECT DISTINCT ON (v.garantia_id, v.numero_cuota)
  v.garantia_id,
  v.conductor_id,
  v.numero_cuota,
  v.monto,
  v.fecha_pago_aprox,
  CONCAT('Import histórico - ', v.semana)
FROM v_historial_pagos_garantia v
WHERE NOT EXISTS (
  SELECT 1 FROM garantias_pagos p
  WHERE p.garantia_id = v.garantia_id
    AND p.numero_cuota = v.numero_cuota
)
ORDER BY v.garantia_id, v.numero_cuota, v.fecha_pago_aprox;
*/

-- =====================================================
-- PASO 7: Verificar resultado
-- =====================================================
/*
-- Resumen de garantías
SELECT
  estado,
  tipo_alquiler,
  COUNT(*) as cantidad,
  SUM(cuotas_pagadas) as total_cuotas_pagadas,
  SUM(monto_pagado) as total_monto_pagado
FROM garantias_conductores
GROUP BY estado, tipo_alquiler
ORDER BY estado, tipo_alquiler;

-- Resumen de pagos
SELECT
  g.conductor_nombre,
  g.cuotas_pagadas as cuotas_en_garantia,
  COUNT(p.id) as pagos_registrados,
  SUM(p.monto) as total_pagado
FROM garantias_conductores g
LEFT JOIN garantias_pagos p ON p.garantia_id = g.id
GROUP BY g.id, g.conductor_nombre, g.cuotas_pagadas
HAVING COUNT(p.id) > 0
ORDER BY g.conductor_nombre
LIMIT 50;
*/

-- =====================================================
-- LIMPIEZA (ejecutar después de migración exitosa)
-- =====================================================
/*
DROP VIEW IF EXISTS v_historial_pagos_garantia;
DROP VIEW IF EXISTS v_ultimo_estado_garantia;
DROP TABLE IF EXISTS temp_facturacion_historico;
DROP FUNCTION IF EXISTS parse_numero_cuota(text);
*/
