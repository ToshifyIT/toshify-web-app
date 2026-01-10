// Edge Function: List Google Drive Files in a folder
// Lista los archivos de una carpeta en Google Drive usando Service Account

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
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

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

// Listar archivos en una carpeta de Google Drive
async function listDriveFiles(
  accessToken: string,
  folderId: string
): Promise<Array<{
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
  webViewLink?: string
  thumbnailLink?: string
  iconLink?: string
}>> {
  const query = `'${folderId}' in parents and trashed=false`
  const fields = 'files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, iconLink)'

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=name`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Error listing files:', errorText)
    throw new Error('Failed to list Drive files: ' + errorText)
  }

  const data = await response.json()
  return data.files || []
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener credenciales de variables de entorno
    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n')

    if (!clientEmail || !privateKey) {
      throw new Error('Missing Google Drive configuration. Check environment variables.')
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

    // Obtener folderId del body
    const body = await req.json()
    const { folderId, folderUrl } = body

    // Extraer folderId de la URL si se proporciona
    let targetFolderId = folderId
    if (!targetFolderId && folderUrl) {
      // Extraer ID de URLs como https://drive.google.com/drive/folders/1abc123
      const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/)
      if (match) {
        targetFolderId = match[1]
      }
    }

    if (!targetFolderId) {
      throw new Error('Falta parámetro: folderId o folderUrl')
    }

    console.log('Listing files for folder:', targetFolderId)

    // Obtener access token de Google
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey)

    // Listar archivos
    const files = await listDriveFiles(accessToken, targetFolderId)

    console.log(`Found ${files.length} files`)

    return new Response(
      JSON.stringify({
        success: true,
        files: files,
        count: files.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error en list-drive-files:', error)

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
