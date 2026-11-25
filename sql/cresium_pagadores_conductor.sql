-- =====================================================
-- Cresium conductores: a qué conductor corresponde quien paga (2026-11-25)
-- =====================================================
-- A veces el pago no lo hace el conductor sino un familiar (pareja, hermana, tía...).
-- En Administración > Cresium conductores se busca ese pago y se elige a qué
-- conductor corresponde. Se guarda la persona que pagó (por CUIT/CUIL o, si no
-- tiene, por CBU/CVU): sus pagos anteriores y los que vengan quedan a nombre de
-- ese conductor (columna «Corresponde a», cruce «Asignado»).
-- Idempotente: se puede correr de nuevo.

BEGIN;

CREATE TABLE IF NOT EXISTS cresium_pagadores_conductor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CUIT/CUIL de quien paga, solo números
  cuit TEXT,
  -- CBU/CVU de quien paga (se usa si el movimiento no trae CUIT)
  cbu TEXT,
  -- Nombre de quien paga como figura en Cresium
  nombre_pagador TEXT,
  -- Pareja, Hermano/a, Tío/a...
  vinculo TEXT,
  conductor_id UUID NOT NULL REFERENCES conductores(id) ON DELETE CASCADE,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cresium_pagadores_cuit_o_cbu CHECK (cuit IS NOT NULL OR cbu IS NOT NULL)
);

-- Una persona que paga corresponde a un solo conductor
CREATE UNIQUE INDEX IF NOT EXISTS ux_cresium_pagadores_cuit
  ON cresium_pagadores_conductor(cuit) WHERE cuit IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cresium_pagadores_cbu
  ON cresium_pagadores_conductor(cbu) WHERE cuit IS NULL AND cbu IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cresium_pagadores_conductor
  ON cresium_pagadores_conductor(conductor_id);

ALTER TABLE cresium_pagadores_conductor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cresium_pagadores_select ON cresium_pagadores_conductor;
CREATE POLICY cresium_pagadores_select ON cresium_pagadores_conductor
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cresium_pagadores_insert ON cresium_pagadores_conductor;
CREATE POLICY cresium_pagadores_insert ON cresium_pagadores_conductor
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS cresium_pagadores_update ON cresium_pagadores_conductor;
CREATE POLICY cresium_pagadores_update ON cresium_pagadores_conductor
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cresium_pagadores_delete ON cresium_pagadores_conductor;
CREATE POLICY cresium_pagadores_delete ON cresium_pagadores_conductor
  FOR DELETE TO authenticated USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
