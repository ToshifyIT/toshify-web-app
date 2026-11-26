-- Regularizaciones de "Descuentos a favor" cargadas el 20/11/2026 con semana 47.
-- Corrigen la factura de una semana anterior (la que nombra la referencia), así que van con
-- esa semana. Con semana 47, el histórico de Saldos por semana cerrada mostraba deuda en
-- semanas que en realidad cerraron a favor (ej. Yolanda Morales al cierre de S46).
-- Solo cambia la semana del movimiento: el saldo y el monto quedan igual.
-- Aplicado el 26/11/2026.

BEGIN;

UPDATE control_saldos SET semana = 46
WHERE id = 'e48d8250-0454-4e3a-ada1-8e8bcb483191' AND semana = 47 AND anio = 2026; -- YOLANDA LEONOR MORALES

UPDATE control_saldos SET semana = 17
WHERE id = '02bd2f27-dd46-4333-b973-9a56855b87af' AND semana = 47 AND anio = 2026; -- RUBEN EXEQUIEL ALANIS NAVARRO

UPDATE control_saldos SET semana = 12
WHERE id = '6d2bfa72-635e-4f44-b526-57f0e6280b00' AND semana = 47 AND anio = 2026; -- JOSE GREGORIO DOBOBUTO CADEVILLA

COMMIT;

-- Para volver atrás:
-- UPDATE control_saldos SET semana = 47
-- WHERE id IN ('e48d8250-0454-4e3a-ada1-8e8bcb483191', '02bd2f27-dd46-4333-b973-9a56855b87af',
--              '6d2bfa72-635e-4f44-b526-57f0e6280b00');
