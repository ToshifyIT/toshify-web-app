-- =============================================================================
-- CORRECCIÓN DE IVA EN CONCEPTOS DE FACTURACIÓN
-- Según reunión del 07/01/2026
-- =============================================================================

-- P001/P002 (Alquiler): 21% IVA
-- Alquiler a Cargo y Alquiler a Turno deben tener IVA del 21%
UPDATE conceptos_nomina
SET
  iva_porcentaje = 21,
  precio_final = precio_base * 1.21,
  updated_at = NOW()
WHERE codigo IN ('P001', 'P002');

-- P003, P004, P005, P007, P009, P010: IVA Exento (0%)
-- Garantía, Tickets a Favor, Telepeajes, Multas, Mora, Reparaciones
UPDATE conceptos_nomina
SET
  iva_porcentaje = 0,
  precio_final = precio_base,
  updated_at = NOW()
WHERE codigo IN ('P003', 'P004', 'P005', 'P007', 'P009', 'P010');

-- P006 (Exceso Kilometraje): 21% IVA (verificar que esté correcto)
UPDATE conceptos_nomina
SET
  iva_porcentaje = 21,
  precio_final = precio_base * 1.21,
  updated_at = NOW()
WHERE codigo = 'P006';

-- Verificar cambios
SELECT
  codigo,
  descripcion,
  precio_base,
  iva_porcentaje,
  precio_final,
  CASE
    WHEN iva_porcentaje = 21 THEN 'Con IVA 21%'
    WHEN iva_porcentaje = 0 THEN 'IVA Exento'
    ELSE 'Otro'
  END as estado_iva
FROM conceptos_nomina
WHERE codigo IN ('P001', 'P002', 'P003', 'P004', 'P005', 'P006', 'P007', 'P009', 'P010')
ORDER BY codigo;
