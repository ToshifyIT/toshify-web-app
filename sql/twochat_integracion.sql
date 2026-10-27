-- =====================================================
-- Integración 2Chat (contactos para llamadas + reporte de llamadas)
-- =====================================================
-- 1) Tabla twochat_contactos: registra qué conductor ya se creó en 2Chat, para
--    que el botón "Sincronizar nuevos" solo cree los que faltan y no duplique.
-- 2) Submenú "2Chat" dentro de Integraciones (después de Cabify).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.
--
-- La tabla solo la escribe el servidor (server-2chat.js con la service role);
-- desde la app los usuarios autenticados solo la leen.

BEGIN;

-- =====================================================
-- TABLA: twochat_contactos
-- =====================================================

CREATE TABLE IF NOT EXISTS twochat_contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id UUID NOT NULL UNIQUE REFERENCES conductores(id) ON DELETE CASCADE,
  -- UUID del contacto en 2Chat (CON...). Null si el alta falló.
  twochat_contact_uuid TEXT,
  -- Teléfono con el que se creó (+549...). Sirve para detectar si cambió después.
  telefono TEXT,
  -- 'creado' | 'error'
  estado TEXT NOT NULL DEFAULT 'creado',
  error TEXT,
  sincronizado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twochat_contactos_estado ON twochat_contactos(estado);
CREATE INDEX IF NOT EXISTS idx_twochat_contactos_telefono ON twochat_contactos(telefono);

ALTER TABLE twochat_contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "twochat_contactos_select_autenticados" ON twochat_contactos;
CREATE POLICY "twochat_contactos_select_autenticados"
  ON twochat_contactos FOR SELECT
  TO authenticated
  USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE: solo la service role (servidor) escribe.

-- =====================================================
-- SUBMENÚ: Integraciones > 2Chat
-- =====================================================
-- El name DEBE ser 'twochat' (coincide con el submenuName del ProtectedRoute en
-- HomePage.tsx). Al crearlo solo lo ven los admin; para otros roles darle
-- permiso desde Administración > Menú por rol.

DO $$
DECLARE
  v_ref_id uuid;
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_nuevo_id uuid;
BEGIN
  SELECT id, menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_ref_id, v_menu_id, v_parent_id, v_level, v_order
  FROM submenus
  WHERE name = 'cabify'
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú cabify (referencia para ubicar 2Chat en Integraciones).';
  END IF;

  SELECT id INTO v_nuevo_id FROM submenus WHERE name = 'twochat' LIMIT 1;

  IF v_nuevo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('twochat', '2Chat', '/integraciones/2chat', v_menu_id, v_parent_id, v_level, v_order + 1, true);
  ELSE
    UPDATE submenus
    SET label = '2Chat',
        route = '/integraciones/2chat',
        menu_id = v_menu_id,
        parent_id = v_parent_id,
        level = v_level,
        order_index = v_order + 1,
        is_active = true
    WHERE id = v_nuevo_id;
  END IF;
END $$;

COMMIT;

-- Que la API de Supabase (PostgREST) vea la tabla nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
