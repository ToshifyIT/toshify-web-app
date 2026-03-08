/**
 * Toshify Production Server
 * Serves static files + Google Drive API
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { google } from 'googleapis'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 80

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
