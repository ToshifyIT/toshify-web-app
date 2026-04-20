/**
 * Toshify Production Server
 * Serves static files + Google Drive API
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { google } from 'googleapis'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { Readable } from 'stream'
// API REST removida - reemplazada por MCP Server (mcp/server.js)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 80

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Security headers (los que el browser ignora cuando van en <meta>)
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  next()
})

// Google Drive service
function getDriveService(writeAccess = false) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    throw new Error('Missing Google Service Account credentials')
  }

  const scopes = writeAccess
    ? ['https://www.googleapis.com/auth/drive.file']
    : ['https://www.googleapis.com/auth/drive.readonly']

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },
    scopes
  })

  return google.drive({ version: 'v3', auth })
}

// Drive service con scope completo (lectura + escritura de cualquier archivo compartido)
// Se usa exclusivamente para generación de contratos, donde se necesita leer plantillas
// que no fueron creadas por el service account.
function getDriveServiceFull() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    throw new Error('Missing Google Service Account credentials')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  })

  return google.drive({ version: 'v3', auth })
}

function extractFolderId(input) {
  if (!input) return null
  if (!input.includes('/')) return input
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// API: List Drive files
app.post('/api/list-drive-files', async (req, res) => {
  try {
    const { folderId, folderUrl } = req.body
    const targetFolderId = folderId || extractFolderId(folderUrl)

    if (!targetFolderId) {
      return res.status(400).json({ error: 'Falta parametro: folderId o folderUrl' })
    }

    const drive = getDriveService()
    const response = await drive.files.list({
      q: `'${targetFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, iconLink)',
      orderBy: 'name'
    })

    res.json({
      success: true,
      files: response.data.files || [],
      count: (response.data.files || []).length
    })
  } catch (error) {
    console.error('Error listing drive files:', error.message)

    if (error.code === 404) {
      return res.status(404).json({ error: 'Carpeta no encontrada o sin acceso' })
    }
    if (error.code === 403) {
      return res.status(403).json({ error: 'Sin permisos para acceder a esta carpeta' })
    }

    res.status(500).json({ error: error.message })
  }
})

// API: Create Drive folder
app.post('/api/create-drive-folder', async (req, res) => {
  try {
    const { tipo = 'conductor', conductorId, conductorNombre, conductorDni, vehiculoId, vehiculoPatente } = req.body

    // Get parent folder ID based on type
    const parentFolderId = tipo === 'vehiculo'
      ? process.env.GOOGLE_DRIVE_VEHICULOS_FOLDER_ID
      : process.env.GOOGLE_DRIVE_CONDUCTORES_FOLDER_ID

    if (!parentFolderId) {
      return res.status(500).json({ error: `Falta configurar GOOGLE_DRIVE_${tipo.toUpperCase()}S_FOLDER_ID` })
    }

    let folderName
    if (tipo === 'vehiculo') {
      if (!vehiculoPatente) {
        return res.status(400).json({ error: 'Falta parametro: vehiculoPatente' })
      }
      folderName = vehiculoPatente.toUpperCase()
    } else {
      if (!conductorNombre) {
        return res.status(400).json({ error: 'Falta parametro: conductorNombre' })
      }
      folderName = conductorDni
        ? `${conductorDni} - ${conductorNombre}`
        : conductorNombre
    }

    console.log(`Creating ${tipo} folder: ${folderName}`)

    const drive = getDriveService(true)
    const response = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      },
      fields: 'id, webViewLink'
    })

    const folder = response.data
    console.log('Folder created:', folder)

    res.json({
      success: true,
      folderId: folder.id,
      folderUrl: folder.webViewLink,
      folderName
    })
  } catch (error) {
    console.error('Error creating folder:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Cabify auth proxy (for production - in dev Vite proxy handles this)
app.post('/cabify-auth', async (req, res) => {
  try {
    const response = await fetch('https://cabify.com/auth/api/authorization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Cabify GraphQL proxy (for production - in dev Vite proxy handles this)
app.post('/cabify-graphql', async (req, res) => {
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization
    }
    const response = await fetch('https://partners.cabify.com/api/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Cabify efectivo toggle - activar/desactivar en un solo request
app.post('/api/cabify-efectivo', async (req, res) => {
  try {
    const { cabify_driver_id, cabify_company_id, accion, conductor_dni, conductor_nombre, alquiler, garantia, cobro_app } = req.body

    if (!cabify_driver_id || !cabify_company_id || !accion) {
      return res.status(400).json({ error: 'Faltan campos requeridos: cabify_driver_id, cabify_company_id, accion' })
    }

    if (accion !== 'activar' && accion !== 'desactivar') {
      return res.status(400).json({ error: 'accion debe ser "activar" o "desactivar"' })
    }

    // 1. Autenticar con Cabify
    const authResponse = await fetch('https://cabify.com/auth/api/authorization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: process.env.CABIFY_CLIENT_ID || process.env.VITE_CABIFY_CLIENT_ID || 'd14cdae660ad4817a6b20542a61cf5b1',
        client_secret: process.env.CABIFY_CLIENT_SECRET || process.env.VITE_CABIFY_CLIENT_SECRET || 'ebZ45Oj3ln9W5tFC',
        username: process.env.CABIFY_USERNAME || process.env.VITE_CABIFY_USERNAME || 'admin.log2@toshify.com.ar',
        password: process.env.CABIFY_PASSWORD || process.env.VITE_CABIFY_PASSWORD || 'tOSHIBASE2026.',
      }),
    })

    if (!authResponse.ok) {
      const authError = await authResponse.text()
      return res.status(401).json({ error: 'Error de autenticación con Cabify', detail: authError })
    }

    const authData = await authResponse.json()
    const token = authData.access_token

    // 2. Ejecutar mutation GraphQL
    const enabled = accion === 'activar'
    const mutation = `
      mutation ($driverId: String!, $companyId: String, $name: PreferenceName!, $enabled: Boolean!, $canWrite: Boolean) {
        updateDriverPreference(driverId: $driverId, companyId: $companyId, name: $name, enabled: $enabled, canWrite: $canWrite) {
          driverId name enabled canWrite
        }
      }
    `

    const gqlResponse = await fetch('https://partners.cabify.com/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          driverId: cabify_driver_id,
          companyId: cabify_company_id,
          name: 'PAYMENT_CASH',
          enabled,
          canWrite: enabled, // false al desactivar = muestra candado 🔒; true al activar = habilita normal
        },
      }),
    })

    const gqlData = await gqlResponse.json()
    const result = gqlData?.data?.updateDriverPreference

    if (!result || result.enabled !== enabled) {
      const errorMsg = gqlData?.errors?.[0]?.message || 'Respuesta inesperada de Cabify'
      return res.status(500).json({ error: errorMsg, detail: gqlData })
    }

    // 3. Registrar en log via Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/cabify_efectivo_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          conductor_dni: conductor_dni || null,
          conductor_nombre: conductor_nombre || null,
          cabify_driver_id,
          cabify_company_id,
          accion: accion === 'activar' ? 'activacion' : 'desactivacion',
          estado_anterior: enabled ? 'Desactivado' : 'Activado',
          resultado: 'ok',
          alquiler: alquiler || 0,
          garantia: garantia || 0,
          cobro_app: cobro_app || 0,
        }),
      })
    }

    res.json({ success: true, enabled: result.enabled, driverId: result.driverId })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Admin-only: Get integration tokens/credentials
// Verifies the Supabase JWT and checks the user is admin role
app.get('/api/admin/tokens', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configuracion del servidor incompleta' })
    }

    // Verify user via Supabase auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceKey,
      },
    })

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Token invalido' })
    }

    const user = await userRes.json()

    // Check user is admin via user_profiles + roles
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${user.id}&select=role_id,roles(name)`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    )

    if (!profileRes.ok) {
      return res.status(500).json({ error: 'Error verificando permisos' })
    }

    const profiles = await profileRes.json()
    const profile = profiles[0]
    const roleName = profile?.roles?.name

    if (roleName !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado - Solo administradores' })
    }

    // Return tokens from environment variables
    const env = process.env
    const tokens = {
      wialon: {
        token: env.WIALON_TOKEN || null,
      },
      cabify_ba: {
        username: env.VITE_CABIFY_USERNAME || null,
        password: env.VITE_CABIFY_PASSWORD || null,
        client_id: env.VITE_CABIFY_CLIENT_ID || null,
        client_secret: env.VITE_CABIFY_CLIENT_SECRET || null,
        company_id: env.VITE_CABIFY_COMPANY_ID || null,
      },
      cabify_bari: {
        username: env.CABIFY_BARI_USERNAME || null,
        password: env.CABIFY_BARI_PASSWORD || null,
        company_ids: env.CABIFY_BARI_COMPANY_IDS || null,
      },
      google_maps: {
        api_key: env.VITE_GOOGLE_MAPS_API_KEY || null,
      },
      google_drive: {
        service_account_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
        conductores_folder_id: env.GOOGLE_DRIVE_CONDUCTORES_FOLDER_ID || null,
        vehiculos_folder_id: env.GOOGLE_DRIVE_VEHICULOS_FOLDER_ID || null,
        // Private key: only show first/last 20 chars for verification
        private_key_preview: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
          ? `${env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.substring(0, 40)}...${env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.slice(-20)}`
          : null,
      },
      resend: {
        api_key: env.VITE_RESEND_API_KEY || env.RESEND_API_KEY || null,
      },
      supabase: {
        url: env.VITE_SUPABASE_URL || null,
        anon_key_preview: env.VITE_SUPABASE_ANON_KEY
          ? `${env.VITE_SUPABASE_ANON_KEY.substring(0, 30)}...${env.VITE_SUPABASE_ANON_KEY.slice(-10)}`
          : null,
        service_role_preview: env.SUPABASE_SERVICE_ROLE_KEY
          ? `${env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 30)}...${env.SUPABASE_SERVICE_ROLE_KEY.slice(-10)}`
          : null,
      },
    }

    res.json({ success: true, tokens })
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Admin-only: Health check all Edge Functions
app.get('/api/admin/function-health', async (req, res) => {
  try {
    // Same admin auth as /api/admin/tokens
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configuracion del servidor incompleta' })
    }

    // Verify admin
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey },
    })
    if (!userRes.ok) return res.status(401).json({ error: 'Token invalido' })

    const user = await userRes.json()
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${user.id}&select=role_id,roles(name)`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!profileRes.ok) return res.status(500).json({ error: 'Error verificando permisos' })

    const profiles = await profileRes.json()
    if (profiles[0]?.roles?.name !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' })
    }

    // Get all functions from config table
    const configRes = await fetch(
      `${supabaseUrl}/rest/v1/edge_function_config?select=*&order=category,function_name`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!configRes.ok) return res.status(500).json({ error: 'Error leyendo configuracion' })

    const functions = await configRes.json()

    // Ping each function in parallel (with 5s timeout per function)
    const results = await Promise.all(
      functions.map(async (fn) => {
        const start = Date.now()
        let status = 'unknown'
        let responseTime = null
        let errorMsg = null

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)

          const fnRes = await fetch(
            `${supabaseUrl}/functions/v1/${fn.function_name}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ healthCheck: true }),
              signal: controller.signal,
            }
          )

          clearTimeout(timeout)
          responseTime = Date.now() - start

          // Any HTTP response (even 400/500) means the function runtime is alive
          // Only network errors or timeouts mean it's truly down
          status = 'online'
        } catch (err) {
          responseTime = Date.now() - start
          if (err.name === 'AbortError') {
            status = 'timeout'
            errorMsg = 'Timeout (>10s)'
          } else {
            status = 'offline'
            errorMsg = err.message || 'Connection failed'
          }
        }

        return {
          ...fn,
          health_status: status,
          response_time_ms: responseTime,
          health_error: errorMsg,
          checked_at: new Date().toISOString(),
        }
      })
    )

    // Update last_health_check in DB (fire and forget)
    for (const r of results) {
      fetch(
        `${supabaseUrl}/rest/v1/edge_function_config?id=eq.${r.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            last_health_check: r.checked_at,
            last_health_status: r.health_status,
            updated_at: r.checked_at,
          }),
        }
      ).catch(() => {})
    }

    res.json({ success: true, functions: results })
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Admin-only: Toggle function active/inactive
app.post('/api/admin/toggle-function', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configuracion del servidor incompleta' })
    }

    // Verify admin
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey },
    })
    if (!userRes.ok) return res.status(401).json({ error: 'Token invalido' })

    const user = await userRes.json()
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${user.id}&select=role_id,roles(name)`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!profileRes.ok) return res.status(500).json({ error: 'Error verificando permisos' })

    const profiles = await profileRes.json()
    if (profiles[0]?.roles?.name !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' })
    }

    const { functionId, isActive } = req.body
    if (!functionId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Parametros invalidos: functionId y isActive requeridos' })
    }

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/edge_function_config?id=eq.${functionId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ is_active: isActive, updated_at: new Date().toISOString() }),
      }
    )

    if (!updateRes.ok) {
      return res.status(500).json({ error: 'Error actualizando funcion' })
    }

    const updated = await updateRes.json()
    res.json({ success: true, function: updated[0] })
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// =====================================================
// CONTRACT GENERATION
// =====================================================

const CONTRACT_CONFIG = {
  templates: {
    cartaOfertaTurno: '1nhZY3Lk4V-3PhaBAiFr-_0B-4oAkTxIdI5DWmzDS9Gk',
    actualizacionTurno: '1dIF48_QchY5mPl3H4SaE8KoZMdM_OjL6O667HENXEKw',
    cartaOfertaAutoCargo: '1IYK4z_0L8m0vM49FI_IKR-EmSnYOIs9WxYtlLdRU7XQ',
    actualizacionAutoCargo: '197gvFlYzb2csrjyzJ_r40OCv-1pEBjYO0uaOmYKLZXI',
    cartaOfertaPedidosYa: '1Zo6INIVFjdZWhuOF8F91iEjAWkIBg61lcxMCxcoRRQY',
    cartaOfertaAutoCargoBariloche: '1hAVB6eQ6LcCE_7YfB9llQLdGXN7EByHLvy0lG5YRQ5I'
  },
  folders: {
    principal: '1qQCnLb5OB1RioLcZOK8s5nKqaIhA7Kt7',
    pedidosYa: '1UkINzRmBvmwEVZRtoa61V4EtNl3dRNRY',
    bariloche: '1RZfsv-xU_zJSBX26Vwj3-0hHuI9qV1M4'
  },
  nameToshify: 'MARCIAL JOSUE CARIDE GUZMAN',
  amounts: { diurno: '299.000', nocturno: '229.000' }
}

/**
 * Determina qué plantilla usar según tipo_documento + modalidad + sede
 */
function resolveTemplateKey(tipoDocumento, modalidad, sedeCode) {
  if (tipoDocumento === 'na') return null

  const isBariloche = sedeCode && sedeCode.toUpperCase() === 'BARI'

  if (tipoDocumento === 'carta_oferta') {
    if (isBariloche) return 'cartaOfertaAutoCargoBariloche'
    if (modalidad === 'a_cargo') return 'cartaOfertaAutoCargo'
    return 'cartaOfertaTurno'
  }

  if (tipoDocumento === 'anexo') {
    if (modalidad === 'a_cargo') return 'actualizacionAutoCargo'
    return 'actualizacionTurno'
  }

  return null
}

/**
 * Determina la carpeta raíz según sede
 */
function resolveRootFolder(sedeCode) {
  if (sedeCode && sedeCode.toUpperCase() === 'BARI') return CONTRACT_CONFIG.folders.bariloche
  return CONTRACT_CONFIG.folders.principal
}

/**
 * Busca o crea la carpeta del conductor en Drive
 */
async function findOrCreateConductorFolder(drive, conductorDni, conductorNombre, rootFolderId) {
  const folderName = `${conductorDni} - ${conductorNombre}`

  // Buscar carpeta existente
  const searchRes = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    const folder = searchRes.data.files[0]
    return { folderId: folder.id, folderUrl: folder.webViewLink, folderName: folder.name, created: false }
  }

  // Crear carpeta nueva
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId]
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true
  })

  return {
    folderId: createRes.data.id,
    folderUrl: createRes.data.webViewLink,
    folderName,
    created: true
  }
}

/**
 * Obtiene datos del conductor desde Supabase (con JOINs para estado_civil y nacionalidad)
 */
async function fetchConductorData(conductorId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const res = await fetch(
    `${supabaseUrl}/rest/v1/conductores?id=eq.${conductorId}&select=*,estados_civiles(descripcion),nacionalidades(descripcion)`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  )

  if (!res.ok) throw new Error(`Error fetching conductor: ${res.statusText}`)
  const data = await res.json()
  if (!data || data.length === 0) throw new Error(`Conductor ${conductorId} no encontrado`)
  return data[0]
}

/**
 * Obtiene datos del vehículo desde Supabase
 */
async function fetchVehiculoData(vehiculoId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const res = await fetch(
    `${supabaseUrl}/rest/v1/vehiculos?id=eq.${vehiculoId}&select=patente,marca,modelo,color,anio,numero_motor,numero_chasis,kilometraje_actual`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  )

  if (!res.ok) throw new Error(`Error fetching vehiculo: ${res.statusText}`)
  const data = await res.json()
  if (!data || data.length === 0) throw new Error(`Vehiculo ${vehiculoId} no encontrado`)
  return data[0]
}

/**
 * Obtiene el código de la sede desde Supabase
 */
async function fetchSedeCode(sedeId) {
  if (!sedeId) return 'BSAS'
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const res = await fetch(
    `${supabaseUrl}/rest/v1/sedes?id=eq.${sedeId}&select=codigo`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  )

  if (!res.ok) return 'BSAS'
  const data = await res.json()
  return data[0]?.codigo || 'BSAS'
}

/**
 * Actualiza drive_folder_url del conductor en Supabase
 */
async function updateConductorDriveUrl(conductorId, folderUrl) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  await fetch(
    `${supabaseUrl}/rest/v1/conductores?id=eq.${conductorId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ drive_folder_url: folderUrl })
    }
  )
}

/**
 * Registra el documento generado en la tabla documentos_generados
 */
async function saveDocumentoGenerado(record) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const res = await fetch(
    `${supabaseUrl}/rest/v1/documentos_generados`,
    {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    }
  )

  if (!res.ok) {
    console.error('Error saving documento_generado:', await res.text())
  }
}

/**
 * Formatea fecha de nacimiento a DD/MM/YYYY
 */
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Genera un documento (docx + pdf) para un conductor específico
 * Retorna { docxUrl, pdfUrl, folderUrl, folderId }
 */
async function generateContractForConductor({
  drive, conductor, vehiculo, templateKey, turno, sedeCode
}) {
  const templateId = CONTRACT_CONFIG.templates[templateKey]
  if (!templateId) throw new Error(`Template no encontrada para key: ${templateKey}`)

  console.log(`[Contract] Generando ${templateKey} para ${conductor.nombres} ${conductor.apellidos}`)

  // 1. Exportar plantilla como .docx desde Drive
  const exportRes = await drive.files.export(
    { fileId: templateId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { responseType: 'arraybuffer' }
  )

  const templateBuffer = Buffer.from(exportRes.data)

  // 2. Reemplazar variables con docxtemplater
  //    Las plantillas usan {{VARIABLE}}, docxtemplater por defecto usa { y }
  //    Configuramos delimitadores personalizados
  const zip = new PizZip(templateBuffer)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => ''  // Variables no encontradas se reemplazan con string vacío
  })

  const fullName = `${conductor.nombres || ''} ${conductor.apellidos || ''}`.trim().toUpperCase()
  const amount = turno === 'nocturno' ? CONTRACT_CONFIG.amounts.nocturno : CONTRACT_CONFIG.amounts.diurno

  doc.render({
    'NAME': fullName,
    'DNI': (conductor.numero_dni || '').toUpperCase(),
    'ADDRESS': (conductor.direccion || '').toUpperCase(),
    'MAIL': (conductor.email || '').toUpperCase(),
    'PHONENUMBER': (conductor.telefono_contacto || '').toUpperCase(),
    'DATEOFBIRTH': formatDate(conductor.fecha_nacimiento),
    'CITIZEN': (conductor.nacionalidades?.descripcion || '').toUpperCase(),
    'MARITALSTATUS': (conductor.estados_civiles?.descripcion || '').toUpperCase(),
    'PLATE': (vehiculo.patente || '').toUpperCase(),
    'SHIFT': (turno || '').toUpperCase(),
    'MAKE': (vehiculo.marca || '').toUpperCase(),
    'MODEL': (vehiculo.modelo || '').toUpperCase(),
    'COLOR': (vehiculo.color || '').toUpperCase(),
    'YEAR': String(vehiculo.anio || '').toUpperCase(),
    'ENGINE NUMBER': (vehiculo.numero_motor || '').toUpperCase(),
    'CHASSIS NUMBER': (vehiculo.numero_chasis || '').toUpperCase(),
    'AMOUNT': amount,
    'NAMETOSHIFY': CONTRACT_CONFIG.nameToshify,
    'ACTUALYEAR': String(new Date().getFullYear()),
    'KM': String(vehiculo.kilometraje_actual || ''),
    'LTNAFTA': '',
    'OBSERVATIONS': '',
    'COVERAGE': '',
    'TYPE': ''
  })

  const docxBuffer = doc.getZip().generate({ type: 'nodebuffer' })

  // 3. Buscar o crear carpeta del conductor
  const rootFolderId = resolveRootFolder(sedeCode)
  const folder = await findOrCreateConductorFolder(
    drive,
    conductor.numero_dni || '',
    fullName,
    rootFolderId
  )

  // 4. Generar nombre de archivo
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const templateLabel = templateKey.replace(/([A-Z])/g, ' $1').trim()
  const fileName = `${fullName} - ${templateLabel} - ${dateStr}`

  // 5. Subir .docx a la carpeta del conductor
  const docxUpload = await drive.files.create({
    requestBody: {
      name: `${fileName}.docx`,
      parents: [folder.folderId],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(docxBuffer)
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true
  })

  // 6. Subir como Google Doc (para convertir a PDF)
  const tempGoogleDoc = await drive.files.create({
    requestBody: {
      name: `${fileName} (temp)`,
      parents: [folder.folderId],
      mimeType: 'application/vnd.google-apps.document'  // Convierte automáticamente a Google Doc
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(docxBuffer)
    },
    fields: 'id',
    supportsAllDrives: true
  })

  // 7. Exportar Google Doc como PDF
  const pdfExport = await drive.files.export(
    { fileId: tempGoogleDoc.data.id, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' }
  )

  // 8. Subir PDF a la carpeta del conductor
  const pdfUpload = await drive.files.create({
    requestBody: {
      name: `${fileName}.pdf`,
      parents: [folder.folderId],
      mimeType: 'application/pdf'
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(Buffer.from(pdfExport.data))
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true
  })

  // 9. Eliminar Google Doc temporal
  await drive.files.delete({
    fileId: tempGoogleDoc.data.id,
    supportsAllDrives: true
  }).catch(err => console.warn('[Contract] Error deleting temp doc:', err.message))

  // 10. Si el conductor no tenía drive_folder_url, actualizar
  if (!conductor.drive_folder_url && folder.folderUrl) {
    await updateConductorDriveUrl(conductor.id, folder.folderUrl)
  }

  console.log(`[Contract] OK: ${fileName} → docx: ${docxUpload.data.id}, pdf: ${pdfUpload.data.id}`)

  return {
    docxUrl: docxUpload.data.webViewLink,
    pdfUrl: pdfUpload.data.webViewLink,
    folderUrl: folder.folderUrl || `https://drive.google.com/drive/folders/${folder.folderId}`,
    folderId: folder.folderId
  }
}

// API: Generate contract documents
app.post('/api/generate-contract', async (req, res) => {
  try {
    const {
      conductor_id,        // UUID (modo a_cargo) o null
      conductor_diurno_id, // UUID (modo turno) o null
      conductor_nocturno_id, // UUID (modo turno) o null
      vehiculo_id,
      tipo_documento,      // 'carta_oferta' | 'anexo' (modo a_cargo)
      documento_diurno,    // 'carta_oferta' | 'anexo' | 'na' (modo turno)
      documento_nocturno,  // 'carta_oferta' | 'anexo' | 'na' (modo turno)
      modalidad,           // 'turno' | 'a_cargo'
      sede_id,
      programacion_id,     // UUID de la programación creada
      created_by,
      created_by_name
    } = req.body

    if (!vehiculo_id) {
      return res.status(400).json({ error: 'Falta vehiculo_id' })
    }

    const drive = getDriveServiceFull()
    const sedeCode = await fetchSedeCode(sede_id)
    const vehiculo = await fetchVehiculoData(vehiculo_id)

    const results = []

    if (modalidad === 'a_cargo' && conductor_id) {
      // Modo A CARGO: un solo conductor
      if (tipo_documento && tipo_documento !== 'na') {
        const templateKey = resolveTemplateKey(tipo_documento, 'a_cargo', sedeCode)
        if (templateKey) {
          const conductor = await fetchConductorData(conductor_id)
          const result = await generateContractForConductor({
            drive, conductor, vehiculo, templateKey, turno: null, sedeCode
          })

          await saveDocumentoGenerado({
            programacion_id,
            conductor_id,
            tipo_documento,
            plantilla_usada: templateKey,
            turno: null,
            url_docx: result.docxUrl,
            url_pdf: result.pdfUrl,
            drive_folder_url: result.folderUrl,
            drive_folder_id: result.folderId,
            estado: 'generado',
            sede_id,
            created_by,
            created_by_name
          })

          results.push({
            conductor_id,
            conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
            turno: null,
            ...result
          })
        }
      }
    } else if (modalidad === 'turno') {
      // Modo TURNO: hasta 2 conductores
      const turnoConfigs = [
        { id: conductor_diurno_id, doc: documento_diurno, turno: 'diurno' },
        { id: conductor_nocturno_id, doc: documento_nocturno, turno: 'nocturno' }
      ]

      for (const cfg of turnoConfigs) {
        if (cfg.id && cfg.doc && cfg.doc !== 'na') {
          const templateKey = resolveTemplateKey(cfg.doc, 'turno', sedeCode)
          if (templateKey) {
            const conductor = await fetchConductorData(cfg.id)
            const result = await generateContractForConductor({
              drive, conductor, vehiculo, templateKey, turno: cfg.turno, sedeCode
            })

            await saveDocumentoGenerado({
              programacion_id,
              conductor_id: cfg.id,
              tipo_documento: cfg.doc,
              plantilla_usada: templateKey,
              turno: cfg.turno,
              url_docx: result.docxUrl,
              url_pdf: result.pdfUrl,
              drive_folder_url: result.folderUrl,
              drive_folder_id: result.folderId,
              estado: 'generado',
              sede_id,
              created_by,
              created_by_name
            })

            results.push({
              conductor_id: cfg.id,
              conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
              turno: cfg.turno,
              ...result
            })
          }
        }
      }
    }

    if (results.length === 0) {
      return res.json({
        success: true,
        message: 'No se generaron documentos (tipo_documento es "na" o no se proporcionaron conductores)',
        documents: []
      })
    }

    res.json({ success: true, documents: results })
  } catch (error) {
    console.error('[Contract] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static files from dist
app.use(express.static(join(__dirname, 'dist')))

// SPA fallback - all routes go to index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Toshify running on port ${PORT}`)
})
