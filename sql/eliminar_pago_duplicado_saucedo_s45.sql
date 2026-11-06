-- Elimina el pago manual duplicado de FABIAN ARIEL SAUCEDO (DNI 25489022) del 03/11/2026:
-- "Pago en efectivo | Ingreso por DiDi" $43.900 en S45 (repite el del 26/10 en S44).
-- Borra el movimiento del kardex y su abono, corrige el saldo del movimiento siguiente
-- (04/11, $102.700) y el saldo actual: -202.398,64 → -246.298,64.
-- Respaldo en backup_eliminar_pago_saucedo_20261106.

BEGIN;

DO $$
DECLARE
  v_conductor uuid := 'bd37b312-070e-480d-92d7-cb009863c0f7';
  v_saldo numeric;
BEGIN
  SELECT saldo_actual INTO v_saldo FROM saldos_conductores WHERE conductor_id = v_conductor;
  IF v_saldo IS DISTINCT FROM -202398.64 THEN
    RAISE EXCEPTION 'El saldo cambió (%): revisar antes de corregir', v_saldo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control_saldos WHERE id = '7dcf4c11-b711-4246-87eb-b356cf260e46' AND monto_movimiento = 43900)
     OR NOT EXISTS (SELECT 1 FROM abonos_conductores WHERE id = '9c70adcd-dd6a-4084-9d98-9e839dba136c' AND monto = 43900)
     OR NOT EXISTS (SELECT 1 FROM control_saldos WHERE id = '37595894-410b-44eb-9af3-b5b3bb59df35' AND saldo_pendiente = -202398.64) THEN
    RAISE EXCEPTION 'Los movimientos no coinciden con lo esperado';
  END IF;
  -- No debe haber movimientos posteriores al del 04/11
  IF EXISTS (SELECT 1 FROM control_saldos WHERE conductor_id = v_conductor AND created_at > '2026-11-04 13:51:33.299569+00') THEN
    RAISE EXCEPTION 'Hay movimientos posteriores al 04/11: revisar antes de corregir';
  END IF;
END $$;

CREATE TABLE backup_eliminar_pago_saucedo_20261106 AS
SELECT 'control_saldos' AS tabla, to_jsonb(cs) AS fila FROM control_saldos cs
 WHERE cs.id IN ('7dcf4c11-b711-4246-87eb-b356cf260e46', '37595894-410b-44eb-9af3-b5b3bb59df35')
UNION ALL
SELECT 'abonos_conductores', to_jsonb(a) FROM abonos_conductores a WHERE a.id = '9c70adcd-dd6a-4084-9d98-9e839dba136c'
UNION ALL
SELECT 'saldos_conductores', to_jsonb(s) FROM saldos_conductores s WHERE s.conductor_id = 'bd37b312-070e-480d-92d7-cb009863c0f7';

DELETE FROM control_saldos WHERE id = '7dcf4c11-b711-4246-87eb-b356cf260e46';
DELETE FROM abonos_conductores WHERE id = '9c70adcd-dd6a-4084-9d98-9e839dba136c';

-- Movimiento siguiente (04/11): su saldo ya no incluye los $43.900
UPDATE control_saldos
SET saldo_pendiente = -246298.64, saldo_adeudado = 246298.64, saldo_a_favor = 0, updated_at = now()
WHERE id = '37595894-410b-44eb-9af3-b5b3bb59df35';

UPDATE saldos_conductores
SET saldo_actual = -246298.64, ultima_actualizacion = now(), updated_at = now()
WHERE conductor_id = 'bd37b312-070e-480d-92d7-cb009863c0f7';

-- Control
SELECT created_at, semana, tipo_movimiento, monto_movimiento, saldo_pendiente, referencia
FROM control_saldos WHERE conductor_id = 'bd37b312-070e-480d-92d7-cb009863c0f7' AND created_at > '2026-10-25'
ORDER BY created_at;
SELECT saldo_actual FROM saldos_conductores WHERE conductor_id = 'bd37b312-070e-480d-92d7-cb009863c0f7';

COMMIT;
