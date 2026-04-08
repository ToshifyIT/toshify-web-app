-- =====================================================
-- Script: Backfill regularizado S14/2026
-- Genera entradas "regularizado" en control_saldos
-- para conductores de la semana 14 que no las tienen.
--
-- PASO 1: Ejecutar el SELECT para ver qué se va a insertar
-- PASO 2: Si los datos son correctos, ejecutar el INSERT
-- =====================================================

-- ─────────────────────────────────────────────────────
-- PASO 1: DIAGNÓSTICO — ver conductores sin regularizado en S14
-- ─────────────────────────────────────────────────────
SELECT
  fc.conductor_id,
  fc.conductor_nombre,
  fc.conductor_dni,
  fc.conductor_cuit,
  fc.semana,
  fc.anio,
  fc.total_a_pagar,
  fc.saldo_anterior,
  sc.saldo_actual AS saldo_en_tabla_saldos,
  CASE
    WHEN cs_exist.id IS NOT NULL THEN 'YA EXISTE'
    ELSE 'FALTA'
  END AS estado_regularizado
FROM facturacion_conductores fc
JOIN periodos_facturacion pf ON pf.id = fc.periodo_id
LEFT JOIN saldos_conductores sc ON sc.conductor_id = fc.conductor_id
LEFT JOIN control_saldos cs_exist
  ON cs_exist.conductor_id = fc.conductor_id
  AND cs_exist.semana = pf.semana
  AND cs_exist.anio = pf.anio
  AND cs_exist.tipo_movimiento = 'regularizado'
WHERE pf.semana = 14
  AND pf.anio = 2026
  AND cs_exist.id IS NULL
ORDER BY fc.conductor_nombre;


-- ─────────────────────────────────────────────────────
-- PASO 2: INSERT — crear las entradas regularizado faltantes
-- Solo ejecutar después de validar el PASO 1
-- ─────────────────────────────────────────────────────
INSERT INTO control_saldos (
  conductor_id,
  conductor_nombre,
  conductor_dni,
  conductor_cuit,
  semana,
  anio,
  periodo_id,
  tipo_movimiento,
  monto_movimiento,
  referencia,
  saldo_adeudado,
  saldo_a_favor,
  saldo_pendiente,
  dias_mora,
  interes_mora,
  created_by_name,
  created_at
)
SELECT
  fc.conductor_id,
  fc.conductor_nombre,
  fc.conductor_dni,
  fc.conductor_cuit,
  pf.semana,
  pf.anio,
  pf.id AS periodo_id,
  'regularizado',
  ABS(fc.total_a_pagar),                         -- monto_movimiento (siempre positivo)
  'Facturación S' || pf.semana || '/' || pf.anio,
  CASE WHEN fc.total_a_pagar > 0 THEN fc.total_a_pagar ELSE 0 END,  -- saldo_adeudado
  CASE WHEN fc.total_a_pagar < 0 THEN ABS(fc.total_a_pagar) ELSE 0 END,  -- saldo_a_favor
  -fc.total_a_pagar,                             -- saldo_pendiente (negado: negativo = deuda)
  0,                                              -- dias_mora
  0,                                              -- interes_mora
  'Sistema (backfill)',
  NOW()
FROM facturacion_conductores fc
JOIN periodos_facturacion pf ON pf.id = fc.periodo_id
LEFT JOIN control_saldos cs_exist
  ON cs_exist.conductor_id = fc.conductor_id
  AND cs_exist.semana = pf.semana
  AND cs_exist.anio = pf.anio
  AND cs_exist.tipo_movimiento = 'regularizado'
WHERE pf.semana = 14
  AND pf.anio = 2026
  AND cs_exist.id IS NULL;


-- ─────────────────────────────────────────────────────
-- PASO 3: VERIFICACIÓN — confirmar que se insertaron
-- ─────────────────────────────────────────────────────
SELECT
  cs.conductor_nombre,
  cs.semana,
  cs.anio,
  cs.tipo_movimiento,
  cs.monto_movimiento,
  cs.saldo_pendiente,
  cs.referencia,
  cs.created_by_name,
  cs.created_at
FROM control_saldos cs
WHERE cs.semana = 14
  AND cs.anio = 2026
  AND cs.tipo_movimiento = 'regularizado'
ORDER BY cs.conductor_nombre;
