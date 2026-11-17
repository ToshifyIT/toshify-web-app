-- =====================================================
-- 2Chat: Control de mensajes de WhatsApp (2026-11-17)
-- =====================================================
-- Integraciones > 2Chat > Control de mensajes. El servidor (server-2chat.js) trae
-- de 2Chat los mensajes del WhatsApp «Toshify Clientes» y los guarda acá, igual que
-- las llamadas. Solo se guardan los datos para el reporte: quién escribió (cliente o
-- agente), cuándo y si se leyó. EL TEXTO DE LOS MENSAJES NO SE GUARDA.
--
-- 2Chat no dice qué agente escribió cada mensaje (solo «agente»): el agente de una
-- conversación es al que está asignada en 2Chat (twochat_conversaciones).
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS twochat_mensajes (
  -- uuid del mensaje en 2Chat (MSG...): evita duplicados
  uuid TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  -- 'cliente' | 'agente' | 'api' | 'flujo' | otro valor de 2Chat
  enviado_por TEXT NOT NULL,
  numero TEXT,
  -- Últimos 10 dígitos, para cruzar con conductores y leads
  numero_clave TEXT,
  leido BOOLEAN,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twochat_mensajes_fecha ON twochat_mensajes(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_twochat_mensajes_session ON twochat_mensajes(session_key, fecha);

CREATE TABLE IF NOT EXISTS twochat_conversaciones (
  session_key TEXT PRIMARY KEY,
  numero TEXT,
  numero_clave TEXT,
  -- Usuario de 2Chat al que está asignada (uuid USR... y nombre)
  agente_id TEXT,
  agente TEXT,
  equipo TEXT,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  link TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE twochat_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE twochat_conversaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "twochat_mensajes_select_autenticados" ON twochat_mensajes;
CREATE POLICY "twochat_mensajes_select_autenticados"
  ON twochat_mensajes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "twochat_conversaciones_select_autenticados" ON twochat_conversaciones;
CREATE POLICY "twochat_conversaciones_select_autenticados"
  ON twochat_conversaciones FOR SELECT TO authenticated USING (true);

-- Submenú «Control de mensajes» debajo de 2Chat (entre Control de llamadas y Contactos)
DO $$
DECLARE
  v_padre_id uuid;
  v_menu_id uuid;
  v_level integer;
  v_id uuid;
BEGIN
  SELECT id, menu_id, COALESCE(level, 1) INTO v_padre_id, v_menu_id, v_level
  FROM submenus WHERE name = 'twochat' LIMIT 1;
  IF v_padre_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú twochat';
  END IF;

  SELECT id INTO v_id FROM submenus WHERE name = 'twochat-mensajes' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('twochat-mensajes', 'Control de mensajes', '/integraciones/2chat/mensajes',
            v_menu_id, v_padre_id, v_level + 1, 2, true);
  ELSE
    UPDATE submenus SET label = 'Control de mensajes', route = '/integraciones/2chat/mensajes',
      menu_id = v_menu_id, parent_id = v_padre_id, level = v_level + 1, order_index = 2, is_active = true
    WHERE id = v_id;
  END IF;
  UPDATE submenus SET order_index = 3 WHERE name = 'twochat-contactos';
END $$;

-- Mismos permisos que Control de llamadas (por rol y por usuario)
INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT p.role_id, n.id, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM role_submenu_permissions p
JOIN submenus v ON v.id = p.submenu_id AND v.name = 'twochat-llamadas'
CROSS JOIN submenus n
WHERE n.name = 'twochat-mensajes'
  AND NOT EXISTS (SELECT 1 FROM role_submenu_permissions x WHERE x.role_id = p.role_id AND x.submenu_id = n.id);

INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT p.user_id, n.id, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM user_submenu_permissions p
JOIN submenus v ON v.id = p.submenu_id AND v.name = 'twochat-llamadas'
CROSS JOIN submenus n
WHERE n.name = 'twochat-mensajes'
  AND NOT EXISTS (SELECT 1 FROM user_submenu_permissions x WHERE x.user_id = p.user_id AND x.submenu_id = n.id);

COMMIT;

NOTIFY pgrst, 'reload schema';
