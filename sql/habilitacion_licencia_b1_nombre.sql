-- =====================================================
-- Licencia B1: no es una promoción, es una habilitación (solo cambia el nombre)
-- =====================================================
-- Hasta ahora solo se aceptaban conductores con licencia D1. Hasta el 31/12 se habilitó
-- que entren conductores con licencia B1, con la condición de pagar $15.000 por día como
-- garantía de que de verdad están trabajando. Quedó cargado en la tabla promociones (PRM02,
-- clave CYBER_LICENCIA_B1) para manejar su período desde Parámetros > Promociones, al lado
-- de PRM01, que sí es una promoción.
--
-- Este script solo cambia el nombre y la descripción. NO toca la clave (la usa el sistema),
-- ni el código PRM02, ni las fechas, ni si está activa.
-- El cambio queda en promociones_historial si la tabla tiene el trigger de historial.
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr de nuevo.

BEGIN;

UPDATE public.promociones
SET
  nombre = 'Habilitación licencia B1 (pago diario)',
  descripcion = 'Habilitación temporal: hasta el 31/12 se aceptan conductores con licencia B1 (antes solo D1), con la condición de pagar $15.000 por día como garantía de que está trabajando, hasta obtener la D1, darse de baja o el 31/12.'
WHERE clave = 'CYBER_LICENCIA_B1';

-- Debe devolver una fila con el nombre nuevo
SELECT codigo, clave, nombre, descripcion, fecha_inicio, fecha_fin, activa
FROM public.promociones
WHERE clave = 'CYBER_LICENCIA_B1';

COMMIT;

-- Para deshacer (nombre anterior):
--   UPDATE public.promociones SET nombre = 'Cyber Toshi: licencia B1 con pago diario'
--   WHERE clave = 'CYBER_LICENCIA_B1';
