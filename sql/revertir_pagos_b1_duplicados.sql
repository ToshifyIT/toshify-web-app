-- Revierte dos pagos B1 que entraron al saldo de más el 26/11/2026 (00:58), al probar el
-- paso de los pagos B1 al saldo:
--   · DIEGO DANIEL DÍAZ: el depósito de Cresium de $195.822 es el mismo que ya estaba
--     cargado el 24/11 como "Pago en efectivo". Se borra el movimiento B1 y su abono, el
--     saldo vuelve a -$0,08 y el depósito queda excluido de la promoción (no se vuelve a tomar).
--   · YANINA ELIZABETH VARGAS: su pago B1 de $45.000 entró dos veces (dos cargas a la vez).
--     Se borra el segundo movimiento y el abono que quedó suelto; el saldo vuelve a $45.566,72.
-- Aplicado el 26/11/2026 desde la app. Este archivo documenta el cambio y cómo deshacerlo.

BEGIN;

-- Diego Díaz
DELETE FROM control_saldos WHERE id = 'defc199c-b2a3-48ea-9eb1-8cf9e381e5fe'; -- +195.822, saldo 195.821,92
DELETE FROM abonos_conductores WHERE id = 'd8c46794-afcb-4597-816f-c10dd92cdb8e';
UPDATE saldos_conductores SET saldo_actual = -0.08 WHERE id = '929d3089-5e58-40fd-b274-ec9e52d02933' AND saldo_actual = 195821.92;
UPDATE promocion_b1_pagos SET abono_id = NULL, origen = 'excluido'
WHERE id = '399e80dd-e278-4979-a38f-aeeb62942d7a'; -- antes: origen 'cresium', abono_id d8c46794-...

-- Yanina Vargas
DELETE FROM control_saldos WHERE id = '0345c138-b32f-465f-843b-b6ff0ab64a6e'; -- segundo +45.000, saldo 90.566,72
DELETE FROM abonos_conductores WHERE id = '309c9875-68b9-4df5-9712-92111afcf113'; -- abono suelto (el registro usa ff3538d9-...)
UPDATE saldos_conductores SET saldo_actual = 45566.72 WHERE id = 'd54ab888-2b9d-46c5-98ca-7e01e05685dc' AND saldo_actual = 90566.72;

COMMIT;
