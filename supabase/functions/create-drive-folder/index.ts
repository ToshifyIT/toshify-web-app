// Edge Function: Create Google Drive Folder for Conductor or Vehiculo
// Crea una carpeta en Google Drive usando Service Account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64urlEncode } from 'https://deno.land/std@0.168.0/encoding/base64url.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función para crear JWT para Google Service Account
async function createGoogleJWT(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Importar la clave privada para firmar
  const pemContents = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  const signatureB64 = base64urlEncode(new Uint8Array(signature))
  return `${unsignedToken}.${signatureB64}`
}

// Obtener access token de Google
async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const jwt = await createGoogleJWT(clientEmail, privateKey)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Error getting Google token:', errorText)
    throw new Error('Failed to get Google access token')
  }

  const data = await response.json()
  return data.access_token
}

// Crear carpeta en Google Drive
async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  }

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Error creating folder:', errorText)
    throw new Error('Failed to create Google Drive folder: ' + errorText)
  }

  return response.json()
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener datos del request primero para saber qué tipo es
    const body = await req.json()
    const { tipo = 'conductor' } = body // 'conductor' o 'vehiculo'

    // Obtener credenciales de variables de entorno
    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n')

    // Seleccionar carpeta padre según el tipo
    const parentFolderId = tipo === 'vehiculo'
      ? Deno.env.get('GOOGLE_DRIVE_VEHICULOS_FOLDER_ID')
      : Deno.env.get('GOOGLE_DRIVE_CONDUCTORES_FOLDER_ID')

    if (!clientEmail || !privateKey || !parentFolderId) {
      throw new Error(`Missing Google Drive configuration for ${tipo}. Check environment variables.`)
    }

    // Verificar autenticación Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Usuario no autenticado')
    }

    // Extraer datos del body según el tipo
    const { conductorId, conductorNombre, conductorDni, vehiculoId, vehiculoPatente } = body

    let entityId: string
    let folderName: string
    let tableName: string

    if (tipo === 'vehiculo') {
      if (!vehiculoId || !vehiculoPatente) {
        throw new Error('Faltan parámetros: vehiculoId y vehiculoPatente')
      }
      entityId = vehiculoId
      folderName = vehiculoPatente.toUpperCase()
      tableName = 'vehiculos'
    } else {
      if (!conductorId || !conductorNombre) {
        throw new Error('Faltan parámetros: conductorId y conductorNombre')
      }
      entityId = conductorId
      // Crear nombre de carpeta: "DNI - NombreApellido" o "ID - NombreApellido"
      folderName = conductorDni
        ? `${conductorDni} - ${conductorNombre}`
        : `${conductorId.slice(0, 8)} - ${conductorNombre}`
      tableName = 'conductores'
    }

    console.log(`Creating ${tipo} folder:`, folderName)

    // Obtener access token de Google
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey)

    // Crear carpeta
    const folder = await createDriveFolder(accessToken, folderName, parentFolderId)

    console.log('Folder created:', folder)

    // Actualizar la entidad con el link de la carpeta
    const { error: updateError } = await supabaseAdmin
      .from(tableName)
      .update({
        url_documentacion: folder.webViewLink,
        drive_folder_id: folder.id,
        drive_folder_url: folder.webViewLink
      })
      .eq('id', entityId)

    if (updateError) {
      console.error(`Error updating ${tipo}:`, updateError)
      // No lanzar error, la carpeta ya se creó
    }

    return new Response(
      JSON.stringify({
        success: true,
        folderId: folder.id,
        folderUrl: folder.webViewLink,
        folderName: folderName
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error en create-drive-folder:', error)

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
