-- Regularización de saldos: facturas con total a favor que el Pago Cabify dejó como deuda.
--
-- Causa (corregida en el código, F3 del checklist): al registrar el pago se usaba el total
-- de la factura sin signo, así que una factura a favor quedaba como deuda en el saldo, y la
-- semana siguiente la arrastraba como saldo anterior.
--
-- Casos (sede Buenos Aires):
--   RUBEN EXEQUIEL ALANIS NAVARRO (DNI 24758188): S17/2026 a favor 11.999,97 quedó como deuda
--     y la S29 la cobró. Hay que sumarle 23.999,94.  Saldo: -267.301,47 -> -243.301,53
--   JOSE GREGORIO DOBOBUTO CADEVILLA (DNI 96457279): S12/2026 a favor 12.857,14 quedó como
--     deuda (-12.857,57) y la S30 la cobró. Hay que sumarle 25.714,71.
--     Saldo: -155.356,07 -> -129.641,36
--
-- Cada bloque solo actúa si el saldo sigue siendo el actual (si alguien lo cambió, no hace
-- nada). Correr todo junto.

BEGIN;

-- RUBEN EXEQUIEL ALANIS NAVARRO
WITH s AS (
  UPDATE saldos_conductores
  SET saldo_actual = -243301.53, ultima_actualizacion = now()
  WHERE id = 'bc4a3d18-e2c5-4af4-8983-1427e51ec074' AND saldo_actual = -267301.47
  RETURNING conductor_id, conductor_nombre, conductor_dni, conductor_cuit
)
INSERT INTO control_saldos (conductor_id, conductor_nombre, conductor_dni, conductor_cuit, semana, anio,
  tipo_movimiento, monto_movimiento, referencia, saldo_adeudado, saldo_a_favor, saldo_pendiente, created_by_name)
SELECT conductor_id, conductor_nombre, conductor_dni, conductor_cuit, 47, 2026,
  'ajuste_manual', 23999.94, 'Regularización de saldo S17/2026 - Descuentos a favor', 243301.53, 0, -243301.53, 'Administrador'
FROM s;

-- JOSE GREGORIO DOBOBUTO CADEVILLA
WITH s AS (
  UPDATE saldos_conductores
  SET saldo_actual = -129641.36, ultima_actualizacion = now()
  WHERE id = '265fa7f2-2f4a-4f6b-8c1d-52f407e6810a' AND saldo_actual = -155356.07
  RETURNING conductor_id, conductor_nombre, conductor_dni, conductor_cuit
)
INSERT INTO control_saldos (conductor_id, conductor_nombre, conductor_dni, conductor_cuit, semana, anio,
  tipo_movimiento, monto_movimiento, referencia, saldo_adeudado, saldo_a_favor, saldo_pendiente, created_by_name)
SELECT conductor_id, conductor_nombre, conductor_dni, conductor_cuit, 47, 2026,
  'ajuste_manual', 25714.71, 'Regularización de saldo S12/2026 - Descuentos a favor', 129641.36, 0, -129641.36, 'Administrador'
FROM s;

-- YOLANDA LEONOR MORALES (ya regularizada): solo cambia el texto del movimiento
UPDATE control_saldos
SET referencia = 'Regularización de saldo S46/2026 - Descuentos a favor (falla vehicular)'
WHERE id = 'e48d8250-0454-4e3a-ada1-8e8bcb483191';

-- Verificación: tienen que salir los tres con el saldo nuevo
SELECT conductor_nombre, saldo_actual FROM saldos_conductores
WHERE id IN ('bc4a3d18-e2c5-4af4-8983-1427e51ec074', '265fa7f2-2f4a-4f6b-8c1d-52f407e6810a')
   OR conductor_dni = '24814424';

COMMIT;
