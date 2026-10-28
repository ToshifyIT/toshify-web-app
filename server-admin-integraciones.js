/**
 * Administración > Integraciones & Tokens (solo administradores).
 *
 *  - GET  /api/admin/tokens           credenciales de cada integración (para la pestaña Credenciales)
 *  - GET  /api/admin/function-health  estado de las edge functions (pestaña Monitor)
 *  - POST /api/admin/toggle-function  activar / desactivar una edge function
 *
 * Antes estaban dentro de server.js, y en desarrollo (npm run dev) no respondían si no
 * se levantaba además npm run dev:api. Ahora es un router aparte que monta server.js en
 * producción y vite.config.ts en desarrollo, igual que 2Chat, Cresium y Alegra.
 *
 * Las claves de Alegra, Cresium y 2Chat se devuelven enmascaradas (inicio…final):
 * alcanzan para comprobar cuál está cargada sin exponer el valor completo.
 */
import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ------------------------------ Variables .env ------------------------------ */
// En producción las pone el contenedor; en desarrollo se leen del .env del proyecto.

function resolveEnvPath() {
  const candidatos = []
  let dir = process.cwd()
  for (let i = 0; i < 5; i += 1) {
    candidatos.push(join(dir, '.env'))
    const padre = dirname(dir)
    if (padre === dir) break
    dir = padre
  }
  candidatos.push(join(__dirname, '.env'))
  return candidatos.find((p) => existsSync(p)) ?? null
}

function loadEnv() {
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
      if (!key || process.env[key]) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // Sin .env: se usan las variables del entorno
  }
}

loadEnv()

/* --------------------------------- Helpers --------------------------------- */

function config() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

/** Solo administradores. Devuelve la config o responde el error y devuelve null. */
async function requireAdmin(req, res) {
  const cfg = config()
  if (!cfg) {
    res.status(500).json({ error: 'Configuración del servidor incompleta (falta SUPABASE_SERVICE_ROLE_KEY)' })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  const userRes = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: cfg.key },
  })
  if (!userRes.ok) {
    res.status(401).json({ error: 'Sesión inválida, volvé a iniciar sesión' })
    return null
  }
  const user = await userRes.json()
  const profileRes = await fetch(
    `${cfg.url}/rest/v1/user_profiles?id=eq.${user.id}&select=role_id,roles(name)`,
    { headers: cfg.headers },
  )
  if (!profileRes.ok) {
    res.status(500).json({ error: 'Error verificando permisos' })
    return null
  }
  const profiles = await profileRes.json()
  if (profiles[0]?.roles?.name !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado - Solo administradores' })
    return null
  }
  return cfg
}

/** "abcdef…wxyz": deja ver que la clave está cargada sin exponerla entera. */
function enmascarar(valor) {
  if (!valor) return null
  const v = String(valor)
  if (v.length <= 12) return `${v.slice(0, 2)}…`
  return `${v.slice(0, 6)}…${v.slice(-4)}`
}

/* --------------------------------- Rutas ----------------------------------- */

// express() (no express.Router()): así tiene res.status/res.json también montado en el
// dev server de Vite, igual que twoChatRouter. Las rutas que no son suyas siguen de largo.
export const adminIntegracionesRouter = express()
adminIntegracionesRouter.use(express.json())

// Credenciales de cada integración
adminIntegracionesRouter.get('/tokens', async (req, res) => {
  try {
    const cfg = await requireAdmin(req, res)
    if (!cfg) return
    const env = process.env
    const tokens = {
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
        private_key_preview: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
          ? `${env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.substring(0, 40)}...${env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.slice(-20)}`
          : null,
      },
      alegra: {
        email_44dreams: env.ALEGRA_44DREAMS_EMAIL || null,
        token_44dreams: enmascarar(env.ALEGRA_44DREAMS_TOKEN),
        email_grupocg: env.ALEGRA_GRUPOCG_EMAIL || null,
        token_grupocg: enmascarar(env.ALEGRA_GRUPOCG_TOKEN),
      },
      cresium: {
        api_key_44dreams: enmascarar(env.CRESIUM_44DREAMS_API_KEY),
        company_44dreams: env.CRESIUM_44DREAMS_COMPANY_ID || null,
        api_key_grupocg: enmascarar(env.CRESIUM_GRUPOCG_API_KEY),
        company_grupocg: env.CRESIUM_GRUPOCG_COMPANY_ID || null,
        sync_auto: env.CRESIUM_SYNC_AUTO === '1' ? 'Activado (cada hora, 9 a 18 h)' : 'Desactivado',
      },
      twochat: {
        api_key: enmascarar(env.TWOCHAT_API_KEY),
        sync_auto: env.TWOCHAT_SYNC_AUTO === '1' ? 'Activado (cada hora, 9 a 17 h)' : 'Desactivado',
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
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Estado de todas las edge functions
adminIntegracionesRouter.get('/function-health', async (req, res) => {
  try {
    const cfg = await requireAdmin(req, res)
    if (!cfg) return

    const configRes = await fetch(
      `${cfg.url}/rest/v1/edge_function_config?select=*&order=category,function_name`,
      { headers: cfg.headers },
    )
    if (!configRes.ok) return res.status(500).json({ error: 'Error leyendo configuración' })
    const functions = await configRes.json()

    // Ping de cada función en paralelo (10 s máximo cada una)
    const results = await Promise.all(
      functions.map(async (fn) => {
        const start = Date.now()
        let status = 'unknown'
        let responseTime = null
        let errorMsg = null
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)
          await fetch(`${cfg.url}/functions/v1/${fn.function_name}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ healthCheck: true }),
            signal: controller.signal,
          })
          clearTimeout(timeout)
          responseTime = Date.now() - start
          // Cualquier respuesta HTTP (aunque sea 400/500) significa que la función está viva
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
      }),
    )

    // Guardar el último chequeo (sin esperar)
    for (const r of results) {
      fetch(`${cfg.url}/rest/v1/edge_function_config?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: { ...cfg.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          last_health_check: r.checked_at,
          last_health_status: r.health_status,
          updated_at: r.checked_at,
        }),
      }).catch(() => {})
    }

    res.json({ success: true, functions: results })
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Activar / desactivar una edge function
adminIntegracionesRouter.post('/toggle-function', async (req, res) => {
  try {
    const cfg = await requireAdmin(req, res)
    if (!cfg) return

    const { functionId, isActive } = req.body || {}
    if (!functionId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Parámetros inválidos: functionId y isActive requeridos' })
    }

    const updateRes = await fetch(`${cfg.url}/rest/v1/edge_function_config?id=eq.${encodeURIComponent(functionId)}`, {
      method: 'PATCH',
      headers: { ...cfg.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ is_active: isActive, updated_at: new Date().toISOString() }),
    })
    if (!updateRes.ok) return res.status(500).json({ error: 'Error actualizando función' })

    const updated = await updateRes.json()
    res.json({ success: true, function: updated[0] })
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})
