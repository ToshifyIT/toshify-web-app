// Edge Function: Sync Google Drive Folders with Conductores
// Lista carpetas de Drive y hace matching con conductores por nombre aproximado

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
  const header = { alg: 'RS256', typ: 'JWT' }

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
    throw new Error('Failed to get Google access token: ' + errorText)
  }

  const data = await response.json()
  return data.access_token
}

// Listar carpetas en una carpeta padre de Google Drive
async function listDriveFolders(
  accessToken: string,
  parentFolderId: string
): Promise<Array<{ id: string; name: string; webViewLink: string }>> {
  const folders: Array<{ id: string; name: string; webViewLink: string }> = []
  let pageToken: string | null = null

  do {
    const params = new URLSearchParams({
      q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, webViewLink)',
      pageSize: '1000'
    })

    if (pageToken) {
      params.append('pageToken', pageToken)
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error('Failed to list Drive folders: ' + errorText)
    }

    const data = await response.json()
    folders.push(...data.files)
    pageToken = data.nextPageToken || null
  } while (pageToken)

  return folders
}

// Normalizar nombre para comparación
function normalizeForComparison(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^A-Z0-9\s]/g, '') // Solo letras, números y espacios
    .replace(/\s+/g, ' ')
    .trim()
}

// Calcular similitud entre dos strings (Levenshtein simplificado)
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForComparison(str1)
  const s2 = normalizeForComparison(str2)

  if (s1 === s2) return 1

  // Verificar si uno contiene al otro
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9
  }

  // Dividir en palabras y contar coincidencias
  const words1 = s1.split(' ').filter(w => w.length > 2)
  const words2 = s2.split(' ').filter(w => w.length > 2)

  if (words1.length === 0 || words2.length === 0) return 0

  let matches = 0
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matches++
        break
      }
    }
  }

  return matches / Math.max(words1.length, words2.length)
}

// Encontrar el mejor match para un conductor
function findBestMatch(
  conductor: { id: string; nombres: string; apellidos: string; numero_dni: string | null },
  folders: Array<{ id: string; name: string; webViewLink: string }>
): { folder: typeof folders[0]; score: number } | null {
  const conductorFullName = `${conductor.nombres} ${conductor.apellidos}`
  const conductorDni = conductor.numero_dni

  let bestMatch: { folder: typeof folders[0]; score: number } | null = null

  for (const folder of folders) {
    // Primero intentar match por DNI si está en el nombre de la carpeta
    if (conductorDni && folder.name.includes(conductorDni)) {
      return { folder, score: 1 }
    }

    // Calcular similitud por nombre
    const similarity = calculateSimilarity(conductorFullName, folder.name)

    if (similarity >= 0.7 && (!bestMatch || similarity > bestMatch.score)) {
      bestMatch = { folder, score: similarity }
    }
  }

  return bestMatch
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener credenciales
    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n')
    const parentFolderId = Deno.env.get('GOOGLE_DRIVE_CONDUCTORES_FOLDER_ID')

    if (!clientEmail || !privateKey || !parentFolderId) {
      throw new Error('Missing Google Drive configuration')
    }

    // Verificar autenticación
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

    // Parsear body para ver si hay filtro específico
    let conductorId: string | null = null
    try {
      const body = await req.json()
      conductorId = body.conductorId || null
    } catch {
      // No body, procesar todos
    }

    console.log('Getting Google access token...')
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey)

    console.log('Listing Drive folders...')
    const folders = await listDriveFolders(accessToken, parentFolderId)
    console.log(`Found ${folders.length} folders in Drive`)

    // Obtener conductores sin drive_folder_url
    let query = supabaseAdmin
      .from('conductores')
      .select('id, nombres, apellidos, numero_dni')

    if (conductorId) {
      query = query.eq('id', conductorId)
    } else {
      query = query.is('drive_folder_url', null)
    }

    const { data: conductores, error: conductoresError } = await query

    if (conductoresError) {
      throw new Error('Error fetching conductores: ' + conductoresError.message)
    }

    console.log(`Found ${conductores?.length || 0} conductores to process`)

    const results = {
      matched: [] as Array<{ conductorId: string; conductorName: string; folderName: string; score: number }>,
      unmatched: [] as Array<{ conductorId: string; conductorName: string }>,
      errors: [] as Array<{ conductorId: string; error: string }>
    }

    // Procesar cada conductor
    for (const conductor of (conductores || [])) {
      const fullName = `${conductor.nombres} ${conductor.apellidos}`

      try {
        const match = findBestMatch(conductor, folders)

        if (match && match.score >= 0.7) {
          // Actualizar conductor con la URL
          const { error: updateError } = await supabaseAdmin
            .from('conductores')
            .update({
              drive_folder_id: match.folder.id,
              drive_folder_url: match.folder.webViewLink
            })
            .eq('id', conductor.id)

          if (updateError) {
            results.errors.push({ conductorId: conductor.id, error: updateError.message })
          } else {
            results.matched.push({
              conductorId: conductor.id,
              conductorName: fullName,
              folderName: match.folder.name,
              score: match.score
            })
          }
        } else {
          results.unmatched.push({ conductorId: conductor.id, conductorName: fullName })
        }
      } catch (err: any) {
        results.errors.push({ conductorId: conductor.id, error: err.message })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFolders: folders.length,
        totalConductores: conductores?.length || 0,
        matched: results.matched.length,
        unmatched: results.unmatched.length,
        errors: results.errors.length,
        details: results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error en sync-drive-folders:', error)

    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
