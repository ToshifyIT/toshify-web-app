// Edge Function: Enviar contraseña por email usando Resend
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY no configurada')
    }

    const { email, userName, password } = await req.json()

    if (!email || !password) {
      throw new Error('Faltan parámetros: email y password son requeridos')
    }

    // Enviar email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Toshify <noreply@toshify.com.ar>',
        to: [email],
        subject: 'Tu nueva contraseña - Toshify',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
              .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              .logo { text-align: center; margin-bottom: 30px; }
              .logo span { font-size: 28px; font-weight: 700; color: #FF0033; }
              h1 { color: #333; font-size: 22px; margin-bottom: 20px; }
              p { color: #666; line-height: 1.6; }
              .password-box { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 24px 0; }
              .password { font-family: monospace; font-size: 24px; letter-spacing: 3px; color: #333; font-weight: 600; }
              .warning { background: #fef3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 8px; margin-top: 20px; font-size: 13px; color: #856404; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">
                <span>toshify</span>
              </div>
              <h1>Hola ${userName || 'Usuario'},</h1>
              <p>Tu contraseña ha sido restablecida por un administrador. Aqui esta tu nueva contraseña temporal:</p>
              <div class="password-box">
                <div class="password">${password}</div>
              </div>
              <div class="warning">
                <strong>Importante:</strong> Por seguridad, deberas cambiar esta contraseña la proxima vez que inicies sesion.
              </div>
              <div class="footer">
                <p>Este es un mensaje automatico de Toshify. No respondas a este correo.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Error de Resend:', data)
      throw new Error(data.message || 'Error enviando email')
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email enviado correctamente' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
