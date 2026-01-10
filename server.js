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
