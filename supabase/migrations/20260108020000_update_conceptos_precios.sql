-- =============================================================================
-- ACTUALIZACIÓN DE PRECIOS EN CONCEPTOS_NOMINA
-- Basado en el reporte de Bruno Timoteo Mancuello 2025
-- Fecha: 2026-01-08
-- =============================================================================

-- IMPORTANTE: Los valores se actualizan según el reporte operativo real

-- =============================================================================
-- 1. ACTUALIZAR PRECIOS DE ALQUILER
-- =============================================================================

-- P001: ALQUILER DE VEHICULO TURNO
-- Bruno muestra $300,000/semana
-- Con IVA 21%: precio_base = 300000 / 1.21 = 247,933.88
UPDATE conceptos_nomina
SET
  precio_base = 247933.88,
  iva_porcentaje = 21,
  precio_final = 300000.00,
  descripcion = 'ALQUILER DE VEHICULO TURNO',
  updated_at = NOW()
WHERE codigo = 'P001';

-- P002: ALQUILER DE VEHICULO A CARGO
-- Según operaciones: $360,000/semana
-- Con IVA 21%: precio_base = 360000 / 1.21 = 297,520.66
UPDATE conceptos_nomina
SET
  precio_base = 297520.66,
  iva_porcentaje = 21,
  precio_final = 360000.00,
  descripcion = 'ALQUILER DE VEHICULO A CARGO',
  updated_at = NOW()
WHERE codigo = 'P002';

-- =============================================================================
-- 2. ACTUALIZAR GARANTÍA
-- =============================================================================

-- P003: CUOTA DE GARANTIA
-- Bruno muestra $80,000/semana (exento IVA)
UPDATE conceptos_nomina
SET
  precio_base = 80000.00,
  iva_porcentaje = 0,
  precio_final = 80000.00,
  descripcion = 'CUOTA DE GARANTIA',
  updated_at = NOW()
WHERE codigo = 'P003';

-- =============================================================================
-- 3. AGREGAR CONCEPTO P008 (MORA) si no existe
-- =============================================================================

-- P008: MORA / INTERESES (5% flat según Bruno)
INSERT INTO conceptos_nomina (
  codigo, descripcion, precio_base, iva_porcentaje, precio_final,
  tipo, es_variable, aplica_turno, aplica_cargo, orden
)
VALUES (
  'P008', 'MORA (5%)', 0, 0, 0,
  'penalidad', true, true, true, 8
)
ON CONFLICT (codigo) DO UPDATE SET
  descripcion = 'MORA (5%)',
  iva_porcentaje = 0,
  tipo = 'penalidad',
  updated_at = NOW();

-- =============================================================================
-- 4. CORREGIR P009 si es necesario
-- =============================================================================

-- P009: Renombrar para claridad (diferente de mora)
UPDATE conceptos_nomina
SET
  descripcion = 'INTERESES FINANCIEROS',
  iva_porcentaje = 0,
  precio_final = precio_base,
  updated_at = NOW()
WHERE codigo = 'P009';

-- =============================================================================
-- 5. ACTUALIZAR OTROS CONCEPTOS PARA CONSISTENCIA DE IVA
-- =============================================================================

-- P005: PEAJE - IVA Exento
UPDATE conceptos_nomina
SET
  iva_porcentaje = 0,
  precio_final = precio_base,
  updated_at = NOW()
WHERE codigo = 'P005';

-- P006: EXCESO DE KM - IVA 21% (es variable, el monto se calcula)
UPDATE conceptos_nomina
SET
  iva_porcentaje = 21,
  updated_at = NOW()
WHERE codigo = 'P006';

-- P007: MULTAS/INFRACCIONES - IVA Exento
UPDATE conceptos_nomina
SET
  iva_porcentaje = 0,
  precio_final = precio_base,
  updated_at = NOW()
WHERE codigo = 'P007';

-- P010: REPUESTOS/DAÑOS - IVA Exento
UPDATE conceptos_nomina
SET
  iva_porcentaje = 0,
  precio_final = precio_base,
  updated_at = NOW()
WHERE codigo = 'P010';

-- =============================================================================
-- 6. VERIFICACIÓN FINAL
-- =============================================================================
SELECT
  codigo,
  descripcion,
  precio_base,
  iva_porcentaje,
  precio_final,
  tipo,
  es_variable,
  CASE
    WHEN iva_porcentaje = 21 THEN 'IVA 21%'
    WHEN iva_porcentaje = 0 THEN 'Exento'
    ELSE 'Otro'
  END as estado_iva
FROM conceptos_nomina
WHERE activo = true
ORDER BY orden;
