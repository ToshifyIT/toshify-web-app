/**
 * Integración Cresium -> Alegra (Integraciones > Cresium).
 *
 * Por empresa (44 Dreams y Grupo CG):
 *  - Guarda los movimientos de su cuenta Cresium (Partner API V3) en
 *    cresium_movimientos (sql/cresium_integracion.sql). La pantalla lee SIEMPRE
 *    de la base; a Cresium solo se va para traer lo nuevo: desde el último
 *    movimiento guardado (con un margen para refrescar estados), con el botón
 *    "Traer nuevos" o solo cada hora si CRESIUM_SYNC_AUTO=1.
 *  - Propone cómo cargar cada uno en Alegra, con el mismo criterio que ya se usa
 *    a mano: contacto por CUIT, cobros de Cabify a "Ventas", pagos que coinciden
 *    con una factura de proveedor abierta contra esa factura, el resto a la cuenta
 *    contable que se usó la última vez para ese CUIT, y el impuesto ley 25.413
 *    como un pago aparte a "Impuesto ley 25.413 créditos".
 *  - Crea los pagos/cobros en Alegra (y el contacto si no existe) y guarda los
 *    ids, para que nunca se cargue dos veces.
 *
 * Credenciales SOLO en el servidor (.env, nunca con prefijo VITE_):
 *  - CRESIUM_44DREAMS_API_KEY, CRESIUM_44DREAMS_SECRET, CRESIUM_44DREAMS_COMPANY_ID
 *  - CRESIUM_GRUPOCG_API_KEY,  CRESIUM_GRUPOCG_SECRET,  CRESIUM_GRUPOCG_COMPANY_ID
 *  - ALEGRA_44DREAMS_EMAIL, ALEGRA_44DREAMS_TOKEN   (token de API de esa empresa)
 *  - ALEGRA_GRUPOCG_EMAIL,  ALEGRA_GRUPOCG_TOKEN
 *  - CRESIUM_BASE_URL (opcional, default https://api.cresium.app)
 *  - CRESIUM_DESDE    (opcional, default 2026-05-01): desde qué día se importa la primera vez
 *  - CRESIUM_SYNC_AUTO (opcional) "1" trae lo nuevo de cada empresa sola, cada hora de 9 a 18 h ART
 *  - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (ya existen)
 *
 * Permisos: ver = can_view del submenú; cargar en Alegra = can_edit del submenú
 * (Administración > Menú por rol). Los admin pueden todo.
 *
 * Se monta en server.js:
 *   import { cresiumRouter } from './server-cresium.js'
 *   app.use('/api/cresium', cresiumRouter)
 * y en desarrollo lo monta vite.config.ts (npm run dev).
 *
 * Conciliación: crea en Alegra una conciliación en BORRADOR de la cuenta Cresium hasta
 * una fecha, con el saldo bancario calculado desde Cresium (saldo actual de la cuenta
 * menos los movimientos posteriores) y los pagos cargados por el módulo. Se confirma en Alegra.
 *
 * Cresium: firma HMAC-SHA256("{timestamp}|{METHOD}|{path+query}|{body}", secret) en
 * base64, timestamp ISO 8601 (se rechaza con más de 60 s). Los GET van sin
 * Content-Type (si no, la API firma "{}" y rechaza).
 * Alegra: https://api.alegra.com/api/v1, Basic email:token.
 */

import express from 'express'
import crypto from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ALEGRA_API = 'https://api.alegra.com/api/v1'
const TIMEOUT_MS = 30000
const PAUSA_ALEGRA_MS = 300
const MAX_POR_LOTE = 10
const CACHE_ALEGRA_MS = 15 * 60 * 1000
// Páginas de Alegra que se piden a la vez
const PARALELO_ALEGRA = 4
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
// Al traer lo nuevo se repasan también estos días hacia atrás (movimientos que cambian de estado)
const MARGEN_DIAS_RESYNC = 3
// Como mucho una consulta a Cresium por empresa cada este tiempo (salvo el sync de un mes puntual)
const ESPERA_ENTRE_SYNC_MS = 60 * 1000
// Diferencia máxima (en pesos) para considerar que un pago es de una factura
const TOLERANCIA_FACTURA = 0.05

const CUIT_CABIFY = '30715245120'
const CUIT_GRUPO_CG = '30718340000'

/** Tipos de transacción de Cresium en los que entra plata a la cuenta */
const TIPOS_ENTRADA = new Set(['DEPOSIT', 'YIELD', 'REFUND', 'WITHDRAWAL_INVESTMENT'])

const EMPRESAS = {
  '44dreams': { label: '44 Dreams', submenu: 'cresium-44dreams', env: '44DREAMS' },
  grupocg: { label: 'Grupo CG', submenu: 'cresium-grupocg', env: 'GRUPOCG' },
}

/* -------------------------------------------------------------------------- */
/* Credenciales (mismo criterio que server-2chat.js)                          */
/* -------------------------------------------------------------------------- */

const CLAVES_ENV = [
  'CRESIUM_BASE_URL',
  'CRESIUM_DESDE',
  'CRESIUM_SYNC_AUTO',
  ...Object.values(EMPRESAS).flatMap(({ env }) => [
    `CRESIUM_${env}_API_KEY`, `CRESIUM_${env}_SECRET`, `CRESIUM_${env}_COMPANY_ID`,
    `ALEGRA_${env}_EMAIL`, `ALEGRA_${env}_TOKEN`,
  ]),
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
    console.warn('[cresium] No se pudo leer .env:', err.message)
  }
}

loadEnv()

function config() {
  return {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

function credenciales(empresa) {
  const { env } = EMPRESAS[empresa]
  const e = (k) => (process.env[k] || '').trim()
  const cresium = {
    baseUrl: (e('CRESIUM_BASE_URL') || 'https://api.cresium.app').replace(/\/$/, ''),
    apiKey: e(`CRESIUM_${env}_API_KEY`),
    secret: e(`CRESIUM_${env}_SECRET`),
    companyId: e(`CRESIUM_${env}_COMPANY_ID`),
  }
  const alegra = { email: e(`ALEGRA_${env}_EMAIL`), token: e(`ALEGRA_${env}_TOKEN`) }
  return {
    cresium,
    alegra,
    cresiumOk: !!(cresium.apiKey && cresium.secret && cresium.companyId),
    alegraOk: !!(alegra.email && alegra.token),
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers HTTP                                                               */
/* -------------------------------------------------------------------------- */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

async function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function leerJson(res) {
  const texto = await res.text()
  try { return { data: texto ? JSON.parse(texto) : null, texto } } catch { return { data: null, texto } }
}

function headersServicio(cfg) {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
  }
}

async function selectTodo(cfg, tablaYQuery) {
  const filas = []
  const tam = 1000
  for (let desde = 0; desde < 200000; desde += tam) {
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

async function actualizarMovimiento(cfg, empresa, cresiumId, cambios) {
  const res = await fetchConTimeout(
    `${cfg.url}/rest/v1/cresium_movimientos?empresa=eq.${empresa}&cresium_id=eq.${cresiumId}`,
    {
      method: 'PATCH',
      headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({ ...cambios, updated_at: new Date().toISOString() }),
    },
  )
  if (!res.ok) throw new Error(`No se pudo guardar el movimiento ${cresiumId}: ${(await res.text()).slice(0, 200)}`)
}

/* -------------------------------------------------------------------------- */
/* Cresium                                                                    */
/* -------------------------------------------------------------------------- */

function queryCresium(params) {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((x) => usp.append(`${k}[]`, String(x)))
    else usp.append(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

async function cresiumGet(cred, path, params = {}) {
  const ruta = path + queryCresium(params)
  for (let intento = 0; intento < 4; intento += 1) {
    const timestamp = new Date().toISOString()
    const firma = crypto
      .createHmac('sha256', cred.secret)
      .update(`${timestamp}|GET|${ruta}|`)
      .digest('base64')
    const res = await fetchConTimeout(cred.baseUrl + ruta, {
      headers: {
        'x-api-key': cred.apiKey,
        'x-company-id': cred.companyId,
        'x-timestamp': timestamp,
        'x-signature': firma,
        Accept: 'application/json',
      },
    })
    if (res.status === 429 || res.status >= 500) {
      await esperar(1500 * (intento + 1))
      continue
    }
    const { data, texto } = await leerJson(res)
    if (!res.ok) throw new Error(`Cresium ${res.status}: ${String(texto).slice(0, 300)}`)
    return data
  }
  throw new Error('Cresium no respondió (límite de llamadas o error del servidor)')
}

/** La respuesta de búsqueda no está documentada: se busca la lista y el cursor */
function extraerPagina(resp) {
  if (Array.isArray(resp)) return { items: resp, cursor: null }
  if (!resp || typeof resp !== 'object') return { items: [], cursor: null }
  for (const k of ['data', 'items', 'transactions', 'results', 'content']) {
    const v = resp[k]
    if (Array.isArray(v)) {
      const cursor = resp.cursor ?? resp.nextCursor ?? resp.pagination?.cursor ?? resp.pagination?.nextCursor ?? null
      return { items: v, cursor }
    }
    if (v && typeof v === 'object') return extraerPagina(v)
  }
  throw new Error(`Respuesta de Cresium no reconocida (claves: ${Object.keys(resp).join(', ')})`)
}

/** Rango del mes en hora argentina (UTC-3, sin horario de verano) */
function rangoMes(mes) {
  const [a, m] = mes.split('-').map(Number)
  const desde = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0))
  const hasta = new Date(Date.UTC(a, m, 1, 3, 0, 0) - 1)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

function fechaART(iso) {
  if (!iso) return null
  return new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function traerMovimientosCresium(cred, { desde, hasta }) {
  const todos = []
  const vistos = new Set()
  let cursor = null
  for (let pagina = 0; pagina < 200; pagina += 1) {
    const resp = await cresiumGet(cred, '/v3/transaction/search', {
      fromDate: desde, toDate: hasta, field: 'processedAt', order: 'asc', pageSize: 100, cursor,
    })
    const { items, cursor: siguiente } = extraerPagina(resp)
    const nuevos = items.filter((t) => !vistos.has(t.id))
    nuevos.forEach((t) => vistos.add(t.id))
    todos.push(...nuevos)
    if (!siguiente || items.length < 100 || nuevos.length === 0) break
    cursor = siguiente
  }
  return todos
}

/** Transacción de Cresium -> fila de cresium_movimientos (sin los campos de Alegra) */
function aFila(empresa, t) {
  const entrada = TIPOS_ENTRADA.has(t.type)
  const contra = (entrada ? t.from : t.to) || {}
  const impuesto = (t.amounts || [])
    .filter((a) => a.type === 'FEE')
    .reduce((s, a) => s + (Number(a.amount) || 0), 0)
  return {
    empresa,
    cresium_id: t.id,
    fecha: fechaART(t.processedAt || t.createdAt),
    procesado_en: t.processedAt || null,
    tipo: t.type || null,
    estado: t.status || null,
    direccion: entrada ? 'entrada' : 'salida',
    contraparte: String(contra.ownerName || '').replace(/\s+/g, ' ').trim() || null,
    cuit: soloDigitos(contra.uuid) || null,
    cuenta_contraparte: contra.value || null,
    banco_contraparte: contra.bankName || null,
    // Como en el extracto: la entrada en bruto, la salida sin el impuesto
    importe: redondear(entrada ? t.totalAmount : t.netAmount),
    impuesto: redondear(impuesto),
    tag: t.tag || null,
    nota: t.internalNote || null,
    external_id: t.externalId || null,
    raw: t,
    updated_at: new Date().toISOString(),
  }
}

async function guardarMovimientos(cfg, filas) {
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200)
    const res = await fetchConTimeout(
      `${cfg.url}/rest/v1/cresium_movimientos?on_conflict=empresa,cresium_id`,
      {
        method: 'POST',
        headers: { ...headersServicio(cfg), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(lote),
      },
    )
    if (!res.ok) throw new Error(`No se pudieron guardar los movimientos: ${(await res.text()).slice(0, 300)}`)
  }
}

/** Último procesado_en guardado de la empresa (o null si nunca se importó) */
async function ultimoProcesado(cfg, empresa) {
  const [f] = await selectTodo(
    cfg,
    `cresium_movimientos?select=procesado_en&empresa=eq.${empresa}&procesado_en=not.is.null&order=procesado_en.desc&limit=1`,
  )
  return f?.procesado_en || null
}

const ultimaSync = new Map() // empresa -> ms
const sincronizando = new Set()

/**
 * Trae de Cresium solo lo nuevo: desde el último movimiento guardado menos
 * MARGEN_DIAS_RESYNC (para actualizar estados), o desde CRESIUM_DESDE la primera vez.
 * Con mes = 'AAAA-MM' vuelve a traer ese mes completo (re-sincronizar).
 * Nunca toca los campos de Alegra de lo ya guardado.
 */
export async function sincronizarEmpresa(cfg, empresa, { mes = null, forzar = false } = {}) {
  const cred = credenciales(empresa)
  if (!cred.cresiumOk) throw new Error(`Faltan las claves de Cresium de ${EMPRESAS[empresa].label} en el .env del servidor`)
  if (sincronizando.has(empresa)) return { traidos: 0, nuevos: 0, omitido: 'en_curso' }
  if (!mes && !forzar && Date.now() - (ultimaSync.get(empresa) || 0) < ESPERA_ENTRE_SYNC_MS) {
    return { traidos: 0, nuevos: 0, omitido: 'reciente' }
  }
  sincronizando.add(empresa)
  try {
    let rango
    if (mes) {
      rango = rangoMes(mes)
    } else {
      const ultimo = await ultimoProcesado(cfg, empresa)
      const inicio = (process.env.CRESIUM_DESDE || '').trim()
      const desde = ultimo
        ? new Date(new Date(ultimo).getTime() - MARGEN_DIAS_RESYNC * 24 * 60 * 60 * 1000)
        : new Date(`${FECHA_RE.test(inicio) ? inicio : '2026-05-01'}T03:00:00.000Z`)
      rango = { desde: desde.toISOString(), hasta: new Date().toISOString() }
    }
    const transacciones = await traerMovimientosCresium(cred.cresium, rango)
    // El company id es el de la empresa: si viene otro, las claves están cruzadas
    const ajena = transacciones.find((t) => t.companyId && String(t.companyId) !== cred.cresium.companyId)
    if (ajena) throw new Error('Cresium devolvió movimientos de otra empresa: revisá las claves del .env')

    // Cuántos son nuevos de verdad (para el mensaje)
    const ids = transacciones.map((t) => t.id)
    let existentes = new Set()
    if (ids.length > 0) {
      const ya = []
      for (let i = 0; i < ids.length; i += 300) {
        ya.push(...await selectTodo(
          cfg,
          `cresium_movimientos?select=cresium_id&empresa=eq.${empresa}&cresium_id=in.(${ids.slice(i, i + 300).join(',')})`,
        ))
      }
      existentes = new Set(ya.map((x) => Number(x.cresium_id)))
    }
    await guardarMovimientos(cfg, transacciones.map((t) => aFila(empresa, t)))
    ultimaSync.set(empresa, Date.now())
    return {
      traidos: transacciones.length,
      nuevos: transacciones.filter((t) => !existentes.has(Number(t.id))).length,
      desde: rango.desde,
    }
  } finally {
    sincronizando.delete(empresa)
  }
}

/* -------------------------------------------------------------------------- */
/* Alegra                                                                     */
/* -------------------------------------------------------------------------- */

async function alegra(cred, path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${cred.email}:${cred.token}`).toString('base64')
  for (let intento = 0; intento < 4; intento += 1) {
    const res = await fetchConTimeout(`${ALEGRA_API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429 || res.status >= 500) {
      await esperar(2000 * (intento + 1))
      continue
    }
    const { data, texto } = await leerJson(res)
    return { ok: res.ok, status: res.status, data, texto }
  }
  return { ok: false, status: 429, data: null, texto: 'Alegra no respondió (límite de llamadas)' }
}

function errorAlegra(r) {
  const msg = r.data?.message || r.data?.error?.message || r.data?.error || String(r.texto || '').slice(0, 300)
  return `Alegra ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`
}

/** Lista completa paginada (30 por página, el máximo de Alegra), con las páginas en paralelo */
async function alegraTodo(cred, path, params = {}) {
  const pedirPagina = async (start, conMeta = false) => {
    const qs = new URLSearchParams({ ...params, start: String(start), limit: '30', ...(conMeta ? { metadata: 'true' } : {}) })
    const r = await alegra(cred, `${path}?${qs}`)
    if (!r.ok) throw new Error(errorAlegra(r))
    return r.data
  }
  const primera = await pedirPagina(0, true)
  const filas = Array.isArray(primera) ? [...primera] : [...(primera?.data || [])]
  const total = Number(primera?.metadata?.total)
  if (Number.isFinite(total) && total > 30) {
    const starts = []
    for (let st = 30; st < total; st += 30) starts.push(st)
    for (let k = 0; k < starts.length; k += PARALELO_ALEGRA) {
      const paginas = await Promise.all(starts.slice(k, k + PARALELO_ALEGRA).map((st) => pedirPagina(st)))
      paginas.forEach((pg) => filas.push(...(Array.isArray(pg) ? pg : (pg?.data || []))))
    }
  } else if (!Number.isFinite(total) && filas.length === 30) {
    // Sin metadata: se sigue de a una página
    for (let st = 30; st < 30000; st += 30) {
      const pg = await pedirPagina(st)
      const lista = Array.isArray(pg) ? pg : (pg?.data || [])
      filas.push(...lista)
      if (lista.length < 30) break
    }
  }
  return filas
}

const cacheAlegra = new Map() // empresa -> { en, datos }
const pendientesAlegra = new Map() // empresa -> Promise (evita pedir lo mismo dos veces a la vez)

async function leerBaseAlegra(empresa, cred) {
  const [rBancos, rCat, contactos, bills] = await Promise.all([
    alegra(cred, '/bank-accounts'),
    alegra(cred, '/categories?format=plain'),
    alegraTodo(cred, '/contacts'),
    alegraTodo(cred, '/bills'),
  ])
  if (!rBancos.ok) throw new Error(errorAlegra(rBancos))
  if (!rCat.ok) throw new Error(errorAlegra(rCat))
  const bancos = Array.isArray(rBancos.data) ? rBancos.data : []
  const banco = bancos.find((b) => /cresium/i.test(b.name || ''))
  if (!banco) throw new Error('En Alegra no hay una cuenta bancaria llamada "Cresium"')

  const categorias = (Array.isArray(rCat.data) ? rCat.data : [])
    .filter((x) => x.status !== 'inactive' && x.use === 'movement')
    .map((x) => ({ id: String(x.id), nombre: x.name, tipo: x.type }))

  const porCuit = new Map()
  for (const ct of contactos) {
    const cuit = soloDigitos(ct.identificationObject?.number ?? ct.identification)
    if (cuit && !porCuit.has(cuit)) porCuit.set(cuit, { id: String(ct.id), nombre: ct.name })
  }

  const facturas = bills
    .filter((b) => b.status === 'open' && Number(b.balance) > 0)
    .map((b) => ({
      id: String(b.id),
      numero: b.numberTemplate?.fullNumber || b.numberTemplate?.number || String(b.id),
      fecha: b.date,
      saldo: redondear(b.balance),
      cuit: soloDigitos(b.provider?.identification),
      proveedor: b.provider?.name || '',
    }))

  const datos = { banco: { id: String(banco.id), nombre: banco.name }, categorias, porCuit, facturas }
  cacheAlegra.set(empresa, { en: Date.now(), datos })
  return datos
}

/**
 * Datos de Alegra para proponer y cargar: cuenta bancaria "Cresium", plan de
 * cuentas, contactos por CUIT y facturas de proveedor abiertas.
 * Con caché: si venció, devuelve lo guardado y lo renueva por detrás.
 * forzar = true (al cargar) siempre lee de nuevo.
 */
async function datosAlegra(empresa, cred, { forzar = false } = {}) {
  const c = cacheAlegra.get(empresa)
  const enCurso = pendientesAlegra.get(empresa)
  const renovar = () => {
    if (pendientesAlegra.has(empresa)) return pendientesAlegra.get(empresa)
    const p = leerBaseAlegra(empresa, cred).finally(() => pendientesAlegra.delete(empresa))
    pendientesAlegra.set(empresa, p)
    return p
  }
  if (forzar) return enCurso || renovar()
  if (c) {
    if (Date.now() - c.en > CACHE_ALEGRA_MS) renovar().catch((err) => console.warn('[cresium] Renovando Alegra:', err.message))
    return c.datos
  }
  return renovar()
}

const cachePagosMes = new Map() // `${empresa}|${mes}` -> { en, pagos }

/**
 * Pagos/cobros de Alegra en la cuenta Cresium de ese mes (para detectar lo cargado
 * a mano). Se leen del más nuevo al más viejo y se corta al pasar el mes.
 */
async function pagosAlegraDelMes(empresa, cred, bancoId, mes, { forzar = false } = {}) {
  const clave = `${empresa}|${mes}`
  const c = cachePagosMes.get(clave)
  if (!forzar && c && Date.now() - c.en < CACHE_ALEGRA_MS) return c.pagos
  const primerDia = `${mes}-01`
  const [a, m] = mes.split('-').map(Number)
  const siguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
  const pagos = []
  for (let start = 0; start < 30000; start += 30) {
    const qs = new URLSearchParams({ start: String(start), limit: '30', order_field: 'date', order_direction: 'DESC' })
    const r = await alegra(cred, `/payments?${qs}`)
    if (!r.ok) throw new Error(errorAlegra(r))
    const pagina = Array.isArray(r.data) ? r.data : (r.data?.data || [])
    for (const p of pagina) {
      if (p.date >= primerDia && p.date < siguiente && String(p.bankAccount?.id) === String(bancoId) && p.status !== 'void') {
        pagos.push({ id: String(p.id), fecha: p.date, monto: redondear(p.amount), tipo: p.type })
      }
    }
    const masViejo = pagina[pagina.length - 1]?.date
    if (pagina.length < 30 || (masViejo && masViejo < primerDia)) break
  }
  cachePagosMes.set(clave, { en: Date.now(), pagos })
  return pagos
}

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function categoriaPorNombre(categorias, ...nombres) {
  for (const n of nombres) {
    const c = categorias.find((x) => normalizar(x.nombre) === normalizar(n))
    if (c) return c
  }
  return null
}

/**
 * Propuesta de carga para un movimiento pendiente.
 * Devuelve { contacto, crear_contacto, destino: {tipo:'categoria'|'factura', id, nombre} | null,
 *            ajuste, opciones_factura }
 */
function proponer(empresa, fila, alg, ultimaCategoriaPorCuit) {
  const contacto = fila.cuit ? alg.porCuit.get(fila.cuit) || null : null
  const opcionesFactura = fila.direccion === 'salida' && fila.cuit
    ? alg.facturas.filter((f) => f.cuit === fila.cuit)
    : []

  let destino = null
  let ajuste = 0
  if (fila.direccion === 'salida') {
    const fac = opcionesFactura.find((f) => {
      const dif = redondear(fila.importe - f.saldo)
      return dif >= 0 && dif <= TOLERANCIA_FACTURA
    })
    if (fac) {
      destino = { tipo: 'factura', id: fac.id, nombre: `Factura ${fac.numero}` }
      ajuste = redondear(fila.importe - fac.saldo)
    }
  }
  if (!destino) {
    const ultima = fila.cuit ? ultimaCategoriaPorCuit.get(fila.cuit) : null
    let cat = ultima ? alg.categorias.find((c) => c.id === ultima) : null
    if (!cat && fila.direccion === 'entrada') {
      cat = fila.cuit === CUIT_CABIFY
        ? categoriaPorNombre(alg.categorias, 'Ventas')
        : categoriaPorNombre(alg.categorias, 'Otros ingresos diversos', 'Otros Ingresos')
    }
    if (!cat && fila.direccion === 'salida' && empresa === '44dreams' && fila.cuit === CUIT_GRUPO_CG) {
      cat = categoriaPorNombre(alg.categorias, 'Otros honorarios')
    }
    if (cat) destino = { tipo: 'categoria', id: cat.id, nombre: cat.nombre }
  }

  return {
    contacto,
    crear_contacto: !contacto && !!fila.cuit,
    destino,
    ajuste,
    opciones_factura: opcionesFactura.map((f) => ({ id: f.id, nombre: `Factura ${f.numero} · saldo ${f.saldo}`, saldo: f.saldo })),
  }
}

/** Pago ya existente en la cuenta Cresium de Alegra con misma fecha e importe (cargado a mano) */
function posibleDuplicado(fila, pagos, usados) {
  const tipo = fila.direccion === 'entrada' ? 'in' : 'out'
  const p = pagos.find((x) =>
    !usados.has(x.id) && x.tipo === tipo && x.fecha === fila.fecha && Math.abs(x.monto - fila.importe) < 0.01)
  return p || null
}

/* -------------------------------------------------------------------------- */
/* Autenticación y permisos                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Usuario activo con permiso sobre el submenú de la empresa.
 * accion: 'view' | 'edit'. Devuelve { cfg, userId, isAdmin, puedeEditar } o null.
 */
async function requireUsuario(req, res, empresa, accion = 'view') {
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
  const perfil = profileRes.ok ? (await profileRes.json())[0] : null
  if (!perfil || perfil.is_active === false) {
    res.status(403).json({ error: 'Usuario inactivo' })
    return null
  }
  const isAdmin = perfil.roles?.name === 'admin'
  let puedeVer = isAdmin
  let puedeEditar = isAdmin
  if (!isAdmin) {
    const r = await fetchConTimeout(`${cfg.url}/rest/v1/rpc/get_user_permissions`, {
      method: 'POST',
      headers: headersServicio(cfg),
      body: JSON.stringify({ p_user_id: user.id }),
    })
    const filas = r.ok ? await r.json() : []
    const submenu = EMPRESAS[empresa].submenu
    const permiso = (Array.isArray(filas) ? filas : []).find(
      (f) => !f.is_menu && (f.menu_name === submenu || f.submenu_name === submenu),
    )
    puedeVer = !!permiso?.can_view
    puedeEditar = !!permiso?.can_edit
  }
  if (!puedeVer || (accion === 'edit' && !puedeEditar)) {
    res.status(403).json({
      error: accion === 'edit'
        ? 'No tenés permiso de edición en este módulo para cargar en Alegra'
        : 'No tenés acceso a este módulo',
    })
    return null
  }
  return { cfg, userId: user.id, isAdmin, puedeEditar }
}

function leerEmpresa(req, res) {
  const empresa = String(req.params.empresa || '')
  if (!EMPRESAS[empresa]) {
    res.status(404).json({ error: 'Empresa inválida' })
    return null
  }
  return empresa
}

/* -------------------------------------------------------------------------- */
/* Listado                                                                    */
/* -------------------------------------------------------------------------- */

async function ultimaCategoriaPorCuit(cfg, empresa) {
  const filas = await selectTodo(
    cfg,
    `cresium_movimientos?select=cuit,alegra_categoria_id,alegra_cargado_en&empresa=eq.${empresa}` +
      '&alegra_estado=eq.cargado&alegra_categoria_id=not.is.null&order=alegra_cargado_en.asc',
  )
  const mapa = new Map()
  for (const f of filas) if (f.cuit) mapa.set(f.cuit, String(f.alegra_categoria_id))
  return mapa
}

const COLUMNAS_LISTADO = [
  'cresium_id', 'fecha', 'procesado_en', 'tipo', 'estado', 'direccion', 'contraparte', 'cuit',
  'cuenta_contraparte', 'banco_contraparte', 'importe', 'impuesto', 'tag', 'nota',
  'alegra_estado', 'alegra_pago_id', 'alegra_impuesto_pago_id', 'alegra_ajuste_pago_id',
  'alegra_detalle', 'alegra_error', 'alegra_cargado_en', 'alegra_conciliacion_id', 'updated_at',
].join(',')

async function filasDelMes(cfg, empresa, mes) {
  const [a, m] = mes.split('-').map(Number)
  const primerDia = `${mes}-01`
  const siguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
  const filas = await selectTodo(
    cfg,
    `cresium_movimientos?select=${COLUMNAS_LISTADO}&empresa=eq.${empresa}` +
      `&fecha=gte.${primerDia}&fecha=lt.${siguiente}&order=procesado_en.asc`,
  )
  return filas.map((f) => ({ ...f, importe: Number(f.importe) || 0, impuesto: Number(f.impuesto) || 0 }))
}

/** Movimientos del mes desde la base (rápido: no consulta Cresium ni Alegra) */
async function armarListado(ctx, empresa, mes) {
  const cred = credenciales(empresa)
  const [filas, ultimoMovimiento] = await Promise.all([
    filasDelMes(ctx.cfg, empresa, mes),
    ultimoProcesado(ctx.cfg, empresa),
  ])
  const sync = ultimaSync.get(empresa)
  return {
    empresa,
    empresa_label: EMPRESAS[empresa].label,
    mes,
    filas: filas.map((f) => ({ ...f, propuesta: null, posible_duplicado: null })),
    puede_cargar: ctx.puedeEditar && cred.alegraOk,
    cresium_configurado: cred.cresiumOk,
    alegra_configurado: cred.alegraOk,
    // Último movimiento guardado de la empresa (de cualquier mes) y última vez que se consultó Cresium
    ultimo_movimiento: ultimoMovimiento,
    ultima_sync: sync ? new Date(sync).toISOString() : null,
  }
}

/** Propuesta de carga en Alegra para los pendientes del mes (consulta Alegra, con caché) */
async function armarPropuestas(ctx, empresa, mes, { refrescar = false } = {}) {
  const cred = credenciales(empresa)
  if (!cred.alegraOk) return { propuestas: {}, categorias: [], error_alegra: null }
  const [filas, alg, ultima, vinculadosFilas] = await Promise.all([
    filasDelMes(ctx.cfg, empresa, mes),
    datosAlegra(empresa, cred.alegra, { forzar: refrescar }),
    ultimaCategoriaPorCuit(ctx.cfg, empresa),
    selectTodo(ctx.cfg, `cresium_movimientos?select=alegra_pago_id&empresa=eq.${empresa}&alegra_pago_id=not.is.null`),
  ])
  const pendientes = filas.filter((f) => f.estado === 'SUCCESS' && ['pendiente', 'error'].includes(f.alegra_estado))
  const pagos = pendientes.length > 0
    ? await pagosAlegraDelMes(empresa, cred.alegra, alg.banco.id, mes, { forzar: refrescar })
    : []
  // Pagos de Alegra ya vinculados a otro movimiento: no se proponen como duplicado
  const vinculados = new Set(vinculadosFilas.map((t) => String(t.alegra_pago_id)))
  const propuestas = {}
  for (const fila of pendientes) {
    const dup = posibleDuplicado(fila, pagos, vinculados)
    if (dup) vinculados.add(dup.id)
    propuestas[fila.cresium_id] = {
      propuesta: proponer(empresa, fila, alg, ultima),
      posible_duplicado: dup ? { id: dup.id, fecha: dup.fecha, monto: dup.monto } : null,
    }
  }
  return {
    propuestas,
    categorias: alg.categorias.filter((c) => ['income', 'expense', 'asset', 'liability', 'cost'].includes(c.tipo)),
    error_alegra: null,
  }
}

/* -------------------------------------------------------------------------- */
/* Carga en Alegra                                                            */
/* -------------------------------------------------------------------------- */

async function crearContacto(cred, fila) {
  const empresaJuridica = /^3[034]/.test(fila.cuit)
  const body = {
    name: fila.contraparte || `CUIT ${fila.cuit}`,
    identificationObject: { type: 'CUIT', number: fila.cuit },
    type: [fila.direccion === 'entrada' ? 'client' : 'provider'],
    ivaCondition: empresaJuridica ? 'IVA_RESPONSABLE' : 'CONSUMIDOR_FINAL',
    address: { province: 'Buenos Aires', city: '[POR CONFIRMAR]', address: '[POR CONFIRMAR]' },
    observations:
      `Creado desde Toshibase (Cresium). CBU/CVU: ${fila.cuenta_contraparte || '-'} ` +
      `(${fila.banco_contraparte || '-'}). Revisar condición de IVA y domicilio.`,
  }
  const r = await alegra(cred, '/contacts', { method: 'POST', body })
  if (!r.ok) throw new Error(`No se pudo crear el contacto ${body.name}: ${errorAlegra(r)}`)
  return { id: String(r.data.id), nombre: r.data.name }
}

async function crearPago(cred, body) {
  const r = await alegra(cred, '/payments', { method: 'POST', body })
  if (!r.ok) throw new Error(errorAlegra(r))
  await esperar(PAUSA_ALEGRA_MS)
  return String(r.data.id)
}

let cargando = false

/**
 * Carga un movimiento. elegido: { categoria_id?, factura_id? } (si no viene, se usa la propuesta).
 * Crea solo lo que falta (si un intento anterior dejó el principal hecho, sigue con el impuesto).
 */
async function cargarUno(ctx, empresa, cred, alg, fila, elegido, ultima) {
  const prop = proponer(empresa, fila, alg, ultima)
  let destino = prop.destino
  let ajuste = prop.ajuste
  if (elegido?.factura_id) {
    const fac = alg.facturas.find((f) => f.id === String(elegido.factura_id) && f.cuit === fila.cuit)
    if (!fac) throw new Error('La factura elegida no está abierta o no es de este proveedor')
    const dif = redondear(fila.importe - fac.saldo)
    if (dif < 0 || dif > TOLERANCIA_FACTURA) {
      throw new Error(`El importe (${fila.importe}) no coincide con el saldo de la factura ${fac.numero} (${fac.saldo})`)
    }
    destino = { tipo: 'factura', id: fac.id, nombre: `Factura ${fac.numero}` }
    ajuste = dif
  } else if (elegido?.categoria_id) {
    const cat = alg.categorias.find((c) => c.id === String(elegido.categoria_id))
    if (!cat) throw new Error('La cuenta contable elegida no existe en Alegra')
    destino = { tipo: 'categoria', id: cat.id, nombre: cat.nombre }
    ajuste = 0
  }
  if (!destino) throw new Error('Elegí la cuenta contable o la factura antes de cargar')

  const catImpuesto = categoriaPorNombre(alg.categorias, 'Impuesto ley 25.413 créditos', 'Impuesto ley 25.413')
  if (fila.impuesto > 0 && !catImpuesto) throw new Error('No existe la cuenta "Impuesto ley 25.413 créditos" en Alegra')

  const cambios = {}
  let contacto = prop.contacto
  if (!contacto && fila.cuit) {
    contacto = await crearContacto(cred, fila)
    alg.porCuit.set(fila.cuit, contacto)
  }
  cambios.alegra_contacto_id = contacto?.id || null

  const obs = `Cresium op ${fila.cresium_id}`
  const base = { date: fila.fecha, bankAccount: { id: Number(alg.banco.id) }, paymentMethod: 'transfer' }
  const tipo = fila.direccion === 'entrada' ? 'in' : 'out'

  try {
    if (!fila.alegra_pago_id) {
      const montoPrincipal = destino.tipo === 'factura' ? redondear(fila.importe - ajuste) : fila.importe
      const body = {
        ...base,
        type: tipo,
        ...(contacto ? { client: { id: Number(contacto.id) } } : {}),
        ...(destino.tipo === 'factura'
          ? { bills: [{ id: Number(destino.id), amount: montoPrincipal }] }
          : { categories: [{ id: Number(destino.id), price: montoPrincipal, quantity: 1, observations: fila.nota || '' }] }),
        observations: obs,
      }
      cambios.alegra_pago_id = await crearPago(cred, body)
      fila.alegra_pago_id = cambios.alegra_pago_id
      if (destino.tipo === 'factura') {
        const fac = alg.facturas.find((f) => f.id === destino.id)
        if (fac) alg.facturas.splice(alg.facturas.indexOf(fac), 1)
      }
    }

    if (ajuste > 0 && !fila.alegra_ajuste_pago_id) {
      const catAjuste = categoriaPorNombre(alg.categorias, 'Ajuste por redondeo', 'Otros gastos', 'Otros honorarios')
      if (!catAjuste) throw new Error('No hay cuenta para registrar la diferencia de redondeo')
      cambios.alegra_ajuste_pago_id = await crearPago(cred, {
        ...base, type: tipo,
        ...(contacto ? { client: { id: Number(contacto.id) } } : {}),
        categories: [{ id: Number(catAjuste.id), price: ajuste, quantity: 1 }],
        observations: `${obs} - Diferencia con ${destino.nombre}`,
      })
      fila.alegra_ajuste_pago_id = cambios.alegra_ajuste_pago_id
    }

    if (fila.impuesto > 0 && !fila.alegra_impuesto_pago_id) {
      cambios.alegra_impuesto_pago_id = await crearPago(cred, {
        ...base, type: 'out',
        categories: [{ id: Number(catImpuesto.id), price: fila.impuesto, quantity: 1 }],
        observations: `${obs} - Imp. 25.413`,
      })
    }
  } catch (err) {
    // Se guarda lo que sí se creó para no duplicarlo en el reintento
    await actualizarMovimiento(ctx.cfg, empresa, fila.cresium_id, {
      ...cambios, alegra_estado: 'error', alegra_error: err.message,
    })
    throw err
  }

  const detalle = destino.nombre + (ajuste > 0 ? ` (+ ajuste ${ajuste})` : '')
  await actualizarMovimiento(ctx.cfg, empresa, fila.cresium_id, {
    ...cambios,
    alegra_estado: 'cargado',
    alegra_categoria_id: destino.tipo === 'categoria' ? destino.id : null,
    alegra_factura_id: destino.tipo === 'factura' ? destino.id : null,
    alegra_detalle: detalle,
    alegra_error: null,
    alegra_cargado_por: ctx.userId,
    alegra_cargado_en: new Date().toISOString(),
  })
  return { detalle, pago_id: cambios.alegra_pago_id || fila.alegra_pago_id }
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const cresiumRouter = express()
cresiumRouter.use(express.json())

/** GET /api/cresium/:empresa/movimientos?mes=AAAA-MM -> solo la base (rápido) */
cresiumRouter.get('/:empresa/movimientos', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'view')
    if (!ctx) return
    const mes = String(req.query.mes || '')
    if (!MES_RE.test(mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' })
    res.json(await armarListado(ctx, empresa, mes))
  } catch (error) {
    console.error('[cresium/movimientos]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** GET /api/cresium/:empresa/propuestas?mes=AAAA-MM[&refrescar=1] -> cómo se cargaría en Alegra */
cresiumRouter.get('/:empresa/propuestas', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'view')
    if (!ctx) return
    const mes = String(req.query.mes || '')
    if (!MES_RE.test(mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' })
    try {
      res.json(await armarPropuestas(ctx, empresa, mes, { refrescar: req.query.refrescar === '1' }))
    } catch (err) {
      // Si Alegra falla, la tabla igual se ve: solo falta la propuesta
      res.json({ propuestas: {}, categorias: [], error_alegra: err.message })
    }
  } catch (error) {
    console.error('[cresium/propuestas]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cresium/:empresa/actualizar { mes? }
 *  - sin mes: trae solo lo nuevo desde el último movimiento guardado
 *  - con mes (AAAA-MM): vuelve a traer ese mes completo
 */
cresiumRouter.post('/:empresa/actualizar', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'view')
    if (!ctx) return
    const mes = req.body?.mes ? String(req.body.mes) : null
    if (mes && !MES_RE.test(mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' })
    const r = await sincronizarEmpresa(ctx.cfg, empresa, { mes, forzar: true })
    if (r.omitido === 'en_curso') return res.status(409).json({ error: 'Ya se están trayendo los movimientos. Esperá un momento.' })
    res.json(r)
  } catch (error) {
    console.error('[cresium/actualizar]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cresium/:empresa/cargar { items: [{ cresium_id, categoria_id?, factura_id? }] }
 * Crea en Alegra los movimientos indicados (hasta MAX_POR_LOTE por llamada).
 */
cresiumRouter.post('/:empresa/cargar', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'edit')
    if (!ctx) return
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (items.length === 0 || items.length > MAX_POR_LOTE || !items.every((i) => Number.isInteger(i?.cresium_id))) {
      return res.status(400).json({ error: `Enviá entre 1 y ${MAX_POR_LOTE} movimientos` })
    }
    const cred = credenciales(empresa)
    if (!cred.alegraOk) {
      return res.status(500).json({ error: `Falta el token de Alegra de ${EMPRESAS[empresa].label} en el .env del servidor` })
    }
    if (cargando) return res.status(409).json({ error: 'Ya hay una carga en curso. Esperá a que termine.' })
    cargando = true
    const resultados = []
    try {
      const alg = await datosAlegra(empresa, cred.alegra, { forzar: true })
      const ultima = await ultimaCategoriaPorCuit(ctx.cfg, empresa)
      const ids = items.map((i) => i.cresium_id).join(',')
      const filas = await selectTodo(
        ctx.cfg,
        `cresium_movimientos?select=*&empresa=eq.${empresa}&cresium_id=in.(${ids})`,
      )
      for (const item of items) {
        const fila = filas.find((f) => Number(f.cresium_id) === item.cresium_id)
        if (!fila) {
          resultados.push({ cresium_id: item.cresium_id, ok: false, error: 'Movimiento no encontrado' })
          continue
        }
        fila.importe = Number(fila.importe) || 0
        fila.impuesto = Number(fila.impuesto) || 0
        if (fila.estado !== 'SUCCESS') {
          resultados.push({ cresium_id: item.cresium_id, ok: false, error: 'El movimiento no está acreditado en Cresium' })
          continue
        }
        if (!['pendiente', 'error'].includes(fila.alegra_estado)) {
          resultados.push({ cresium_id: item.cresium_id, ok: false, error: 'Ya está cargado o ignorado' })
          continue
        }
        try {
          const r = await cargarUno(ctx, empresa, cred.alegra, alg, fila, item, ultima)
          if (fila.cuit && item.categoria_id) ultima.set(fila.cuit, String(item.categoria_id))
          resultados.push({ cresium_id: item.cresium_id, ok: true, detalle: r.detalle, pago_id: r.pago_id })
        } catch (err) {
          console.warn(`[cresium] Error cargando ${fila.cresium_id}: ${err.message}`)
          resultados.push({ cresium_id: item.cresium_id, ok: false, error: err.message })
        }
      }
    } finally {
      cargando = false
      for (const k of cachePagosMes.keys()) if (k.startsWith(`${empresa}|`)) cachePagosMes.delete(k)
    }
    res.json({
      cargados: resultados.filter((r) => r.ok).length,
      errores: resultados.filter((r) => !r.ok).length,
      resultados,
    })
  } catch (error) {
    cargando = false
    console.error('[cresium/cargar]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cresium/:empresa/marcar { cresium_id, accion: 'ignorar'|'pendiente'|'vincular', alegra_pago_id? }
 *  - vincular: el movimiento ya estaba cargado a mano en Alegra (queda como cargado)
 *  - ignorar / pendiente: sacarlo o volverlo a la lista de pendientes
 */
cresiumRouter.post('/:empresa/marcar', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'edit')
    if (!ctx) return
    const cresiumId = req.body?.cresium_id
    const accion = req.body?.accion
    if (!Number.isInteger(cresiumId) || !['ignorar', 'pendiente', 'vincular'].includes(accion)) {
      return res.status(400).json({ error: 'Datos inválidos' })
    }
    const [fila] = await selectTodo(
      ctx.cfg,
      `cresium_movimientos?select=alegra_estado,alegra_pago_id&empresa=eq.${empresa}&cresium_id=eq.${cresiumId}`,
    )
    if (!fila) return res.status(404).json({ error: 'Movimiento no encontrado' })
    if (fila.alegra_estado === 'cargado' && accion !== 'vincular') {
      return res.status(409).json({ error: 'Ya está cargado en Alegra: para deshacerlo, anulá el pago en Alegra' })
    }
    let cambios
    if (accion === 'vincular') {
      const pagoId = String(req.body?.alegra_pago_id || '')
      if (!/^\d+$/.test(pagoId)) return res.status(400).json({ error: 'Pago de Alegra inválido' })
      cambios = {
        alegra_estado: 'cargado', alegra_pago_id: pagoId, alegra_detalle: 'Vinculado a pago existente',
        alegra_error: null, alegra_cargado_por: ctx.userId, alegra_cargado_en: new Date().toISOString(),
      }
    } else if (accion === 'ignorar') {
      cambios = { alegra_estado: 'ignorado', alegra_error: null }
    } else {
      cambios = { alegra_estado: 'pendiente', alegra_error: null }
    }
    await actualizarMovimiento(ctx.cfg, empresa, cresiumId, cambios)
    res.json({ ok: true })
  } catch (error) {
    console.error('[cresium/marcar]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Conciliación en Alegra                                                     */
/* -------------------------------------------------------------------------- */

/** Saldo en pesos de la cuenta Cresium ahora (GET /v3/balance/wallets) */
async function saldoCresiumActual(cred) {
  const resp = await cresiumGet(cred, '/v3/balance/wallets')
  const lista = Array.isArray(resp) ? resp : (resp?.data || resp?.wallets || [])
  const ars = lista.find((w) => (w.currency?.code || w.currency || w.currencyCode) === 'ARS') || lista[0]
  if (!ars || ars.balance === undefined) throw new Error('Cresium no devolvió el saldo de la cuenta en pesos')
  return redondear(ars.balance)
}

/** Efecto de un movimiento en el saldo del banco (como en el extracto) */
const efectoEnSaldo = (f) => redondear(
  (f.direccion === 'entrada' ? Number(f.importe) : -Number(f.importe)) - Number(f.impuesto || 0),
)

/**
 * Prepara (y con confirmar=true crea) la conciliación del mes de `hasta`, desde el
 * día 1 hasta `hasta`. Exige que no queden movimientos pendientes en ese rango.
 */
async function conciliar(ctx, empresa, hasta, confirmar) {
  const cred = credenciales(empresa)
  if (!cred.cresiumOk || !cred.alegraOk) throw new Error('Faltan claves de Cresium o Alegra en el .env del servidor')
  // Base al día: el saldo se calcula hacia atrás desde el saldo actual
  await sincronizarEmpresa(ctx.cfg, empresa, { forzar: true })

  const desde = `${hasta.slice(0, 7)}-01`
  const todas = await selectTodo(
    ctx.cfg,
    `cresium_movimientos?select=cresium_id,fecha,estado,direccion,contraparte,importe,impuesto,alegra_estado,` +
      `alegra_pago_id,alegra_impuesto_pago_id,alegra_ajuste_pago_id,alegra_conciliacion_id` +
      `&empresa=eq.${empresa}&fecha=gte.${desde}&estado=eq.SUCCESS`,
  )
  const enRango = todas.filter((f) => f.fecha <= hasta)
  const pendientes = enRango.filter((f) => ['pendiente', 'error'].includes(f.alegra_estado))
  if (pendientes.length > 0) {
    return {
      ok: false,
      error: `Quedan ${pendientes.length} movimientos sin cargar en Alegra entre el ${desde} y el ${hasta}. ` +
        'Cargalos o marcalos como "No cargar" antes de conciliar.',
    }
  }
  const aConciliar = enRango.filter((f) => f.alegra_estado === 'cargado' && !f.alegra_conciliacion_id)
  const transacciones = [...new Set(aConciliar.flatMap((f) =>
    [f.alegra_pago_id, f.alegra_impuesto_pago_id, f.alegra_ajuste_pago_id].filter(Boolean).map(String)))]
  if (transacciones.length === 0) {
    return { ok: false, error: 'No hay movimientos cargados sin conciliar en ese rango.' }
  }

  const saldoActual = await saldoCresiumActual(cred.cresium)
  const posteriores = todas.filter((f) => f.fecha > hasta)
  // Los de meses siguientes también restan: se traen aparte (el select de arriba arranca en `desde`)
  const siguienteMes = new Date(Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)), 1)).toISOString().slice(0, 10)
  const mesesSiguientes = await selectTodo(
    ctx.cfg,
    `cresium_movimientos?select=direccion,importe,impuesto&empresa=eq.${empresa}&fecha=gte.${siguienteMes}&estado=eq.SUCCESS`,
  )
  const efectoPosterior = [...posteriores.filter((f) => f.fecha < siguienteMes), ...mesesSiguientes]
    .reduce((s, f) => s + efectoEnSaldo(f), 0)
  const saldoBancario = redondear(saldoActual - efectoPosterior)

  const resumen = {
    desde,
    hasta,
    saldo_bancario: saldoBancario,
    saldo_cresium_hoy: saldoActual,
    movimientos: aConciliar.length,
    transacciones: transacciones.length,
    ingresos: redondear(aConciliar.filter((f) => f.direccion === 'entrada').reduce((s, f) => s + Number(f.importe), 0)),
    egresos: redondear(aConciliar.filter((f) => f.direccion === 'salida').reduce((s, f) => s + Number(f.importe), 0)),
    impuestos: redondear(aConciliar.reduce((s, f) => s + Number(f.impuesto || 0), 0)),
  }
  if (!confirmar) return { ok: true, ...resumen }

  const alg = await datosAlegra(empresa, cred.alegra)
  const r = await alegra(cred.alegra, '/conciliations', {
    method: 'POST',
    body: {
      account: { id: Number(alg.banco.id) },
      date: hasta,
      realBalance: saldoBancario,
      bankExpenses: 0,
      bankTaxes: 0,
      bankInterests: 0,
      status: 'draft',
      transactions: transacciones.map(Number),
    },
  })
  if (!r.ok) throw new Error(errorAlegra(r))
  const conciliacionId = String(r.data?.id ?? '')
  const ids = aConciliar.map((f) => f.cresium_id).join(',')
  const upd = await fetchConTimeout(
    `${ctx.cfg.url}/rest/v1/cresium_movimientos?empresa=eq.${empresa}&cresium_id=in.(${ids})`,
    {
      method: 'PATCH',
      headers: { ...headersServicio(ctx.cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({ alegra_conciliacion_id: conciliacionId || 'creada', updated_at: new Date().toISOString() }),
    },
  )
  if (!upd.ok) console.warn('[cresium] Conciliación creada pero no se pudo marcar en la base:', await upd.text())
  return { ok: true, ...resumen, conciliacion_id: conciliacionId }
}

/**
 * POST /api/cresium/:empresa/conciliar { hasta: 'AAAA-MM-DD', confirmar?: boolean }
 * Sin confirmar devuelve el resumen (saldo bancario calculado, movimientos); con
 * confirmar crea la conciliación en borrador en Alegra.
 */
cresiumRouter.post('/:empresa/conciliar', async (req, res) => {
  try {
    const empresa = leerEmpresa(req, res)
    if (!empresa) return
    const ctx = await requireUsuario(req, res, empresa, 'edit')
    if (!ctx) return
    const hasta = String(req.body?.hasta || '')
    if (!FECHA_RE.test(hasta)) return res.status(400).json({ error: 'Fecha de corte inválida (AAAA-MM-DD)' })
    const r = await conciliar(ctx, empresa, hasta, req.body?.confirmar === true)
    if (!r.ok) return res.status(409).json({ error: r.error })
    res.json(r)
  } catch (error) {
    console.error('[cresium/conciliar]', error.message)
    res.status(500).json({ error: error.message })
  }
})

/* -------------------------------------------------------------------------- */
/* Actualización automática (CRESIUM_SYNC_AUTO=1)                             */
/* -------------------------------------------------------------------------- */

const SYNC_AUTO_HORA_DESDE = 9
const SYNC_AUTO_HORA_HASTA = 18

/** Cada hora en punto de 9 a 18 h ART trae lo nuevo de cada empresa con claves */
export function iniciarSyncAutomaticoCresium() {
  if (globalThis.__cresiumSyncAuto) return
  globalThis.__cresiumSyncAuto = true
  let ultimaHoraCorrida = null
  const revisar = async () => {
    const art = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const hora = art.getUTCHours()
    if (hora < SYNC_AUTO_HORA_DESDE || hora > SYNC_AUTO_HORA_HASTA || art.getUTCMinutes() > 5) return
    const clave = `${art.toISOString().slice(0, 10)} ${hora}`
    if (ultimaHoraCorrida === clave) return
    ultimaHoraCorrida = clave
    const cfg = config()
    if (!cfg.url || !cfg.serviceKey) return
    for (const empresa of Object.keys(EMPRESAS)) {
      if (!credenciales(empresa).cresiumOk) continue
      try {
        const r = await sincronizarEmpresa(cfg, empresa, { forzar: true })
        console.log(`[cresium] Automático ${clave}:00 ART ${empresa}: ${r.nuevos ?? 0} nuevos de ${r.traidos ?? 0}`)
      } catch (err) {
        console.error(`[cresium] Automático ${clave}:00 ART ${empresa} falló:`, err.message)
      }
    }
  }
  setInterval(() => { void revisar() }, 60 * 1000).unref?.()
  console.log(`[cresium] Actualización automática activa: cada hora de ${SYNC_AUTO_HORA_DESDE} a ${SYNC_AUTO_HORA_HASTA} h (Argentina)`)
}

if (process.env.CRESIUM_SYNC_AUTO === '1') iniciarSyncAutomaticoCresium()
