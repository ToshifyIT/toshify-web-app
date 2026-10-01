-- =====================================================
-- Onboarding: leads programados en programaciones_onboarding
-- =====================================================
-- Permite que un turno de una programación lo ocupe alguien que TODAVÍA no es
-- conductor (un lead del pipeline).
--
-- Modelo: cuando el slot lo ocupa un lead, `conductor_<turno>_id` queda NULL a
-- propósito y sólo se cargan `conductor_<turno>_nombre` y `_dni`. Ese estado ya
-- era válido antes de estas columnas:
--   * "Enviar a entrega" valida `conductor_X_id OR conductor_X_nombre`, y
--   * el INSERT en `asignaciones_conductores` está condicionado a que exista el
--     id, así que ninguna FK se rompe.
-- Lo único que faltaba era saber A QUÉ lead corresponde ese nombre: eso es lo
-- que guardan estas tres columnas.
--
-- Consecuencia aceptada: al enviar a entrega NO se crea la fila de
-- `asignaciones_conductores` de ese turno. El vínculo persona-vehículo queda
-- pendiente hasta que el lead se convierta a conductor, más adelante.
--
-- NOTA: la vista `v_programaciones_onboarding` NO expone estas columnas (una
-- vista no incorpora columnas agregadas después de su creación). No hace falta
-- recrearla: el módulo v2 las lee aparte de la tabla base (`adjuntarLeadIds` en
-- ProgramacionV2Module.tsx) y las pega al resultado de la vista.
--
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

BEGIN;

-- 1) Columnas ---------------------------------------------------------------
ALTER TABLE programaciones_onboarding
  ADD COLUMN IF NOT EXISTS lead_diurno_id   UUID,
  ADD COLUMN IF NOT EXISTS lead_nocturno_id UUID,
  ADD COLUMN IF NOT EXISTS lead_cargo_id    UUID;

COMMENT ON COLUMN programaciones_onboarding.lead_diurno_id
  IS 'Lead que ocupa el turno diurno. Cuando tiene valor, conductor_diurno_id es NULL.';
COMMENT ON COLUMN programaciones_onboarding.lead_nocturno_id
  IS 'Lead que ocupa el turno nocturno. Cuando tiene valor, conductor_nocturno_id es NULL.';
COMMENT ON COLUMN programaciones_onboarding.lead_cargo_id
  IS 'Lead que ocupa la modalidad A Cargo. Cuando tiene valor, conductor_id es NULL.';

-- 2) FKs hacia leads --------------------------------------------------------
-- ON DELETE SET NULL: borrar un lead no debe borrar la programación; el slot
-- queda con el nombre y el DNI ya cargados, que es un estado válido.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programaciones_onboarding_lead_diurno_id_fkey') THEN
    ALTER TABLE programaciones_onboarding
      ADD CONSTRAINT programaciones_onboarding_lead_diurno_id_fkey
      FOREIGN KEY (lead_diurno_id) REFERENCES leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programaciones_onboarding_lead_nocturno_id_fkey') THEN
    ALTER TABLE programaciones_onboarding
      ADD CONSTRAINT programaciones_onboarding_lead_nocturno_id_fkey
      FOREIGN KEY (lead_nocturno_id) REFERENCES leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programaciones_onboarding_lead_cargo_id_fkey') THEN
    ALTER TABLE programaciones_onboarding
      ADD CONSTRAINT programaciones_onboarding_lead_cargo_id_fkey
      FOREIGN KEY (lead_cargo_id) REFERENCES leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Índices parciales ------------------------------------------------------
-- La enorme mayoría de las programaciones no tienen lead: el índice parcial
-- sólo cubre las filas que sí lo tienen.
CREATE INDEX IF NOT EXISTS idx_prog_onb_lead_diurno
  ON programaciones_onboarding (lead_diurno_id) WHERE lead_diurno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prog_onb_lead_nocturno
  ON programaciones_onboarding (lead_nocturno_id) WHERE lead_nocturno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prog_onb_lead_cargo
  ON programaciones_onboarding (lead_cargo_id) WHERE lead_cargo_id IS NOT NULL;

COMMIT;

-- Verificación:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'programaciones_onboarding'
--    AND column_name IN ('lead_diurno_id','lead_nocturno_id','lead_cargo_id');
