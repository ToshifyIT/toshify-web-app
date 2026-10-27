/**
 * Integración con 2Chat (Integraciones > 2Chat).
 *
 *  - Contactos: carga a los conductores como contactos de 2Chat para poder
 *    llamarlos desde la central telefónica / WhatsApp de 2Chat. Solo se crean
 *    los que todavía no están (tabla twochat_contactos, sql/twochat_integracion.sql).
 *  - Llamadas: historial de llamadas de 2Chat con el agente y el conductor o
 *    lead, para el reporte por agente. Se guarda en twochat_llamadas
 *    (sql/twochat_llamadas.sql) y en cada consulta solo se traen las nuevas.
 *
 * La API key vive SOLO en el servidor (nunca con prefijo VITE_):
 *  - TWOCHAT_API_KEY        (obligatoria)  -> header X-User-API-Key
 *  - TWOCHAT_SYNC_AUTO      (opcional)     -> "1" activa la actualización automática de
 *                                             llamadas: todos los días, cada hora en punto
 *                                             de 9 a 17 h de Argentina (ver iniciarSyncAutomatico)
 *  - TWOCHAT_CHANNEL_UUID   (opcional)     -> solo si hay un canal de WhatsApp (WPN...). Si está,
 *                                             el contacto también se crea en ese WhatsApp. Con
 *                                             solo canal de voz se deja vacía.
 *  - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (ya existen)
 *
 * Se monta en server.js:
 *   import { twoChatRouter } from './server-2chat.js'
 *   app.use('/api/2chat', twoChatRouter)
 * y en desarrollo lo monta vite.config.ts (npm run dev), sin levantar dev:api.
 *
 * Docs: https://developers.2chat.co/docs/intro
 *   POST /open/contacts            crear contacto
 *   GET  /open/voip/call-history   historial (paginado, sin filtro de fechas)
 *   GET  /open/voip/call/{uuid}    detalle de una llamada (trae el agente)
 *   GET  /open/users               usuarios activos de la cuenta (agentes)
 */

import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalizarCelularAR } from './mcp/lib/telefono.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TWOCHAT_API = 'https://api.p.2chat.io/open'
const TIMEOUT_MS = 20000
const PAUSA_ENTRE_ALTAS_MS = 250
const MAX_POR_LOTE = 50
const MAX_PAGINAS_HISTORIAL = 200
const CACHE_AGENTES_MS = 10 * 60 * 1000
const CACHE_CRUCE_MS = 10 * 60 * 1000
// Llamadas: como mucho una consulta a 2Chat por minuto (salvo botón Actualizar)
const ESPERA_SYNC_LLAMADAS_MS = 60 * 1000
// Margen hacia atrás al traer lo nuevo, para refrescar llamadas que estaban en curso
const MARGEN_RESYNC_MS = 2 * 60 * 60 * 1000
// Primera importación del historial: hasta esta cantidad de días hacia atrás
const IMPORT_INICIAL_DIAS = 90
// Llamadas incompletas (entrante sin número / saliente sin agente): se reintentan solo las de estos días
const DIAS_REVISAR_INCOMPLETAS = 3
// Fuente con la que se guardan los leads creados desde una llamada (decisión 2026-10-26)
const FUENTE_LEAD_2CHAT = '2Chat'
const APELLIDO_INTERNO = 'INTERNO'
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Argentina no tiene horario de verano: el día ART arranca a las 03:00 UTC.
const OFFSET_ART = '-03:00'

/* -------------------------------------------------------------------------- */
/* Credenciales (mismo criterio que server-insights-directivo.js)             */
/* -------------------------------------------------------------------------- */

const CLAVES_ENV = [
  'TWOCHAT_API_KEY',
  'TWOCHAT_SYNC_AUTO',
  'TWOCHAT_CHANNEL_UUID',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]

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
      if (!CLAVES_ENV.includes(key) || process.env[key]) continue
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
    console.warn('[2chat] No se pudo leer .env:', err.message)
  }
}

loadEnv()

function config() {
  return {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    apiKey: process.env.TWOCHAT_API_KEY,
    canal: process.env.TWOCHAT_CHANNEL_UUID || null,
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers HTTP                                                               */
/* -------------------------------------------------------------------------- */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Llamada a 2Chat con reintento ante 429 (límite de llamadas). */
export async function twoChat(apiKey, path, { method = 'GET', body } = {}) {
  for (let intento = 0; intento < 4; intento += 1) {
    const res = await fetchConTimeout(`${TWOCHAT_API}${path}`, {
      method,
      headers: {
        'X-User-API-Key': apiKey,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429) {
      await esperar(2000 * (intento + 1))
      continue
    }
    const texto = await res.text()
    let data = null
    try { data = texto ? JSON.parse(texto) : null } catch { data = null }
    return { ok: res.ok && data?.success !== false, status: res.status, data, texto }
  }
  return { ok: false, status: 429, data: null, texto: 'Límite de llamadas de 2Chat (429)' }
}

function mensajeError2Chat(r) {
  return (
    r.data?.error_message ||
    r.data?.message ||
    (typeof r.data?.error === 'string' ? r.data.error : null) ||
    `${r.status} ${String(r.texto || '').slice(0, 200)}`
  )
}

function headersServicio(cfg) {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
  }
}

/** Trae todas las filas de una consulta PostgREST paginando con Range. */
async function selectTodo(cfg, tablaYQuery) {
  const filas = []
  const tam = 1000
  for (let desde = 0; desde < 100000; desde += tam) {
    const res = await fetchConTimeout(`${cfg.url}/rest/v1/${tablaYQuery}`, {
      headers: { ...headersServicio(cfg), Range: `${desde}-${desde + tam - 1}` },
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const pagina = await res.json()
    filas.push(...pagina)
    if (pagina.length < tam) break
  }
  return filas
}

/* -------------------------------------------------------------------------- */
/* Autenticación                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Usuario activo de Toshibase. Con admin=true exige rol admin.
 * Devuelve { cfg, userId, isAdmin } o responde el error y devuelve null.
 */
async function requireUsuario(req, res, { admin = false } = {}) {
  const cfg = config()
  if (!cfg.url || !cfg.anonKey || !cfg.serviceKey) {
    res.status(500).json({ error: 'Configuración del servidor incompleta (Supabase)' })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  const userRes = await fetchConTimeout(`${cfg.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: cfg.anonKey },
  })
  if (!userRes.ok) {
    res.status(401).json({ error: 'Sesión inválida, volvé a iniciar sesión' })
    return null
  }
  const user = await userRes.json()
  const profileRes = await fetchConTimeout(
    `${cfg.url}/rest/v1/user_profiles?id=eq.${user.id}&select=is_active,roles(name)`,
    { headers: headersServicio(cfg) },
  )
  const perfiles = profileRes.ok ? await profileRes.json() : []
  const perfil = perfiles[0]
  if (!perfil || perfil.is_active === false) {
    res.status(403).json({ error: 'Usuario inactivo' })
    return null
  }
  const isAdmin = perfil.roles?.name === 'admin'
  if (admin && !isAdmin) {
    res.status(403).json({ error: 'Solo un administrador puede sincronizar contactos con 2Chat' })
    return null
  }
  if (!cfg.apiKey) {
    res.status(500).json({ error: 'Falta TWOCHAT_API_KEY en el .env del servidor' })
    return null
  }
  return { cfg, userId: user.id, isAdmin }
}

/* -------------------------------------------------------------------------- */
/* Conductores                                                                */
/* -------------------------------------------------------------------------- */

function esInterno(apellidos) {
  const ap = String(apellidos || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase()
  return ap === APELLIDO_INTERNO
}

function nombrePropio(txt) {
  return String(txt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_m, sep, letra) => sep + letra.toUpperCase())
}

const AGENTE_ENTRANTES_SIN_RESPONDER = 'Entrantes sin responder'
const AGENTE_SALIENTES_SIN_AGENTE = 'Salientes sin agente'

/**
 * Agente de la llamada: agent_id; si 2Chat lo dejó vacío en una saliente, el
 * usuario que la inició (`from`), cuando es un usuario de la cuenta.
 */
function agenteDeLlamada(c, agentes) {
  if (c.agent_id) return c.agent_id
  // Usuarios activos (o con formato de usuario de 2Chat: USR..., por si ya no está activo)
  if (c.direction === 'O' && typeof c.from === 'string' && (agentes.has(c.from) || /^USR/i.test(c.from))) {
    return c.from
  }
  return null
}

/** `from` puede ser un número o el UUID de un usuario: solo se usa si es número */
const esTelefono = (v) => typeof v === 'string' && /^\+?[\d\s()-]{8,}$/.test(v.trim())

const ultimos10 = (tel) => String(tel || '').replace(/\D/g, '').slice(-10)

/**
 * Conductores (sin los comodín INTERNO) con su estado de sincronización.
 * estado_sync: 'sincronizado' | 'pendiente' | 'sin_telefono' | 'error' | 'telefono_duplicado'
 */
/**
 * Mismo criterio que aplicarFiltroSede (SedeContext): con una sede elegida se
 * filtra por esa; con "Todas" solo entran las sedes reales (quedan afuera las
 * solo_admin como "Pruebas" y los conductores sin sede).
 */
async function filtroSede(cfg, sedeId) {
  if (sedeId) return `&sede_id=eq.${sedeId}`
  const sedes = await selectTodo(cfg, 'sedes?select=id,solo_admin')
  const reales = sedes.filter((s) => s.solo_admin !== true).map((s) => s.id)
  return reales.length > 0 ? `&sede_id=in.(${reales.join(',')})` : ''
}

export async function listarContactos(cfg, { sedeId = null } = {}) {
  const filtro = await filtroSede(cfg, sedeId)
  const [conductores, registros] = await Promise.all([
    selectTodo(
      cfg,
      'conductores?select=id,nombres,apellidos,numero_dni,email,telefono_contacto,created_at,conductores_estados(codigo,descripcion)' +
        `${filtro}&order=created_at.desc`,
    ),
    selectTodo(cfg, 'twochat_contactos?select=conductor_id,twochat_contact_uuid,telefono,estado,error,updated_at'),
  ])

  const porConductor = new Map(registros.map((r) => [r.conductor_id, r]))
  // Teléfonos ya cargados en 2Chat: no se crea otro contacto con el mismo número
  const telefonosCargados = new Map(
    registros.filter((r) => r.estado === 'creado' && r.telefono).map((r) => [r.telefono, r.conductor_id]),
  )
  const vistos = new Map()

  return conductores
    .filter((c) => !esInterno(c.apellidos))
    .map((c) => {
      const reg = porConductor.get(c.id) || null
      const telefono = normalizarCelularAR(c.telefono_contacto)
      let estadoSync = 'pendiente'
      let detalle = null
      if (reg?.estado === 'creado') {
        estadoSync = 'sincronizado'
      } else if (!telefono) {
        estadoSync = 'sin_telefono'
      } else if (telefonosCargados.has(telefono) && telefonosCargados.get(telefono) !== c.id) {
        estadoSync = 'telefono_duplicado'
        detalle = 'El número ya está cargado en 2Chat para otro conductor'
      } else if (vistos.has(telefono)) {
        estadoSync = 'telefono_duplicado'
        detalle = 'Otro conductor tiene el mismo número'
      } else if (reg?.estado === 'error') {
        estadoSync = 'error'
        detalle = reg.error
      }
      if (telefono && !vistos.has(telefono)) vistos.set(telefono, c.id)
      return {
        conductor_id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        dni: c.numero_dni,
        email: c.email,
        telefono_original: c.telefono_contacto,
        telefono,
        estado_conductor: c.conductores_estados?.codigo || null,
        estado_conductor_label: c.conductores_estados?.descripcion || c.conductores_estados?.codigo || null,
        estado_sync: estadoSync,
        detalle,
        twochat_contact_uuid: reg?.twochat_contact_uuid || null,
        sincronizado_en: reg?.updated_at || null,
        telefono_cambio: !!(reg?.estado === 'creado' && telefono && reg.telefono && reg.telefono !== telefono),
      }
    })
}

function payloadContacto(fila, canal) {
  // PH = teléfono para llamadas por la central telefónica (canal de voz).
  // WAPH = el mismo número como celular: es el que muestra el formulario
  // "Editar contacto" de 2Chat (con solo PH el campo aparece vacío).
  const detalles = [
    { type: 'PH', value: fila.telefono },
    { type: 'WAPH', value: fila.telefono },
  ]
  const email = String(fila.email || '').trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) detalles.push({ type: 'E', value: email })
  const payload = {
    first_name: nombrePropio(fila.nombres) || 'Conductor',
    contact_detail: detalles,
  }
  const apellido = nombrePropio(fila.apellidos)
  if (apellido) payload.last_name = apellido
  if (canal) payload.channel_uuid = canal
  return payload
}

/**
 * Busca en 2Chat un contacto que ya tenga este teléfono (cargado a mano, con el
 * script de Excel, etc.). Compara por los últimos 10 dígitos para que coincidan
 * +5491150108444 y +541150108444. Devuelve el uuid o null.
 */
export async function buscarContactoPorTelefono(apiKey, telefono) {
  const clave = ultimos10(telefono)
  if (clave.length < 10) return null
  const qs = new URLSearchParams({ query: clave, results_per_page: '20', page_number: '0' })
  const r = await twoChat(apiKey, `/contacts/search?${qs}`)
  if (!r.ok) return null
  for (const c of r.data?.contacts || []) {
    const coincide = (c.details || []).some(
      (d) => ['PH', 'WAPH'].includes(String(d.type).toUpperCase()) && ultimos10(d.value) === clave,
    )
    if (coincide && c.uuid) return c.uuid
  }
  return null
}

async function guardarRegistro(cfg, registro) {
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/twochat_contactos?on_conflict=conductor_id`, {
    method: 'POST',
    headers: { ...headersServicio(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...registro, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`No se pudo guardar en twochat_contactos: ${(await res.text()).slice(0, 200)}`)
}

/* -------------------------------------------------------------------------- */
/* Llamadas                                                                   */
/* -------------------------------------------------------------------------- */

let cacheAgentes = { en: 0, mapa: new Map() }
// Una sola sincronización a la vez (evita duplicados por doble clic o dos usuarios)
let sincronizando = false

async function mapaAgentes(apiKey) {
  if (Date.now() - cacheAgentes.en < CACHE_AGENTES_MS && cacheAgentes.mapa.size > 0) {
    return cacheAgentes.mapa
  }
  const mapa = new Map()
  const r = await twoChat(apiKey, '/users')
  for (const u of r.data?.data?.users || []) {
    const nombre = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    mapa.set(u.uuid, nombre || u.email || u.uuid)
  }
  cacheAgentes = { en: Date.now(), mapa }
  return mapa
}

function resultadoLlamada(status, duracion) {
  const s = String(status || '').toUpperCase()
  if (s === 'COMPLETED' || s === 'ANSWERED' || duracion > 0) return 'atendida'
  if (s.includes('BUSY')) return 'ocupado'
  if (s.includes('CANCEL')) return 'cancelada'
  if (s.includes('FAIL') || s.includes('ERROR')) return 'fallida'
  return 'no_atendida'
}

/**
 * Mapas número (últimos 10 dígitos) -> conductor y -> lead, solo sedes reales.
 * Se cachean unos minutos: leer todos los leads es lo más pesado del cruce.
 */
let cacheCruce = { en: 0, conductores: new Map(), leads: new Map() }

async function mapasCruce(cfg) {
  if (Date.now() - cacheCruce.en < CACHE_CRUCE_MS) return cacheCruce
  const filtro = await filtroSede(cfg, null)
  const [conductores, leads] = await Promise.all([
    selectTodo(cfg, `conductores?select=id,apellidos,telefono_contacto${filtro}`),
    selectTodo(cfg, `leads?select=id,phone,whatsapp_number,fecha_creacion${filtro}&order=fecha_creacion.desc`),
  ])
  const porConductor = new Map()
  for (const c of conductores) {
    if (esInterno(c.apellidos)) continue
    const tel = normalizarCelularAR(c.telefono_contacto)
    if (tel && !porConductor.has(ultimos10(tel))) porConductor.set(ultimos10(tel), c.id)
  }
  // Si un número tiene varios leads, queda el más reciente (vienen ordenados desc)
  const porLead = new Map()
  for (const l of leads) {
    for (const campo of [l.phone, l.whatsapp_number]) {
      const tel = normalizarCelularAR(campo)
      if (tel && !porLead.has(ultimos10(tel))) porLead.set(ultimos10(tel), l.id)
    }
  }
  cacheCruce = { en: Date.now(), conductores: porConductor, leads: porLead }
  return cacheCruce
}

async function ultimaLlamadaGuardada(cfg) {
  const res = await fetchConTimeout(
    `${cfg.url}/rest/v1/twochat_llamadas?select=fecha&order=fecha.desc&limit=1`,
    { headers: headersServicio(cfg) },
  )
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const filas = await res.json()
  return filas[0]?.fecha ? Date.parse(filas[0].fecha) : null
}

/**
 * Llamadas guardadas sin conductor ni lead (últimos 60 días): si el número ya
 * pertenece a un lead o conductor cargado después, se completa el cruce.
 */
async function recruzarSinCoincidencia(cfg, cruce) {
  const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const pendientes = await selectTodo(
    cfg,
    `twochat_llamadas?select=uuid,numero_clave&conductor_id=is.null&lead_id=is.null&numero_clave=not.is.null&fecha=gte.${encodeURIComponent(desde)}`,
  )
  const porClave = new Map()
  for (const p of pendientes) {
    const conductorId = cruce.conductores.get(p.numero_clave) || null
    const leadId = conductorId ? null : cruce.leads.get(p.numero_clave) || null
    if (!conductorId && !leadId) continue
    const k = `${conductorId}|${leadId}|${p.numero_clave}`
    if (!porClave.has(k)) porClave.set(k, { conductorId, leadId, clave: p.numero_clave })
  }
  for (const { conductorId, leadId, clave } of porClave.values()) {
    await fetchConTimeout(
      `${cfg.url}/rest/v1/twochat_llamadas?numero_clave=eq.${clave}&conductor_id=is.null&lead_id=is.null`,
      {
        method: 'PATCH',
        headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
        body: JSON.stringify({ conductor_id: conductorId, lead_id: leadId }),
      },
    )
  }
}

/** Última vez que se guardaron llamadas (sirve aunque el servidor se haya reiniciado) */
async function ultimaActualizacionGuardada(cfg) {
  const res = await fetchConTimeout(
    `${cfg.url}/rest/v1/twochat_llamadas?select=sincronizado_en&order=sincronizado_en.desc&limit=1`,
    { headers: headersServicio(cfg) },
  )
  if (!res.ok) return null
  const filas = await res.json()
  return filas[0]?.sincronizado_en || null
}

async function llamadaIncompletaMasVieja(cfg) {
  // Solo los últimos días: más atrás obligaría a pedirle a 2Chat muchas páginas
  const desde = new Date(Date.now() - DIAS_REVISAR_INCOMPLETAS * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetchConTimeout(
    `${cfg.url}/rest/v1/twochat_llamadas?select=fecha` +
      '&or=(and(direccion.eq.entrante,numero.is.null),and(direccion.eq.saliente,agente_id.is.null))' +
      `&fecha=gte.${encodeURIComponent(desde)}&order=fecha.asc&limit=1`,
    { headers: headersServicio(cfg) },
  )
  if (!res.ok) return null
  const filas = await res.json()
  return filas[0]?.fecha ? Date.parse(filas[0].fecha) - 60 * 1000 : null
}

let ultimaSync = 0
// Solo una vez por arranque del servidor (si 2Chat no trae el número, no se insiste)
let revisadasIncompletas = false
let syncEnCurso = null

/**
 * Trae de 2Chat las llamadas nuevas y las guarda en twochat_llamadas.
 * - Primera vez (tabla vacía): todo el historial.
 * - Después: desde la última guardada menos un margen, para tomar también las
 *   que estaban en curso y cambiaron de estado/duración. upsert por uuid.
 * Como mucho una vez por minuto, salvo forzar.
 */
export async function sincronizarLlamadas(cfg, { forzar = false } = {}) {
  if (syncEnCurso) return syncEnCurso
  if (!forzar && Date.now() - ultimaSync < ESPERA_SYNC_LLAMADAS_MS) return { procesadas: 0, omitida: true }
  // Con el botón Actualizar se recargan también conductores y leads para el cruce
  if (forzar) cacheCruce.en = 0
  const inicioSync = Date.now()
  syncEnCurso = (async () => {
    const ultima = await ultimaLlamadaGuardada(cfg)
    // Primera vez (tabla vacía): solo los últimos IMPORT_INICIAL_DIAS, para que no tarde demasiado
    let corte = ultima ? ultima - MARGEN_RESYNC_MS : Date.now() - IMPORT_INICIAL_DIAS * 24 * 60 * 60 * 1000
    // Llamadas guardadas incompletas (entrantes sin número o salientes sin agente):
    // se vuelven a traer para completarlas con la regla actual
    const incompleta = revisadasIncompletas ? null : await llamadaIncompletaMasVieja(cfg)
    revisadasIncompletas = true
    if (ultima && incompleta && incompleta < corte) corte = incompleta

    const cdrs = []
    for (let pagina = 0; pagina < MAX_PAGINAS_HISTORIAL; pagina += 1) {
      const r = await twoChat(cfg.apiKey, `/voip/call-history?page_number=${pagina}`)
      if (!r.ok) throw new Error(`2Chat: ${mensajeError2Chat(r)}`)
      const lote = r.data?.cdrs || []
      if (lote.length === 0) break
      cdrs.push(...lote)
      const total = Number(r.data?.count) || 0
      if (total && cdrs.length >= total) break
      const masVieja = Math.min(...lote.map((c) => Date.parse(c.created_at) || Infinity))
      if (masVieja < corte) break
    }
    const aGuardar = cdrs.filter((c) => c.uuid && Date.parse(c.created_at) >= corte)
    if (aGuardar.length === 0) {
      await recruzarSinCoincidencia(cfg, await mapasCruce(cfg))
      return { procesadas: 0 }
    }

    // Nombres de agentes: usuarios activos + detalle de una llamada para los que ya no están
    const agentes = await mapaAgentes(cfg.apiKey)
    for (const c of aGuardar) c._agente = agenteDeLlamada(c, agentes)
    const faltantes = new Map()
    for (const c of aGuardar) {
      if (c._agente && !agentes.has(c._agente) && !faltantes.has(c._agente)) faltantes.set(c._agente, c.uuid)
    }
    for (const [agenteId, callUuid] of faltantes) {
      const r = await twoChat(cfg.apiKey, `/voip/call/${encodeURIComponent(callUuid)}`)
      const ag = r.data?.cdr?.agent
      const nombre = ag?.full_name || `${ag?.first_name || ''} ${ag?.last_name || ''}`.trim()
      agentes.set(agenteId, nombre || 'Agente sin nombre')
    }

    const cruce = await mapasCruce(cfg)
    const filas = aGuardar.map((c) => {
      const saliente = c.direction === 'O'
      // Entrantes: el número que llamó viene en `from` (o from_number). caller_id_used
      // es el número propio de Toshify, no el del que llama.
      const numero = saliente ? c.to_number : (c.from_number || (esTelefono(c.from) ? c.from : null))
      const clave = numero ? ultimos10(numero) : null
      const conductorId = clave ? cruce.conductores.get(clave) || null : null
      const duracion = Number(c.duration) || 0
      return {
        uuid: c.uuid,
        fecha: c.created_at,
        direccion: saliente ? 'saliente' : 'entrante',
        agente_id: c._agente || null,
        agente: c._agente ? agentes.get(c._agente) || 'Agente sin nombre' : null,
        numero,
        numero_clave: clave,
        status_2chat: c.status || null,
        resultado: resultadoLlamada(c.status, duracion),
        duracion,
        por_whatsapp: !!c.is_whatsapp_call,
        costo_usd: Number(c.call_cost?.call_price) || 0,
        grabacion: c.recording_url || null,
        conductor_id: conductorId,
        lead_id: !conductorId && clave ? cruce.leads.get(clave) || null : null,
        sincronizado_en: new Date().toISOString(),
      }
    })

    for (let i = 0; i < filas.length; i += 500) {
      const res = await fetchConTimeout(`${cfg.url}/rest/v1/twochat_llamadas?on_conflict=uuid`, {
        method: 'POST',
        headers: { ...headersServicio(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(filas.slice(i, i + 500)),
      })
      if (!res.ok) throw new Error(`No se pudo guardar en twochat_llamadas: ${(await res.text()).slice(0, 200)}`)
    }
    await recruzarSinCoincidencia(cfg, cruce)
    return { procesadas: filas.length }
  })()
  try {
    const r = await syncEnCurso
    ultimaSync = Date.now()
    console.log(`[2chat] Llamadas actualizadas: ${r.procesadas ?? 0} en ${((Date.now() - inicioSync) / 1000).toFixed(1)} s`)
    return r
  } finally {
    syncEnCurso = null
  }
}

/** Lee de twochat_llamadas el rango pedido (día calendario de Argentina). */
export async function historialLlamadas(cfg, { desde, hasta, direccion }) {
  const inicio = new Date(`${desde}T00:00:00${OFFSET_ART}`)
  const fin = new Date(new Date(`${hasta}T00:00:00${OFFSET_ART}`).getTime() + 24 * 60 * 60 * 1000)
  let query =
    'twochat_llamadas?select=*,conductores(nombres,apellidos,conductores_estados(codigo)),leads(nombre_completo,estado_de_lead)' +
    `&fecha=gte.${encodeURIComponent(inicio.toISOString())}&fecha=lt.${encodeURIComponent(fin.toISOString())}` +
    '&order=fecha.desc'
  if (direccion === 'outbound') query += '&direccion=eq.saliente'
  if (direccion === 'inbound') query += '&direccion=eq.entrante'
  const filas = await selectTodo(cfg, query)

  return filas.map((f) => {
    const cond = f.conductores
    const lead = f.leads
    return {
      id: f.uuid,
      fecha: f.fecha,
      agente_id: f.agente_id,
      // Sin agente = nadie la tomó: en la práctica, entrantes que no se respondieron
      agente: f.agente || (f.direccion === 'entrante' ? AGENTE_ENTRANTES_SIN_RESPONDER : AGENTE_SALIENTES_SIN_AGENTE),
      direccion: f.direccion,
      numero: f.numero,
      conductor_id: f.conductor_id,
      conductor: cond ? `${nombrePropio(cond.nombres)} ${nombrePropio(cond.apellidos)}`.trim() : null,
      estado_conductor: cond?.conductores_estados?.codigo || null,
      lead_id: f.lead_id,
      lead: lead ? nombrePropio(lead.nombre_completo) : null,
      estado_lead: lead?.estado_de_lead || null,
      tipo_contacto: f.conductor_id ? 'conductor' : f.lead_id ? 'lead' : null,
      resultado: f.resultado,
      status_2chat: f.status_2chat,
      duracion: f.duracion,
      por_whatsapp: f.por_whatsapp,
      costo_usd: Number(f.costo_usd) || 0,
      grabacion: f.grabacion,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Rutas                                                                      */
/* -------------------------------------------------------------------------- */

/** null = todas las sedes reales; false = valor inválido */
function leerSedeId(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === 'todas') return null
  return UUID_RE.test(String(valor)) ? String(valor) : false
}

export const twoChatRouter = express()
twoChatRouter.use(express.json())

/** GET /api/2chat/contactos -> conductores con estado de sincronización */
twoChatRouter.get('/contactos', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const sedeId = leerSedeId(req.query.sede_id)
    if (sedeId === false) return res.status(400).json({ error: 'sede_id inválido' })
    const filas = await listarContactos(ctx.cfg, { sedeId })
    res.json({ filas, canal_whatsapp: !!ctx.cfg.canal, puede_sincronizar: ctx.isAdmin })
  } catch (error) {
    console.error('[2chat/contactos]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/2chat/sincronizar { conductor_ids: string[] }
 * Crea en 2Chat los conductores indicados que estén pendientes (o con error).
 * El frontend manda lotes de hasta MAX_POR_LOTE para mostrar el avance.
 */
twoChatRouter.post('/sincronizar', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res, { admin: true })
    if (!ctx) return
    const ids = Array.isArray(req.body?.conductor_ids) ? req.body.conductor_ids : []
    if (ids.length === 0 || ids.length > MAX_POR_LOTE || !ids.every((id) => UUID_RE.test(id))) {
      return res.status(400).json({ error: `Enviá entre 1 y ${MAX_POR_LOTE} conductor_ids válidos` })
    }

    const sedeId = leerSedeId(req.body?.sede_id)
    if (sedeId === false) return res.status(400).json({ error: 'sede_id inválido' })
    // Se recalcula el estado en el servidor: nunca se crea uno ya sincronizado
    // ni uno fuera de la sede (p. ej. conductores de la sede Pruebas)
    const filas = await listarContactos(ctx.cfg, { sedeId })
    const pedidos = new Set(ids)
    const aCrear = filas.filter(
      (f) => pedidos.has(f.conductor_id) && (f.estado_sync === 'pendiente' || f.estado_sync === 'error'),
    )

    if (sincronizando) {
      return res.status(409).json({ error: 'Ya hay una sincronización en curso. Esperá a que termine.' })
    }
    sincronizando = true
    const resultados = []
    try {
      for (const fila of aCrear) {
        // 1) Si el teléfono ya existe en 2Chat, se vincula en vez de crear otro contacto
        const existente = await buscarContactoPorTelefono(ctx.cfg.apiKey, fila.telefono)
        let ok = true
        let uuid = existente
        let error = null
        if (!existente) {
          const r = await twoChat(ctx.cfg.apiKey, '/contacts', {
            method: 'POST',
            body: payloadContacto(fila, ctx.cfg.canal),
          })
          ok = r.ok
          uuid = r.ok ? r.data?.contact?.uuid || null : null
          error = r.ok ? null : mensajeError2Chat(r)
        }
        await guardarRegistro(ctx.cfg, {
          conductor_id: fila.conductor_id,
          twochat_contact_uuid: uuid,
          telefono: fila.telefono,
          estado: ok ? 'creado' : 'error',
          error,
          sincronizado_por: ctx.userId,
        })
        resultados.push({ conductor_id: fila.conductor_id, ok, vinculado: !!existente, twochat_contact_uuid: uuid, error })
        if (!ok) console.warn(`[2chat] Error creando ${fila.conductor_id}: ${error}`)
        await esperar(PAUSA_ENTRE_ALTAS_MS)
      }
    } finally {
      sincronizando = false
    }

    res.json({
      creados: resultados.filter((r) => r.ok && !r.vinculado).length,
      vinculados: resultados.filter((r) => r.vinculado).length,
      errores: resultados.filter((r) => !r.ok).length,
      omitidos: ids.length - aCrear.length,
      resultados,
    })
  } catch (error) {
    console.error('[2chat/sincronizar]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/2chat/crear-lead { nombre, telefono, sede_id? }
 * Crea un lead desde una llamada sin coincidencia (fuente 2Chat) y le vincula
 * las llamadas de ese número. Si el número ya es de un lead, devuelve ese lead;
 * si es de un conductor, no crea nada.
 */
twoChatRouter.post('/crear-lead', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const nombre = String(req.body?.nombre || '').replace(/\s+/g, ' ').trim()
    const telefono = normalizarCelularAR(req.body?.telefono)
    const sedeId = leerSedeId(req.body?.sede_id)
    if (nombre.length < 3) return res.status(400).json({ error: 'Ingresá el nombre del lead (mínimo 3 letras)' })
    if (!telefono) return res.status(400).json({ error: 'El teléfono no es un celular válido' })
    if (sedeId === false) return res.status(400).json({ error: 'sede_id inválido' })

    // Datos frescos para no duplicar: el número puede haberse cargado hace un momento
    cacheCruce.en = 0
    const cruce = await mapasCruce(ctx.cfg)
    const clave = ultimos10(telefono)
    if (cruce.conductores.has(clave)) {
      return res.status(409).json({ error: 'Ese número ya es de un conductor de Toshify', conductor_id: cruce.conductores.get(clave) })
    }

    let leadId = cruce.leads.get(clave) || null
    const existente = !!leadId
    if (!leadId) {
      let sede = null
      if (sedeId) {
        const sedes = await selectTodo(ctx.cfg, `sedes?select=id,nombre&id=eq.${sedeId}`)
        sede = sedes[0] || null
      }
      const insert = await fetchConTimeout(`${ctx.cfg.url}/rest/v1/leads?select=id`, {
        method: 'POST',
        headers: { ...headersServicio(ctx.cfg), Prefer: 'return=representation' },
        body: JSON.stringify({
          nombre_completo: nombre,
          phone: telefono,
          fuente_de_lead: FUENTE_LEAD_2CHAT,
          ...(sede ? { sede_id: sede.id, sede: sede.nombre } : {}),
        }),
      })
      if (!insert.ok) throw new Error(`No se pudo crear el lead: ${(await insert.text()).slice(0, 200)}`)
      leadId = (await insert.json())[0]?.id || null
      if (!leadId) throw new Error('No se pudo crear el lead')
      cacheCruce.en = 0
    }

    // Vincular las llamadas guardadas de ese número
    await fetchConTimeout(
      `${ctx.cfg.url}/rest/v1/twochat_llamadas?numero_clave=eq.${clave}&conductor_id=is.null&lead_id=is.null`,
      {
        method: 'PATCH',
        headers: { ...headersServicio(ctx.cfg), Prefer: 'return=minimal' },
        body: JSON.stringify({ lead_id: leadId }),
      },
    )
    res.json({ lead_id: leadId, existente })
  } catch (error) {
    console.error('[2chat/crear-lead]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** GET /api/2chat/llamadas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&direccion=outbound|inbound|todas */
twoChatRouter.get('/llamadas', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const { desde, hasta } = req.query
    const direccion = ['outbound', 'inbound', 'todas'].includes(req.query.direccion)
      ? req.query.direccion
      : 'todas'
    if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '') || desde > hasta) {
      return res.status(400).json({ error: 'Rango de fechas inválido (desde/hasta AAAA-MM-DD)' })
    }
    // Al abrir la pantalla solo se lee la base (rápido). A 2Chat se va solo con el
    // botón Consultar (actualizar=1) y con la actualización automática horaria.
    let sync = null
    let errorSync = null
    if (req.query.actualizar === '1') {
      try {
        sync = await sincronizarLlamadas(ctx.cfg, { forzar: true })
      } catch (err) {
        // Si 2Chat falla, igual se muestra lo guardado
        errorSync = err.message
        console.error('[2chat/llamadas] sync:', err.message)
      }
    }
    const [llamadas, actualizadoEn] = await Promise.all([
      historialLlamadas(ctx.cfg, { desde, hasta, direccion }),
      ultimaSync ? Promise.resolve(new Date(ultimaSync).toISOString()) : ultimaActualizacionGuardada(ctx.cfg),
    ])
    res.json({
      llamadas,
      procesadas: sync?.procesadas ?? 0,
      actualizado_en: actualizadoEn,
      error_sync: errorSync,
    })
  } catch (error) {
    console.error('[2chat/llamadas]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Actualización automática de llamadas                                       */
/* -------------------------------------------------------------------------- */

// Todos los días, a cada hora en punto entre estas horas de Argentina (inclusive)
const SYNC_AUTO_HORA_DESDE = 9
const SYNC_AUTO_HORA_HASTA = 17

/** Hora y minuto actuales en Argentina (UTC-3, sin horario de verano) */
function horaArgentina() {
  const art = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return { dia: art.toISOString().slice(0, 10), hora: art.getUTCHours(), minuto: art.getUTCMinutes() }
}

/**
 * Revisa cada minuto si toca actualizar. Corre una vez por hora (aunque el
 * chequeo caiga en el minuto 1 o 2 por un reinicio) y no hace nada si la API
 * key o Supabase no están configurados. Si hay varias instancias del servidor
 * no pasa nada: el guardado es por uuid de llamada y no duplica.
 */
export function iniciarSyncAutomatico() {
  // Evita timers duplicados si el módulo se vuelve a cargar (p. ej. en el dev server de Vite)
  if (globalThis.__twochatSyncAuto) return
  globalThis.__twochatSyncAuto = true
  let ultimaHoraCorrida = null

  const revisar = async () => {
    const { dia, hora, minuto } = horaArgentina()
    if (hora < SYNC_AUTO_HORA_DESDE || hora > SYNC_AUTO_HORA_HASTA || minuto > 5) return
    const clave = `${dia} ${hora}`
    if (ultimaHoraCorrida === clave) return
    ultimaHoraCorrida = clave
    const cfg = config()
    if (!cfg.apiKey || !cfg.url || !cfg.serviceKey) {
      console.warn('[2chat] Actualización automática omitida: falta TWOCHAT_API_KEY o Supabase')
      return
    }
    try {
      const r = await sincronizarLlamadas(cfg, { forzar: true })
      console.log(`[2chat] Actualización automática ${clave}:00 ART: ${r.procesadas ?? 0} llamadas procesadas`)
    } catch (err) {
      console.error(`[2chat] Actualización automática ${clave}:00 ART falló:`, err.message)
    }
  }

  setInterval(() => { void revisar() }, 60 * 1000).unref?.()
  console.log(`[2chat] Actualización automática activa: cada hora de ${SYNC_AUTO_HORA_DESDE} a ${SYNC_AUTO_HORA_HASTA} h (Argentina)`)
}

if (process.env.TWOCHAT_SYNC_AUTO === '1') iniciarSyncAutomatico()

