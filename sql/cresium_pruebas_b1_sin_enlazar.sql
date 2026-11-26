-- =====================================================
-- Cresium: dos transferencias de PRUEBA más, sin enlazar (sede Pruebas)
-- =====================================================
-- Para JUAN MANUEL PRUEBA (B1), pagadas por personas con otro CUIT: no entran solas a
-- nadie, quedan sin asignar en Saldos para enlazarlas a mano.
--
--  17  Raúl Prueba (otro CUIT)   hoy  $15.000
--  18  Laura Prueba (otro CUIT)  hoy  $ 7.000
--
-- Sede Pruebas, alegra_estado 'ignorado'. Ejecutar en el SQL Editor de Supabase.
-- Se puede correr de nuevo (no duplica).

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
  ('grupocg',  9000000000017::bigint, now() - interval '4 minutes', 'RAUL PRUEBA',  '20900000888', '0000003100000000008881', 15000::numeric),
  ('44dreams', 9000000000018::bigint, now() - interval '2 minutes', 'LAURA PRUEBA', '27900000666', '0000003100000000006661',  7000::numeric)
) AS v(empresa, cresium_id, procesado, contraparte, cuit, cuenta, importe)
ON CONFLICT (empresa, cresium_id) DO NOTHING;

-- Verificación: tienen que salir las 2, en la sede Pruebas
SELECT cresium_id, empresa, contraparte, importe, fecha, procesado_en, s.nombre AS sede
FROM public.cresium_movimientos m JOIN public.sedes s ON s.id = m.sede_id
WHERE cresium_id BETWEEN 9000000000017 AND 9000000000018
ORDER BY cresium_id;
