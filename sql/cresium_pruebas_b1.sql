-- =====================================================
-- Cresium: transferencias de PRUEBA para Licencia B1 (sede Pruebas)
-- =====================================================
-- Conductor: JUAN MANUEL PRUEBA (sede Pruebas), pasado a licencia B1 con reingreso el
-- 23/11/2026 y CUIT de prueba 20900000999. Debe $15.000 por día desde el 23/11.
-- Sede Pruebas, cresium_id 9000000000013 a 16 (las de prueba van desde 9000000000000:
-- lo contable las ignora), alegra_estado 'ignorado' (nunca van a Alegra).
--
--  13  Juan Manuel (su CUIT)  23/11 18:00  $15.000  -> cubre el 23 (antes del corte del 26/11
--                                                     12:00: cuenta en B1, no entra al saldo)
--  14  Juan Manuel (su CUIT)  24/11 19:30  $30.000  -> cubre el 24 y el 25 (un pago, dos días)
--  15  Juan Manuel (su CUIT)  hoy          $10.000  -> el 26 queda parcial; entra solo al saldo
--  16  Sofía Prueba (otro CUIT, familiar)  hoy  $5.000 -> queda sin asignar; al enlazarla a
--                                                     Juan Manuel en Saldos (con "Recordar")
--                                                     el 26 queda completo
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr de nuevo (no duplica).

INSERT INTO public.cresium_movimientos (
  empresa, cresium_id, fecha, procesado_en, direccion, tipo, estado,
  contraparte, cuit, cuenta_contraparte, banco_contraparte, importe, impuesto, nota,
  alegra_estado, sede_id
)
SELECT v.empresa, v.cresium_id, (v.procesado AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
       v.procesado, 'entrada', 'DEPOSIT', 'SUCCESS',
       v.contraparte, v.cuit, v.cuenta, 'Banco de prueba', v.importe, 0, 'PRUEBA B1',
       'ignorado', (SELECT id FROM public.sedes WHERE codigo = 'PRUEBAS')
FROM (VALUES
  ('grupocg',  9000000000013::bigint, '2026-11-23 21:00:00+00'::timestamptz, 'JUAN MANUEL PRUEBA', '20900000999', '0000003100000000009991', 15000::numeric),
  ('44dreams', 9000000000014::bigint, '2026-11-24 22:30:00+00'::timestamptz, 'JUAN MANUEL PRUEBA', '20900000999', '0000003100000000009991', 30000::numeric),
  ('grupocg',  9000000000015::bigint, now() - interval '15 minutes',         'JUAN MANUEL PRUEBA', '20900000999', '0000003100000000009991', 10000::numeric),
  ('grupocg',  9000000000016::bigint, now() - interval '5 minutes',          'SOFIA PRUEBA',       '27900000777', '0000003100000000007771',  5000::numeric)
) AS v(empresa, cresium_id, procesado, contraparte, cuit, cuenta, importe)
ON CONFLICT (empresa, cresium_id) DO NOTHING;

-- Verificación: tienen que salir las 4, en la sede Pruebas
SELECT cresium_id, empresa, contraparte, importe, fecha, procesado_en, s.nombre AS sede
FROM public.cresium_movimientos m JOIN public.sedes s ON s.id = m.sede_id
WHERE cresium_id BETWEEN 9000000000013 AND 9000000000016
ORDER BY cresium_id;
