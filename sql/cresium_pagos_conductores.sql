-- =====================================================
-- Cresium: depósitos de conductores que entran solos al saldo como pago
-- =====================================================
-- Desde el 26/11/2026 a las 12:00 (hora Argentina), cada depósito que entra a Cresium (44 Dreams o Grupo CG) y se cruza
-- con un conductor (CUIT, DNI del CUIL, CBU, quien paga por él o asignado en Licencia B1)
-- se carga como pago en su saldo: "Transferencia bancaria" (o "Transferencia bancaria - B1"
-- si ese día paga por día con la promoción de licencia B1). Lo hace el servidor
-- (server-cresium-pagos.js) cada 10 minutos, después de traer los movimientos.
--
-- Estas columnas marcan qué pasó con cada depósito, para no cargarlo dos veces:
--   pago_cargado_en       cuándo entró al saldo (null = todavía no)
--   pago_conductor_id     a qué conductor
--   pago_abono_id         el abono que lo registra (abonos_conductores)
--   pago_control_saldo_id el movimiento del historial (control_saldos); si se omitió por
--                         estar ya cargado a mano, el pago manual con el que se emparejó
--   pago_omitido          por qué no entró: 'ya_cargado_a_mano'
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

ALTER TABLE public.cresium_movimientos
  ADD COLUMN IF NOT EXISTS pago_cargado_en timestamptz,
  ADD COLUMN IF NOT EXISTS pago_conductor_id uuid REFERENCES public.conductores(id),
  ADD COLUMN IF NOT EXISTS pago_abono_id uuid REFERENCES public.abonos_conductores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago_control_saldo_id uuid REFERENCES public.control_saldos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago_omitido text;

-- Depósitos pendientes de cargar (lo que el servidor revisa cada 10 minutos)
CREATE INDEX IF NOT EXISTS cresium_movimientos_pago_pendiente
  ON public.cresium_movimientos (fecha)
  WHERE direccion = 'entrada' AND pago_cargado_en IS NULL AND pago_omitido IS NULL;

-- Para mostrar la fecha de la transferencia en el historial del conductor
CREATE INDEX IF NOT EXISTS cresium_movimientos_pago_control_saldo
  ON public.cresium_movimientos (pago_control_saldo_id)
  WHERE pago_control_saldo_id IS NOT NULL;

COMMIT;

-- Verificación: tienen que salir las 5 columnas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cresium_movimientos' AND column_name LIKE 'pago_%'
ORDER BY column_name;
