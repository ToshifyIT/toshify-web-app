-- =====================================================
-- Portal Conductor: "Olvidé mi contraseña"
-- =====================================================
-- Flujo:
--   1) El conductor pide el reset con su DNI en /mi-espacio. Esto NO pasa por
--      una función pública de Postgres: lo maneja server.js (endpoint
--      POST /api/portal/forgot-password), porque ahí es donde ya vive la
--      integración con Resend para mandar el correo.
--   2) server.js llama a portal_buscar_conductor_reset (privada, solo
--      service_role) para obtener el id y el email del conductor sin
--      exponer esa búsqueda por REST al navegador.
--   3) server.js genera el token aleatorio, guarda SOLO su hash acá, y manda
--      el link (con el token en texto plano) por email. El token crudo nunca
--      pasa por una respuesta HTTP hacia el navegador: solo existe en el
--      correo del conductor. Así "tener el link" (= haber abierto el email)
--      es la prueba de identidad, no el DNI.
--   4) El conductor abre el link (/mi-espacio?reset=TOKEN) y el frontend
--      llama a portal_reset_password_con_token (pública) para fijar la
--      contraseña nueva. Vencimiento: 1 hora. Un solo uso.
--
-- Idempotente: se puede correr más de una vez sin duplicar nada.

BEGIN;

-- ---------------------------------------------------------
-- 1) Tabla de tokens de reset
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_password_resets_token_hash
  ON public.portal_password_resets (token_hash);

CREATE INDEX IF NOT EXISTS idx_portal_password_resets_conductor_created
  ON public.portal_password_resets (conductor_id, created_at DESC);

COMMENT ON TABLE public.portal_password_resets IS
  'Tokens de un solo uso para "olvidé mi contraseña" del Portal Conductor (/mi-espacio). Solo se guarda el hash (sha256) del token; el token en texto plano únicamente existe en el link del email que manda server.js. Sin policies de RLS para anon/authenticated: solo accesible via service_role (server.js) o las funciones SECURITY DEFINER de este archivo.';

ALTER TABLE public.portal_password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_password_resets FROM anon, authenticated;

-- ---------------------------------------------------------
-- 2) RPC privada: buscar conductor por DNI/CUIT para el flujo de reset.
--    Devuelve el email (dato sensible) — por eso NO se otorga a anon ni a
--    authenticated. Solo server.js, usando la service_role key, puede
--    llamarla. Si un día se llamara desde el navegador con la anon key,
--    PostgREST la rechaza con 401/403 porque no tiene EXECUTE.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_buscar_conductor_reset(p_documento text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_dni text := public.portal_normalize_dni(p_documento);
  v_cuit text := public.portal_normalize_cuit(p_documento);
  v_conductor RECORD;
BEGIN
  SELECT id, email
  INTO v_conductor
  FROM conductores
  WHERE (v_dni IS NOT NULL AND numero_dni = v_dni)
     OR (v_cuit IS NOT NULL AND numero_cuit = v_cuit)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'conductor_id', v_conductor.id,
    'email', v_conductor.email
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('found', false);
END;
$function$;

COMMENT ON FUNCTION public.portal_buscar_conductor_reset(text) IS
  'Uso exclusivo de server.js (service_role) para el flujo "olvidé mi contraseña". Devuelve el email del conductor: nunca debe otorgarse EXECUTE a anon/authenticated.';

REVOKE ALL ON FUNCTION public.portal_buscar_conductor_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_buscar_conductor_reset(text) TO service_role;

-- ---------------------------------------------------------
-- 3) RPC pública: canjear el token del email por una contraseña nueva.
--    Requiere poseer el token real (llegó solo por correo), no el DNI.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_reset_password_con_token(p_token text, p_password_nueva text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_token_hash text;
  v_reset RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Link inválido o vencido');
  END IF;

  IF p_password_nueva IS NULL OR length(p_password_nueva) < 8 THEN
    RETURN json_build_object('success', false, 'error', 'La nueva contraseña debe tener al menos 8 caracteres');
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT id, conductor_id, expires_at, used_at
  INTO v_reset
  FROM portal_password_resets
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Link inválido o vencido');
  END IF;

  IF v_reset.used_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Este link ya fue utilizado. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".');
  END IF;

  IF v_reset.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Este link venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".');
  END IF;

  UPDATE conductores
  SET portal_password_hash = crypt(p_password_nueva, gen_salt('bf')),
      portal_must_change_password = false
  WHERE id = v_reset.conductor_id;

  UPDATE portal_password_resets
  SET used_at = now()
  WHERE id = v_reset.id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'No se pudo restablecer la contraseña. Intentá de nuevo.');
END;
$function$;

COMMENT ON FUNCTION public.portal_reset_password_con_token(text, text) IS
  'Canjea un token de "olvidé mi contraseña" (emitido y enviado por email desde server.js) por una contraseña nueva. Valida hash, vencimiento (1 hora) y que no haya sido usado antes.';

GRANT EXECUTE ON FUNCTION public.portal_reset_password_con_token(text, text) TO anon, authenticated;

COMMIT;
