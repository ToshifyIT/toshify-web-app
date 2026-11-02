/**
 * Cabify: el token de acceso se pide SOLO desde el servidor.
 *
 *  - POST /api/cabify/token   devuelve un access_token de Cabify a un usuario con sesión
 *                             iniciada en Toshify. Las credenciales nunca llegan al navegador.
 *
 * Antes la web leía usuario, contraseña y client secret de variables VITE_ (que Vite
 * mete en el JavaScript público) y server.js las tenía escritas como valor por defecto.
 * Ahora se leen únicamente del .env del servidor:
 *   CABIFY_USERNAME, CABIFY_PASSWORD, CABIFY_CLIENT_ID, CABIFY_CLIENT_SECRET
 *   (se aceptan también los nombres viejos VITE_CABIFY_* mientras se migra el .env)
 *
 * Lo monta server.js en producción y vite.config.ts en desarrollo, igual que 2Chat.
 */
import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ------------------------------ Variables .env ------------------------------ */

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

/* ------------------------------- Credenciales ------------------------------- */

function credencialesCabify() {
  const env = process.env
  const c = {
    client_id: env.CABIFY_CLIENT_ID || env.VITE_CABIFY_CLIENT_ID,
    client_secret: env.CABIFY_CLIENT_SECRET || env.VITE_CABIFY_CLIENT_SECRET,
    username: env.CABIFY_USERNAME || env.VITE_CABIFY_USERNAME,
    password: env.CABIFY_PASSWORD || env.VITE_CABIFY_PASSWORD,
  }
  const faltan = Object.entries(c).filter(([, v]) => !v).map(([k]) => k)
  if (faltan.length) {
    throw new Error(`Faltan credenciales de Cabify en el .env del servidor: ${faltan.join(', ')}`)
  }
  return c
}

let tokenCache = null // { access_token, expires_at }

/** Token de Cabify (se reutiliza hasta 5 minutos antes de vencer). */
export async function obtenerTokenCabify() {
  if (tokenCache && Date.now() < tokenCache.expires_at) return tokenCache
  const res = await fetch('https://cabify.com/auth/api/authorization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', ...credencialesCabify() }),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Cabify rechazó la autenticación (${res.status}) ${detalle.slice(0, 200)}`)
  }
  const data = await res.json()
  const expiresIn = Number(data.expires_in) || 3600
  tokenCache = {
    access_token: data.access_token,
    expires_in: expiresIn,
    expires_at: Date.now() + (expiresIn - 300) * 1000,
  }
  return tokenCache
}

/* ------------------------- Token según la cuenta (flota) ------------------------- */
// Cada flota tiene su propia cuenta de Cabify (tabla cabify_cuentas: CG, 44dreams...).
// Para actuar sobre un conductor (ej. activar/desactivar efectivo) hay que usar el token
// de la cuenta donde ese conductor existe: se elige por su cabify_company_id, igual que el
// RPA py-cabify-efectivo. Las claves se leen del .env con los nombres guardados en la tabla.

const cacheCuentas = new Map() // codigo -> { access_token, expires_at, companies: Set, companies_at }
const UNA_HORA = 60 * 60 * 1000

async function cuentasCabifyActivas() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  const res = await fetch(
    `${url}/rest/v1/cabify_cuentas?select=codigo,nombre,env_usuario,env_password,orden&activa=eq.true&order=orden.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!res.ok) return []
  return res.json()
}

async function tokenDeCuenta(cuenta) {
  const previo = cacheCuentas.get(cuenta.codigo)
  if (previo && Date.now() < previo.expires_at) return previo
  const env = process.env
  const base = credencialesCabify() // client_id / client_secret son compartidos
  // Acepta también la forma CABIFY_44_USERNAME para CABIFY_USERNAME_44
  const variante = (n) => n.replace(/^CABIFY_(USERNAME|PASSWORD)_(\w+)$/, 'CABIFY_$2_$1')
  const username = env[cuenta.env_usuario] || env[variante(cuenta.env_usuario)] || env['VITE_' + cuenta.env_usuario]
  const password = env[cuenta.env_password] || env[variante(cuenta.env_password)] || env['VITE_' + cuenta.env_password]
  if (!username || !password) {
    throw new Error(`Faltan ${cuenta.env_usuario} / ${cuenta.env_password} en el .env del servidor web`)
  }
  const res = await fetch('https://cabify.com/auth/api/authorization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: base.client_id,
      client_secret: base.client_secret,
      username,
      password,
    }),
  })
  if (!res.ok) throw new Error(`Cabify rechazó la cuenta ${cuenta.nombre} (${res.status})`)
  const data = await res.json()
  const expiresIn = Number(data.expires_in) || 3600
  const entrada = {
    access_token: data.access_token,
    expires_at: Date.now() + (expiresIn - 300) * 1000,
    companies: previo?.companies ?? null,
    companies_at: previo?.companies_at ?? 0,
  }
  cacheCuentas.set(cuenta.codigo, entrada)
  return entrada
}

async function companiesDeCuenta(cuenta, entrada) {
  if (entrada.companies && Date.now() - entrada.companies_at < UNA_HORA) return entrada.companies
  const res = await fetch('https://partners.cabify.com/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entrada.access_token}` },
    body: JSON.stringify({ query: 'query { metafleetCompanies { companyIds } }' }),
  })
  const data = await res.json().catch(() => ({}))
  entrada.companies = new Set(data?.data?.metafleetCompanies?.companyIds || [])
  entrada.companies_at = Date.now()
  return entrada.companies
}

/**
 * Token de la cuenta de Cabify a la que pertenece la company del conductor.
 * Devuelve { access_token, cuenta } o lanza un error que se puede mostrar al usuario.
 */
export async function obtenerTokenCabifyParaCompany(companyId) {
  const cuentas = await cuentasCabifyActivas()
  if (cuentas.length === 0) {
    // Sin tabla o sin service key: comportamiento anterior (cuenta principal)
    const t = await obtenerTokenCabify()
    return { access_token: t.access_token, cuenta: 'principal' }
  }
  const errores = []
  for (const cuenta of cuentas) {
    try {
      const entrada = await tokenDeCuenta(cuenta)
      const companies = await companiesDeCuenta(cuenta, entrada)
      if (companies.has(companyId)) return { access_token: entrada.access_token, cuenta: cuenta.nombre }
    } catch (err) {
      errores.push(err instanceof Error ? err.message : String(err))
    }
  }
  throw new Error(
    errores.length
      ? `Ninguna cuenta de Cabify disponible contiene a este conductor. ${errores.join(' · ')}`
      : 'El conductor no pertenece a ninguna cuenta de Cabify activa (Parámetros › Grupos de flota › Cuentas de Cabify).',
  )
}

/** Exige una sesión válida de Toshify (cualquier usuario). Devuelve el usuario o null. */
export async function requireUsuario(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    res.status(500).json({ error: 'Configuración del servidor incompleta (Supabase)' })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: key },
  })
  if (!userRes.ok) {
    res.status(401).json({ error: 'Sesión inválida, volvé a iniciar sesión' })
    return null
  }
  return userRes.json()
}

/* ---------------------------------- Rutas ---------------------------------- */

export const cabifyRouter = express.Router()
cabifyRouter.use(express.json())

cabifyRouter.post('/token', async (req, res) => {
  try {
    const usuario = await requireUsuario(req, res)
    if (!usuario) return
    const t = await obtenerTokenCabify()
    res.json({
      access_token: t.access_token,
      expires_in: Math.max(60, Math.round((t.expires_at - Date.now()) / 1000) + 300),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error obteniendo token de Cabify' })
  }
})
