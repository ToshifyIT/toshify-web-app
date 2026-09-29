-- =====================================================================
-- Consumidores externos de la API REST: autenticacion y self-service
-- de API keys.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede correr
-- varias veces sin romper nada.
--
-- QUE ES ESTO
-- Un tercero que consume la API publica NO tiene cuenta en Supabase Auth ni
-- en la app. Vive en `api_users`, un padron aparte, igual que los conductores
-- del Portal. Con su usuario y contrasena pide sus propias API keys en
-- GET /api/v1/keys, que vencen a los 30 minutos.
--
-- La contrasena se verifica DENTRO de Postgres con pgcrypto (bcrypt): el hash
-- nunca sale de la base. Por eso las funciones son SECURITY DEFINER.
--
-- ROLES  (agregado 2026-09-27)
-- El alcance de la key lo decide el rol del usuario, no el request:
--   reader -> solo lectura (default de la tabla)
--   writer -> lectura + alta de leads (POST /api/v1/leads)
-- Asi se puede entregar una credencial de solo consulta a un tercero y otra
-- distinta, con otra contrasena, a quien ademas necesita dar de alta.
--
-- OJO: el mapa rol -> permisos esta espejado en PERMISOS_POR_ROL de
-- mcp/lib/apiUsers.js, que es el que usa el endpoint. Si cambia uno, cambia
-- el otro.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- Tabla de consumidores
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'reader',
  is_active     BOOLEAN DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_users_username ON api_users(username);

ALTER TABLE api_users ENABLE ROW LEVEL SECURITY;
-- Sin politicas: solo service_role entra. Las funciones de abajo son
-- SECURITY DEFINER, asi que no las afecta.

-- ---------------------------------------------------------------------
-- Columnas que el self-service agrega a api_keys
-- ---------------------------------------------------------------------
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_user_id UUID REFERENCES api_users(id) ON DELETE CASCADE;
-- expires_at en NULL = la key no vence. Es el caso de las keys creadas a mano
-- desde Administracion > Integraciones (chatbot MCP, integraciones propias).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_api_keys_api_user ON api_keys(api_user_id);

-- ---------------------------------------------------------------------
-- Mapa rol -> permisos. Fuente de verdad del lado SQL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_user_permisos(p_role text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE lower(coalesce(trim(p_role), ''))
    WHEN 'writer' THEN
      '["leads:api","vehiculos:api","conductores:api","asignaciones:api","flota:api","leads:create:api"]'::jsonb
    ELSE
      -- Cualquier rol desconocido cae en solo lectura: ante la duda, minimo
      -- privilegio, nunca el maximo.
      '["leads:api","vehiculos:api","conductores:api","asignaciones:api","flota:api"]'::jsonb
  END;
$function$;

-- ---------------------------------------------------------------------
-- Alta de un consumidor
--
-- La firma cambio: antes era (text, text). Hay que borrar la vieja o las dos
-- quedan vivas y una llamada de dos argumentos se vuelve ambigua.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.api_user_crear(text, text);

CREATE OR REPLACE FUNCTION public.api_user_crear(
  p_username text,
  p_password text,
  p_role     text DEFAULT 'reader'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id   UUID;
  v_role TEXT := lower(coalesce(trim(p_role), 'reader'));
BEGIN
  IF length(coalesce(p_password, '')) < 12 THEN
    RAISE EXCEPTION 'La contrasena debe tener al menos 12 caracteres';
  END IF;

  IF v_role NOT IN ('reader', 'writer') THEN
    RAISE EXCEPTION 'Rol invalido: %. Valores validos: reader, writer', v_role;
  END IF;

  INSERT INTO api_users (username, password_hash, role, is_active)
  VALUES (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), v_role, true)
  RETURNING id INTO v_id;

  -- No se crea ninguna key aca: la genera el propio consumidor la primera vez
  -- que llama a GET /api/v1/keys con su usuario y contrasena.
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- Cambiar el rol de un consumidor ya existente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_user_cambiar_rol(p_username text, p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok   BOOLEAN;
  v_role TEXT := lower(coalesce(trim(p_role), ''));
BEGIN
  IF v_role NOT IN ('reader', 'writer') THEN
    RAISE EXCEPTION 'Rol invalido: %. Valores validos: reader, writer', v_role;
  END IF;

  UPDATE api_users SET role = v_role WHERE username = lower(trim(p_username));
  GET DIAGNOSTICS v_ok = ROW_COUNT;

  -- Las keys ya emitidas guardan sus permisos al momento de crearse, asi que
  -- un cambio de rol no las afecta. Se desactivan para que el nuevo alcance
  -- valga desde la proxima key y no haya que esperar el vencimiento.
  IF v_ok THEN
    UPDATE api_keys k SET is_active = false
      FROM api_users u
     WHERE k.api_user_id = u.id
       AND u.username = lower(trim(p_username))
       AND k.is_active = true;
  END IF;

  RETURN v_ok;
END;
$function$;

-- ---------------------------------------------------------------------
-- Login: valida la contrasena y devuelve el usuario con su rol
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_user_login(p_username text, p_password text)
RETURNS TABLE(id uuid, username character varying, role character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE api_users u
     SET last_login = NOW()
   WHERE u.username = lower(trim(p_username))
     AND u.is_active = true
     AND u.password_hash = crypt(p_password, u.password_hash)
  RETURNING u.id, u.username, u.role;
END;
$function$;

-- ---------------------------------------------------------------------
-- Cambio de contrasena por el propio consumidor
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_user_cambiar_password(
  p_username         text,
  p_password_actual  text,
  p_password_nueva   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF length(coalesce(p_password_nueva, '')) < 12 THEN
    RAISE EXCEPTION 'La contrasena debe tener al menos 12 caracteres';
  END IF;

  UPDATE api_users
     SET password_hash = crypt(p_password_nueva, gen_salt('bf'))
   WHERE username = lower(trim(p_username))
     AND is_active = true
     AND password_hash = crypt(p_password_actual, password_hash);

  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok;
END;
$function$;

-- ---------------------------------------------------------------------
-- Rotacion manual de la key (desde SQL, sin pasar por el endpoint)
--
-- Se usa cuando hay que cortar una key ya entregada sin esperar a que venza.
-- Los permisos salen del rol: antes estaban hardcodeados y una key rotada
-- perdia silenciosamente el alta de leads.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_user_rotar_key(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id   UUID;
  v_role TEXT;
  v_key  TEXT;
BEGIN
  SELECT id, role INTO v_id, v_role
    FROM api_users
   WHERE username = lower(trim(p_username)) AND is_active = true;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe un consumidor activo con ese usuario';
  END IF;

  UPDATE api_keys SET is_active = false WHERE api_user_id = v_id;

  v_key := encode(gen_random_bytes(32), 'hex');
  INSERT INTO api_keys (name, api_key, permissions, api_user_id, is_active, expires_at)
  VALUES (
    lower(trim(p_username)),
    v_key,
    api_user_permisos(v_role),
    v_id,
    true,
    NOW() + INTERVAL '30 minutes'
  );

  RETURN v_key;
END;
$function$;

-- =====================================================================
-- USO
--
--   Consumidor de solo lectura:
--     SELECT api_user_crear('nombre-del-tercero', 'contrasena-de-12-o-mas');
--
--   Consumidor que ademas da de alta leads:
--     SELECT api_user_crear('nombre-del-tercero', 'contrasena-de-12-o-mas', 'writer');
--
--   Cambiar el rol de uno existente (desactiva sus keys vigentes):
--     SELECT api_user_cambiar_rol('nombre-del-tercero', 'reader');
--
--   Cortar la key entregada y emitir otra:
--     SELECT api_user_rotar_key('nombre-del-tercero');
--
--   Cambiar la contrasena:
--     SELECT api_user_cambiar_password('nombre', 'actual', 'nueva-de-12-o-mas');
-- =====================================================================
