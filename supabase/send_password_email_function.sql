-- Función para enviar email de contraseña usando extensión http
-- Ejecutar en Supabase SQL Editor

-- Habilitar la extensión http
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Crear la función para enviar email
CREATE OR REPLACE FUNCTION public.send_password_email(
  user_email TEXT,
  user_name TEXT,
  user_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  response extensions.http_response;
  email_html TEXT;
  resend_api_key TEXT := 're_gU4r13Fq_CNEqtvPK3s51mePJaybos2UJ';
  request_body JSONB;
BEGIN
  -- Construir el HTML del email
  email_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:20px}.container{max-width:500px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.logo{text-align:center;margin-bottom:30px}.logo span{font-size:28px;font-weight:700;color:#FF0033}h1{color:#333;font-size:22px;margin-bottom:20px}p{color:#666;line-height:1.6}.password-box{background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:24px 0}.password{font-family:monospace;font-size:24px;letter-spacing:3px;color:#333;font-weight:600}.warning{background:#fef3cd;border:1px solid #ffc107;padding:12px;border-radius:8px;margin-top:20px;font-size:13px;color:#856404}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center}</style></head><body><div class="container"><div class="logo"><span>toshify</span></div><h1>Hola ' || user_name || ',</h1><p>Tu contraseña ha sido restablecida por un administrador. Aquí está tu nueva contraseña temporal:</p><div class="password-box"><div class="password">' || user_password || '</div></div><div class="warning"><strong>Importante:</strong> Por seguridad, deberás cambiar esta contraseña la próxima vez que inicies sesión.</div><div class="footer"><p>Este es un mensaje automático de Toshify. No respondas a este correo.</p></div></div></body></html>';

  -- Construir el body del request
  request_body := jsonb_build_object(
    'from', 'Toshify <noreply@toshify.com.ar>',
    'to', jsonb_build_array(user_email),
    'subject', 'Tu nueva contraseña - Toshify',
    'html', email_html
  );

  -- Hacer la llamada HTTP a Resend
  SELECT * INTO response FROM extensions.http((
    'POST',
    'https://api.resend.com/emails',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || resend_api_key),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    request_body::text
  )::extensions.http_request);

  -- Verificar respuesta
  IF response.status >= 200 AND response.status < 300 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Email enviado',
      'status', response.status
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'HTTP ' || response.status || ': ' || response.content
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Dar permisos
GRANT EXECUTE ON FUNCTION public.send_password_email TO authenticated;
