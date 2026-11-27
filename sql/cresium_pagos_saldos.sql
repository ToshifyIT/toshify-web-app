-- =====================================================
-- Saldos: pagos de Cresium por revisar (2026-11-26)
-- =====================================================
-- Los movimientos de Cresium (44 Dreams y Grupo CG, cresium_movimientos, se traen solos
-- cada 10 minutos) que se cruzan con un conductor quedan acá como PENDIENTES. En
-- Facturación > Saldos, botón «Cresium por revisar», alguien con acceso a Saldos los
-- revisa: «Permitir» los registra como un movimiento más del saldo (abono si el dinero
-- entró, cargo si salió; la semana se puede cambiar) y «Rechazar» los descarta.
-- Mientras están pendientes no cambian el saldo.
--
-- Cruce con el conductor (el mismo orden que Administración > Cresium conductores):
--   1. CUIT/CUIL del movimiento = CUIT del conductor
--   2. DNI dentro del CUIL (dígitos 3 a 10) = DNI del conductor
--   3. CBU/CVU del movimiento = CBU del conductor
--   4. persona asignada a un conductor (cresium_pagadores_conductor)
-- Si no se cruza, no se hace nada. Se dejan afuera los movimientos de empresas
-- (CUIT 30, 33, 34) y los rechazados (FAILED). Solo desde el 24/11/2026.
--
-- Se llena sola: al entrar un movimiento nuevo y al asignar una persona a un conductor
-- (toma sus movimientos desde el 24/11 que todavía no estaban). Al correr este script
-- se cargan los movimientos que ya había desde el 24/11.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

CREATE TABLE IF NOT EXISTS cresium_pagos_saldos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES cresium_movimientos(id) ON DELETE CASCADE,
  -- '44dreams' | 'grupocg'
  empresa TEXT NOT NULL,
  cresium_id BIGINT NOT NULL,
  -- Día del movimiento en Argentina
  fecha DATE,
  -- 'entrada' | 'salida'
  direccion TEXT NOT NULL,
  importe NUMERIC(16, 2) NOT NULL,
  contraparte TEXT,
  cuit TEXT,
  cuenta_contraparte TEXT,
  nota TEXT,
  conductor_id UUID NOT NULL REFERENCES conductores(id) ON DELETE CASCADE,
  sede_id UUID REFERENCES sedes(id) ON DELETE SET NULL,
  -- 'cuit' | 'dni' | 'cbu' | 'asignado'
  criterio TEXT NOT NULL,
  -- Movimiento de saldo que se propone: 'abono' (entró dinero) | 'cargo' (salió); editable
  tipo TEXT NOT NULL CHECK (tipo IN ('abono', 'cargo')),
  -- Semana ISO del movimiento (la del envío del dinero); editable antes de permitir
  semana INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  -- 'pendiente' | 'permitido' | 'rechazado'
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'permitido', 'rechazado')),
  motivo_rechazo TEXT,
  -- Movimiento creado en el saldo al permitir
  abono_id UUID REFERENCES abonos_conductores(id) ON DELETE SET NULL,
  revisado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  revisado_por_nombre TEXT,
  revisado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, cresium_id)
);

CREATE INDEX IF NOT EXISTS idx_cresium_pagos_saldos_estado ON cresium_pagos_saldos(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cresium_pagos_saldos_conductor ON cresium_pagos_saldos(conductor_id);
CREATE INDEX IF NOT EXISTS idx_cresium_pagos_saldos_sede ON cresium_pagos_saldos(sede_id);

-- =====================================================
-- Cruce y alta de un movimiento
-- =====================================================

/** Conductor de un movimiento de Cresium (NULL si no se cruza). */
CREATE OR REPLACE FUNCTION cresium_conductor_de_movimiento(p_cuit TEXT, p_cuenta TEXT)
RETURNS TABLE (conductor_id UUID, criterio TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cuit TEXT := regexp_replace(COALESCE(p_cuit, ''), '\D', '', 'g');
  v_cbu TEXT := regexp_replace(COALESCE(p_cuenta, ''), '\D', '', 'g');
  v_dni TEXT := '';
  v_id UUID;
BEGIN
  IF length(v_cuit) = 11 THEN
    v_dni := ltrim(substr(v_cuit, 3, 8), '0');
    SELECT c.id INTO v_id FROM conductores c
      WHERE regexp_replace(COALESCE(c.numero_cuit, ''), '\D', '', 'g') = v_cuit ORDER BY c.id LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, 'cuit'::TEXT; RETURN; END IF;
    IF length(v_dni) >= 6 THEN
      SELECT c.id INTO v_id FROM conductores c
        WHERE ltrim(regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g'), '0') = v_dni ORDER BY c.id LIMIT 1;
      IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, 'dni'::TEXT; RETURN; END IF;
    END IF;
  END IF;
  IF length(v_cbu) = 22 THEN
    SELECT c.id INTO v_id FROM conductores c
      WHERE regexp_replace(COALESCE(c.cbu, ''), '\D', '', 'g') = v_cbu ORDER BY c.id LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, 'cbu'::TEXT; RETURN; END IF;
  END IF;
  -- Persona que paga por un conductor: por CUIT/CUIL, o por CBU si el movimiento no trae CUIT
  SELECT p.conductor_id INTO v_id FROM cresium_pagadores_conductor p
    WHERE (length(v_cuit) = 11 AND p.cuit = v_cuit)
       OR (v_cuit = '' AND length(v_cbu) = 22 AND p.cuit IS NULL AND p.cbu = v_cbu)
    LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, 'asignado'::TEXT; END IF;
END;
$$;

/** Pone un movimiento en revisión si corresponde (no hace nada si ya está o no se cruza). */
CREATE OR REPLACE FUNCTION cresium_registrar_pago_saldo(p_mov_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m cresium_movimientos%ROWTYPE;
  v_cuit TEXT;
  v_conductor UUID;
  v_criterio TEXT;
BEGIN
  SELECT * INTO m FROM cresium_movimientos WHERE id = p_mov_id;
  IF NOT FOUND OR m.fecha IS NULL OR m.fecha < DATE '2026-11-24' THEN RETURN; END IF;
  IF COALESCE(m.estado, '') = 'FAILED' OR m.direccion NOT IN ('entrada', 'salida') THEN RETURN; END IF;
  IF COALESCE(m.importe, 0) <= 0 THEN RETURN; END IF;
  v_cuit := regexp_replace(COALESCE(m.cuit, ''), '\D', '', 'g');
  -- Empresas (Cabify, dLocal, transferencias entre 44 Dreams y Grupo CG...): no
  IF length(v_cuit) = 11 AND left(v_cuit, 2) IN ('30', '33', '34') THEN RETURN; END IF;

  SELECT x.conductor_id, x.criterio INTO v_conductor, v_criterio
    FROM cresium_conductor_de_movimiento(m.cuit, m.cuenta_contraparte) x;
  IF v_conductor IS NULL THEN RETURN; END IF;

  INSERT INTO cresium_pagos_saldos (
    movimiento_id, empresa, cresium_id, fecha, direccion, importe, contraparte, cuit,
    cuenta_contraparte, nota, conductor_id, sede_id, criterio, tipo, semana, anio
  )
  SELECT m.id, m.empresa, m.cresium_id, m.fecha, m.direccion, m.importe, m.contraparte, m.cuit,
    m.cuenta_contraparte, m.nota, v_conductor, c.sede_id, v_criterio,
    CASE WHEN m.direccion = 'entrada' THEN 'abono' ELSE 'cargo' END,
    EXTRACT(WEEK FROM m.fecha)::INTEGER, EXTRACT(ISOYEAR FROM m.fecha)::INTEGER
  FROM conductores c WHERE c.id = v_conductor
  ON CONFLICT (empresa, cresium_id) DO NOTHING;
END;
$$;

-- Movimiento nuevo (o que cambia de estado): a revisión. Si pasa a rechazado (FAILED)
-- y todavía estaba pendiente, sale de la revisión.
CREATE OR REPLACE FUNCTION trg_cresium_movimiento_a_saldos()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.estado, '') = 'FAILED' THEN
    DELETE FROM cresium_pagos_saldos WHERE movimiento_id = NEW.id AND estado = 'pendiente';
  ELSE
    PERFORM cresium_registrar_pago_saldo(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cresium_movimiento_a_saldos ON cresium_movimientos;
CREATE TRIGGER cresium_movimiento_a_saldos
  AFTER INSERT OR UPDATE OF estado ON cresium_movimientos
  FOR EACH ROW EXECUTE FUNCTION trg_cresium_movimiento_a_saldos();

-- Persona asignada a un conductor: sus movimientos desde el 24/11 que no estaban
CREATE OR REPLACE FUNCTION trg_cresium_pagador_a_saldos()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT m.id FROM cresium_movimientos m
    WHERE m.fecha >= DATE '2026-11-24'
      AND ((NEW.cuit IS NOT NULL AND regexp_replace(COALESCE(m.cuit, ''), '\D', '', 'g') = NEW.cuit)
        OR (NEW.cuit IS NULL AND NEW.cbu IS NOT NULL
            AND regexp_replace(COALESCE(m.cuit, ''), '\D', '', 'g') = ''
            AND regexp_replace(COALESCE(m.cuenta_contraparte, ''), '\D', '', 'g') = NEW.cbu))
      AND NOT EXISTS (SELECT 1 FROM cresium_pagos_saldos s WHERE s.movimiento_id = m.id)
  LOOP
    PERFORM cresium_registrar_pago_saldo(r.id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cresium_pagador_a_saldos ON cresium_pagadores_conductor;
CREATE TRIGGER cresium_pagador_a_saldos
  AFTER INSERT ON cresium_pagadores_conductor
  FOR EACH ROW EXECUTE FUNCTION trg_cresium_pagador_a_saldos();

-- Las funciones solo las usan los triggers
REVOKE ALL ON FUNCTION cresium_conductor_de_movimiento(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cresium_registrar_pago_saldo(UUID) FROM PUBLIC, anon, authenticated;

-- =====================================================
-- Permisos: los usuarios ven y revisan (permitir / rechazar / cambiar semana o tipo);
-- las filas las crean solo los triggers.
-- =====================================================

ALTER TABLE cresium_pagos_saldos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cresium_pagos_saldos_select_autenticados" ON cresium_pagos_saldos;
CREATE POLICY "cresium_pagos_saldos_select_autenticados"
  ON cresium_pagos_saldos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cresium_pagos_saldos_update_autenticados" ON cresium_pagos_saldos;
CREATE POLICY "cresium_pagos_saldos_update_autenticados"
  ON cresium_pagos_saldos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, DELETE ON cresium_pagos_saldos FROM anon, authenticated;
REVOKE UPDATE ON cresium_pagos_saldos FROM anon;
GRANT SELECT, UPDATE ON cresium_pagos_saldos TO authenticated;

-- =====================================================
-- Carga inicial: los movimientos que ya había desde el 24/11
-- =====================================================

SELECT cresium_registrar_pago_saldo(m.id)
FROM cresium_movimientos m
WHERE m.fecha >= DATE '2026-11-24';

COMMIT;

-- Que la API de Supabase (PostgREST) vea la tabla nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
