-- =====================================================
-- Integración DiDi (Integraciones > DiDi) (2026-11-26)
-- =====================================================
-- Datos de los conductores en DiDi Fleet, por semana (lunes a domingo). Se cargan
-- importando los Excel de DiDi Fleet («Informe de ganancias» e «Informe de viaje»,
-- que DiDi manda por email con «Descargar informe»). Cuando DiDi habilite la Fleet
-- Open API, la carga pasa a ser automática con las mismas tablas.
--
-- 1) didi_semanal: una fila por conductor de DiDi, semana y sede. Cada informe
--    completa sus columnas (ganancias o viajes); se pueden importar por separado.
-- 2) didi_conductores: a qué conductor de Toshify corresponde cada nombre de DiDi
--    (el Excel no trae DNI). Se cruza solo por nombre; lo que no se cruza se elige a
--    mano en la pantalla y queda guardado para las semanas siguientes.
-- 3) Menú: Integraciones > DiDi (/integraciones/didi), después de Integración Cabify.
--    El name DEBE coincidir con el submenuName del ProtectedRoute en HomePage.tsx ('didi').
--    Permisos (Administración > Menú por rol): Ver = can_view; Importar y vincular =
--    can_edit. Al crearlo solo lo ven los admin.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

BEGIN;

-- =====================================================
-- TABLA: didi_conductores (vínculo nombre DiDi -> conductor)
-- =====================================================

CREATE TABLE IF NOT EXISTS didi_conductores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nombre como figura en DiDi, en mayúsculas sin acentos ni signos (clave del cruce)
  nombre_norm TEXT NOT NULL UNIQUE,
  nombre_didi TEXT NOT NULL,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  -- 'auto' (por nombre) | 'manual' (elegido en la pantalla)
  origen TEXT NOT NULL DEFAULT 'auto' CHECK (origen IN ('auto', 'manual')),
  vinculado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_didi_conductores_conductor ON didi_conductores(conductor_id);

-- =====================================================
-- TABLA: didi_semanal
-- =====================================================

CREATE TABLE IF NOT EXISTS didi_semanal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sede en la que se importó (DiDi Fleet es una cuenta por flota)
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
  -- Semana ISO (lunes a domingo)
  anio INTEGER NOT NULL,
  semana INTEGER NOT NULL,
  nombre_didi TEXT NOT NULL,
  nombre_norm TEXT NOT NULL,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,

  -- Informe de ganancias
  viajes_pagados INTEGER,
  ganancia_total NUMERIC(14, 2),
  ganancia_efectivo NUMERIC(14, 2),
  ganancia_tarjeta NUMERIC(14, 2),
  efectivo_conductor NUMERIC(14, 2),
  impuesto NUMERIC(14, 2),
  cargo_tag NUMERIC(14, 2),
  recompensas NUMERIC(14, 2),
  deduccion_plataforma NUMERIC(14, 2),

  -- Informe de viaje
  horas_en_linea NUMERIC(8, 2),
  viajes_asignados INTEGER,
  viajes_aceptados INTEGER,
  tasa_aceptacion NUMERIC(6, 2),
  viajes_finalizados INTEGER,
  tasa_finalizacion NUMERIC(6, 2),
  cancelados_pasajero INTEGER,
  cancelados_conductor INTEGER,
  cancelados_otros INTEGER,
  viajes_finalizados_pagados INTEGER,
  total_pagado_finalizados NUMERIC(14, 2),

  ganancias_importado_en TIMESTAMPTZ,
  viajes_importado_en TIMESTAMPTZ,
  importado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una fila por conductor de DiDi, semana y sede (la importación hace upsert con esta clave)
CREATE UNIQUE INDEX IF NOT EXISTS ux_didi_semanal_conductor_semana
  ON didi_semanal(sede_id, anio, semana, nombre_norm);
CREATE INDEX IF NOT EXISTS idx_didi_semanal_semana ON didi_semanal(anio, semana);
CREATE INDEX IF NOT EXISTS idx_didi_semanal_conductor ON didi_semanal(conductor_id);

-- =====================================================
-- Permisos: los usuarios autenticados leen y cargan (la pantalla controla quién
-- puede importar con el permiso can_edit del submenú)
-- =====================================================

ALTER TABLE didi_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE didi_semanal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "didi_conductores_autenticados" ON didi_conductores;
CREATE POLICY "didi_conductores_autenticados" ON didi_conductores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "didi_semanal_autenticados" ON didi_semanal;
CREATE POLICY "didi_semanal_autenticados" ON didi_semanal
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON didi_conductores, didi_semanal FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON didi_conductores, didi_semanal TO authenticated;

-- =====================================================
-- MENÚ: Integraciones > DiDi
-- =====================================================

DO $$
DECLARE
  v_ref_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_id uuid;
BEGIN
  -- Se ubica después de Integración Cabify
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus WHERE name = 'cabify' LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú cabify (referencia para ubicar DiDi en Integraciones).';
  END IF;

  SELECT id INTO v_id FROM submenus WHERE name = 'didi' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('didi', 'Integración DiDi', '/integraciones/didi', v_menu_id, v_parent_id, v_level, v_order + 1, true);
  ELSE
    UPDATE submenus
    SET label = 'Integración DiDi', route = '/integraciones/didi', menu_id = v_menu_id,
        parent_id = v_parent_id, level = v_level, order_index = v_order + 1, is_active = true
    WHERE id = v_id;
  END IF;
END $$;

COMMIT;

-- Que la API de Supabase (PostgREST) vea las tablas nuevas sin reiniciar
NOTIFY pgrst, 'reload schema';
