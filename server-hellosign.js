/**
 * Toshify · Integración Dropbox Sign (ex HelloSign)
 * ---------------------------------------------------------------------------
 * ARCHIVO AISLADO: no modifica nada de la lógica existente.
 *
 * Expone un router Express con los endpoints necesarios para la vista
 * /hellosign del frontend. La API key NUNCA sale de este proceso: el browser
 * solo habla con /api/hellosign/*.
 *
 * Dos formas de usarlo:
 *
 *  1) Montado dentro de server.js (recomendado, es lo que ya quedó hecho):
 *       import { hellosignRouter } from './server-hellosign.js'
 *       app.use('/api/hellosign', hellosignRouter)
 *     El proxy `/api` -> localhost:3001 de vite.config.ts ya lo cubre.
 *
 *  2) Standalone, sin tocar server.js:
 *       npm run dev:hellosign          (levanta en HELLOSIGN_PORT || 3011)
 *     y en vite.config.ts, ANTES de la entrada '/api', agregar:
 *       '/api/hellosign': { target: 'http://localhost:3011', changeOrigin: true }
 *
 * Variables requeridas en .env:
 *   HELLOSIGN_API_KEY    (obligatoria)
 *   HELLOSIGN_CLIENT_ID  (opcional: branding / callbacks de la app)
 *
 * Docs: https://developers.hellosign.com/api/reference/
 */

import express from 'express'
import { Readable } from 'node:stream'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const HELLOSIGN_API_BASE = 'https://api.hellosign.com/v3'

/* -------------------------------------------------------------------------- */
/* Credenciales                                                               */
/* -------------------------------------------------------------------------- */

/**
 * server.js no carga dotenv (en producción las vars vienen del entorno).
 * Para que `npm run dev:api` funcione sin cambiar nada de lo existente,
 * leemos el .env acá y tomamos SOLO las claves HELLOSIGN_*.
 * Nunca pisamos una variable que ya esté definida en process.env.
 */
function resolveEnvPath() {
  const candidatos = []

  // Desde el cwd hacia arriba (cubre `npm run dev`, `npm run dev:api` y monorepos).
  let dir = process.cwd()
  for (let i = 0; i < 5; i += 1) {
    candidatos.push(join(dir, '.env'))
    const padre = dirname(dir)
    if (padre === dir) break
    dir = padre
  }

  // Y como fallback, junto a este archivo.
  candidatos.push(join(__dirname, '.env'))

  return candidatos.find((p) => existsSync(p)) ?? null
}

function loadHelloSignEnv() {
  const envPath = resolveEnvPath()
  if (!envPath) return

  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const eq = trimmed.indexOf('=')
      if (eq === -1) continue

      const key = trimmed.slice(0, eq).trim()
      if (!key.startsWith('HELLOSIGN_')) continue
      if (process.env[key]) continue

      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (err) {
    console.warn('[hellosign] No se pudo leer .env:', err.message)
  }
}

loadHelloSignEnv()

function getApiKey() {
  const apiKey = process.env.HELLOSIGN_API_KEY
  if (!apiKey) {
    const error = new Error(
      'Falta HELLOSIGN_API_KEY. Agregala al .env y reiniciá el servidor de API.',
    )
    error.statusCode = 503
    throw error
  }
  return apiKey
}

/** Dropbox Sign usa Basic Auth con la API key como usuario y password vacío. */
function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${getApiKey()}:`).toString('base64')
}

/* -------------------------------------------------------------------------- */
/* Cliente HTTP                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Llama a la API de Dropbox Sign y normaliza los errores.
 * @param {string} path  Ruta relativa, ej: '/template/list?page=1'
 * @param {object} [options]
 * @param {'GET'|'POST'} [options.method]
 * @param {object} [options.body]
 */
async function hellosignRequest(path, options = {}) {
  const { method = 'GET', body } = options

  const headers = {
    Authorization: getAuthHeader(),
    Accept: 'application/json',
  }
  if (body) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${HELLOSIGN_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }

  if (!response.ok) {
    const apiError = payload?.error ?? {}
    const error = new Error(
      apiError.error_msg || `Dropbox Sign respondió ${response.status}`,
    )
    error.statusCode = response.status
    error.errorName = apiError.error_name || null
    throw error
  }

  return payload
}

function sendError(res, err, contexto) {
  const status = err.statusCode || 500
  console.error(`[hellosign] ${contexto}:`, err.message)
  res.status(status).json({
    error: err.message || 'Error inesperado en la integración con Dropbox Sign',
    error_name: err.errorName || null,
  })
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Se usa una sub-app de Express (no un Router) a proposito: montada como
 * middleware "pelado" dentro del dev server de Vite, la sub-app agrega por su
 * cuenta res.json()/res.status(). Un Router suelto no lo hace y explotaria.
 * Sigue funcionando igual con app.use('/api/hellosign', hellosignRouter).
 */
export const hellosignRouter = express()

hellosignRouter.use(express.json())

/**
 * GET /api/hellosign/status
 * Chequeo rápido de configuración + conexión (sin exponer la key).
 */
hellosignRouter.get('/status', async (_req, res) => {
  if (!process.env.HELLOSIGN_API_KEY) {
    return res.json({
      configured: false,
      connected: false,
      hasClientId: Boolean(process.env.HELLOSIGN_CLIENT_ID),
      clientId: process.env.HELLOSIGN_CLIENT_ID ?? null,
      message: 'Falta HELLOSIGN_API_KEY en el .env',
    })
  }

  try {
    const data = await hellosignRequest('/account')
    res.json({
      configured: true,
      connected: true,
      hasClientId: Boolean(process.env.HELLOSIGN_CLIENT_ID),
      // El client_id es publico por diseno: el SDK embebido lo necesita en el browser.
      clientId: process.env.HELLOSIGN_CLIENT_ID ?? null,
      account: {
        account_id: data?.account?.account_id ?? null,
        email_address: data?.account?.email_address ?? null,
        is_locked: data?.account?.is_locked ?? null,
      },
    })
  } catch (err) {
    res.json({
      configured: true,
      connected: false,
      hasClientId: Boolean(process.env.HELLOSIGN_CLIENT_ID),
      clientId: process.env.HELLOSIGN_CLIENT_ID ?? null,
      message: err.message,
    })
  }
})

/**
 * GET /api/hellosign/templates
 * Query: page, page_size (1-100), query, account_id
 * Devuelve { templates, list_info }
 */
hellosignRouter.get('/templates', async (req, res) => {
  try {
    const params = new URLSearchParams()

    const page = Number.parseInt(req.query.page, 10)
    params.set('page', Number.isFinite(page) && page > 0 ? String(page) : '1')

    const pageSize = Number.parseInt(req.query.page_size, 10)
    params.set(
      'page_size',
      Number.isFinite(pageSize) ? String(Math.min(Math.max(pageSize, 1), 100)) : '100',
    )

    if (req.query.query) params.set('query', String(req.query.query))
    if (req.query.account_id) params.set('account_id', String(req.query.account_id))

    const data = await hellosignRequest(`/template/list?${params.toString()}`)
    res.json({
      templates: data?.templates ?? [],
      list_info: data?.list_info ?? { num_pages: 1, num_results: 0, page: 1, page_size: 100 },
    })
  } catch (err) {
    sendError(res, err, 'GET /templates')
  }
})

/**
 * GET /api/hellosign/templates/:templateId
 * Detalle completo de una plantilla (roles, documentos, custom fields).
 */
hellosignRouter.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params
    if (!/^[A-Za-z0-9]+$/.test(templateId)) {
      return res.status(400).json({ error: 'template_id inválido' })
    }

    const data = await hellosignRequest(`/template/${templateId}`)
    res.json({ template: data?.template ?? null })
  } catch (err) {
    sendError(res, err, 'GET /templates/:templateId')
  }
})

/**
 * POST /api/hellosign/templates/embedded-draft
 * Crea un borrador de plantilla y devuelve el edit_url del editor embebido.
 *
 * El cuerpo llega como multipart/form-data y se REENVIA tal cual (boundary
 * incluido) a Dropbox Sign: asi no hace falta sumar un parser de multipart
 * (multer/busboy) ni cargar el archivo entero en memoria.
 */
hellosignRouter.post('/templates/embedded-draft', async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({
        error: 'Se espera multipart/form-data con el documento y los roles.',
      })
    }

    if (!process.env.HELLOSIGN_CLIENT_ID) {
      return res.status(503).json({
        error: 'Falta HELLOSIGN_CLIENT_ID en el .env: es obligatorio para el editor embebido.',
      })
    }

    const response = await fetch(`${HELLOSIGN_API_BASE}/template/create_embedded_draft`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader(), 'Content-Type': contentType },
      body: Readable.toWeb(req),
      duplex: 'half',
    })

    const texto = await response.text()
    let payload = null
    try {
      payload = texto ? JSON.parse(texto) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      const mensaje =
        payload?.error?.error_msg || `Dropbox Sign respondio ${response.status}`
      console.error('[hellosign] POST /templates/embedded-draft:', mensaje)
      return res.status(response.status).json({
        error: mensaje,
        error_name: payload?.error?.error_name ?? null,
      })
    }

    res.json({ template: payload?.template ?? null })
  } catch (err) {
    sendError(res, err, 'POST /templates/embedded-draft')
  }
})

/**
 * POST /api/hellosign/templates/:templateId/update-files
 * Sube un documento nuevo calcando los campos de la plantilla indicada.
 *
 * OJO con la semantica de la API: NO reemplaza in-place. Crea OTRA plantilla con
 * los campos copiados y deja la original intacta. Ademas es asincrona: el 200 OK
 * solo confirma que paso la validacion inicial. El front hace polling y recien
 * despues borra la original.
 */
hellosignRouter.post('/templates/:templateId/update-files', async (req, res) => {
  try {
    const { templateId } = req.params
    if (!/^[A-Za-z0-9]+$/.test(templateId)) {
      return res.status(400).json({ error: 'template_id invalido' })
    }

    const contentType = req.headers['content-type'] || ''
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Se espera multipart/form-data con el documento.' })
    }

    const response = await fetch(
      `${HELLOSIGN_API_BASE}/template/update_files/${templateId}`,
      {
        method: 'POST',
        headers: { Authorization: getAuthHeader(), 'Content-Type': contentType },
        body: Readable.toWeb(req),
        duplex: 'half',
      },
    )

    const texto = await response.text()
    let payload = null
    try {
      payload = texto ? JSON.parse(texto) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      const mensaje = payload?.error?.error_msg || `Dropbox Sign respondio ${response.status}`
      console.error('[hellosign] POST /templates/:templateId/update-files:', mensaje)
      return res.status(response.status).json({
        error: mensaje,
        error_name: payload?.error?.error_name ?? null,
      })
    }

    res.json({ template: payload?.template ?? null })
  } catch (err) {
    sendError(res, err, 'POST /templates/:templateId/update-files')
  }
})

/**
 * DELETE /api/hellosign/templates/:templateId
 * Borra una plantilla. La API de Dropbox Sign usa POST /template/delete/{id}.
 * No hay papelera: es definitivo.
 */
hellosignRouter.delete('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params
    if (!/^[A-Za-z0-9]+$/.test(templateId)) {
      return res.status(400).json({ error: 'template_id invalido' })
    }

    await hellosignRequest(`/template/delete/${templateId}`, { method: 'POST' })
    res.json({ ok: true })
  } catch (err) {
    sendError(res, err, 'DELETE /templates/:templateId')
  }
})

/**
 * GET /api/hellosign/templates/:templateId/file?file_type=pdf|zip
 * Devuelve el documento de la plantilla como binario, para poder previsualizarlo.
 * Se hace fetch crudo (no via hellosignRequest) porque la respuesta NO es JSON.
 */
hellosignRouter.get('/templates/:templateId/file', async (req, res) => {
  try {
    const { templateId } = req.params
    if (!/^[A-Za-z0-9]+$/.test(templateId)) {
      return res.status(400).json({ error: 'template_id invalido' })
    }

    const fileType = req.query.file_type === 'zip' ? 'zip' : 'pdf'

    const response = await fetch(
      `${HELLOSIGN_API_BASE}/template/files/${templateId}?file_type=${fileType}`,
      { headers: { Authorization: getAuthHeader() } },
    )

    if (!response.ok) {
      let mensaje = `Dropbox Sign respondio ${response.status}`
      try {
        const texto = await response.text()
        mensaje = JSON.parse(texto)?.error?.error_msg || mensaje
      } catch {
        // El cuerpo puede venir binario o vacio: nos quedamos con el mensaje generico.
      }
      if (response.status === 409) {
        mensaje =
          'Dropbox Sign todavia esta preparando el documento de esta plantilla. Probá de nuevo en unos segundos.'
      }
      console.error('[hellosign] GET /templates/:templateId/file:', mensaje)
      return res.status(response.status).json({ error: mensaje })
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // server.js aplica X-Frame-Options: DENY y frame-ancestors 'none' a todo.
    // Este archivo se muestra embebido dentro de la propia app, asi que se relajan
    // SOLO para esta respuesta (mismo origen, nadie externo puede embeberla).
    res.removeHeader('X-Frame-Options')
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'")

    res.setHeader('Content-Type', fileType === 'zip' ? 'application/zip' : 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="plantilla-${templateId}.${fileType}"`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(buffer)
  } catch (err) {
    sendError(res, err, 'GET /templates/:templateId/file')
  }
})

/**
 * POST /api/hellosign/signature-request/send-with-template
 * Body: { template_id, subject, message, signers[], ccs[], custom_fields[], test_mode }
 * Envía la solicitud de firma a partir de una plantilla.
 */
hellosignRouter.post('/signature-request/send-with-template', async (req, res) => {
  try {
    const {
      template_id: templateId,
      template_ids: templateIds,
      subject,
      message,
      signers,
      ccs,
      custom_fields: customFields,
      test_mode: testMode,
    } = req.body ?? {}

    const ids = Array.isArray(templateIds) && templateIds.length ? templateIds : [templateId]
    if (!ids[0]) {
      return res.status(400).json({ error: 'Falta template_id' })
    }

    if (!Array.isArray(signers) || signers.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un firmante' })
    }

    for (const signer of signers) {
      if (!signer?.name || !signer?.email_address) {
        return res.status(400).json({
          error: `El firmante "${signer?.role ?? 'sin rol'}" necesita nombre y email`,
        })
      }
    }

    const payload = {
      template_ids: ids,
      signers: signers.map((s) => ({
        role: s.role,
        name: String(s.name).trim(),
        email_address: String(s.email_address).trim(),
      })),
      test_mode: Boolean(testMode),
    }

    if (subject) payload.subject = String(subject).slice(0, 255)
    if (message) payload.message = String(message).slice(0, 5000)

    if (Array.isArray(ccs)) {
      const validCcs = ccs.filter((cc) => cc?.email_address)
      if (validCcs.length) {
        payload.ccs = validCcs.map((cc) => ({
          role: cc.role,
          email_address: String(cc.email_address).trim(),
        }))
      }
    }

    if (Array.isArray(customFields)) {
      const validFields = customFields.filter(
        (f) => f?.name && f.value !== undefined && f.value !== '',
      )
      if (validFields.length) {
        payload.custom_fields = validFields.map((f) => ({
          name: f.name,
          value: String(f.value),
        }))
      }
    }

    if (process.env.HELLOSIGN_CLIENT_ID) {
      payload.client_id = process.env.HELLOSIGN_CLIENT_ID
    }

    const data = await hellosignRequest('/signature_request/send_with_template', {
      method: 'POST',
      body: payload,
    })

    res.json({ signature_request: data?.signature_request ?? null })
  } catch (err) {
    sendError(res, err, 'POST /signature-request/send-with-template')
  }
})

/* -------------------------------------------------------------------------- */
/* Modo standalone: node server-hellosign.js                                   */
/* -------------------------------------------------------------------------- */

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  const app = express()
  const port = process.env.HELLOSIGN_PORT || 3011

  app.use('/api/hellosign', hellosignRouter)
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'hellosign' }))

  app.listen(port, () => {
    console.log(`[hellosign] Servidor standalone escuchando en :${port}`)
    console.log(
      `[hellosign] API key ${process.env.HELLOSIGN_API_KEY ? 'detectada' : 'FALTANTE (revisá .env)'}`,
    )
  })
}

export default hellosignRouter
