-- =====================================================
-- MCP: login por persona (OAuth) con la cuenta de Toshibase
-- =====================================================
-- El conector de Claude ya no necesita una API key compartida: cada persona inicia
-- sesión con su cuenta de Toshibase y el MCP le muestra solo las tablas de las pantallas
-- que tiene habilitadas (Menú por rol / Menú por usuario). Ver mcp/lib/oauth.js.
--
--   mcp_oauth_clientes  aplicaciones que se registraron solas (Claude al agregar el conector)
--   mcp_oauth_codigos   códigos de autorización de un solo uso (vencen a los 5 minutos)
--   mcp_oauth_tokens    permisos de acceso (1 hora) y de renovación (30 días) por persona
--
-- Los códigos y tokens se guardan como hash SHA-256: un volcado de la tabla no sirve para
-- entrar. RLS activo y sin políticas: solo el backend del MCP (service_role) las usa.
--
-- También agrega a api_request_log quién hizo cada consulta (user_id, user_email).
--
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar el MCP. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mcp_oauth_clientes (
  client_id text PRIMARY KEY,
  client_name text,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_codigos (
  codigo_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_oauth_clientes(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text,
  expires_at timestamptz NOT NULL,
  usado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  token_hash text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('access', 'refresh')),
  client_id text NOT NULL REFERENCES public.mcp_oauth_clientes(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text,
  scope text,
  expires_at timestamptz NOT NULL,
  revocado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_idx ON public.mcp_oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expira_idx ON public.mcp_oauth_tokens (expires_at);

ALTER TABLE public.mcp_oauth_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mcp_oauth_clientes, public.mcp_oauth_codigos, public.mcp_oauth_tokens
  FROM anon, authenticated;

-- Quién hizo cada consulta (con login por persona no hay key)
ALTER TABLE public.api_request_log ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.api_request_log ADD COLUMN IF NOT EXISTS user_email text;

COMMIT;

-- Para cortarle el acceso a una persona desde Claude al instante (además de desactivarla
-- en Toshibase, que también lo corta):
--   UPDATE public.mcp_oauth_tokens SET revocado_at = now()
--   WHERE user_email = 'persona@toshify.com.ar' AND revocado_at IS NULL;
--
-- Limpieza opcional de vencidos:
--   DELETE FROM public.mcp_oauth_tokens WHERE expires_at < now() - interval '7 days';
--   DELETE FROM public.mcp_oauth_codigos WHERE expires_at < now() - interval '1 day';
