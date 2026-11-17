-- =====================================================
-- 2Chat: llamar desde Toshibase (2026-11-18)
-- =====================================================
-- 1) twochat_usuarios: qué cuenta de 2Chat usa cada usuario de Toshibase para llamar
--    (y para el chat de Leads). Si un usuario no está acá, se busca solo su cuenta
--    por email o por nombre (Carla, Eunice y Ali ya se encuentran solas).
--    Admin, Karen y Gandhy usan la cuenta compartida «Info Toshify» (info+2@).
-- 2) twochat_llamadas_toshibase: cada llamada hecha desde el botón de Toshibase, con
--    el usuario REAL. Con esto Control de llamadas muestra «Gandhy Barcelo (vía Info
--    Toshify)» en vez de todo junto como «Info Toshify».
-- Idempotente. Lo usa el servidor (server-2chat.js) con la service role.

BEGIN;

CREATE TABLE IF NOT EXISTS twochat_usuarios (
  user_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- uuid del usuario de 2Chat (USR...) y su nombre, para mostrar
  twochat_user_uuid TEXT NOT NULL,
  twochat_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS twochat_llamadas_toshibase (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  usuario TEXT,
  -- Cuenta de 2Chat con la que salió la llamada
  twochat_user_uuid TEXT,
  twochat_nombre TEXT,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  numero TEXT,
  numero_clave TEXT,
  -- 'iniciada' | 'atendida' | 'no_atendida' | 'fallida'
  estado TEXT NOT NULL DEFAULT 'iniciada',
  duracion INTEGER,
  iniciada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminada_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_twochat_llamadas_toshibase_clave ON twochat_llamadas_toshibase(numero_clave, iniciada_en DESC);

ALTER TABLE twochat_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE twochat_llamadas_toshibase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS twochat_usuarios_select ON twochat_usuarios;
CREATE POLICY twochat_usuarios_select ON twochat_usuarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS twochat_llamadas_toshibase_select ON twochat_llamadas_toshibase;
CREATE POLICY twochat_llamadas_toshibase_select ON twochat_llamadas_toshibase FOR SELECT TO authenticated USING (true);

-- Cuenta compartida «Info Toshify» para admin@, Karen (coord.admin@) y Gandhy (coord.hr@)
INSERT INTO twochat_usuarios (user_id, twochat_user_uuid, twochat_nombre)
SELECT id, 'USR309a3b75-f6dc-4c68-888f-6937193f5140', 'Info Toshify'
FROM user_profiles
WHERE email IN ('admin@toshify.com.ar', 'coord.admin@toshify.com.ar', 'coord.hr@toshify.com.ar')
ON CONFLICT (user_id) DO UPDATE SET twochat_user_uuid = EXCLUDED.twochat_user_uuid, twochat_nombre = EXCLUDED.twochat_nombre;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para vincular a otra persona:
-- INSERT INTO twochat_usuarios (user_id, twochat_user_uuid, twochat_nombre)
--   SELECT id, 'USR...', 'Nombre en 2Chat' FROM user_profiles WHERE email = '...@toshify.com.ar'
--   ON CONFLICT (user_id) DO UPDATE SET twochat_user_uuid = EXCLUDED.twochat_user_uuid;
