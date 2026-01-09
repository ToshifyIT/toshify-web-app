// Edge Function: Reset User Password
// Permite a administradores resetear contraseñas de usuarios y marcar must_change_password

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente con service role para operaciones admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Obtener token del header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')

    // Verificar el token y obtener el usuario
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      console.error('Error verificando usuario:', userError)
      throw new Error('Usuario no autenticado')
    }

    // Verificar rol de admin
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error obteniendo perfil:', profileError)
      throw new Error('No se pudo verificar el perfil del usuario')
    }

    const roleName = (callerProfile?.roles as any)?.name?.toLowerCase() || ''
    console.log('Rol del usuario que llama:', roleName)

    if (roleName !== 'admin' && roleName !== 'administrador' && roleName !== 'superadmin') {
      throw new Error('No tienes permisos para realizar esta acción. Rol: ' + roleName)
    }

    // Obtener datos del request
    const { userId, newPassword, mustChangePassword, sendEmail, userEmail } = await req.json()

    if (!userId || !newPassword) {
      throw new Error('Faltan parámetros requeridos: userId y newPassword')
    }

    // Validar contraseña
    if (newPassword.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres')
    }

    console.log('Actualizando contraseña para usuario:', userId)

    // 1. Actualizar contraseña en Auth
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (updateAuthError) {
      console.error('Error actualizando auth:', updateAuthError)
      throw new Error('Error al cambiar contraseña: ' + updateAuthError.message)
    }

    console.log('Contraseña actualizada exitosamente')

    // 2. Marcar must_change_password en user_profiles
    if (mustChangePassword) {
      const { error: updateProfileError } = await supabaseAdmin
        .from('user_profiles')
        .update({ must_change_password: true })
        .eq('id', userId)

      if (updateProfileError) {
        console.error('Error actualizando perfil:', updateProfileError)
        // No lanzar error, la contraseña ya se cambió
      } else {
        console.log('must_change_password marcado como true')
      }
    }

    // 3. Enviar email si se solicitó
    if (sendEmail && userEmail) {
      console.log(`Email solicitado para ${userEmail} con nueva contraseña`)
      // TODO: Integrar con servicio de email (Resend, SendGrid, etc.)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Contraseña actualizada correctamente'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error en reset-user-password:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Error interno del servidor'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
