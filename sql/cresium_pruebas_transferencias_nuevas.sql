-- =====================================================
-- Cresium: transferencias de PRUEBA nuevas (sede Pruebas)
-- =====================================================
-- Para probar la carga automática de pagos (server-cresium-pagos.js) y Saldos > Registrar
-- Pago > Transferencia con "Recordar que esta persona paga por este conductor".
-- Hora = ahora (posterior al corte del 26/11 12:00). Sede Pruebas, cresium_id desde
-- 9000000000007 (las de prueba van desde 9000000000000: lo contable las ignora),
-- alegra_estado 'ignorado' (nunca van a Alegra).
--
--   7  Marta Prueba (familiar de Carlos Prueba, otro CUIT)  $12.000  -> enlazar a mano y recordar
--   8  Marta Prueba                                          $ 8.000  -> después entra sola a Carlos
--   9  Ana Prueba RC (su CUIT)                               $20.000  -> entra sola por CUIT
--  10  Persona que no es de nadie                            $ 3.000  -> queda sin asignar
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr de nuevo (no duplica).

INSERT INTO public.cresium_movimientos (
  empresa, cresium_id, fecha, procesado_en, direccion, tipo, estado,
  contraparte, cuit, cuenta_contraparte, banco_contraparte, importe, impuesto, nota,
  alegra_estado, sede_id
)
SELECT v.empresa, v.cresium_id, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
       now() - v.hace, 'entrada', 'DEPOSIT', 'SUCCESS',
       v.contraparte, v.cuit, v.cuenta, 'Banco de prueba', v.importe, 0, 'PRUEBA Saldos',
       'ignorado', (SELECT id FROM public.sedes WHERE codigo = 'PRUEBAS')
FROM (VALUES
  ('grupocg',  9000000000007::bigint, interval '20 minutes', 'MARTA PRUEBA',          '27900000998', '0000003100000000009981', 12000::numeric),
  ('grupocg',  9000000000008::bigint, interval '10 minutes', 'MARTA PRUEBA',          '27900000998', '0000003100000000009981',  8000::numeric),
  ('44dreams', 9000000000009::bigint, interval '15 minutes', 'ANA PRUEBA RC',         '27900000115', '0000003100000000001151', 20000::numeric),
  ('grupocg',  9000000000010::bigint, interval '5 minutes',  'OTRA PERSONA SIN CONDUCTOR', '20999999981', '0000003100000000099981',  3000::numeric)
) AS v(empresa, cresium_id, hace, contraparte, cuit, cuenta, importe)
ON CONFLICT (empresa, cresium_id) DO NOTHING;

-- Verificación: tienen que salir las 4, en la sede Pruebas
SELECT cresium_id, empresa, contraparte, importe, procesado_en, s.nombre AS sede
FROM public.cresium_movimientos m JOIN public.sedes s ON s.id = m.sede_id
WHERE cresium_id BETWEEN 9000000000007 AND 9000000000010
ORDER BY cresium_id;
