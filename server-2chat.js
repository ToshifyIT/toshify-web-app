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
 *  - TWOCHAT_SYNC_AUTO      (opcional)     -> "1" activa la actualización automática: llamadas y
 *                                             mensajes cada hora en punto, y alta de contactos cada
 *                                             5 minutos para los conductores activos que ya tienen
 *                                             una asignación (ver iniciarSyncAutomatico)
 *  - GEMINI_API_KEY        (opcional)     -> transcribe las llamadas atendidas, detecta el buzón
 *                                             de voz y califica la conversación (ver transcribirPendientes)
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
  'GEMINI_API_KEY',
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
    geminiKey: process.env.GEMINI_API_KEY || null,
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

// Números de prueba (María Flores, 2026-11-18): sus llamadas y mensajes no se guardan
const NUMEROS_PRUEBA = new Set(['3686251232', '1999950133'])
const esNumeroPrueba = (tel) => NUMEROS_PRUEBA.has(ultimos10(tel))

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

// Una sola alta de contactos a la vez (evita duplicados entre la automática, un doble clic o dos usuarios)
let sincronizando = false

/**
 * Crea en 2Chat los contactos de estas filas (de listarContactos). Si el teléfono
 * ya existe en 2Chat, lo vincula en vez de crear otro. Guarda el resultado de cada uno.
 */
async function crearContactos(cfg, filas, userId = null) {
  const resultados = []
  for (const fila of filas) {
    const existente = await buscarContactoPorTelefono(cfg.apiKey, fila.telefono)
    let ok = true
    let uuid = existente
    let error = null
    if (!existente) {
      const r = await twoChat(cfg.apiKey, '/contacts', { method: 'POST', body: payloadContacto(fila, cfg.canal) })
      ok = r.ok
      uuid = r.ok ? r.data?.contact?.uuid || null : null
      error = r.ok ? null : mensajeError2Chat(r)
    }
    await guardarRegistro(cfg, {
      conductor_id: fila.conductor_id,
      twochat_contact_uuid: uuid,
      telefono: fila.telefono,
      estado: ok ? 'creado' : 'error',
      error,
      sincronizado_por: userId,
    })
    resultados.push({ conductor_id: fila.conductor_id, ok, vinculado: !!existente, twochat_contact_uuid: uuid, error })
    if (!ok) console.warn(`[2chat] Error creando ${fila.conductor_id}: ${error}`)
    await esperar(PAUSA_ENTRE_ALTAS_MS)
  }
  return resultados
}

/**
 * Alta automática: crea en 2Chat a los conductores activos que ya tienen una
 * asignación (la programación pasó a asignación) y todavía no están cargados.
 * Los que quedaron con error solo se reintentan con reintentarErrores (una vez por hora).
 * Solo sedes reales (no Pruebas), mismo criterio que la pantalla.
 */
export async function sincronizarContactosNuevos(cfg, { reintentarErrores = false } = {}) {
  if (sincronizando) return { creados: 0, vinculados: 0, errores: 0, omitido: true }
  sincronizando = true
  try {
    const filas = await listarContactos(cfg)
    const candidatos = filas.filter(
      (f) => String(f.estado_conductor || '').toLowerCase() === 'activo' &&
        (f.estado_sync === 'pendiente' || (reintentarErrores && f.estado_sync === 'error')),
    )
    if (candidatos.length === 0) return { creados: 0, vinculados: 0, errores: 0 }
    const conAsignacion = new Set()
    for (let i = 0; i < candidatos.length; i += 100) {
      const ids = candidatos.slice(i, i + 100).map((f) => f.conductor_id).join(',')
      const filasAsig = await selectTodo(
        cfg,
        'asignaciones_conductores?select=conductor_id,asignaciones!inner(estado)' +
          `&conductor_id=in.(${ids})&estado=neq.cancelado&asignaciones.estado=neq.cancelada`,
      )
      for (const a of filasAsig) conAsignacion.add(a.conductor_id)
    }
    const aCrear = candidatos.filter((f) => conAsignacion.has(f.conductor_id)).slice(0, MAX_POR_LOTE)
    const resultados = await crearContactos(cfg, aCrear)
    return {
      creados: resultados.filter((r) => r.ok && !r.vinculado).length,
      vinculados: resultados.filter((r) => r.vinculado).length,
      errores: resultados.filter((r) => !r.ok).length,
    }
  } finally {
    sincronizando = false
  }
}

/* -------------------------------------------------------------------------- */
/* Llamadas                                                                   */
/* -------------------------------------------------------------------------- */

let cacheAgentes = { en: 0, mapa: new Map() }

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
    // El cruce con conductores y leads (leer ~13.000 leads) se arranca en paralelo con
    // las páginas de 2Chat en vez de esperar a que terminen
    const crucePromesa = mapasCruce(cfg)
    crucePromesa.catch(() => {})
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
      await recruzarSinCoincidencia(cfg, await crucePromesa)
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

    const cruce = await crucePromesa
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
    }).filter((f) => !esNumeroPrueba(f.numero))

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

  // Llamadas hechas desde el botón de Toshibase: quién llamó de verdad (importa con
  // la cuenta compartida «Info Toshify», que usan varias personas). Se cruza por
  // número, cuenta de 2Chat y hora (hasta 3 minutos de diferencia).
  let registros = []
  try {
    const margen = 10 * 60 * 1000
    registros = await selectTodo(
      cfg,
      'twochat_llamadas_toshibase?select=usuario,twochat_user_uuid,numero_clave,iniciada_en' +
        `&iniciada_en=gte.${encodeURIComponent(new Date(inicio.getTime() - margen).toISOString())}` +
        `&iniciada_en=lt.${encodeURIComponent(new Date(fin.getTime() + margen).toISOString())}`,
    )
  } catch {
    // Sin la tabla (sql/twochat_voz.sql todavía no corrido)
  }
  const quienLlamo = (f) => {
    if (f.direccion !== 'saliente' || !registros.length) return null
    const t = new Date(f.fecha).getTime()
    let mejor = null
    for (const r of registros) {
      if (r.numero_clave !== f.numero_clave || (f.agente_id && r.twochat_user_uuid !== f.agente_id)) continue
      const dif = Math.abs(new Date(r.iniciada_en).getTime() - t)
      if (dif <= 3 * 60 * 1000 && (!mejor || dif < mejor.dif)) mejor = { dif, usuario: r.usuario }
    }
    return mejor?.usuario || null
  }

  return filas.map((f) => {
    const cond = f.conductores
    const lead = f.leads
    const persona = quienLlamo(f)
    const cuenta = f.agente || (f.direccion === 'entrante' ? AGENTE_ENTRANTES_SIN_RESPONDER : AGENTE_SALIENTES_SIN_AGENTE)
    return {
      id: f.uuid,
      fecha: f.fecha,
      agente_id: f.agente_id,
      // Sin agente = nadie la tomó: en la práctica, entrantes que no se respondieron.
      // Si salió desde Toshibase por una cuenta compartida: «Persona (vía Cuenta)»
      agente: persona && persona !== cuenta ? `${persona} (vía ${cuenta})` : cuenta,
      realizada_por: persona,
      // Cuenta de 2Chat con la que salió (puede ser la compartida «Info Toshify»)
      cuenta_2chat: cuenta,
      direccion: f.direccion,
      numero: f.numero,
      conductor_id: f.conductor_id,
      conductor: cond ? `${nombrePropio(cond.nombres)} ${nombrePropio(cond.apellidos)}`.trim() : null,
      estado_conductor: cond?.conductores_estados?.codigo || null,
      lead_id: f.lead_id,
      lead: lead ? nombrePropio(lead.nombre_completo) : null,
      estado_lead: lead?.estado_de_lead || null,
      tipo_contacto: f.conductor_id ? 'conductor' : f.lead_id ? 'lead' : null,
      // El buzón de voz 2Chat lo cuenta como atendida: Gemini lo distingue al escuchar la grabación
      resultado: f.resultado === 'atendida' && f.tipo_atencion === 'buzon_de_voz'
        ? 'buzon_voz'
        : f.resultado === 'atendida' && f.tipo_atencion === 'sin_conversacion'
          ? 'sin_conversacion'
          : f.resultado,
      status_2chat: f.status_2chat,
      duracion: f.duracion,
      por_whatsapp: f.por_whatsapp,
      costo_usd: Number(f.costo_usd) || 0,
      grabacion: f.grabacion,
      transcripcion: f.transcripcion ?? null,
      resumen: f.resumen ?? null,
      calificacion: f.calificacion ?? null,
      calificacion_detalle: f.calificacion_detalle ?? null,
      resultado_conversacion: f.resultado_conversacion ?? null,
      proximo_paso: f.proximo_paso ?? null,
      analizada: f.transcripcion_estado === 'ok',
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Transcripción, buzón de voz y calidad (Gemini Flash-Lite)                  */
/* -------------------------------------------------------------------------- */
// 2Chat no transcribe y marca como "atendida" la llamada que atiende el buzón de voz.
// Gemini escucha la grabación y devuelve el texto, qué pasó realmente y una nota de
// calidad con criterios de QA de call center. ~1.500 tokens por minuto de audio:
// menos de un centavo de dólar por llamada (decisión 2026-11-17: el modelo económico).

const GEMINI_MODELO = 'gemini-flash-lite-latest'
const GEMINI_TIMEOUT_MS = 120000
const TRANSCRIPCION_MAX_INTENTOS = 3
const TRANSCRIPCION_POR_TANDA = 40
// Más de 25 min de audio no entra cómodo en un pedido inline: se marca como error
const TRANSCRIPCION_MAX_SEG = 25 * 60
const TIPOS_ATENCION = ['conversacion', 'buzon_de_voz', 'sin_conversacion']
const RESULTADOS_CONVERSACION = ['interesado', 'agendado', 'volver_a_llamar', 'no_interesado', 'informativa', 'otro']
const CRITERIOS_CALIDAD = ['presentacion', 'indagacion', 'claridad', 'objeciones', 'cierre']

const PROMPT_LLAMADA = `Sos analista de calidad de un call center. Escuchá esta llamada telefónica de Toshify
(empresa de Argentina que alquila autos a conductores de apps como Cabify y Uber). Habla un agente de
Toshify con un conductor o con un candidato (lead) que quiere alquilar un auto o ofrecer el suyo.

Devolvé SOLO un JSON con estas claves:
- tipo_atencion: "conversacion" si el agente habló con una persona; "buzon_de_voz" si atendió un
  contestador, casilla de mensajes o mensaje automático del operador (aunque el agente deje un mensaje);
  "sin_conversacion" si nadie habló, se cortó enseguida, solo hay silencio o ruido, o fue número equivocado.
- transcripcion: la llamada completa en español rioplatense, un turno por línea, cada uno empieza con
  "Agente:" o "Contacto:" ("Buzón:" para el mensaje grabado). Vacío si no hay voz.
- resumen: 1 o 2 oraciones con lo que se habló y lo que se acordó.
- resultado_conversacion: uno de "interesado", "agendado" (quedó una cita, visita o entrega con día),
  "volver_a_llamar", "no_interesado", "informativa" (consulta o aviso sin venta), "otro". null si no hubo conversación.
- proximo_paso: el próximo paso concreto acordado, o null si no quedó ninguno.
- criterios: solo si tipo_atencion es "conversacion" (si no, null). Puntaje de 1 a 5 al AGENTE en:
  presentacion (saluda, dice su nombre y que llama de Toshify),
  indagacion (pregunta por la situación y lo que necesita el contacto antes de ofrecer),
  claridad (explica condiciones, precios o requisitos sin errores ni vueltas),
  objeciones (responde dudas o reparos con argumentos; null si no hubo objeciones),
  cierre (termina con un próximo paso concreto: fecha, documentación, visita).
- calificacion: nota general de 1 a 5 de la llamada para el agente (null si no fue conversación).
  5 = ejemplar, 4 = buena, 3 = correcta con mejoras, 2 = floja, 1 = mala.
- motivo: una oración que justifique la nota con lo más importante a mejorar o a destacar (null si no aplica).`

const nota15 = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
}
const textoONull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

function normalizarAnalisis(r) {
  // Sin un tipo válido no se adivina: queda como error de análisis (se reintenta) y la
  // llamada sigue como «Atendida». Antes caía en 'sin_conversacion' y una conversación
  // real podía quedar como «Sin contacto».
  if (!TIPOS_ATENCION.includes(r?.tipo_atencion)) {
    throw new Error(`Gemini devolvió un tipo_atencion no válido: ${String(r?.tipo_atencion).slice(0, 40)}`)
  }
  const tipo = r.tipo_atencion
  const esConversacion = tipo === 'conversacion'
  const criterios = esConversacion && r?.criterios && typeof r.criterios === 'object' ? r.criterios : null
  const detalle = criterios
    ? { ...Object.fromEntries(CRITERIOS_CALIDAD.map((c) => [c, nota15(criterios[c])])), motivo: textoONull(r.motivo) }
    : null
  return {
    tipo_atencion: tipo,
    transcripcion: textoONull(r?.transcripcion),
    resumen: textoONull(r?.resumen),
    calificacion: esConversacion ? nota15(r?.calificacion) : null,
    calificacion_detalle: detalle,
    resultado_conversacion: esConversacion && RESULTADOS_CONVERSACION.includes(r?.resultado_conversacion)
      ? r.resultado_conversacion
      : null,
    proximo_paso: esConversacion ? textoONull(r?.proximo_paso) : null,
  }
}

export async function analizarGrabacion(geminiKey, urlGrabacion) {
  const audio = await fetchConTimeout(urlGrabacion)
  if (!audio.ok) throw new Error(`grabación HTTP ${audio.status}`)
  const mime = (audio.headers.get('content-type') || 'audio/mpeg').split(';')[0]
  const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mime.startsWith('audio/') ? mime : 'audio/mpeg', data: base64 } }, { text: PROMPT_LLAMADA }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 12000 },
        }),
      },
    )
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    return normalizarAnalisis(JSON.parse(texto))
  } finally {
    clearTimeout(timer)
  }
}

let transcripcionEnCurso = null

/**
 * Analiza las llamadas atendidas con grabación que todavía no tienen transcripción
 * (las más nuevas primero). Corre una tanda por vez; si la tabla no tiene las
 * columnas (falta sql/twochat_llamadas_transcripcion.sql) o no hay GEMINI_API_KEY, no hace nada.
 */
export async function transcribirPendientes(cfg, { limite = TRANSCRIPCION_POR_TANDA } = {}) {
  if (!cfg.geminiKey) return { analizadas: 0, omitida: 'sin GEMINI_API_KEY' }
  if (transcripcionEnCurso) return transcripcionEnCurso
  transcripcionEnCurso = (async () => {
    const res = await fetchConTimeout(
      `${cfg.url}/rest/v1/twochat_llamadas?select=uuid,grabacion,duracion,transcripcion_intentos` +
        '&resultado=eq.atendida&grabacion=not.is.null&or=(transcripcion_estado.is.null,transcripcion_estado.eq.error)' +
        `&transcripcion_intentos=lt.${TRANSCRIPCION_MAX_INTENTOS}&order=fecha.desc&limit=${limite}`,
      { headers: headersServicio(cfg) },
    )
    if (!res.ok) throw new Error(`twochat_llamadas (¿falta sql/twochat_llamadas_transcripcion.sql?): ${(await res.text()).slice(0, 150)}`)
    const pendientes = await res.json()
    let ok = 0
    let errores = 0
    for (const f of pendientes) {
      let cambios
      try {
        if (f.duracion > TRANSCRIPCION_MAX_SEG) throw new Error('llamada demasiado larga')
        cambios = { ...(await analizarGrabacion(cfg.geminiKey, f.grabacion)), transcripcion_estado: 'ok' }
        ok += 1
      } catch (err) {
        errores += 1
        console.error(`[2chat] Transcripción ${f.uuid}:`, err.message)
        cambios = { transcripcion_estado: 'error' }
      }
      cambios.transcripcion_intentos = (f.transcripcion_intentos || 0) + 1
      cambios.transcripcion_en = new Date().toISOString()
      await fetchConTimeout(`${cfg.url}/rest/v1/twochat_llamadas?uuid=eq.${encodeURIComponent(f.uuid)}`, {
        method: 'PATCH',
        headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
        body: JSON.stringify(cambios),
      })
    }
    if (pendientes.length) console.log(`[2chat] Llamadas analizadas con Gemini: ${ok} ok, ${errores} con error`)
    return { analizadas: ok, errores, quedan: pendientes.length === limite }
  })()
  try {
    return await transcripcionEnCurso
  } finally {
    transcripcionEnCurso = null
  }
}

/** Corre transcribirPendientes sin frenar la respuesta (tras el botón Consultar). */
function transcribirEnSegundoPlano(cfg) {
  transcribirPendientes(cfg).catch((err) => console.error('[2chat] Transcripción:', err.message))
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

/** GET /api/2chat/contactos -> conductores con estado de sincronización (el alta es automática) */
twoChatRouter.get('/contactos', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const sedeId = leerSedeId(req.query.sede_id)
    if (sedeId === false) return res.status(400).json({ error: 'sede_id inválido' })
    const filas = await listarContactos(ctx.cfg, { sedeId })
    res.json({
      filas,
      canal_whatsapp: !!ctx.cfg.canal,
      puede_sincronizar: ctx.isAdmin,
      alta_automatica: process.env.TWOCHAT_SYNC_AUTO === '1',
    })
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
    let resultados = []
    try {
      resultados = await crearContactos(ctx.cfg, aCrear, ctx.userId)
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

/* -------------------------------------------------------------------------- */
/* Chat de WhatsApp con un lead (botón «Chat» de la lista de Leads)            */
/* -------------------------------------------------------------------------- */
// Abre la conversación del lead en el WhatsApp de 2Chat («Toshify Clientes»). Si
// todavía no hay conversación, la crea mandando un primer mensaje (la API de 2Chat
// no permite crear un chat vacío). En los dos casos la etiqueta «Lead» y la asigna
// al usuario de Toshibase que la abre (se cruza con los usuarios de 2Chat).

// Parte fija de los links del Chat en vivo de la cuenta (app.2chat.io/live-chat/<esto>/<session_key>)
const LIVE_CHAT_BASE = 'https://app.2chat.io/live-chat/STEc7fa4009-df4e-43e7-b267-2e9adc836ea7'
const ETIQUETA_LEAD = 'Lead'
const EQUIPO_LEADS = 'Ventas'
// Conversaciones de conductores: al capitán que tiene en Toshibase (conductores.guia)
const ETIQUETA_CONDUCTOR = 'Conductor'
const EQUIPO_CONDUCTORES = 'Clientes'
const MAX_MENSAJE = 1000
const CACHE_CANAL_MS = 10 * 60 * 1000

let cacheCanalWa = { en: 0, canal: null }
let cacheUsuarios2Chat = { en: 0, usuarios: [] }
let cacheEquipos2Chat = { en: 0, equipos: [] }

/** Equipo de 2Chat por nombre (sin distinguir mayúsculas) */
async function equipo2Chat(apiKey, nombre) {
  if (Date.now() - cacheEquipos2Chat.en >= CACHE_AGENTES_MS) {
    const r = await twoChat(apiKey, '/teams')
    cacheEquipos2Chat = { en: Date.now(), equipos: r.ok && Array.isArray(r.data?.data?.teams) ? r.data.data.teams : [] }
  }
  return cacheEquipos2Chat.equipos.find((t) => String(t.name || '').toLowerCase() === nombre.toLowerCase()) || null
}

/** Canal de WhatsApp conectado (uuid y número) */
async function canalWhatsApp(apiKey) {
  if (cacheCanalWa.canal && Date.now() - cacheCanalWa.en < CACHE_CANAL_MS) return cacheCanalWa.canal
  const r = await twoChat(apiKey, '/whatsapp/get-numbers')
  if (!r.ok) throw new Error(`2Chat: no se pudo leer el canal de WhatsApp (${mensajeError2Chat(r)})`)
  const numeros = Array.isArray(r.data?.numbers) ? r.data.numbers : []
  const canal = numeros.find((n) => n.connection_status === 'C') || numeros[0] || null
  if (!canal) throw new Error('No hay ningún WhatsApp conectado en 2Chat')
  cacheCanalWa = { en: Date.now(), canal: { uuid: canal.uuid, numero: canal.phone_number, conectado: canal.connection_status === 'C' } }
  return cacheCanalWa.canal
}

async function usuarios2Chat(apiKey) {
  if (Date.now() - cacheUsuarios2Chat.en < CACHE_AGENTES_MS) return cacheUsuarios2Chat.usuarios
  const r = await twoChat(apiKey, '/users')
  const usuarios = r.ok && Array.isArray(r.data?.data?.users) ? r.data.data.users : []
  cacheUsuarios2Chat = { en: Date.now(), usuarios }
  return usuarios
}

const soloLetras = (s) => String(s || '').normalize('NFD').replace(/[^a-zA-Z\s]/g, '').toLowerCase().trim()
const primeraPalabra = (s) => soloLetras(s).split(/\s+/)[0] || ''
const ultimaPalabra = (s) => soloLetras(s).split(/\s+/).pop() || ''
const capitalizar = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/**
 * Usuario de 2Chat del usuario de Toshibase: mismo email (sin el «+algo») o mismo
 * nombre y apellido (ignora segundos nombres y apóstrofes: «Eunice Durso» = «Eunice D'Urso»).
 */
function cruzarUsuario2Chat(perfil, usuarios) {
  const email = String(perfil.email || '').toLowerCase()
  const nombre = perfil.full_name || ''
  return (
    usuarios.find((u) => String(u.email || '').toLowerCase().replace(/\+[^@]*@/, '@') === email) ||
    usuarios.find((u) => {
      const completo = `${u.first_name || ''} ${u.last_name || ''}`
      return primeraPalabra(completo) === primeraPalabra(nombre) && ultimaPalabra(completo) === ultimaPalabra(nombre)
    }) ||
    null
  )
}

/**
 * Cuenta de 2Chat del usuario de Toshibase: primero la vinculada a mano en
 * twochat_usuarios (p. ej. admin, Karen y Gandhy → «Info Toshify», compartida);
 * si no hay, la que coincide por email o nombre. compartida = la usa más de uno.
 */
async function usuario2ChatDe(cfg, userId) {
  const [perfiles, usuarios] = await Promise.all([
    selectTodo(cfg, `user_profiles?select=full_name,email&id=eq.${userId}`),
    usuarios2Chat(cfg.apiKey),
  ])
  const perfil = perfiles[0] || {}
  let vinculo = null
  try {
    vinculo = (await selectTodo(cfg, `twochat_usuarios?select=twochat_user_uuid&user_id=eq.${userId}`))[0] || null
  } catch {
    // Sin la tabla (sql/twochat_voz.sql todavía no corrido): solo cruce automático
  }
  if (vinculo) {
    const agente = usuarios.find((u) => u.uuid === vinculo.twochat_user_uuid) || null
    return { perfil, agente, compartida: true }
  }
  return { perfil, agente: cruzarUsuario2Chat(perfil, usuarios), compartida: false }
}

/** Conversación de WhatsApp con ese número (o null) */
async function buscarConversacion(apiKey, canalUuid, telefono) {
  const digitos = telefono.replace(/\D/g, '').slice(-10)
  const r = await twoChat(apiKey, `/whatsapp/conversations/${canalUuid}?page_number=0&phone_number=${digitos}`)
  if (!r.ok) throw new Error(`2Chat: no se pudo buscar la conversación (${mensajeError2Chat(r)})`)
  const sesiones = Array.isArray(r.data?.sessions) ? r.data.sessions : []
  const objetivo = telefono.replace(/\D/g, '')
  return sesiones.find((s) => !s.is_group_chat && String(s.phone_number || '').replace(/\D/g, '') === objetivo) || null
}

async function contextoChatLead(ctx, leadId) {
  const [leads, cuenta] = await Promise.all([
    selectTodo(ctx.cfg, `leads?select=id,nombre_completo,primer_nombre,phone,whatsapp_number&id=eq.${leadId}`),
    usuario2ChatDe(ctx.cfg, ctx.userId),
  ])
  const lead = leads[0]
  if (!lead) return { error: 'No se encontró el lead', status: 404 }
  const telefono = normalizarCelularAR(lead.whatsapp_number) || normalizarCelularAR(lead.phone)
  if (!telefono) return { error: 'El lead no tiene un celular válido', status: 400 }
  const { perfil, agente, compartida } = cuenta
  const canal = await canalWhatsApp(ctx.cfg.apiKey)
  const nombreLead = capitalizar(String(lead.primer_nombre || lead.nombre_completo || '').trim().split(/\s+/)[0] || '')
  // Con la cuenta compartida (Info Toshify) el saludo va con el nombre de la persona
  const nombreAgente = capitalizar(
    (!compartida && agente?.first_name?.split(/\s+/)[0]) || String(perfil.full_name || '').split(/\s+/)[0] || '',
  )
  return { lead, telefono, canal, agente, nombreLead, nombreAgente }
}

function saludoSugerido(nombreLead, nombreAgente) {
  return `Hola${nombreLead ? ` ${nombreLead}` : ''}, ¿cómo estás? Mi nombre es ${nombreAgente || '…'}, me comunico de Toshify. ` +
    'Estamos buscando conductores para sumar a nuestra flota y me llegó tu solicitud. ¿Seguís interesado?'
}

/**
 * Etiqueta y asigna al equipo y al agente (por defecto «Lead» / Ventas; conductores:
 * «Conductor» / Clientes). Devuelve avisos (no corta el flujo si falla)
 */
async function etiquetarYAsignar(apiKey, sessionKey, agente, { etiqueta = ETIQUETA_LEAD, nombreEquipo = EQUIPO_LEADS } = {}) {
  const avisos = []
  const tag = await twoChat(apiKey, '/tags', { method: 'POST', body: { name: etiqueta, session_key: sessionKey } })
  if (!tag.ok) avisos.push(`No se pudo poner la etiqueta «${etiqueta}»: ${mensajeError2Chat(tag)}`)
  const equipo = await equipo2Chat(apiKey, nombreEquipo)
  if (equipo) {
    const eq = await twoChat(apiKey, `/conversations/${encodeURIComponent(sessionKey)}/assignment/team`, {
      method: 'POST',
      body: { team_uuid: equipo.uuid },
    })
    if (!eq.ok) avisos.push(`No se pudo asignar al equipo ${nombreEquipo}: ${mensajeError2Chat(eq)}`)
  } else {
    avisos.push(`No existe el equipo «${nombreEquipo}» en 2Chat`)
  }
  if (agente) {
    const asig = await twoChat(apiKey, `/conversations/${encodeURIComponent(sessionKey)}/assignment/user`, {
      method: 'POST',
      body: { user_uuid: agente.uuid },
    })
    if (!asig.ok) avisos.push(`No se pudo asignar a ${agente.first_name}: ${mensajeError2Chat(asig)}`)
  } else {
    avisos.push('Tu usuario no está en 2Chat: la conversación quedó sin asignar')
  }
  return avisos
}

/**
 * Asigna cada conversación de un conductor al usuario de 2Chat de su capitán en Toshibase
 * (conductores.guia; se cruza por nombre, p. ej. «Eunice D'Urso» = «Eunice Durso»), con el
 * equipo «Clientes» y la etiqueta «Conductor». Si estaba asignada a otra persona, la pasa
 * al capitán (así sigue al capitán si cambia). Leads y números sin cruce no se tocan.
 * Corre al final de cada sincronización de mensajes.
 */
export async function asignarConversacionesACapitan(cfg) {
  const conversaciones = await selectTodo(
    cfg,
    'twochat_conversaciones?select=session_key,agente_id,conductores(guia)&conductor_id=not.is.null',
  )
  if (!conversaciones.length) return { asignadas: 0 }
  const usuarios = await usuarios2Chat(cfg.apiKey)
  const equipo = await equipo2Chat(cfg.apiKey, EQUIPO_CONDUCTORES)
  let asignadas = 0
  for (const c of conversaciones) {
    const guia = c.conductores?.guia
    if (!guia) continue
    const capitan = cruzarUsuario2Chat({ full_name: guia }, usuarios)
    if (!capitan || c.agente_id === capitan.uuid) continue
    const sk = encodeURIComponent(c.session_key)
    if (equipo) {
      await twoChat(cfg.apiKey, `/conversations/${sk}/assignment/team`, { method: 'POST', body: { team_uuid: equipo.uuid } })
    }
    const asig = await twoChat(cfg.apiKey, `/conversations/${sk}/assignment/user`, { method: 'POST', body: { user_uuid: capitan.uuid } })
    if (!asig.ok) {
      console.error(`[2chat] No se pudo asignar ${c.session_key} a ${guia}:`, mensajeError2Chat(asig))
      continue
    }
    await twoChat(cfg.apiKey, '/tags', { method: 'POST', body: { name: ETIQUETA_CONDUCTOR, session_key: c.session_key } })
    await fetchConTimeout(`${cfg.url}/rest/v1/twochat_conversaciones?session_key=eq.${sk}`, {
      method: 'PATCH',
      headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({
        agente_id: capitan.uuid,
        agente: `${capitan.first_name || ''} ${capitan.last_name || ''}`.trim(),
        ...(equipo ? { equipo: equipo.name } : {}),
        actualizado_en: new Date().toISOString(),
      }),
    })
    asignadas += 1
  }
  if (asignadas) console.log(`[2chat] Conversaciones de conductores asignadas a su capitán: ${asignadas}`)
  return { asignadas }
}

/** GET /api/2chat/lead-chat/:leadId -> si ya hay conversación y el saludo sugerido */
twoChatRouter.get('/lead-chat/:leadId', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    if (!UUID_RE.test(req.params.leadId)) return res.status(400).json({ error: 'lead inválido' })
    const c = await contextoChatLead(ctx, req.params.leadId)
    if (c.error) return res.status(c.status).json({ error: c.error })
    const conversacion = await buscarConversacion(ctx.cfg.apiKey, c.canal.uuid, c.telefono)
    res.json({
      telefono: c.telefono,
      existe: !!conversacion,
      canal: c.canal.numero,
      canal_conectado: c.canal.conectado,
      agente: c.agente ? `${c.agente.first_name} ${c.agente.last_name}`.trim() : null,
      saludo: saludoSugerido(c.nombreLead, c.nombreAgente),
    })
  } catch (error) {
    console.error('[2chat/lead-chat]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/2chat/lead-chat/:leadId { mensaje? }
 * Si hay conversación: la etiqueta, la asigna y devuelve el link.
 * Si no hay: manda `mensaje` (obligatorio), espera a que aparezca la conversación,
 * la etiqueta, la asigna y devuelve el link.
 */
/**
 * Abre la conversación con c.telefono o la inicia mandando `mensaje`; después la
 * etiqueta y la asigna (opciones de etiquetarYAsignar). Responde { enviado, url, avisos }.
 */
async function abrirOIniciarChat(ctx, c, mensajeCrudo, opciones, res) {
  let conversacion = await buscarConversacion(ctx.cfg.apiKey, c.canal.uuid, c.telefono)
  let enviado = false
  if (!conversacion) {
    const mensaje = String(mensajeCrudo || '').trim()
    if (!mensaje) return res.status(400).json({ error: 'Escribí el primer mensaje para iniciar la conversación' })
    if (mensaje.length > MAX_MENSAJE) return res.status(400).json({ error: `El mensaje no puede pasar de ${MAX_MENSAJE} caracteres` })
    const envio = await twoChat(ctx.cfg.apiKey, '/whatsapp/send-message', {
      method: 'POST',
      body: { from_number: c.canal.numero, to_number: c.telefono, text: mensaje },
    })
    if (!envio.ok) return res.status(502).json({ error: `2Chat no pudo mandar el mensaje: ${mensajeError2Chat(envio)}` })
    enviado = true
    // El envío queda en cola: la conversación aparece a los pocos segundos
    for (let intento = 0; intento < 6 && !conversacion; intento += 1) {
      await esperar(1500)
      conversacion = await buscarConversacion(ctx.cfg.apiKey, c.canal.uuid, c.telefono)
    }
  }
  if (!conversacion) {
    return res.json({
      enviado,
      url: LIVE_CHAT_BASE.replace(/\/STE.*$/, '/'),
      avisos: ['El mensaje salió, pero la conversación todavía no aparece en 2Chat: buscala en el Chat en vivo en unos segundos'],
    })
  }
  const avisos = await etiquetarYAsignar(ctx.cfg.apiKey, conversacion.session_key, c.agente, opciones)
  return res.json({ enviado, url: `${LIVE_CHAT_BASE}/${conversacion.session_key}`, avisos })
}

twoChatRouter.post('/lead-chat/:leadId', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    if (!UUID_RE.test(req.params.leadId)) return res.status(400).json({ error: 'lead inválido' })
    const c = await contextoChatLead(ctx, req.params.leadId)
    if (c.error) return res.status(c.status).json({ error: c.error })
    await abrirOIniciarChat(ctx, c, req.body?.mensaje, undefined, res)
  } catch (error) {
    console.error('[2chat/lead-chat POST]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* Chat con un conductor (Seguimiento de conductores): etiqueta «Conductor», equipo
   Clientes y asignado a su capitán en Toshibase (si no está en 2Chat, a quien lo abre). */

const OPCIONES_CONDUCTOR = { etiqueta: ETIQUETA_CONDUCTOR, nombreEquipo: EQUIPO_CONDUCTORES }

async function contextoChatConductor(ctx, conductorId) {
  const [conductores, cuenta, usuarios] = await Promise.all([
    selectTodo(ctx.cfg, `conductores?select=id,nombres,apellidos,telefono_contacto,guia&id=eq.${conductorId}`),
    usuario2ChatDe(ctx.cfg, ctx.userId),
    usuarios2Chat(ctx.cfg.apiKey),
  ])
  const conductor = conductores[0]
  if (!conductor) return { error: 'No se encontró el conductor', status: 404 }
  const telefono = normalizarCelularAR(conductor.telefono_contacto)
  if (!telefono) return { error: 'El conductor no tiene un celular válido', status: 400 }
  const capitan = conductor.guia ? cruzarUsuario2Chat({ full_name: conductor.guia }, usuarios) : null
  const agente = capitan || cuenta.agente
  const canal = await canalWhatsApp(ctx.cfg.apiKey)
  const nombreConductor = capitalizar(String(conductor.nombres || '').trim().split(/\s+/)[0] || '')
  const nombreQuienEscribe = capitalizar(
    (!cuenta.compartida && cuenta.agente?.first_name?.split(/\s+/)[0]) || String(cuenta.perfil.full_name || '').split(/\s+/)[0] || '',
  )
  return { telefono, canal, agente, esCapitan: !!capitan, nombreConductor, nombreQuienEscribe }
}

/** GET /api/2chat/conductor-chat/:conductorId -> si ya hay conversación, a quién se asigna y el saludo */
twoChatRouter.get('/conductor-chat/:conductorId', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    if (!UUID_RE.test(req.params.conductorId)) return res.status(400).json({ error: 'conductor inválido' })
    const c = await contextoChatConductor(ctx, req.params.conductorId)
    if (c.error) return res.status(c.status).json({ error: c.error })
    const conversacion = await buscarConversacion(ctx.cfg.apiKey, c.canal.uuid, c.telefono)
    res.json({
      telefono: c.telefono,
      existe: !!conversacion,
      canal: c.canal.numero,
      canal_conectado: c.canal.conectado,
      agente: c.agente ? `${c.agente.first_name} ${c.agente.last_name}`.trim() : null,
      es_capitan: c.esCapitan,
      saludo: `Hola${c.nombreConductor ? ` ${c.nombreConductor}` : ''}, ¿cómo estás? Soy ${c.nombreQuienEscribe || '…'}, te escribo de Toshify. `,
    })
  } catch (error) {
    console.error('[2chat/conductor-chat]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** POST /api/2chat/conductor-chat/:conductorId { mensaje? } -> como lead-chat, para conductores */
twoChatRouter.post('/conductor-chat/:conductorId', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    if (!UUID_RE.test(req.params.conductorId)) return res.status(400).json({ error: 'conductor inválido' })
    const c = await contextoChatConductor(ctx, req.params.conductorId)
    if (c.error) return res.status(c.status).json({ error: c.error })
    await abrirOIniciarChat(ctx, c, req.body?.mensaje, OPCIONES_CONDUCTOR, res)
  } catch (error) {
    console.error('[2chat/conductor-chat POST]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Llamar desde Toshibase (kit de voz de 2Chat, sql/twochat_voz.sql)           */
/* -------------------------------------------------------------------------- */
// El navegador llama con un permiso temporal (JWT) para la cuenta de 2Chat del
// usuario. La API key nunca sale del servidor. Cada permiso cuesta 1 crédito de la
// API: dura una jornada (12 h) y se renueva solo.

const TTL_TOKEN_VOZ = 12 * 60 * 60
let cacheCallerId = { en: 0, numero: null }

/** Número con el que salen las llamadas (caller ID de la cuenta de 2Chat) */
async function callerId(apiKey) {
  if (cacheCallerId.numero && Date.now() - cacheCallerId.en < CACHE_CANAL_MS) return cacheCallerId.numero
  const r = await twoChat(apiKey, '/voip/caller-ids')
  const ids = r.ok && Array.isArray(r.data?.caller_ids) ? r.data.caller_ids : []
  const numero = ids[0]?.phone_number || null
  if (!numero) throw new Error('La cuenta de 2Chat no tiene un número habilitado para llamar')
  cacheCallerId = { en: Date.now(), numero }
  return numero
}

/**
 * GET /api/2chat/sdk/open/sdk/(sip-credentials|caller-ids)
 * Puente para el kit de voz: 2Chat solo acepta esas consultas desde el navegador si
 * vienen de app.2chat.io (CORS), así que el kit (apiBaseUrl) las hace por acá y el
 * servidor las reenvía tal cual. La autorización es el permiso temporal (JWT) que dio
 * /voz/token, no la sesión de Toshibase; la API key no se usa.
 */
twoChatRouter.get('/sdk/open/sdk/:recurso', async (req, res) => {
  try {
    const recurso = req.params.recurso
    if (!['sip-credentials', 'caller-ids'].includes(recurso)) return res.status(404).json({ error: 'No encontrado' })
    const auth = String(req.headers.authorization || '')
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' })
    const qs = new URLSearchParams(req.query).toString()
    const r = await fetchConTimeout(`${TWOCHAT_API}/sdk/${recurso}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    res.status(r.status).type('application/json').send(await r.text())
  } catch (error) {
    console.error('[2chat/sdk]', error.message)
    res.status(502).json({ error: error.message })
  }
})

/** POST /api/2chat/voz/token -> permiso de voz para la cuenta de 2Chat del usuario */
twoChatRouter.post('/voz/token', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const { perfil, agente, compartida } = await usuario2ChatDe(ctx.cfg, ctx.userId)
    if (!agente) {
      return res.status(403).json({ error: 'Tu usuario no tiene una cuenta de 2Chat para llamar. Pedile a un administrador que la vincule.' })
    }
    const [desde, tok] = await Promise.all([
      callerId(ctx.cfg.apiKey),
      twoChat(ctx.cfg.apiKey, '/sdk/access-token', {
        method: 'POST',
        body: { user_uuid: agente.uuid, label: `toshibase:${perfil.email || ctx.userId}`, ttl: TTL_TOKEN_VOZ },
      }),
    ])
    const token = tok.data?.token || tok.data?.data?.token
    if (!tok.ok || !token) return res.status(502).json({ error: `2Chat no dio el permiso para llamar: ${mensajeError2Chat(tok)}` })
    res.json({
      token,
      expira: tok.data?.expires_at || null,
      desde,
      cuenta: `${agente.first_name || ''} ${agente.last_name || ''}`.trim(),
      compartida,
    })
  } catch (error) {
    console.error('[2chat/voz/token]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/2chat/voz/llamada { conductor_id, telefono? } -> número a llamar y registro de quién llama.
 * telefono: 'principal' (el de WhatsApp, telefono_contacto; por defecto) o 'secundario'.
 * El registro (twochat_llamadas_toshibase) es lo que permite saber en Control de llamadas
 * qué persona hizo una llamada que salió por una cuenta compartida.
 */
twoChatRouter.post('/voz/llamada', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const conductorId = String(req.body?.conductor_id || '')
    if (!UUID_RE.test(conductorId)) return res.status(400).json({ error: 'conductor inválido' })
    const [conductores, cuenta] = await Promise.all([
      selectTodo(ctx.cfg, `conductores?select=id,nombres,apellidos,telefono_contacto,telefono_secundario&id=eq.${conductorId}`),
      usuario2ChatDe(ctx.cfg, ctx.userId),
    ])
    const c = conductores[0]
    if (!c) return res.status(404).json({ error: 'No se encontró el conductor' })
    const secundario = req.body?.telefono === 'secundario'
    const numero = normalizarCelularAR(secundario ? c.telefono_secundario : c.telefono_contacto)
    if (!numero) {
      return res.status(400).json({
        error: secundario ? 'El teléfono secundario del conductor no es un celular válido' : 'El conductor no tiene un celular válido cargado',
      })
    }
    if (!cuenta.agente) return res.status(403).json({ error: 'Tu usuario no tiene una cuenta de 2Chat para llamar' })
    // Una llamada a la vez por cuenta de 2Chat (2026-11-18): el SDK de 2Chat espera un
    // usuario por persona, y con la cuenta compartida (Info Toshify) dos personas podían
    // llamar a la vez. Ver lineaOcupada.
    const ocupada = await lineaOcupada(ctx.cfg, cuenta.agente.uuid)
    if (ocupada) {
      const nombreCuenta = `${cuenta.agente.first_name || ''} ${cuenta.agente.last_name || ''}`.trim() || 'de 2Chat'
      return res.status(409).json({
        error: ocupada.user_id === ctx.userId
          ? 'Ya tenés una llamada en curso (en otra pestaña o ventana). Cortala antes de hacer otra.'
          : `La línea ${nombreCuenta} está ocupada: ${ocupada.usuario || 'otra persona'} está en una llamada. Probá de nuevo cuando corte.`,
        ocupada_por: ocupada.usuario || null,
      })
    }
    const nombre = `${nombrePropio(c.nombres)} ${nombrePropio(c.apellidos)}`.trim()
    let registroId = null
    try {
      const ins = await fetchConTimeout(`${ctx.cfg.url}/rest/v1/twochat_llamadas_toshibase?select=id`, {
        method: 'POST',
        headers: { ...headersServicio(ctx.cfg), Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: ctx.userId,
          usuario: cuenta.perfil.full_name || cuenta.perfil.email || null,
          twochat_user_uuid: cuenta.agente.uuid,
          twochat_nombre: `${cuenta.agente.first_name || ''} ${cuenta.agente.last_name || ''}`.trim(),
          conductor_id: c.id,
          numero,
          numero_clave: ultimos10(numero),
        }),
      })
      if (ins.ok) registroId = (await ins.json())[0]?.id ?? null
      else console.warn('[2chat/voz/llamada] registro:', (await ins.text()).slice(0, 200))
    } catch (err) {
      console.warn('[2chat/voz/llamada] registro:', err.message)
    }
    res.json({ numero, nombre, registro_id: registroId })
  } catch (error) {
    console.error('[2chat/voz/llamada]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Mientras la llamada está abierta, el navegador avisa cada SENAL_LLAMADA_MS que sigue
 * (POST /voz/llamada/:id/senal): se guarda en `duracion` los segundos desde que empezó.
 * La línea está ocupada si hay un registro «iniciada» de esa cuenta con señal reciente.
 * Si alguien cierra el navegador sin cortar, la señal deja de llegar y la línea se
 * libera sola en LINEA_LIBRE_MS. Solo cubre las llamadas que salen desde Toshibase.
 */
const LINEA_LIBRE_MS = 60 * 1000
async function lineaOcupada(cfg, twochatUserUuid) {
  const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const abiertas = await selectTodo(cfg,
    'twochat_llamadas_toshibase?select=id,user_id,usuario,iniciada_en,duracion' +
    `&twochat_user_uuid=eq.${encodeURIComponent(twochatUserUuid)}&estado=eq.iniciada` +
    `&iniciada_en=gte.${encodeURIComponent(desde)}&order=iniciada_en.desc`)
  const ahora = Date.now()
  return abiertas.find((r) => {
    const ultimaSenal = new Date(r.iniciada_en).getTime() + (Number(r.duracion) || 0) * 1000
    return ahora - ultimaSenal < LINEA_LIBRE_MS
  }) || null
}

/**
 * GET /api/2chat/voz/linea -> si el usuario puede llamar ahora. La pantalla lo consulta
 * cada tanto para mostrar el botón «Llamar» desactivado mientras la línea está ocupada.
 */
twoChatRouter.get('/voz/linea', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const cuenta = await usuario2ChatDe(ctx.cfg, ctx.userId)
    if (!cuenta.agente) return res.json({ disponible: false, motivo: 'sin_cuenta', cuenta: null, ocupada_por: null, propia: false })
    const nombreCuenta = `${cuenta.agente.first_name || ''} ${cuenta.agente.last_name || ''}`.trim()
    const ocupada = await lineaOcupada(ctx.cfg, cuenta.agente.uuid)
    res.json({
      disponible: !ocupada,
      motivo: ocupada ? 'ocupada' : null,
      cuenta: nombreCuenta,
      ocupada_por: ocupada?.usuario || null,
      // La llamada abierta es del mismo usuario (otra pestaña o ventana)
      propia: !!ocupada && ocupada.user_id === ctx.userId,
    })
  } catch (error) {
    console.error('[2chat/voz/linea]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** POST /api/2chat/voz/llamada/:id/senal -> la llamada sigue abierta (ver lineaOcupada) */
twoChatRouter.post('/voz/llamada/:id/senal', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'registro inválido' })
    const filas = await selectTodo(ctx.cfg,
      `twochat_llamadas_toshibase?select=iniciada_en&id=eq.${id}&user_id=eq.${ctx.userId}&estado=eq.iniciada`)
    if (!filas[0]) return res.json({ ok: false })
    const segundos = Math.max(0, Math.round((Date.now() - new Date(filas[0].iniciada_en).getTime()) / 1000))
    await fetchConTimeout(`${ctx.cfg.url}/rest/v1/twochat_llamadas_toshibase?id=eq.${id}&user_id=eq.${ctx.userId}&estado=eq.iniciada`, {
      method: 'PATCH',
      headers: { ...headersServicio(ctx.cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({ duracion: segundos }),
    })
    res.json({ ok: true })
  } catch (error) {
    console.error('[2chat/voz/senal]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** POST /api/2chat/voz/llamada/:id/fin { estado, duracion } -> cierra el registro */
twoChatRouter.post('/voz/llamada/:id/fin', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const id = Number(req.params.id)
    const estado = ['atendida', 'no_atendida', 'fallida'].includes(req.body?.estado) ? req.body.estado : 'no_atendida'
    const duracion = Math.max(0, Math.min(6 * 3600, Math.round(Number(req.body?.duracion) || 0)))
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'registro inválido' })
    // Solo el mismo usuario puede cerrar su registro
    await fetchConTimeout(`${ctx.cfg.url}/rest/v1/twochat_llamadas_toshibase?id=eq.${id}&user_id=eq.${ctx.userId}`, {
      method: 'PATCH',
      headers: { ...headersServicio(ctx.cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({ estado, duracion, terminada_en: new Date().toISOString() }),
    })
    res.json({ ok: true })
  } catch (error) {
    console.error('[2chat/voz/fin]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Mensajes de WhatsApp (Control de mensajes, sql/twochat_mensajes.sql)        */
/* -------------------------------------------------------------------------- */
// Se guardan solo los datos del reporte (quién escribió, cuándo, si se leyó): el
// texto NO se guarda. 2Chat no dice qué agente escribió cada mensaje, así que el
// agente de una conversación es al que está asignada en 2Chat.

const MAX_PAGINAS_MENSAJES = 40
const ESPERA_SYNC_MENSAJES_MS = 60 * 1000
const ENVIADO_POR = { user: 'cliente', agent: 'agente', api: 'api', flow: 'flujo', chatter: 'flujo' }
let ultimaSyncMensajes = 0
let syncMensajesEnCurso = null

/** 2Chat devuelve la fecha sin zona («2026-11-17T22:42:57»): es UTC */
const fechaUtc = (v) => (v && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? `${v}Z` : v)

async function upsert(cfg, tabla, filas, conflicto) {
  for (let i = 0; i < filas.length; i += 500) {
    const res = await fetchConTimeout(`${cfg.url}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
      method: 'POST',
      headers: { ...headersServicio(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(filas.slice(i, i + 500)),
    })
    if (!res.ok) throw new Error(`No se pudo guardar en ${tabla}: ${(await res.text()).slice(0, 200)}`)
  }
}

/**
 * Trae de 2Chat los mensajes nuevos (de más nuevo a más viejo hasta encontrar una
 * página ya guardada) y actualiza la asignación de las conversaciones tocadas.
 */
export async function sincronizarMensajes(cfg, { forzar = false } = {}) {
  if (!forzar && Date.now() - ultimaSyncMensajes < ESPERA_SYNC_MENSAJES_MS) return { procesados: 0 }
  if (syncMensajesEnCurso) return syncMensajesEnCurso
  syncMensajesEnCurso = (async () => {
    const canal = await canalWhatsApp(cfg.apiKey)
    const cruce = await mapasCruce(cfg)
    const nuevos = []
    for (let pagina = 0; pagina < MAX_PAGINAS_MENSAJES; pagina += 1) {
      const r = await twoChat(cfg.apiKey, `/whatsapp/messages/${encodeURIComponent(canal.numero)}?page_number=${pagina}`)
      if (!r.ok) throw new Error(`2Chat: no se pudieron leer los mensajes (${mensajeError2Chat(r)})`)
      const msgs = Array.isArray(r.data?.messages) ? r.data.messages : []
      if (msgs.length === 0) break
      const uuids = msgs.map((m) => m.uuid).filter(Boolean)
      const guardados = await selectTodo(cfg, `twochat_mensajes?select=uuid&uuid=in.(${uuids.map(encodeURIComponent).join(',')})`)
      const ya = new Set(guardados.map((g) => g.uuid))
      const faltan = msgs.filter((m) => m.uuid && !ya.has(m.uuid))
      nuevos.push(...faltan)
      // Una página entera ya guardada: lo anterior también está
      if (faltan.length === 0) break
    }

    const filas = nuevos.map((m) => {
      const clave = ultimos10(m.remote_phone_number)
      const conductor = cruce.conductores.get(clave) || null
      return {
        uuid: m.uuid,
        session_key: m.session_key,
        fecha: fechaUtc(m.created_at),
        enviado_por: ENVIADO_POR[m.sent_by] || String(m.sent_by || 'desconocido'),
        numero: m.remote_phone_number || null,
        numero_clave: clave || null,
        leido: typeof m.read === 'boolean' ? m.read : null,
        conductor_id: conductor,
        lead_id: conductor ? null : cruce.leads.get(clave) || null,
        sincronizado_en: new Date().toISOString(),
      }
    }).filter((f) => f.session_key && f.fecha && !esNumeroPrueba(f.numero))
    await upsert(cfg, 'twochat_mensajes', filas, 'uuid')

    // Asignación de cada conversación tocada (1 crédito por conversación)
    const porSesion = new Map(filas.map((f) => [f.session_key, f]))
    const conversaciones = []
    for (const [sessionKey, f] of porSesion) {
      const a = await twoChat(cfg.apiKey, `/conversations/${encodeURIComponent(sessionKey)}/assignment`)
      const usuario = a.ok ? a.data?.data?.assigned_user : null
      const equipo = a.ok ? a.data?.data?.assigned_team : null
      conversaciones.push({
        session_key: sessionKey,
        numero: f.numero,
        numero_clave: f.numero_clave,
        agente_id: usuario?.uuid || null,
        agente: usuario ? `${usuario.first_name || ''} ${usuario.last_name || ''}`.trim() : null,
        equipo: equipo?.name || null,
        conductor_id: f.conductor_id,
        lead_id: f.lead_id,
        link: `${LIVE_CHAT_BASE}/${sessionKey}`,
        actualizado_en: new Date().toISOString(),
      })
    }
    await upsert(cfg, 'twochat_conversaciones', conversaciones, 'session_key')
    try {
      await asignarConversacionesACapitan(cfg)
    } catch (err) {
      // No frena la sincronización de mensajes
      console.error('[2chat] Asignación al capitán:', err.message)
    }
    ultimaSyncMensajes = Date.now()
    return { procesados: filas.length }
  })()
  try {
    return await syncMensajesEnCurso
  } finally {
    syncMensajesEnCurso = null
  }
}

/** Mensajes del rango (fechas ART) con su conversación, agente y contacto */
async function historialMensajes(cfg, { desde, hasta }) {
  const inicio = new Date(`${desde}T00:00:00${OFFSET_ART}`)
  const fin = new Date(new Date(`${hasta}T00:00:00${OFFSET_ART}`).getTime() + 24 * 60 * 60 * 1000)
  const filas = await selectTodo(
    cfg,
    'twochat_mensajes?select=uuid,session_key,fecha,enviado_por,numero,leido,conductor_id,lead_id,' +
      'conductores(nombres,apellidos),leads(nombre_completo,estado_de_lead)' +
      `&fecha=gte.${encodeURIComponent(inicio.toISOString())}&fecha=lt.${encodeURIComponent(fin.toISOString())}` +
      '&order=fecha.asc',
  )
  const sesiones = [...new Set(filas.map((f) => f.session_key))]
  const conv = sesiones.length
    ? await selectTodo(cfg, `twochat_conversaciones?select=session_key,agente,equipo,link&session_key=in.(${sesiones.map((s) => `"${s}"`).map(encodeURIComponent).join(',')})`)
    : []
  const porSesion = new Map(conv.map((c) => [c.session_key, c]))
  return filas.map((f) => {
    const c = porSesion.get(f.session_key)
    return {
      id: f.uuid,
      session_key: f.session_key,
      fecha: f.fecha,
      enviado_por: f.enviado_por,
      numero: f.numero,
      leido: f.leido,
      agente: c?.agente || null,
      equipo: c?.equipo || null,
      link: c?.link || `${LIVE_CHAT_BASE}/${f.session_key}`,
      conductor_id: f.conductor_id,
      conductor: f.conductores ? `${nombrePropio(f.conductores.nombres)} ${nombrePropio(f.conductores.apellidos)}`.trim() : null,
      lead_id: f.lead_id,
      lead: f.leads ? nombrePropio(f.leads.nombre_completo) : null,
      estado_lead: f.leads?.estado_de_lead || null,
      tipo_contacto: f.conductor_id ? 'conductor' : f.lead_id ? 'lead' : null,
    }
  })
}

/** GET /api/2chat/mensajes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&actualizar=1] */
twoChatRouter.get('/mensajes', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    const { desde, hasta } = req.query
    if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '') || desde > hasta) {
      return res.status(400).json({ error: 'Rango de fechas inválido (desde/hasta AAAA-MM-DD)' })
    }
    let errorSync = null
    let procesados = 0
    if (req.query.actualizar === '1') {
      try {
        procesados = (await sincronizarMensajes(ctx.cfg, { forzar: true })).procesados
      } catch (err) {
        errorSync = err.message
        console.error('[2chat/mensajes] sync:', err.message)
      }
    }
    const mensajes = await historialMensajes(ctx.cfg, { desde, hasta })
    let actualizadoEn = ultimaSyncMensajes ? new Date(ultimaSyncMensajes).toISOString() : null
    if (!actualizadoEn) {
      const ult = await selectTodo(ctx.cfg, 'twochat_mensajes?select=sincronizado_en&order=sincronizado_en.desc&limit=1')
      actualizadoEn = ult[0]?.sincronizado_en || null
    }
    // Todos los agentes de 2Chat, para mostrarlos aunque no tengan conversaciones
    const agentes = (await usuarios2Chat(ctx.cfg.apiKey).catch(() => []))
      .map((u) => `${u.first_name || ''} ${u.last_name || ''}`.trim())
      .filter(Boolean)
    res.json({ mensajes, agentes, procesados, actualizado_en: actualizadoEn, error_sync: errorSync })
  } catch (error) {
    console.error('[2chat/mensajes]', error.message)
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
        transcribirEnSegundoPlano(ctx.cfg)
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
/* Resumen de seguimiento del conductor (Gemini)                               */
/* -------------------------------------------------------------------------- */
// Lee la Bitácora de seguimiento (notas de cobranza + llamadas de 2Chat desde la primera
// asignación) y deja en conductores_seguimiento_resumen un resumen corto para la
// operación y un nivel (bueno/regular/malo) que es el factor «Seguimiento» de la
// calificación. Solo se rehace si la bitácora cambió. Sin GEMINI_API_KEY o sin la tabla
// (sql/conductores_seguimiento_resumen.sql) no hace nada.

const SEGUIMIENTO_MAX_ENTRADAS = 40
const SEGUIMIENTO_POR_TANDA = 30
const NIVELES_SEGUIMIENTO = ['bueno', 'regular', 'malo']
// Conductores sin nada que resumir (p. ej. solo llamadas de cuando eran lead), por día:
// así la tanda de cada hora no los vuelve a revisar
const sinBitacora = { dia: null, ids: new Set() }

const PROMPT_SEGUIMIENTO = `Sos coordinador de operaciones de Toshify (Argentina). Toshify alquila autos a
conductores para que trabajen con apps como Cabify y Uber. El equipo los llama y les deja notas para
coordinar entregas y devoluciones del auto, turnos con el compañero, cobranzas, o para preguntar si
está todo bien. Abajo está la bitácora de UN conductor: notas del equipo y llamadas con su resumen.

Lo que importa es CÓMO ES TRATAR CON ESTA PERSONA, para que quien lo contacte sepa qué esperar.
No repitas lo que se habló en cada llamada.

Devolvé SOLO un JSON con estas claves:
- resumen: 2 o 3 oraciones cortas en español rioplatense sobre su perfil: cómo se comunica (atiende,
  responde, es claro), su trato (respetuoso, amable, cortante, grosero, se enoja), si es fácil o difícil
  coordinar y acordar cosas con él y si cumple lo que acuerda; si se queja, de qué se queja (el auto,
  los pagos, el compañero, la atención…) y si es seguido; y, si hubo deuda o cobranza, cómo
  reacciona (paga, promete y no cumple, se pone a la defensiva). Cerrá con una recomendación práctica
  para tratarlo si la hay. Si la bitácora no alcanza para saber algo, no lo inventes.
- nivel: cómo es la relación con él:
  "bueno" (buena comunicación, respetuoso, fácil de coordinar, cumple),
  "regular" (cuesta contactarlo o coordinar, cumple a medias, algún roce o se queja seguido),
  "malo" (no responde, grosero o agresivo, incumple acuerdos o pagos prometidos).
  Si la bitácora casi no muestra cómo es (solo avisos operativos), "bueno".
- motivo: una oración con lo que más pesó para el nivel.`

async function geminiJSON(geminiKey, prompt) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 2000 },
        }),
      },
    )
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    return JSON.parse(texto)
  } finally {
    clearTimeout(timer)
  }
}

/** Día (YYYY-MM-DD) en Argentina */
const diaART = (iso) => new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

const fechaHoraART = (iso) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

/** Entradas de la bitácora (notas + llamadas desde la primera asignación), más viejas primero */
async function entradasSeguimiento(cfg, conductorId) {
  const notas = await selectTodo(
    cfg,
    `conductores_notas_cobranza?select=nota,created_at,usuario_nombre&conductor_id=eq.${conductorId}`,
  )
  const asig = await selectTodo(
    cfg,
    `asignaciones_conductores?select=fecha_inicio,asignaciones!inner(estado,fecha_inicio)&conductor_id=eq.${conductorId}&asignaciones.estado=neq.cancelada`,
  )
  const inicios = asig.map((a) => a.fecha_inicio || a.asignaciones?.fecha_inicio).filter(Boolean).sort()
  const llamadas = inicios.length
    ? await selectTodo(
        cfg,
        'twochat_llamadas?select=fecha,direccion,agente,resultado,duracion,resumen,proximo_paso' +
          `&conductor_id=eq.${conductorId}&fecha=gte.${encodeURIComponent(new Date(inicios[0]).toISOString())}`,
      )
    : []
  return [
    ...notas.map((n) => ({ fecha: n.created_at, texto: `Nota de ${n.usuario_nombre || 'alguien del equipo'}: ${n.nota}` })),
    ...llamadas.map((l) => ({
      fecha: l.fecha,
      texto:
        `Llamada ${l.direccion === 'entrante' ? 'entrante' : 'saliente'} (${l.agente || 'sin agente'}), ` +
        `${l.resultado}${l.duracion ? `, ${l.duracion} seg` : ''}` +
        `${l.resumen ? `: ${l.resumen}` : ''}${l.proximo_paso ? ` Próximo paso: ${l.proximo_paso}` : ''}`,
    })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
}

async function resumenGuardado(cfg, conductorId) {
  const res = await fetchConTimeout(
    `${cfg.url}/rest/v1/conductores_seguimiento_resumen?conductor_id=eq.${conductorId}&select=*`,
    { headers: headersServicio(cfg) },
  )
  if (!res.ok) throw new Error(`conductores_seguimiento_resumen (¿falta sql/conductores_seguimiento_resumen.sql?): ${(await res.text()).slice(0, 150)}`)
  return (await res.json())[0] || null
}

/**
 * Devuelve el resumen de seguimiento del conductor; lo genera de nuevo si la bitácora
 * cambió o si es de otro día (se actualiza todos los días: una promesa de pago vencida
 * cambia el nivel aunque no haya notas nuevas). null si la bitácora está vacía.
 */
export async function resumenSeguimiento(cfg, conductorId) {
  const entradas = await entradasSeguimiento(cfg, conductorId)
  const guardado = await resumenGuardado(cfg, conductorId)
  if (!entradas.length) return null
  const ultima = entradas[entradas.length - 1].fecha
  const igual = guardado && guardado.entradas === entradas.length &&
    new Date(guardado.ultima_entrada).getTime() === new Date(ultima).getTime() &&
    diaART(guardado.generado_en) === diaART(new Date().toISOString())
  if (igual || !cfg.geminiKey) return guardado

  const texto = entradas.slice(-SEGUIMIENTO_MAX_ENTRADAS).map((e) => `[${fechaHoraART(e.fecha)}] ${e.texto}`).join('\n')
  const r = await geminiJSON(cfg.geminiKey, `${PROMPT_SEGUIMIENTO}\n\nHoy es ${fechaHoraART(new Date().toISOString())}.\n\nBitácora:\n${texto}`)
  const nivel = NIVELES_SEGUIMIENTO.includes(r?.nivel) ? r.nivel : null
  const resumen = textoONull(r?.resumen)
  if (!nivel || !resumen) throw new Error('Gemini no devolvió un resumen válido')
  const fila = {
    conductor_id: conductorId,
    resumen,
    nivel,
    motivo: textoONull(r?.motivo),
    entradas: entradas.length,
    ultima_entrada: ultima,
    generado_en: new Date().toISOString(),
  }
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/conductores_seguimiento_resumen?on_conflict=conductor_id`, {
    method: 'POST',
    headers: { ...headersServicio(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(fila),
  })
  if (!res.ok) throw new Error(`No se pudo guardar el resumen: ${(await res.text()).slice(0, 150)}`)
  return fila
}

/**
 * Rehace los resúmenes de los conductores con notas o llamadas nuevas desde su último
 * resumen y, una vez por día, todos los demás (para que la calificación esté al día
 * sin abrir cada detalle). Corre cada hora en tandas: primero los que cambiaron.
 */
export async function resumirSeguimientosPendientes(cfg, { limite = SEGUIMIENTO_POR_TANDA } = {}) {
  if (!cfg.geminiKey) return { resumidos: 0, omitida: 'sin GEMINI_API_KEY' }
  const guardados = new Map(
    (await selectTodo(cfg, 'conductores_seguimiento_resumen?select=conductor_id,generado_en')).map((g) => [g.conductor_id, g.generado_en]),
  )
  const desde = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const recientes = [
    ...(await selectTodo(cfg, `conductores_notas_cobranza?select=conductor_id,fecha:created_at&created_at=gte.${encodeURIComponent(desde)}`)),
    ...(await selectTodo(cfg, `twochat_llamadas?select=conductor_id,fecha:sincronizado_en&conductor_id=not.is.null&sincronizado_en=gte.${encodeURIComponent(desde)}`)),
  ]
  const hoy = diaART(new Date().toISOString())
  // 1) con notas o llamadas nuevas desde su último resumen
  const cambiaron = recientes
    .filter((x) => x.conductor_id && (!guardados.has(x.conductor_id) || new Date(x.fecha) > new Date(guardados.get(x.conductor_id))))
    .map((x) => x.conductor_id)
  // 2) los que tienen bitácora pero nunca se resumieron (p. ej. la carga inicial de notas)
  const nunca = [
    ...(await selectTodo(cfg, 'conductores_notas_cobranza?select=conductor_id')),
    ...(await selectTodo(cfg, 'twochat_llamadas?select=conductor_id&conductor_id=not.is.null')),
  ].map((x) => x.conductor_id).filter((id) => !guardados.has(id))
  // 3) una vez por día, todos los demás
  const viejos = [...guardados].filter(([, g]) => diaART(g) !== hoy).map(([id]) => id)
  if (sinBitacora.dia !== hoy) Object.assign(sinBitacora, { dia: hoy, ids: new Set() })
  const pendientes = [...new Set([...cambiaron, ...viejos, ...nunca])]
    .filter((id) => !sinBitacora.ids.has(id) || cambiaron.includes(id))
    .slice(0, limite)
  let ok = 0
  for (const id of pendientes) {
    try {
      if (await resumenSeguimiento(cfg, id)) ok += 1
      else sinBitacora.ids.add(id)
    } catch (err) {
      console.error(`[2chat] Resumen de seguimiento ${id}:`, err.message)
    }
  }
  if (pendientes.length) console.log(`[2chat] Resúmenes de seguimiento: ${ok} de ${pendientes.length}`)
  return { resumidos: ok }
}

/** GET /api/2chat/seguimiento/:conductorId → { resumen } (null si la bitácora está vacía) */
twoChatRouter.get('/seguimiento/:conductorId', async (req, res) => {
  try {
    const ctx = await requireUsuario(req, res)
    if (!ctx) return
    if (!UUID_RE.test(req.params.conductorId)) return res.status(400).json({ error: 'conductor inválido' })
    res.json({ resumen: await resumenSeguimiento(ctx.cfg, req.params.conductorId) })
  } catch (error) {
    console.error('[2chat/seguimiento]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Actualización automática de llamadas                                       */
/* -------------------------------------------------------------------------- */

// Todos los días, a cada hora en punto (las 24 horas, hora Argentina)
const SYNC_AUTO_HORA_DESDE = 0
const SYNC_AUTO_HORA_HASTA = 23
// Cada cuántos minutos se revisa si hay conductores recién asignados para crear como contacto
const CONTACTOS_AUTO_CADA_MIN = 5

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

  const revisarContactos = async (minuto) => {
    if (minuto % CONTACTOS_AUTO_CADA_MIN !== 0) return
    const cfg = config()
    if (!cfg.apiKey || !cfg.url || !cfg.serviceKey) return
    try {
      // En el primer chequeo de cada hora también se reintentan los que quedaron con error
      const r = await sincronizarContactosNuevos(cfg, { reintentarErrores: minuto < CONTACTOS_AUTO_CADA_MIN })
      if (r.creados || r.vinculados || r.errores) {
        console.log(`[2chat] Contactos automáticos: ${r.creados} creados, ${r.vinculados} vinculados, ${r.errores} con error`)
      }
    } catch (err) {
      console.error('[2chat] Alta automática de contactos falló:', err.message)
    }
  }

  const revisar = async () => {
    const { dia, hora, minuto } = horaArgentina()
    await revisarContactos(minuto)
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
      try {
        await transcribirPendientes(cfg)
      } catch (errTr) {
        console.error('[2chat] Transcripción en la actualización automática:', errTr.message)
      }
      try {
        await resumirSeguimientosPendientes(cfg)
      } catch (errSeg) {
        // Sin la tabla (sql/conductores_seguimiento_resumen.sql): no frena el resto
        console.error('[2chat] Resúmenes de seguimiento en la actualización automática:', errSeg.message)
      }
      try {
        const m = await sincronizarMensajes(cfg, { forzar: true })
        console.log(`[2chat] Actualización automática ${clave}:00 ART: ${m.procesados ?? 0} mensajes nuevos`)
      } catch (errMsg) {
        // Sin la tabla (sql/twochat_mensajes.sql) o sin WhatsApp: no frena las llamadas
        console.error('[2chat] Mensajes en la actualización automática:', errMsg.message)
      }
    } catch (err) {
      console.error(`[2chat] Actualización automática ${clave}:00 ART falló:`, err.message)
    }
  }

  setInterval(() => { void revisar() }, 60 * 1000).unref?.()
  console.log(`[2chat] Actualización automática activa: cada hora de ${SYNC_AUTO_HORA_DESDE} a ${SYNC_AUTO_HORA_HASTA} h (Argentina)`)
}

if (process.env.TWOCHAT_SYNC_AUTO === '1') iniciarSyncAutomatico()

