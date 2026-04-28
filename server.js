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
  // Flag para alternar entre plantillas de producción y de prueba (TB)
  // true = usa plantillas TB (prueba) | false = usa plantillas de producción
  useTestTemplates: true,
  templates: {
    cartaOfertaTurno: '1nhZY3Lk4V-3PhaBAiFr-_0B-4oAkTxIdI5DWmzDS9Gk',
    actualizacionTurno: '1dIF48_QchY5mPl3H4SaE8KoZMdM_OjL6O667HENXEKw',
    cartaOfertaAutoCargo: '1IYK4z_0L8m0vM49FI_IKR-EmSnYOIs9WxYtlLdRU7XQ',
    actualizacionAutoCargo: '197gvFlYzb2csrjyzJ_r40OCv-1pEBjYO0uaOmYKLZXI',
    cartaOfertaPedidosYa: '1Zo6INIVFjdZWhuOF8F91iEjAWkIBg61lcxMCxcoRRQY',
    cartaOfertaAutoCargoBariloche: '1hAVB6eQ6LcCE_7YfB9llQLdGXN7EByHLvy0lG5YRQ5I',
    // Plantillas de prueba (TB)
    cartaOfertaTurnoTB: '1rjSKaYDUqls9T-NQU22CvR6TDfhCeX_rSlPREXh8CRQ',
    actualizacionTurnoTB: '1xSfKu0QzyOUBiP3tSBoQkm79pFK1b9XVr0-JNlNdOoo',
    cartaOfertaAutoCargoTB: '1_amfmBuFNIS_JtiAVvVAmWJXWET2tPhqpxQdORqMEOM',
    actualizacionAutoCargoTB: '1IB7Dstd_9t8JDSjHIBsiaIsZfKbhknLQWNWzktU2iyY',
    cartaOfertaAutoCargoBarilocheTB: '1_4DID8aqv3JvB7Xri1OV3EOHNfSi-0nDWC0rxTMDeVE'
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
 * Resuelve el ID de la plantilla según la key y el flag useTestTemplates.
 * Si useTestTemplates es true, busca key + 'TB'. Si no existe, usa la original como fallback.
 */
function getTemplateId(templateKey) {
  if (CONTRACT_CONFIG.useTestTemplates) {
    const testKey = templateKey + 'TB'
    if (CONTRACT_CONFIG.templates[testKey]) {
      console.log(`[Contract] Usando plantilla TB: ${testKey}`)
      return CONTRACT_CONFIG.templates[testKey]
    }
    console.log(`[Contract] Plantilla TB no encontrada para ${testKey}, usando producción: ${templateKey}`)
  }
  return CONTRACT_CONFIG.templates[templateKey]
}

/**
 * Determina qué plantilla usar según tipo_documento + modalidad + sede
 */
function resolveTemplateKey(tipoDocumento, modalidad, sedeCode) {
  if (tipoDocumento === 'na') return null

  const isBariloche = sedeCode && sedeCode.toUpperCase() === 'BRC'

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
  if (sedeCode && sedeCode.toUpperCase() === 'BRC') return CONTRACT_CONFIG.folders.bariloche
  return CONTRACT_CONFIG.folders.principal
}

/**
 * Busca o crea la carpeta del conductor en Drive
 */
async function findOrCreateConductorFolder(drive, conductorDni, conductorNombre, rootFolderId) {
  const folderName = conductorNombre
  const folderNameLegacy = `${conductorDni} - ${conductorNombre}`

  // Buscar carpeta con formato nuevo (solo nombre)
  const searchRes = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    const folder = searchRes.data.files[0]
    return { folderId: folder.id, folderUrl: `https://drive.google.com/drive/folders/${folder.id}`, folderName: folder.name, created: false }
  }

  // Buscar carpeta con formato legacy (DNI - nombre) para no crear duplicados
  if (conductorDni) {
    const searchLegacy = await drive.files.list({
      q: `name='${folderNameLegacy.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })

    if (searchLegacy.data.files && searchLegacy.data.files.length > 0) {
      const folder = searchLegacy.data.files[0]
      return { folderId: folder.id, folderUrl: `https://drive.google.com/drive/folders/${folder.id}`, folderName: folder.name, created: false }
    }
  }

  // Crear carpeta nueva (solo nombre, sin DNI)
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId]
    },
    fields: 'id',
    supportsAllDrives: true
  })

  // Compartir carpeta con el dominio toshify.com.ar
  try {
    await drive.permissions.create({
      fileId: createRes.data.id,
      requestBody: {
        role: 'writer',
        type: 'domain',
        domain: 'toshify.com.ar'
      },
      supportsAllDrives: true,
      sendNotificationEmail: false
    })
  } catch (permErr) {
    console.warn(`[Drive] No se pudo compartir carpeta ${createRes.data.id}: ${permErr.message}`)
  }

  return {
    folderId: createRes.data.id,
    folderUrl: `https://drive.google.com/drive/folders/${createRes.data.id}`,
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
    `${supabaseUrl}/rest/v1/vehiculos?id=eq.${vehiculoId}&select=patente,marca,modelo,color,anio,numero_motor,numero_chasis,kilometraje_actual,gnc,cobertura,notas`,
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

  if (!res.ok) {
    console.error(`[fetchSedeCode] Error al consultar sede ${sedeId}: HTTP ${res.status}`)
    return 'BSAS'
  }
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
 * Determina el código del concepto de facturación según turno, modalidad y GNC del vehículo.
 * Mapeo:
 *   Diurno  + GNC → P001 | Diurno  sin GNC → P014
 *   Nocturno + GNC → P013 | Nocturno sin GNC → P015
 *   A Cargo + GNC → P002 | A Cargo sin GNC → P016
 */
function resolveConceptoCodigo(turno, modalidad, gnc) {
  const tieneGnc = !!gnc
  if (modalidad === 'a_cargo' || !turno) {
    return tieneGnc ? 'P002' : 'P016'
  }
  if (turno === 'nocturno') {
    return tieneGnc ? 'P013' : 'P015'
  }
  // diurno (default)
  return tieneGnc ? 'P001' : 'P014'
}

/**
 * Consulta la tabla conceptos_nomina y devuelve el precio_final formateado en pesos argentinos.
 * Ej: 42714.29 → "42.714,29"
 */
async function fetchAmountFromConceptos(turno, modalidad, gnc) {
  const codigo = resolveConceptoCodigo(turno, modalidad, gnc)
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const res = await fetch(
    `${supabaseUrl}/rest/v1/conceptos_nomina?codigo=eq.${codigo}&select=precio_final`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  )

  if (!res.ok) {
    console.error(`[Contract] Error fetching concepto ${codigo}: ${res.statusText}`)
    return null
  }

  const data = await res.json()
  if (!data || data.length === 0 || data[0].precio_final == null) {
    console.error(`[Contract] Concepto ${codigo} no encontrado o sin precio_final`)
    return null
  }

  const precioSemanal = data[0].precio_final
  // Multiplicar x 7 (valor semanal → valor que va en el documento)
  // Redondear a entero para evitar decimales por aritmética de punto flotante
  const precioFinal = Math.round(precioSemanal * 7)
  // Formatear como pesos argentinos: 299000 → "$299.000,00"
  const formatted = '$' + precioFinal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  console.log(`[Contract] AMOUNT: concepto ${codigo} → semanal $${precioSemanal} x 7 = ${formatted}`)
  return formatted
}

/**
 * Genera un documento (docx + pdf) para un conductor específico
 * Retorna { googleDocUrl, pdfUrl, folderUrl, folderId }
 */
async function generateContractForConductor({
  drive, conductor, vehiculo, templateKey, turno, sedeCode, modalidad
}) {
  const templateId = getTemplateId(templateKey)
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
    nullGetter: (part) => `{{${part.value}}}`  // Variables sin dato se dejan como placeholder
  })

  const fullName = `${conductor.nombres || ''} ${conductor.apellidos || ''}`.trim().toUpperCase()
  const amount = await fetchAmountFromConceptos(turno, modalidad, vehiculo.gnc)

  // Solo incluir variables que tengan dato real, las vacías las maneja nullGetter
  const renderData = {}
  const addIfPresent = (key, value) => { if (value) renderData[key] = value }

  addIfPresent('NAME', fullName)
  addIfPresent('DNI', conductor.numero_dni?.toUpperCase())
  addIfPresent('ADDRESS', conductor.direccion?.toUpperCase())
  addIfPresent('MAIL', conductor.email?.toUpperCase())
  addIfPresent('PHONENUMBER', conductor.telefono_contacto?.toUpperCase())
  addIfPresent('DATEOFBIRTH', formatDate(conductor.fecha_nacimiento))
  addIfPresent('CITIZEN', conductor.nacionalidades?.descripcion?.toUpperCase())
  addIfPresent('MARITALSTATUS', conductor.estados_civiles?.descripcion?.toUpperCase())
  addIfPresent('PLATE', vehiculo.patente?.toUpperCase())
  addIfPresent('SHIFT', turno?.toUpperCase())
  addIfPresent('MAKE', vehiculo.marca?.toUpperCase())
  addIfPresent('MODEL', vehiculo.modelo?.toUpperCase())
  addIfPresent('COLOR', vehiculo.color?.toUpperCase())
  addIfPresent('YEAR', vehiculo.anio ? String(vehiculo.anio) : null)
  addIfPresent('ENGINE NUMBER', vehiculo.numero_motor?.toUpperCase())
  addIfPresent('CHASSIS NUMBER', vehiculo.numero_chasis?.toUpperCase())
  addIfPresent('AMOUNT', amount)
  addIfPresent('AMMOUNT', amount)
  addIfPresent('COVERAGE', vehiculo.cobertura?.toUpperCase())
  addIfPresent('MODE', modalidad === 'a_cargo' ? 'A CARGO' : (turno === 'nocturno' ? 'NOCTURNO' : 'DIURNO'))
  addIfPresent('OBSERVATIONS', vehiculo.notas)
  addIfPresent('NAMETOSHIFY', CONTRACT_CONFIG.nameToshify)
  addIfPresent('ACTUALYEAR', String(new Date().getFullYear()))
  addIfPresent('KM', vehiculo.kilometraje_actual ? String(vehiculo.kilometraje_actual) : null)

  doc.render(renderData)

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
  // Formato: "TIPO - MODALIDAD[ - TURNO] - NOMBRE"
  // Ejemplos:
  //   Carta Oferta - A Cargo - NOMBRE
  //   Carta Oferta - Turno - Diurno - NOMBRE
  //   Actualizacion Carta Oferta - Auto a Cargo Bariloche - NOMBRE
  const tipoLabel = templateKey.includes('cartaOferta') ? 'Carta Oferta' : 'Actualizacion Carta Oferta'
  const sedeLabel = sedeCode?.toUpperCase() === 'BRC' ? ' Bariloche' : ''
  const isAutoCargo = modalidad === 'a_cargo'
  const modalidadLabel = isAutoCargo ? `Auto a Cargo${sedeLabel}` : `Turno${sedeLabel}`
  const turnoLabel = (!isAutoCargo && turno) ? (turno === 'diurno' ? 'Diurno' : 'Nocturno') : ''
  const fileName = turnoLabel
    ? `${tipoLabel} - ${modalidadLabel} - ${turnoLabel} - ${fullName}`
    : `${tipoLabel} - ${modalidadLabel} - ${fullName}`

  // 5. Subir como Google Doc (documento definitivo, editable por Apps Script)
  const googleDoc = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folder.folderId],
      mimeType: 'application/vnd.google-apps.document'
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(docxBuffer)
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true
  })

  // 6. (PDF deshabilitado por ahora - se implementará más adelante)

  // 7. Siempre actualizar drive_folder_url del conductor
  const finalFolderUrl = `https://drive.google.com/drive/folders/${folder.folderId}`
  await updateConductorDriveUrl(conductor.id, finalFolderUrl)

  console.log(`[Contract] OK: ${fileName} → doc: ${googleDoc.data.id}`)

  return {
    googleDocUrl: googleDoc.data.webViewLink,
    googleDocId: googleDoc.data.id,
    pdfUrl: null,
    folderUrl: `https://drive.google.com/drive/folders/${folder.folderId}`,
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
            drive, conductor, vehiculo, templateKey, turno: null, sedeCode, modalidad: 'a_cargo'
          })

          await saveDocumentoGenerado({
            programacion_id,
            conductor_id,
            tipo_documento,
            plantilla_usada: templateKey,
            turno: null,
            url_docx: result.googleDocUrl,
            url_pdf: result.pdfUrl,
            google_doc_id: result.googleDocId,
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
              drive, conductor, vehiculo, templateKey, turno: cfg.turno, sedeCode, modalidad: 'turno'
            })

            await saveDocumentoGenerado({
              programacion_id,
              conductor_id: cfg.id,
              tipo_documento: cfg.doc,
              plantilla_usada: templateKey,
              turno: cfg.turno,
              url_docx: result.googleDocUrl,
              url_pdf: result.pdfUrl,
              google_doc_id: result.googleDocId,
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

// Servicio Google Docs API (para editar documentos existentes)
function getDocsService() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('Missing Google Service Account credentials')

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive']
  })

  return google.docs({ version: 'v1', auth })
}

// API: Completar Control — edita el Google Doc existente y genera PDF
app.post('/api/complete-control', async (req, res) => {
  try {
    const {
      conductor_id,
      asignacion_id,
      // Campos de control
      km,
      ltnafta,
      cristal_status,
      carter,
      tires,
      others_docs,
      other_accesory,
      make_chains,
      status_chains,
      tensioners_chains,
      others_kit
    } = req.body

    if (!conductor_id) {
      return res.status(400).json({ error: 'Falta campo requerido: conductor_id' })
    }
    if (!km || !ltnafta) {
      return res.status(400).json({ error: 'KM y LTNAFTA son obligatorios' })
    }

    // 1. Buscar el documento generado para este conductor
    // Si hay asignacion_id, buscar por programacion_id de esa asignacion para encontrar el documento correcto
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    let docQueryUrl = `${supabaseUrl}/rest/v1/documentos_generados?conductor_id=eq.${conductor_id}&google_doc_id=not.is.null&order=created_at.desc&limit=1`

    if (asignacion_id) {
      // Obtener programacion_id de la asignacion
      const asigQuery = await fetch(
        `${supabaseUrl}/rest/v1/asignaciones?id=eq.${asignacion_id}&select=programacion_id`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        }
      )
      const asigData = await asigQuery.json()
      if (asigData && asigData.length > 0 && asigData[0].programacion_id) {
        const progId = asigData[0].programacion_id
        docQueryUrl = `${supabaseUrl}/rest/v1/documentos_generados?conductor_id=eq.${conductor_id}&programacion_id=eq.${progId}&google_doc_id=not.is.null&order=created_at.desc&limit=1`
        console.log(`[Control] Buscando documento por programacion_id=${progId} y conductor_id=${conductor_id}`)
      } else {
        console.log(`[Control] No se encontro programacion_id para asignacion ${asignacion_id}, buscando por conductor_id solamente`)
      }
    }

    const docQuery = await fetch(docQueryUrl, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    })
    const docs = await docQuery.json()
    if (!docs || docs.length === 0) {
      return res.status(404).json({ error: 'No se encontró documento generado para este conductor. Primero debe generarse el contrato desde Programaciones.' })
    }

    const docRecord = docs[0]
    const googleDocId = docRecord.google_doc_id
    const plantillaUsada = docRecord.plantilla_usada

    console.log(`[Control] Editando doc ${googleDocId} (plantilla: ${plantillaUsada}) para conductor ${conductor_id}`)

    // 2. Usar Google Docs API para reemplazar placeholders en el documento existente
    const docsService = getDocsService()

    // Construir lista de reemplazos
    const replacements = [
      { find: '{{KM}}', replace: `${km} KM` },
      { find: '{{LTNAFTA}}', replace: ltnafta }
    ]

    // Campos adicionales para Bariloche
    const isBariloche = plantillaUsada && plantillaUsada.toLowerCase().includes('bariloche')
    if (isBariloche) {
      replacements.push(
        { find: '{{CRISTAL STATUS}}', replace: cristal_status || '-' },
        { find: '{{CARTER}}', replace: carter || '-' },
        { find: '{{TIRES}}', replace: tires || '-' },
        { find: '{{OTHERS DOCS}}', replace: others_docs || '-' },
        { find: '{{OTHER ACCESORY}}', replace: other_accesory || '-' },
        { find: '{{MAKE CHAINS}}', replace: make_chains || '-' },
        { find: '{{STATUS CAHINS}}', replace: status_chains || '-' },
        { find: '{{TENSIONERS CHAINS}}', replace: tensioners_chains || '-' },
        { find: '{{OTHERS KIT}}', replace: others_kit || '-' }
      )
    }

    // Ejecutar replaceAllText para cada placeholder
    const requests = replacements.map(r => ({
      replaceAllText: {
        containsText: { text: r.find, matchCase: false },
        replaceText: r.replace
      }
    }))

    await docsService.documents.batchUpdate({
      documentId: googleDocId,
      requestBody: { requests }
    })

    console.log(`[Control] Placeholders reemplazados: ${replacements.length} variables`)

    // 3. Exportar como PDF y subir a Drive
    const drive = getDriveServiceFull()
    let pdfUrl = null
    try {
      const pdfExport = await drive.files.export(
        { fileId: googleDocId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' }
      )
      const pdfBuffer = Buffer.from(pdfExport.data)

      // Obtener info del archivo para el nombre del PDF
      const fileInfo = await drive.files.get({
        fileId: googleDocId,
        fields: 'name, parents',
        supportsAllDrives: true
      })

      const pdfFile = await drive.files.create({
        requestBody: {
          name: `${fileInfo.data.name}.pdf`,
          parents: fileInfo.data.parents || [],
          mimeType: 'application/pdf'
        },
        media: {
          mimeType: 'application/pdf',
          body: Readable.from(pdfBuffer)
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true
      })
      pdfUrl = pdfFile.data.webViewLink
    } catch (pdfErr) {
      console.warn(`[Control] No se pudo generar PDF: ${pdfErr.message}`)
    }

    // 4. Actualizar registro en documentos_generados con la URL del PDF
    if (pdfUrl) {
      await fetch(
        `${supabaseUrl}/rest/v1/documentos_generados?id=eq.${docRecord.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url_pdf: pdfUrl, estado: 'completado' })
        }
      )
    }

    // 5. Marcar control_completado en la asignación
    if (asignacion_id) {
      await fetch(
        `${supabaseUrl}/rest/v1/asignaciones?id=eq.${asignacion_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ control_completado: true })
        }
      )
    }

    console.log(`[Control] OK: doc ${googleDocId} actualizado, pdf: ${pdfUrl ? 'si' : 'no'}`)

    res.json({
      success: true,
      document: {
        googleDocId,
        pdfUrl,
        plantillaUsada
      }
    })
  } catch (error) {
    console.error('[Control] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// =====================================================
// INTERCOM INTEGRATION
// =====================================================

app.post('/api/intercom/create-contact', async (req, res) => {
  try {
    const accessToken = process.env.INTERCOM_ACCESS_TOKEN
    if (!accessToken) {
      return res.status(500).json({ error: 'INTERCOM_ACCESS_TOKEN no configurado en el servidor' })
    }

    const { conductor_id, email, name, user_id, phone, patente, turno, companero, direccion, tiempo_de_antiguedad, dni, primer_nombre } = req.body

    if (!email || !name || !user_id || !phone) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email, name, user_id, phone' })
    }

    const userData = {
      email,
      name,
      external_id: user_id,
      phone,
      role: 'user',
      custom_attributes: {
        'Patente': patente || 'N/A',
        'Turno': turno || 'N/A',
        'Compañero': companero || 'N/A',
        'Dirección': direccion || 'N/A',
        'Tiempo de antiguedad': tiempo_de_antiguedad || 'N/A',
        'DNI': dni || '',
        'Primer nombre': primer_nombre || ''
      }
    }

    console.log(`[Intercom] Creando contacto para conductor ${conductor_id}: ${name}`)

    const intercomRes = await fetch('https://api.intercom.io/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Intercom-Version': '2.10'
      },
      body: JSON.stringify(userData)
    })

    const responseText = await intercomRes.text()
    let responseData
    try { responseData = JSON.parse(responseText) } catch { responseData = null }

    if (intercomRes.status === 409) {
      const existingId = extractIdFrom409(responseData)
      if (existingId) {
        console.log(`[Intercom] Contacto ya existe (${existingId}), actualizando...`)
        const updateData = { name, phone, custom_attributes: userData.custom_attributes }
        const updateRes = await fetch(`https://api.intercom.io/contacts/${existingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Intercom-Version': '2.10'
          },
          body: JSON.stringify(updateData)
        })

        if (updateRes.status >= 400) {
          const updateError = await updateRes.text()
          console.error(`[Intercom] Error al actualizar: ${updateError}`)
          return res.status(updateRes.status).json({ error: `Error al actualizar contacto existente: ${simplifyIntercomError(updateError)}` })
        }

        const updateResult = await updateRes.json()
        return res.json({
          intercom_id: updateResult.id || existingId,
          status: 'Actualizado',
          message: 'El contacto ya existía en Intercom y fue actualizado con los datos actuales'
        })
      }
    }

    if (intercomRes.status >= 400) {
      console.error(`[Intercom] Error ${intercomRes.status}: ${responseText}`)
      // Extraer mensaje legible de la respuesta de Intercom
      let errorMsg = simplifyIntercomError(responseText)
      if (responseData?.errors?.length > 0) {
        errorMsg = responseData.errors.map(e => `${e.code || 'error'}: ${e.message || ''}`).join(' | ')
      }
      return res.status(intercomRes.status).json({ error: errorMsg })
    }

    console.log(`[Intercom] Contacto creado: ${responseData?.id}`)
    return res.json({
      intercom_id: responseData?.id,
      status: 'Creado',
      message: 'Contacto creado exitosamente en Intercom'
    })
  } catch (error) {
    console.error('[Intercom] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

function extractIdFrom409(errorObj) {
  try {
    if (errorObj?.errors?.length > 0) {
      const msg = errorObj.errors[0].message || ''
      const match = msg.match(/id[=:\s]+([a-f0-9]+)/i)
      if (match) return match[1]
    }
  } catch { /* ignore */ }
  return null
}

function simplifyIntercomError(text) {
  if (typeof text !== 'string') text = JSON.stringify(text)
  if (text.includes('409') && text.includes('conflict')) return 'Conflicto: contacto duplicado'
  if (text.includes('400')) return 'Datos inválidos enviados a Intercom'
  if (text.includes('401')) return 'Error de autorización con Intercom. Verificar token.'
  if (text.includes('422')) return 'Formato de datos no válido para Intercom'
  if (text.includes('429')) return 'Límite de solicitudes excedido. Intentar más tarde.'
  if (text.includes('500')) return 'Error interno del servidor de Intercom'
  if (text.length > 100) return text.substring(0, 97) + '...'
  return text
}

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
