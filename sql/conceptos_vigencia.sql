-- Vigencia de conceptos de facturación (etapa 1)
--
-- Los conceptos que se firman en el contrato (alquileres, garantía) pueden
-- convivir en varias versiones: cada conductor sigue con la que firmó hasta que
-- firme otra. Para eso cada concepto puede llevar:
--   tiene_vigencia  marca el concepto como versionado
--   vigente_desde   día desde el que se puede elegir (obligatorio si tiene vigencia)
--   vigente_hasta   vacío = sin vencimiento
--   periodo         etiqueta de la versión, ej. 'ENE-26'. En los nuevos se calcula
--                   del mes de vigente_desde; en los existentes se respeta la de hoy.
--
-- Los gastos fijos que no se firman (peajes, multas, intereses) quedan sin
-- vigencia y se actualizan editando el precio, como hasta ahora.
-- Esta etapa no cambia Asignaciones, Entrega ni Programación.

ALTER TABLE public.conceptos_nomina
  ADD COLUMN IF NOT EXISTS tiene_vigencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date,
  ADD COLUMN IF NOT EXISTS periodo text;

ALTER TABLE public.conceptos_nomina
  DROP CONSTRAINT IF EXISTS conceptos_nomina_vigencia_chk;
ALTER TABLE public.conceptos_nomina
  ADD CONSTRAINT conceptos_nomina_vigencia_chk CHECK (
    NOT tiene_vigencia
    OR (vigente_desde IS NOT NULL
        AND periodo IS NOT NULL
        AND (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde))
  );

-- Alquileres ENE-26 (P001, P002, P013, P014, P015, P016): desde el 01/01/26.
UPDATE public.conceptos_nomina
SET tiene_vigencia = true, vigente_desde = DATE '2026-01-01', periodo = 'ENE-26'
WHERE codigo IN ('P001', 'P002', 'P013', 'P014', 'P015', 'P016');

-- Alquileres OCT-26 (P021 a P026): desde la primera asignación que tomó el
-- precio nuevo (ASG-20260903-165953, inicio 04/09/26). El período se mantiene
-- OCT-26 como dice su nombre, aunque el mes de inicio sea septiembre.
UPDATE public.conceptos_nomina
SET tiene_vigencia = true, vigente_desde = DATE '2026-09-04', periodo = 'OCT-26'
WHERE codigo IN ('P021', 'P022', 'P023', 'P024', 'P025', 'P026');

-- Cuota de garantía (P003): desde la primera asignación del sistema (03/01/26).
-- Conserva su nombre; cuando cambie se desactiva y se crea la versión nueva.
UPDATE public.conceptos_nomina
SET tiene_vigencia = true, vigente_desde = DATE '2026-01-03', periodo = 'ENE-26'
WHERE codigo = 'P003';

-- Verificación
SELECT codigo, descripcion, tiene_vigencia, vigente_desde, vigente_hasta, periodo
FROM public.conceptos_nomina
ORDER BY codigo;
