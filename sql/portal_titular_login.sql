-- =====================================================
-- Mi Espacio del titular (/mi-espacio/titular): ingreso con contraseña
-- =====================================================
-- Misma lógica que el portal del conductor:
--   - Usuario: el documento SOLO con números. Persona: DNI. Empresa: CUIT.
--     Si una persona tiene cargado el CUIT en dni_cuit, el DNI son los 8 dígitos
--     del medio.
--   - Primer ingreso: la contraseña es ese mismo documento y se obliga a
--     cambiarla antes de ver el tablero.
--   - Solo titulares en estado 'activo' y con documento cargado pueden entrar.
--
-- Las contraseñas van en una tabla aparte (titulares_portal_acceso) y no en
-- titulares, porque titulares se lee desde el navegador: así el hash nunca
-- queda al alcance de anon/authenticated. Solo la tocan las funciones
-- SECURITY DEFINER de este archivo.
--
-- Pendiente (siguiente paso): "olvidé mi contraseña" por email, como el del
-- conductor (sql/portal_forgot_password.sql + server.js).
--
-- Se puede correr más de una vez.

BEGIN;

-- ---------------------------------------------------------
-- 1) Contraseñas del portal del titular
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.titulares_portal_acceso (
  titular_id uuid PRIMARY KEY REFERENCES public.titulares(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  ultimo_ingreso timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.titulares_portal_acceso IS
  'Contraseña (hash bcrypt) del portal del titular. Sin fila = todavía no cambió la contraseña inicial (su documento). Sin policies: solo se accede por las funciones portal_titular_*.';

ALTER TABLE public.titulares_portal_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.titulares_portal_acceso FROM anon, authenticated;

-- ---------------------------------------------------------
-- 2) Documento con el que ingresa cada titular (solo números)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_titular_documento(p_tipo text, p_dni_cuit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN p_tipo = 'empresa' THEN d
    -- Persona con CUIT cargado: el DNI son los 8 dígitos del medio
    WHEN length(d) = 11 THEN ltrim(substr(d, 3, 8), '0')
    ELSE ltrim(d, '0')
  END
  FROM (SELECT regexp_replace(coalesce(p_dni_cuit, ''), '\D', '', 'g') AS d) x;
$function$;

-- Datos que ve el navegador después de ingresar (nunca el hash).
CREATE OR REPLACE FUNCTION public.portal_titular_publico(p_titular_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT json_build_object(
    'id', t.id,
    'nombre', CASE WHEN t.tipo = 'empresa' THEN coalesce(t.razon_social, '')
                   ELSE trim(coalesce(t.nombres, '') || ' ' || coalesce(t.apellidos, '')) END,
    'tipo', t.tipo,
    'documento', t.dni_cuit,
    'must_change_password', coalesce(a.must_change_password, true)
  )
  FROM titulares t
  LEFT JOIN titulares_portal_acceso a ON a.titular_id = t.id
  WHERE t.id = p_titular_id;
$function$;

REVOKE ALL ON FUNCTION public.portal_titular_publico(uuid) FROM PUBLIC;

-- ---------------------------------------------------------
-- 3) Ingreso
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_titular_login(p_documento text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_doc text := ltrim(coalesce(p_documento, ''), '0');
  v_titular RECORD;
  v_hash text;
  v_ok boolean;
BEGIN
  IF v_doc = '' OR p_documento !~ '^\d+$' OR coalesce(p_password, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Documento o contraseña incorrectos');
  END IF;

  SELECT t.id, t.estado, public.portal_titular_documento(t.tipo, t.dni_cuit) AS documento
  INTO v_titular
  FROM titulares t
  WHERE ltrim(public.portal_titular_documento(t.tipo, t.dni_cuit), '0') = v_doc
  ORDER BY (t.estado = 'activo') DESC, t.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Documento o contraseña incorrectos');
  END IF;

  SELECT password_hash INTO v_hash FROM titulares_portal_acceso WHERE titular_id = v_titular.id;

  IF v_hash IS NULL THEN
    -- Primer ingreso: la contraseña es el documento.
    v_ok := ltrim(regexp_replace(p_password, '\D', '', 'g'), '0') = v_doc
            AND p_password ~ '^\d+$';
  ELSE
    v_ok := crypt(p_password, v_hash) = v_hash;
  END IF;

  IF NOT v_ok THEN
    RETURN json_build_object('success', false, 'error', 'Documento o contraseña incorrectos');
  END IF;

  IF v_titular.estado IS DISTINCT FROM 'activo' THEN
    RETURN json_build_object('success', false,
      'error', 'Tu cuenta no está activa. Si creés que es un error, comunicate con Toshify.');
  END IF;

  UPDATE titulares_portal_acceso SET ultimo_ingreso = now() WHERE titular_id = v_titular.id;

  RETURN json_build_object('success', true, 'titular', public.portal_titular_publico(v_titular.id));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'No se pudo ingresar. Intentá de nuevo.');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_titular_login(text, text) TO anon, authenticated;

-- ---------------------------------------------------------
-- 4) Cambio de contraseña (obligatorio en el primer ingreso)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_titular_cambiar_password(
  p_titular_id uuid,
  p_password_actual text,
  p_password_nueva text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_doc text;
  v_hash text;
  v_ok boolean;
BEGIN
  IF p_password_nueva IS NULL OR length(p_password_nueva) < 8
     OR p_password_nueva !~ '[A-Z]' OR p_password_nueva !~ '[a-z]' OR p_password_nueva !~ '[0-9]' THEN
    RETURN json_build_object('success', false,
      'error', 'La contraseña nueva necesita 8 caracteres, una mayúscula, una minúscula y un número');
  END IF;

  SELECT ltrim(public.portal_titular_documento(tipo, dni_cuit), '0') INTO v_doc
  FROM titulares WHERE id = p_titular_id AND estado = 'activo';
  IF v_doc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No se pudo cambiar la contraseña');
  END IF;

  SELECT password_hash INTO v_hash FROM titulares_portal_acceso WHERE titular_id = p_titular_id;
  IF v_hash IS NULL THEN
    v_ok := ltrim(coalesce(p_password_actual, ''), '0') = v_doc AND p_password_actual ~ '^\d+$';
  ELSE
    v_ok := crypt(coalesce(p_password_actual, ''), v_hash) = v_hash;
  END IF;

  IF NOT v_ok THEN
    RETURN json_build_object('success', false, 'error', 'La contraseña actual no es correcta');
  END IF;

  INSERT INTO titulares_portal_acceso (titular_id, password_hash, must_change_password, ultimo_ingreso)
  VALUES (p_titular_id, crypt(p_password_nueva, gen_salt('bf')), false, now())
  ON CONFLICT (titular_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        must_change_password = false,
        updated_at = now();

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'No se pudo cambiar la contraseña. Intentá de nuevo.');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_titular_cambiar_password(uuid, text, text) TO anon, authenticated;

-- ---------------------------------------------------------
-- 5) Restaurar la sesión al recargar (mismo criterio que el conductor:
--    el navegador guarda el id hasta tocar "Salir")
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_titular_sesion(p_titular_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM titulares
    WHERE id = p_titular_id AND estado = 'activo'
      AND public.portal_titular_documento(tipo, dni_cuit) IS NOT NULL
  ) THEN
    RETURN json_build_object('success', false);
  END IF;
  RETURN json_build_object('success', true, 'titular', public.portal_titular_publico(p_titular_id));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_titular_sesion(uuid) TO anon, authenticated;

COMMIT;
