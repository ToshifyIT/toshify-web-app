/**
 * Integraciones > Alegra: comprobantes recibidos de ARCA -> Alegra.
 *
 * Por empresa (44 Dreams y Grupo CG):
 *  - Se sube el Excel de ARCA "Mis Comprobantes Recibidos" tal cual, con una
 *    columna más a la derecha con el NOMBRE de la cuenta contable de Alegra.
 *    El navegador lee el Excel y manda encabezados + filas; acá se interpretan y
 *    se guardan en alegra_comprobantes (sql/alegra_compras.sql). Volver a subir
 *    el mismo Excel no duplica: la clave es CUIT + tipo + punto de venta + número.
 *  - "Revisar en Alegra" compara cada comprobante con Alegra: si ya está cargado
 *    (proveedor + número) lo marca como cargado con el link; si no, dice si está
 *    listo para cargar o qué hay que revisar (cuenta que no existe, moneda
 *    extranjera, percepciones, totales que no cierran...). Si algo cargado se
 *    borró en Alegra vuelve a pendiente.
 *  - "Cargar en Alegra" crea, con el mismo criterio que la carga masiva de octubre
 *    (alegra_carga.py):
 *      · Facturas A y C -> factura de proveedor. A: una línea por alícuota de IVA
 *        (+ exentas con el impuesto EXENTO); C: una línea por el total.
 *        Número = número del comprobante sin ceros; vencimiento = fecha.
 *      · Notas de crédito A y C -> nota débito de la empresa (numeración
 *        "Notas débito tipo A / C"), aplicada a la factura del proveedor con el
 *        mismo total cuando hay una sola posible.
 *      · El proveedor, si no existe, se crea por CUIT con domicilio provisorio
 *        "[POR CONFIRMAR]" (RI si emite A, monotributo si emite C).
 *    Nunca modifica comprobantes que ya existen en Alegra.
 *
 * Credenciales SOLO en el servidor (.env): ALEGRA_44DREAMS_EMAIL/TOKEN y
 * ALEGRA_GRUPOCG_EMAIL/TOKEN (las mismas que usa server-cresium.js), más las de Supabase.
 *
 * Permisos: ver = can_view del submenú; subir Excel, elegir cuenta y cargar = can_edit.
 *
 * Se monta en server.js ANTES del express.json() general (el Excel puede pasar los 100 kb):
 *   import { alegraRouter } from './server-alegra.js'
 *   app.use('/api/alegra', alegraRouter)
 * y en desarrollo lo monta vite.config.ts.
 */

import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ALEGRA_API = 'https://api.alegra.com/api/v1'
const TIMEOUT_MS = 30000
const PARALELO_ALEGRA = 4
const MAX_POR_LOTE = 10
const MAX_FILAS_EXCEL = 3000
// Datos de Alegra (plan de cuentas, proveedores, facturas, notas): se reusan este tiempo
const CACHE_ALEGRA_MS = 2 * 60 * 1000
const TOLERANCIA = 0.05

const EMPRESAS = {
  '44dreams': { label: '44 Dreams', submenu: 'alegra-compras-44dreams', env: '44DREAMS' },
  grupocg: { label: 'Grupo CG', submenu: 'alegra-compras-grupocg', env: 'GRUPOCG' },
}

/** Numeración de notas débito de 44 Dreams usada en octubre, si no se encuentra por nombre */
const RESOLUCION_NOTA_44DREAMS = { A: '7', C: '9' }

/** Código ARCA -> qué es */
const TIPOS = {
  1: { letra: 'A', clase: 'factura' },
  11: { letra: 'C', clase: 'factura' },
  3: { letra: 'A', clase: 'nc' },
  13: { letra: 'C', clase: 'nc' },
}

const DIR_PROVISORIA = { province: 'Buenos Aires', city: '[POR CONFIRMAR]', address: '[POR CONFIRMAR]' }

/* -------------------------------------------------------------------------- */
/* Credenciales                                                               */
/* -------------------------------------------------------------------------- */

const CLAVES_ENV = [
  ...Object.values(EMPRESAS).flatMap(({ env }) => [`ALEGRA_${env}_EMAIL`, `ALEGRA_${env}_TOKEN`]),
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (err) {
    console.warn('[alegra] No se pudo leer .env:', err.message)
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

function credAlegra(empresa) {
  const { env } = EMPRESAS[empresa]
  const email = (process.env[`ALEGRA_${env}_EMAIL`] || '').trim()
  const token = (process.env[`ALEGRA_${env}_TOKEN`] || '').trim()
  return { email, token, ok: !!(email && token) }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\./g, '').replace(/\s+/g, ' ').trim()
const PESOS_AR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pad = (n, largo) => String(n).padStart(largo, '0')

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

/* ------------------------------ Supabase --------------------------------- */

function headersServicio(cfg) {
  return { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' }
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

async function insertar(cfg, tabla, filas, { onConflict = null, devolver = false } = {}) {
  if (filas.length === 0) return []
  const qs = onConflict ? `?on_conflict=${onConflict}` : ''
  const prefer = [devolver ? 'return=representation' : 'return=minimal']
  if (onConflict) prefer.push('resolution=merge-duplicates')
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/${tabla}${qs}`, {
    method: 'POST',
    headers: { ...headersServicio(cfg), Prefer: prefer.join(',') },
    body: JSON.stringify(filas),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return devolver ? res.json() : []
}

async function actualizarComprobante(cfg, id, cambios) {
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/alegra_comprobantes?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...cambios, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`No se pudo guardar el comprobante: ${(await res.text()).slice(0, 200)}`)
}

/* ------------------------------ Alegra ----------------------------------- */

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

/** Lista completa paginada (30 por página), con las páginas en paralelo */
async function alegraTodo(cred, path, params = {}) {
  const pedirPagina = async (start, conMeta = false) => {
    const qs = new URLSearchParams({ ...params, start: String(start), limit: '30', ...(conMeta ? { metadata: 'true' } : {}) })
    const r = await alegra(cred, `${path}?${qs}`)
    if (!r.ok) throw new Error(errorAlegra(r))
    return r.data
  }
  const lista = (pg) => (Array.isArray(pg) ? pg : (pg?.data || []))
  const primera = await pedirPagina(0, true)
  const filas = [...lista(primera)]
  const total = Number(primera?.metadata?.total)
  if (Number.isFinite(total) && total > 30) {
    const starts = []
    for (let st = 30; st < total; st += 30) starts.push(st)
    for (let k = 0; k < starts.length; k += PARALELO_ALEGRA) {
      const paginas = await Promise.all(starts.slice(k, k + PARALELO_ALEGRA).map((st) => pedirPagina(st)))
      paginas.forEach((pg) => filas.push(...lista(pg)))
    }
  } else if (!Number.isFinite(total) && filas.length === 30) {
    for (let st = 30; st < 30000; st += 30) {
      const pg = lista(await pedirPagina(st))
      filas.push(...pg)
      if (pg.length < 30) break
    }
  }
  return filas
}

/** Número de comprobante sin ceros a la izquierda (como quedaron las facturas cargadas) */
const numeroSinCeros = (n) => String(n ?? '').replace(/\D/g, '').replace(/^0+/, '') || '0'
const claveFactura = (provId, numero) => `${provId}|${numeroSinCeros(numero)}`
/** Referencia con la que empieza la observación de la nota débito: "NC A 00003-00000123" */
const refNota = (letra, pv, nro) => `NC ${letra} ${pad(pv, 5)}-${pad(nro, 8)}`
const claveNota = (provId, ref) => `${provId}|${ref}`

function resumenFactura(b) {
  return {
    id: String(b.id),
    numero: b.numberTemplate?.number ?? b.numberTemplate?.fullNumber ?? '',
    fecha: b.date,
    total: redondear(b.total),
    saldo: redondear(b.balance),
    estado: b.status,
    provId: String(b.provider?.id ?? ''),
    cuentas: (b.purchases?.categories || []).map((c) => ({ id: String(c.id), nombre: c.name })).filter((c) => c.id),
  }
}

function resumenNota(d) {
  const obs = String(d.observations || '')
  return {
    id: String(d.id),
    numero: d.numberTemplate?.fullNumber || d.numberTemplate?.number || '',
    total: redondear(d.total),
    estado: d.status,
    provId: String(d.client?.id ?? ''),
    ref: obs.split(' | ')[0].trim(),
  }
}

const cacheAlegra = new Map() // empresa -> { en, datos }
const pendientesAlegra = new Map()

/**
 * Lo que hace falta de Alegra: plan de cuentas, impuestos IVA/EXENTO, proveedores
 * por CUIT, facturas de proveedor, notas débito y numeración de notas débito.
 */
async function leerBaseAlegra(empresa, cred) {
  const [rCat, rTax, rNum, contactos, bills, notas] = await Promise.all([
    alegra(cred, '/categories?format=plain'),
    alegra(cred, '/taxes'),
    alegra(cred, '/number-templates'),
    alegraTodo(cred, '/contacts', { type: 'provider', mode: 'simple' }),
    alegraTodo(cred, '/bills'),
    alegraTodo(cred, '/debit-notes'),
  ])
  if (!rCat.ok) throw new Error(errorAlegra(rCat))
  if (!rTax.ok) throw new Error(errorAlegra(rTax))

  const categorias = (Array.isArray(rCat.data) ? rCat.data : [])
    .filter((x) => x.status !== 'inactive' && x.use === 'movement')
    .map((x) => ({ id: String(x.id), nombre: x.name, tipo: x.type, codigo: x.code ? String(x.code) : null }))

  const ivaPorPct = new Map() // 21 -> id
  const pctPorTax = new Map() // id -> 21
  let exentoId = null
  for (const t of Array.isArray(rTax.data) ? rTax.data : []) {
    if ((t.status ?? 'active') !== 'active') continue
    const tipo = String(t.type || '').toUpperCase()
    if (tipo === 'IVA') {
      const pct = Number(t.percentage)
      if (!ivaPorPct.has(pct)) ivaPorPct.set(pct, String(t.id))
      pctPorTax.set(String(t.id), pct)
    }
    if (tipo === 'EXENTO' && !exentoId) {
      exentoId = String(t.id)
      pctPorTax.set(exentoId, 0)
    }
  }

  // Numeración de notas débito por letra ("Notas débito tipo A")
  const numeracionNota = {}
  const plantillas = Array.isArray(rNum.data) ? rNum.data : []
  for (const letra of ['A', 'C']) {
    const re = new RegExp(`\\btipo ${letra.toLowerCase()}\\b|\\b${letra.toLowerCase()}$`)
    const t = plantillas.find((p) => {
      const nombre = normalizar(p.name)
      const doc = normalizar(p.documentType)
      return (p.status ?? 'active') === 'active' && (doc.includes('debit') || /debito/.test(nombre)) && re.test(nombre)
    })
    if (t) numeracionNota[letra] = String(t.id)
    else if (empresa === '44dreams') numeracionNota[letra] = RESOLUCION_NOTA_44DREAMS[letra]
  }

  const porCuit = new Map()
  for (const c of contactos) {
    const cuit = soloDigitos(c.identificationObject?.number ?? c.identification)
    if (cuit && !porCuit.has(cuit)) porCuit.set(cuit, { id: String(c.id), nombre: c.name })
  }

  const facturas = new Map() // id -> resumen
  const facturaPorClave = new Map()
  const ultimaCuentaPorProv = new Map() // provId -> { id, nombre, fecha }
  for (const b of bills) {
    const f = resumenFactura(b)
    facturas.set(f.id, f)
    if (f.estado !== 'void') {
      facturaPorClave.set(claveFactura(f.provId, f.numero), f)
      const previa = ultimaCuentaPorProv.get(f.provId)
      if (f.cuentas[0] && (!previa || String(f.fecha) > String(previa.fecha))) {
        ultimaCuentaPorProv.set(f.provId, { ...f.cuentas[0], fecha: f.fecha })
      }
    }
  }
  const notasPorId = new Map()
  const notaPorClave = new Map()
  for (const d of notas) {
    const n = resumenNota(d)
    notasPorId.set(n.id, n)
    if (n.estado !== 'void' && n.ref) notaPorClave.set(claveNota(n.provId, n.ref), n)
  }

  const datos = {
    categorias, ivaPorPct, pctPorTax, exentoId, numeracionNota, porCuit,
    facturas, facturaPorClave, ultimaCuentaPorProv, notasPorId, notaPorClave,
  }
  cacheAlegra.set(empresa, { en: Date.now(), datos })
  return datos
}

/** Datos de Alegra con caché corta. forzar = leer de nuevo ("Revisar en Alegra"). */
async function datosAlegra(empresa, cred, { forzar = false } = {}) {
  const c = cacheAlegra.get(empresa)
  if (!forzar && c && Date.now() - c.en < CACHE_ALEGRA_MS) return c.datos
  if (pendientesAlegra.has(empresa)) return pendientesAlegra.get(empresa)
  const p = leerBaseAlegra(empresa, cred).finally(() => pendientesAlegra.delete(empresa))
  pendientesAlegra.set(empresa, p)
  return p
}

/* -------------------------------------------------------------------------- */
/* Excel de ARCA                                                              */
/* -------------------------------------------------------------------------- */

/** Encabezados de ARCA (normalizados) -> campo. Incluye los nombres del formato nuevo. */
const ALIAS = {
  fecha: ['fecha', 'fecha de emision'],
  tipo: ['tipo', 'tipo de comprobante'],
  pv: ['punto de venta'],
  numero: ['numero desde', 'numero'],
  cae: ['cod autorizacion', 'codigo de autorizacion', 'cae'],
  cuit: ['nro doc emisor', 'nro doc emisor/receptor', 'cuit emisor'],
  proveedor: ['denominacion emisor', 'denominacion emisor/receptor'],
  tipo_cambio: ['tipo cambio', 'tipo de cambio'],
  moneda: ['moneda'],
  neto_total: ['neto gravado total', 'imp neto gravado', 'imp neto gravado total'],
  no_gravado: ['neto no gravado', 'imp neto no gravado'],
  exentas: ['op exentas', 'imp op exentas'],
  otros_tributos: ['otros tributos', 'imp otros tributos'],
  iva_total: ['total iva', 'iva'],
  total: ['imp total', 'importe total'],
}
const ALICUOTAS = [21, 10.5, 27, 5, 2.5, 0]
const txtPct = (p) => String(p).replace('.', ',')
const ALIAS_NETO = Object.fromEntries(ALICUOTAS.map((p) => [p, [`neto grav iva ${txtPct(p)}%`, `imp neto gravado iva ${txtPct(p)}%`]]))
const ALIAS_IVA = Object.fromEntries(ALICUOTAS.filter((p) => p > 0).map((p) => [p, [`iva ${txtPct(p)}%`, `imp iva ${txtPct(p)}%`]]))

function num(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = String(v).trim().replace(/[$\s]/g, '')
  if (!s) return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Fecha del Excel (número de serie, Date ISO o 'DD/MM/AAAA') -> 'AAAA-MM-DD' */
function fechaIso(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (m) return `${m[3]}-${pad(m[2], 2)}-${pad(m[1], 2)}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function codigoTipo(v) {
  const s = String(v ?? '').trim()
  const m = /^(\d+)/.exec(s)
  if (m) return String(Number(m[1]))
  const n = normalizar(s)
  const porTexto = {
    'factura a': '1', 'factura b': '6', 'factura c': '11',
    'nota de credito a': '3', 'nota de credito b': '8', 'nota de credito c': '13',
    'nota de debito a': '2', 'nota de debito b': '7', 'nota de debito c': '12',
  }
  return porTexto[n] ?? (n || '?')
}

/**
 * Ubica las columnas a partir de los encabezados. La cuenta contable es la columna
 * cuyo encabezado dice "cuenta"; si no hay, la primera con encabezado a la derecha de "Imp. Total".
 */
function mapearColumnas(encabezados) {
  const norm = encabezados.map((h) => normalizar(h))
  const buscar = (alias) => norm.findIndex((h) => alias.includes(h))
  const col = {}
  for (const [campo, alias] of Object.entries(ALIAS)) col[campo] = buscar(alias)
  col.neto = {}
  col.iva = {}
  for (const p of ALICUOTAS) col.neto[p] = buscar(ALIAS_NETO[p])
  for (const p of ALICUOTAS.filter((x) => x > 0)) col.iva[p] = buscar(ALIAS_IVA[p])

  let cuenta = norm.findIndex((h) => h.includes('cuenta'))
  if (cuenta === -1 && col.total >= 0) cuenta = norm.findIndex((h, i) => i > col.total && h)
  col.cuenta = cuenta

  const faltan = ['fecha', 'tipo', 'pv', 'numero', 'cuit', 'proveedor', 'total'].filter((c) => col[c] < 0)
  return { col, faltan }
}

/** Una fila del Excel -> comprobante para la base */
function aComprobante(empresa, col, valores, fila, encabezados) {
  const v = (i) => (i >= 0 ? valores[i] : null)
  const tipoCod = codigoTipo(v(col.tipo))
  const esNc = TIPOS[tipoCod]?.clase === 'nc'
  const signo = (x) => (esNc ? Math.abs(x) : x)
  const netos = {}
  const ivas = {}
  for (const p of ALICUOTAS) {
    const n = redondear(signo(num(v(col.neto[p]))))
    if (n) netos[p] = n
  }
  for (const p of ALICUOTAS.filter((x) => x > 0)) {
    const n = redondear(signo(num(v(col.iva[p]))))
    if (n) ivas[p] = n
  }
  const raw = {}
  encabezados.forEach((h, i) => {
    if (h && valores[i] !== null && valores[i] !== undefined && valores[i] !== '') raw[h] = valores[i]
  })
  const netoTotal = col.neto_total >= 0
    ? redondear(signo(num(v(col.neto_total))))
    : redondear(Object.values(netos).reduce((s, x) => s + x, 0))
  const ivaTotal = col.iva_total >= 0
    ? redondear(signo(num(v(col.iva_total))))
    : redondear(Object.values(ivas).reduce((s, x) => s + x, 0))
  return {
    empresa,
    fila,
    fecha: fechaIso(v(col.fecha)),
    tipo_cod: tipoCod,
    tipo: String(v(col.tipo) ?? '').trim() || null,
    punto_venta: Math.trunc(num(v(col.pv))),
    numero: Math.trunc(num(v(col.numero))),
    cae: v(col.cae) !== null && v(col.cae) !== undefined ? String(v(col.cae)).trim() : null,
    cuit: soloDigitos(v(col.cuit)),
    proveedor: String(v(col.proveedor) ?? '').trim() || null,
    moneda: String(v(col.moneda) ?? '$').trim() || '$',
    tipo_cambio: num(v(col.tipo_cambio)) || 1,
    neto_gravado: netoTotal,
    iva: ivaTotal,
    no_gravado: redondear(signo(num(v(col.no_gravado)))),
    exentas: redondear(signo(num(v(col.exentas)))),
    otros_tributos: redondear(signo(num(v(col.otros_tributos)))),
    total: redondear(signo(num(v(col.total)))),
    raw: { ...raw, _netos: netos, _ivas: ivas },
    cuenta_excel: col.cuenta >= 0 && v(col.cuenta) !== null && v(col.cuenta) !== undefined
      ? String(v(col.cuenta)).trim() || null
      : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Validación y armado de lo que se crea en Alegra                            */
/* -------------------------------------------------------------------------- */

const esPesos = (m) => ['$', 'pes', 'ars', ''].includes(normalizar(m))

/** Cuenta contable de Alegra por nombre (sin acentos/mayúsculas) o por código */
function cuentaPorNombre(categorias, texto) {
  const n = normalizar(texto)
  if (!n) return null
  const orden = ['expense', 'cost', 'asset', 'liability', 'equity', 'income']
  const ordenar = (lista) => [...lista].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo))
  let c = ordenar(categorias.filter((x) => normalizar(x.nombre) === n))[0]
  if (c) return c
  c = categorias.find((x) => x.codigo && normalizar(x.codigo) === n)
  if (c) return c
  // "5214 - Otros gastos generales" / "Otros gastos generales (5214)"
  const sinCodigo = n.replace(/^\d+\s*[-–]\s*/, '').replace(/\s*\(\d+\)$/, '')
  if (sinCodigo !== n) return ordenar(categorias.filter((x) => normalizar(x.nombre) === sinCodigo))[0] ?? null
  return null
}

/**
 * Netos por alícuota. Si el Excel no trae el detalle por alícuota (formato nuevo de
 * ARCA) se deduce de neto gravado e IVA totales cuando corresponde a una sola alícuota.
 */
function netosPorAlicuota(c) {
  const netos = Object.fromEntries(Object.entries(c.raw?._netos || {}).map(([k, x]) => [Number(k), Number(x)]))
  if (Object.keys(netos).length > 0) return { netos, ivas: c.raw?._ivas || {} }
  const neto = Number(c.neto_gravado) || 0
  const iva = Number(c.iva) || 0
  if (!neto) return { netos: {}, ivas: {} }
  const pct = ALICUOTAS.find((p) => Math.abs(redondear(neto * p / 100) - iva) <= TOLERANCIA)
  if (pct === undefined) return null
  return { netos: { [pct]: neto }, ivas: pct > 0 ? { [pct]: iva } : {} }
}

/**
 * Líneas de la factura / nota (mismo criterio que alegra_carga.py) o el motivo
 * por el que no se puede cargar automáticamente.
 */
function armarLineas(c, alg, categoriaId) {
  const info = TIPOS[c.tipo_cod]
  const total = redondear(c.total)
  if (info.letra === 'C') {
    return { lineas: [{ id: categoriaId, price: total, quantity: 1, observations: 'Sin IVA discriminado' }] }
  }
  const det = netosPorAlicuota(c)
  if (!det) return { motivo: 'No se pudo deducir la alícuota de IVA (neto e IVA no cierran con ninguna)' }
  const lineas = []
  for (const p of ALICUOTAS) {
    const neto = Number(det.netos[p]) || 0
    if (!neto) continue
    const taxId = alg.ivaPorPct.get(p)
    if (!taxId) return { motivo: `No existe en Alegra el impuesto IVA ${txtPct(p)}%` }
    lineas.push({ id: categoriaId, price: redondear(neto), quantity: 1, tax: [{ id: taxId }], observations: `Neto gravado IVA ${txtPct(p)}%` })
  }
  if (c.exentas) {
    const l = { id: categoriaId, price: redondear(c.exentas), quantity: 1, observations: 'Op. Exentas' }
    if (alg.exentoId) l.tax = [{ id: alg.exentoId }]
    lineas.push(l)
  }
  const ivaArca = Object.values(det.ivas).reduce((s, x) => s + Number(x || 0), 0)
  const calc = redondear(lineas.reduce((s, l) => s + l.price, 0) + ivaArca)
  if (Math.abs(calc - total) > TOLERANCIA) {
    return { motivo: `El total recalculado ${PESOS_AR.format(calc)} no coincide con el de ARCA ${PESOS_AR.format(total)}` }
  }
  if (lineas.length === 0) return { motivo: 'El comprobante no tiene importes' }
  return { lineas }
}

/** Total que va a calcular Alegra con esas líneas */
function totalLineas(lineas, alg) {
  return redondear(lineas.reduce((s, l) => s + l.price + (l.tax || [])
    .reduce((t, x) => t + redondear(l.price * (alg.pctPorTax.get(String(x.id)) ?? 0) / 100), 0), 0))
}

/**
 * Qué falta para poder cargar el comprobante (null = listo).
 * Resuelve también la cuenta contable: la elegida a mano, la del Excel por nombre,
 * o (si la celda está vacía) la última usada para ese proveedor.
 */
function evaluar(c, alg, ultimaCuentaPorCuit) {
  const info = TIPOS[c.tipo_cod]
  const prov = alg.porCuit.get(c.cuit) || null
  let cuenta = null
  let origenCuenta = null
  if (c.alegra_categoria_id) {
    cuenta = alg.categorias.find((x) => x.id === String(c.alegra_categoria_id)) || null
    origenCuenta = cuenta ? 'elegida' : null
  }
  if (!cuenta && c.cuenta_excel) {
    cuenta = cuentaPorNombre(alg.categorias, c.cuenta_excel)
    origenCuenta = cuenta ? 'excel' : null
  }
  if (!cuenta && !c.cuenta_excel) {
    const ult = ultimaCuentaPorCuit.get(c.cuit) || (prov ? alg.ultimaCuentaPorProv.get(prov.id) : null)
    cuenta = ult ? alg.categorias.find((x) => x.id === String(ult.id)) || null : null
    origenCuenta = cuenta ? 'ultima' : null
  }

  let revisar = null
  if (!info) revisar = `${c.tipo || `Tipo ${c.tipo_cod}`}: desde acá solo se cargan facturas y notas de crédito A y C`
  else if (!c.fecha) revisar = 'Fecha inválida'
  else if (!c.cuit) revisar = 'Sin CUIT del emisor'
  else if (!esPesos(c.moneda)) revisar = `Moneda extranjera (${c.moneda}): cargar a mano`
  else if (c.otros_tributos) revisar = 'Tiene percepciones (Otros Tributos): cargar a mano'
  else if (c.no_gravado) revisar = 'Tiene neto no gravado: cargar a mano'
  else if (!cuenta) {
    revisar = c.cuenta_excel ? `No existe en Alegra la cuenta «${c.cuenta_excel}»` : 'Falta la cuenta contable'
  } else {
    const armado = armarLineas(c, alg, cuenta.id)
    if (armado.motivo) revisar = armado.motivo
    else if (info.clase === 'nc' && !alg.numeracionNota[info.letra]) {
      revisar = `No hay numeración de «Notas débito tipo ${info.letra}» en Alegra`
    }
  }
  return { revisar, cuenta, origenCuenta, prov }
}

/** Si el comprobante ya existe en Alegra: { tipo, doc } */
function existenteEnAlegra(c, alg, prov) {
  const info = TIPOS[c.tipo_cod]
  if (!info || !prov) return null
  if (info.clase === 'factura') {
    const f = alg.facturaPorClave.get(claveFactura(prov.id, c.numero))
    return f ? { tipo: 'bill', doc: f } : null
  }
  const n = alg.notaPorClave.get(claveNota(prov.id, refNota(info.letra, c.punto_venta, c.numero)))
  return n ? { tipo: 'debit-note', doc: n } : null
}

const nombreComprobante = (c) => {
  const info = TIPOS[c.tipo_cod]
  const clase = info?.clase === 'nc' ? 'NC' : 'Factura'
  return `${clase} ${info?.letra ?? ''} ${c.punto_venta}-${c.numero}`.replace(/\s+/g, ' ')
}

/* -------------------------------------------------------------------------- */
/* Autenticación y permisos                                                   */
/* -------------------------------------------------------------------------- */

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
      error: accion === 'edit' ? 'No tenés permiso de edición en este módulo' : 'No tenés acceso a este módulo',
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* -------------------------------------------------------------------------- */
/* Revisión contra Alegra                                                     */
/* -------------------------------------------------------------------------- */

const COLUMNAS = [
  'id', 'importacion_id', 'fila', 'fecha', 'tipo_cod', 'tipo', 'punto_venta', 'numero', 'cae', 'cuit', 'proveedor',
  'moneda', 'tipo_cambio', 'neto_gravado', 'iva', 'no_gravado', 'exentas', 'otros_tributos', 'total', 'raw',
  'cuenta_excel', 'alegra_categoria_id', 'alegra_categoria_nombre', 'estado', 'revisar', 'alegra_tipo', 'alegra_id',
  'alegra_numero', 'alegra_total', 'alegra_proveedor_id', 'proveedor_creado', 'alegra_factura_asociada',
  'alegra_detalle', 'alegra_error', 'cargado_en',
].join(',')

/** Última cuenta usada por CUIT en lo que ya cargó este módulo */
async function ultimaCuentaPorCuit(cfg, empresa) {
  const filas = await selectTodo(cfg,
    `alegra_comprobantes?empresa=eq.${empresa}&estado=eq.cargado&alegra_categoria_id=not.is.null` +
    '&select=cuit,alegra_categoria_id,cargado_en&order=cargado_en.desc.nullslast')
  const m = new Map()
  for (const f of filas) if (!m.has(f.cuit)) m.set(f.cuit, { id: f.alegra_categoria_id })
  return m
}

/** Cómo quedó en Alegra (texto para la tabla) */
function detalleExistente(c, ex) {
  const d = ex.doc
  const cuentas = ex.tipo === 'bill' ? [...new Set((d.cuentas || []).map((x) => x.nombre).filter(Boolean))].join(', ') : ''
  return [
    `Ya estaba en Alegra: ${ex.tipo === 'bill' ? 'factura de proveedor' : 'nota débito'} ${d.numero || d.id}`,
    cuentas,
    PESOS_AR.format(d.total),
  ].filter(Boolean).join(' · ')
}

/**
 * Revisa los comprobantes contra Alegra y guarda el estado.
 * - pendiente/error: si ya existe en Alegra -> cargado (vinculado); si no, listo o qué revisar.
 * - cargado: si lo borraron en Alegra -> pendiente.
 */
async function revisarComprobantes(ctx, empresa, comprobantes, alg) {
  const ultimas = await ultimaCuentaPorCuit(ctx.cfg, empresa)
  const resumen = { revisados: comprobantes.length, ya_estaban: 0, revertidos: 0, listos: 0, a_revisar: 0 }
  const cambios = []

  for (const c of comprobantes) {
    if (c.estado === 'ignorado') continue
    if (c.estado === 'cargado') {
      if (!c.alegra_id) continue
      const doc = c.alegra_tipo === 'debit-note' ? alg.notasPorId.get(String(c.alegra_id)) : alg.facturas.get(String(c.alegra_id))
      if (doc && doc.estado !== 'void') continue
      resumen.revertidos += 1
      Object.assign(c, {
        estado: 'pendiente', alegra_tipo: null, alegra_id: null, alegra_numero: null, alegra_total: null,
        alegra_factura_asociada: null, alegra_detalle: null,
        alegra_error: `Se eliminó o anuló en Alegra (${c.alegra_detalle || 'comprobante cargado'})`,
      })
    }

    const ev = evaluar(c, alg, ultimas)
    const ex = existenteEnAlegra(c, alg, ev.prov)
    if (ex) {
      resumen.ya_estaban += 1
      const primeraCuenta = ex.tipo === 'bill' ? ex.doc.cuentas?.[0] : null
      cambios.push({
        ...c,
        estado: 'cargado',
        revisar: null,
        alegra_tipo: ex.tipo,
        alegra_id: ex.doc.id,
        alegra_numero: ex.doc.numero || null,
        alegra_total: ex.doc.total,
        alegra_proveedor_id: ev.prov.id,
        alegra_categoria_id: primeraCuenta?.id ?? ev.cuenta?.id ?? c.alegra_categoria_id ?? null,
        alegra_categoria_nombre: primeraCuenta?.nombre ?? ev.cuenta?.nombre ?? c.alegra_categoria_nombre ?? null,
        alegra_detalle: detalleExistente(c, ex),
        alegra_error: null,
      })
      continue
    }
    if (ev.revisar) resumen.a_revisar += 1
    else resumen.listos += 1
    cambios.push({
      ...c,
      revisar: ev.revisar,
      alegra_proveedor_id: ev.prov?.id ?? null,
      alegra_categoria_id: ev.cuenta?.id ?? null,
      alegra_categoria_nombre: ev.cuenta
        ? `${ev.cuenta.nombre}${ev.origenCuenta === 'ultima' ? ' (la de la última vez)' : ''}`
        : null,
    })
  }

  await guardarEstados(ctx.cfg, empresa, cambios)
  return resumen
}

/** Guarda en bloque el estado de varios comprobantes (upsert por id) */
async function guardarEstados(cfg, empresa, filas) {
  const ahora = new Date().toISOString()
  const datos = filas.map((c) => ({
    id: c.id,
    empresa,
    cuit: c.cuit,
    tipo_cod: c.tipo_cod,
    punto_venta: c.punto_venta,
    numero: c.numero,
    estado: c.estado,
    revisar: c.revisar ?? null,
    alegra_tipo: c.alegra_tipo ?? null,
    alegra_id: c.alegra_id ?? null,
    alegra_numero: c.alegra_numero ?? null,
    alegra_total: c.alegra_total ?? null,
    alegra_proveedor_id: c.alegra_proveedor_id ?? null,
    alegra_categoria_id: c.alegra_categoria_id ?? null,
    alegra_categoria_nombre: c.alegra_categoria_nombre ?? null,
    alegra_factura_asociada: c.alegra_factura_asociada ?? null,
    alegra_detalle: c.alegra_detalle ?? null,
    alegra_error: c.alegra_error ?? null,
    updated_at: ahora,
  }))
  for (let i = 0; i < datos.length; i += 500) {
    await insertar(cfg, 'alegra_comprobantes', datos.slice(i, i + 500), { onConflict: 'id' })
  }
}

async function comprobantesDe(cfg, empresa, importacionId) {
  return selectTodo(cfg,
    `alegra_comprobantes?empresa=eq.${empresa}&importacion_id=eq.${importacionId}` +
    `&select=${COLUMNAS}&order=fecha.asc,fila.asc`)
}

/* -------------------------------------------------------------------------- */
/* Carga en Alegra                                                            */
/* -------------------------------------------------------------------------- */

async function crearProveedor(cred, c, alg) {
  const letra = TIPOS[c.tipo_cod]?.letra
  const body = {
    name: c.proveedor || `CUIT ${c.cuit}`,
    identificationObject: { type: 'CUIT', number: c.cuit },
    ivaCondition: letra === 'A' ? 'IVA_RESPONSABLE' : 'UNIQUE_TRIBUTE_RESPONSABLE',
    type: ['provider'],
    address: { ...DIR_PROVISORIA },
    observations: 'Creado por importación ARCA (Toshibase). Dirección provisoria: completar domicilio real.',
  }
  const r = await alegra(cred, '/contacts', { method: 'POST', body })
  if (!r.ok || !r.data?.id) throw new Error(`No se pudo crear el proveedor: ${errorAlegra(r)}`)
  const prov = { id: String(r.data.id), nombre: r.data.name || body.name }
  alg.porCuit.set(c.cuit, prov)
  return prov
}

/** Factura de proveedor: misma estructura que la carga de octubre */
function bodyFactura(c, lineas, provId) {
  const info = TIPOS[c.tipo_cod]
  const ref = `${pad(c.punto_venta, 5)}-${pad(c.numero, 8)}`
  return {
    date: c.fecha,
    dueDate: c.fecha,
    provider: { id: provId },
    numberTemplate: { number: String(c.numero) },
    observations: `Factura ${info.letra} ${ref} | CAE ${c.cae || '-'} | Importado de ARCA Mis Comprobantes Recibidos (Toshibase, fila ${c.fila ?? '-'})`,
    purchases: { categories: lineas },
  }
}

/** Factura del proveedor a la que se aplica la NC: misma empresa, mismo total, con saldo, una sola posible */
function facturaParaNota(c, alg, provId) {
  const total = redondear(c.total)
  const cands = [...alg.facturas.values()].filter((f) =>
    f.provId === provId && f.estado !== 'void' && f.saldo > 0 && Math.abs(f.total - total) <= TOLERANCIA)
  if (cands.length === 1) return { factura: cands[0] }
  return { motivo: cands.length > 1 ? 'varias facturas posibles' : 'ninguna factura abierta con ese total' }
}

async function crearNota(cred, alg, c, lineas, provId) {
  const info = TIPOS[c.tipo_cod]
  const ref = refNota(info.letra, c.punto_venta, c.numero)
  const body = {
    date: c.fecha,
    client: { id: provId },
    resolution: { id: alg.numeracionNota[info.letra] },
    categories: lineas,
  }
  let obs = `${ref} | CAE ${c.cae || '-'} | Importado de ARCA (Toshibase, fila ${c.fila ?? '-'})`
  const asoc = facturaParaNota(c, alg, provId)
  let facturaAsociada = null
  if (asoc.factura) {
    const monto = Math.min(totalLineas(lineas, alg), asoc.factura.saldo)
    body.bills = [{ id: asoc.factura.id, amount: redondear(monto) }]
    obs += ` | Aplicada a factura ${asoc.factura.numero}`
    facturaAsociada = asoc.factura
  }
  body.observations = obs

  let r = await alegra(cred, '/debit-notes', { method: 'POST', body })
  if (!r.ok && String(r.data?.code) === '13034') {
    // Numeración automática ocupada: siguiente número libre
    const usados = [...alg.notasPorId.values()]
      .map((n) => Number(String(n.numero).replace(/\D/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0)
    body.number = String((usados.length ? Math.max(...usados) : 0) + 1)
    r = await alegra(cred, '/debit-notes', { method: 'POST', body })
  }
  if (!r.ok || !r.data?.id) throw new Error(errorAlegra(r))
  return { doc: r.data, ref, facturaAsociada, motivoSinAsociar: asoc.motivo ?? null, monto: body.bills?.[0]?.amount ?? 0 }
}

const enCarga = new Set()

async function cargarUno(ctx, empresa, cred, alg, c) {
  if (c.estado !== 'pendiente' && c.estado !== 'error') return { ok: false, error: 'Ya no está pendiente' }
  const ultimas = await ultimaCuentaPorCuit(ctx.cfg, empresa)
  const ev = evaluar(c, alg, ultimas)
  let prov = ev.prov

  // ¿Ya existe? (cargado a mano o en otra carga): se vincula, no se crea
  const ex = existenteEnAlegra(c, alg, prov)
  if (ex) {
    await actualizarComprobante(ctx.cfg, c.id, {
      estado: 'cargado', revisar: null, alegra_tipo: ex.tipo, alegra_id: ex.doc.id,
      alegra_numero: ex.doc.numero || null, alegra_total: ex.doc.total, alegra_proveedor_id: prov.id,
      alegra_detalle: detalleExistente(c, ex), alegra_error: null,
    })
    return { ok: true, detalle: 'Ya estaba en Alegra' }
  }
  if (ev.revisar) {
    await actualizarComprobante(ctx.cfg, c.id, { revisar: ev.revisar })
    return { ok: false, error: ev.revisar }
  }

  const info = TIPOS[c.tipo_cod]
  const { lineas } = armarLineas(c, alg, ev.cuenta.id)
  const total = redondear(c.total)
  let provCreado = false
  try {
    if (!prov) {
      prov = await crearProveedor(cred, c, alg)
      provCreado = true
    }

    let cambios
    if (info.clase === 'factura') {
      const r = await alegra(cred, '/bills', { method: 'POST', body: bodyFactura(c, lineas, prov.id) })
      if (!r.ok || !r.data?.id) throw new Error(errorAlegra(r))
      const f = resumenFactura(r.data)
      if (!f.provId) f.provId = prov.id
      if (!f.numero) f.numero = String(c.numero)
      if (!f.cuentas.length) f.cuentas = [{ id: ev.cuenta.id, nombre: ev.cuenta.nombre }]
      alg.facturas.set(f.id, f)
      alg.facturaPorClave.set(claveFactura(prov.id, c.numero), f)
      const dif = Math.abs(f.total - total) > TOLERANCIA
      cambios = {
        alegra_tipo: 'bill',
        alegra_id: f.id,
        alegra_numero: f.numero,
        alegra_total: f.total,
        alegra_factura_asociada: null,
        alegra_detalle: [
          `Factura de proveedor ${f.numero}`,
          ev.cuenta.nombre,
          info.letra === 'A' ? `${lineas.length} línea${lineas.length > 1 ? 's' : ''} de IVA` : 'sin IVA (C)',
          PESOS_AR.format(f.total),
          dif ? `⚠ ARCA ${PESOS_AR.format(total)}` : '',
          provCreado ? 'proveedor creado' : '',
        ].filter(Boolean).join(' · '),
      }
    } else {
      const n = await crearNota(cred, alg, c, lineas, prov.id)
      const nr = resumenNota(n.doc)
      if (!nr.provId) nr.provId = prov.id
      nr.ref = n.ref
      alg.notasPorId.set(nr.id, nr)
      alg.notaPorClave.set(claveNota(prov.id, n.ref), nr)
      if (n.facturaAsociada) {
        n.facturaAsociada.saldo = redondear(n.facturaAsociada.saldo - n.monto)
      }
      const dif = Math.abs(nr.total - total) > TOLERANCIA
      cambios = {
        alegra_tipo: 'debit-note',
        alegra_id: nr.id,
        alegra_numero: nr.numero || null,
        alegra_total: nr.total,
        alegra_factura_asociada: n.facturaAsociada ? n.facturaAsociada.numero : null,
        alegra_detalle: [
          `Nota débito ${nr.numero || nr.id}`,
          ev.cuenta.nombre,
          n.facturaAsociada ? `aplicada a factura ${n.facturaAsociada.numero}` : `sin asociar (${n.motivoSinAsociar})`,
          PESOS_AR.format(nr.total),
          dif ? `⚠ ARCA ${PESOS_AR.format(total)}` : '',
          provCreado ? 'proveedor creado' : '',
        ].filter(Boolean).join(' · '),
      }
    }

    await actualizarComprobante(ctx.cfg, c.id, {
      ...cambios,
      estado: 'cargado',
      revisar: null,
      alegra_proveedor_id: prov.id,
      proveedor_creado: provCreado,
      alegra_categoria_id: ev.cuenta.id,
      alegra_categoria_nombre: ev.cuenta.nombre,
      alegra_error: null,
      cargado_por: ctx.userId,
      cargado_en: new Date().toISOString(),
    })
    return { ok: true, detalle: cambios.alegra_detalle, alegra_id: cambios.alegra_id }
  } catch (err) {
    await actualizarComprobante(ctx.cfg, c.id, {
      estado: 'error',
      alegra_error: String(err.message || err).slice(0, 500),
      alegra_proveedor_id: prov?.id ?? null,
      proveedor_creado: provCreado,
    })
    return { ok: false, error: err.message }
  }
}

/* -------------------------------------------------------------------------- */
/* Rutas                                                                      */
/* -------------------------------------------------------------------------- */

export const alegraRouter = express()
alegraRouter.use(express.json({ limit: '5mb' }))

function manejar(nombre, fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (error) {
      console.error(`[alegra/${nombre}]`, error.message)
      if (!res.headersSent) res.status(500).json({ error: error.message })
    }
  }
}

/** GET /api/alegra/:empresa/importaciones -> Excel subidos (el último primero) */
alegraRouter.get('/:empresa/importaciones', manejar('importaciones', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'view')
  if (!ctx) return
  const importaciones = await selectTodo(ctx.cfg,
    `alegra_importaciones?empresa=eq.${empresa}&select=id,archivo,comprobantes,columna_cuenta,desde,hasta,created_at` +
    '&order=created_at.desc')
  res.json({
    empresa,
    empresa_label: EMPRESAS[empresa].label,
    importaciones,
    puede_editar: ctx.puedeEditar,
    alegra_configurado: credAlegra(empresa).ok,
  })
}))

/** GET /api/alegra/:empresa/comprobantes?importacion=ID -> de la base (rápido) */
alegraRouter.get('/:empresa/comprobantes', manejar('comprobantes', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'view')
  if (!ctx) return
  const importacion = String(req.query.importacion || '')
  if (!UUID_RE.test(importacion)) return res.status(400).json({ error: 'Importación inválida' })
  const filas = await comprobantesDe(ctx.cfg, empresa, importacion)
  res.json({ filas: filas.map(({ raw, ...f }) => ({ ...f, netos: raw?._netos ?? {} })) })
}))

/** GET /api/alegra/:empresa/cuentas -> plan de cuentas de Alegra (para elegir a mano) */
alegraRouter.get('/:empresa/cuentas', manejar('cuentas', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'view')
  if (!ctx) return
  const cred = credAlegra(empresa)
  if (!cred.ok) return res.status(400).json({ error: `Falta el token de Alegra de ${EMPRESAS[empresa].label} en el .env del servidor` })
  const alg = await datosAlegra(empresa, cred)
  res.json({ categorias: alg.categorias.map(({ id, nombre, tipo }) => ({ id, nombre, tipo })) })
}))

/**
 * POST /api/alegra/:empresa/importar { archivo, encabezados: string[], filas: [{ fila, valores: [] }] }
 * Guarda los comprobantes del Excel y los revisa contra Alegra.
 */
alegraRouter.post('/:empresa/importar', manejar('importar', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'edit')
  if (!ctx) return
  const { archivo, encabezados, filas } = req.body || {}
  if (!Array.isArray(encabezados) || !Array.isArray(filas)) return res.status(400).json({ error: 'Excel inválido' })
  if (filas.length > MAX_FILAS_EXCEL) return res.status(400).json({ error: `El Excel tiene más de ${MAX_FILAS_EXCEL} filas` })

  const heads = encabezados.map((h) => String(h ?? '').trim())
  const { col, faltan } = mapearColumnas(heads)
  if (faltan.length > 0) {
    return res.status(400).json({
      error: `No parece el Excel de ARCA "Mis Comprobantes Recibidos": faltan las columnas ${faltan.join(', ')}`,
    })
  }

  // Un comprobante por clave (si el Excel lo repite, queda la última fila)
  const porClave = new Map()
  const omitidas = []
  for (const f of filas) {
    if (!Array.isArray(f?.valores)) continue
    const c = aComprobante(empresa, col, f.valores, Number(f.fila) || null, heads)
    if (!c.cuit || !c.numero) {
      if (f.valores.some((x, i) => i !== col.cuenta && x !== null && x !== '')) omitidas.push(f.fila)
      continue
    }
    porClave.set(`${c.cuit}|${c.tipo_cod}|${c.punto_venta}|${c.numero}`, c)
  }
  const comprobantes = [...porClave.values()]
  if (comprobantes.length === 0) return res.status(400).json({ error: 'El Excel no tiene comprobantes' })

  const fechas = comprobantes.map((c) => c.fecha).filter(Boolean).sort()
  const [imp] = await insertar(ctx.cfg, 'alegra_importaciones', [{
    empresa,
    archivo: String(archivo || 'Excel ARCA').slice(0, 200),
    comprobantes: comprobantes.length,
    columna_cuenta: col.cuenta >= 0 ? heads[col.cuenta] : null,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
    creado_por: ctx.userId,
  }], { devolver: true })

  // Los que ya existían: si están cargados/ignorados no se tocan sus datos de Alegra
  const cuits = [...new Set(comprobantes.map((c) => c.cuit))]
  const existentes = new Map()
  for (let i = 0; i < cuits.length; i += 100) {
    const lista = cuits.slice(i, i + 100).map((x) => `"${x}"`).join(',')
    const filasDb = await selectTodo(ctx.cfg,
      `alegra_comprobantes?empresa=eq.${empresa}&cuit=in.(${lista})&select=id,cuit,tipo_cod,punto_venta,numero,estado,cuenta_excel`)
    filasDb.forEach((x) => existentes.set(`${x.cuit}|${x.tipo_cod}|${x.punto_venta}|${x.numero}`, x))
  }

  const ahora = new Date().toISOString()
  const abiertos = []
  const cerrados = []
  let cuentaCambiada = 0
  for (const c of comprobantes) {
    const prev = existentes.get(`${c.cuit}|${c.tipo_cod}|${c.punto_venta}|${c.numero}`)
    if (prev && (prev.estado === 'cargado' || prev.estado === 'ignorado')) {
      cerrados.push({
        empresa, cuit: c.cuit, tipo_cod: c.tipo_cod, punto_venta: c.punto_venta, numero: c.numero,
        importacion_id: imp.id, fila: c.fila, raw: c.raw, cuenta_excel: c.cuenta_excel, updated_at: ahora,
      })
    } else {
      // Si cambió la cuenta del Excel se vuelve a resolver por nombre
      const reset = !prev || prev.cuenta_excel !== c.cuenta_excel
      if (prev && reset) cuentaCambiada += 1
      abiertos.push({
        ...c, importacion_id: imp.id, estado: prev?.estado ?? 'pendiente', updated_at: ahora,
        ...(reset ? { alegra_categoria_id: null, alegra_categoria_nombre: null } : {}),
      })
    }
  }
  // PostgREST pide las mismas columnas en todo el lote
  const conCuenta = abiertos.filter((x) => 'alegra_categoria_id' in x)
  const sinCuenta = abiertos.filter((x) => !('alegra_categoria_id' in x))
  const conflicto = 'empresa,cuit,tipo_cod,punto_venta,numero'
  for (const lote of [conCuenta, sinCuenta, cerrados]) {
    for (let i = 0; i < lote.length; i += 500) {
      await insertar(ctx.cfg, 'alegra_comprobantes', lote.slice(i, i + 500), { onConflict: conflicto })
    }
  }

  const resultado = {
    importacion_id: imp.id,
    comprobantes: comprobantes.length,
    nuevos: comprobantes.filter((c) => !existentes.has(`${c.cuit}|${c.tipo_cod}|${c.punto_venta}|${c.numero}`)).length,
    ya_cargados_antes: cerrados.length,
    cuenta_cambiada: cuentaCambiada,
    filas_omitidas: omitidas.length,
    columna_cuenta: col.cuenta >= 0 ? heads[col.cuenta] : null,
    revision: null,
    error_alegra: null,
  }

  const cred = credAlegra(empresa)
  if (cred.ok) {
    try {
      const alg = await datosAlegra(empresa, cred, { forzar: true })
      resultado.revision = await revisarComprobantes(ctx, empresa, await comprobantesDe(ctx.cfg, empresa, imp.id), alg)
    } catch (err) {
      resultado.error_alegra = err.message
    }
  }
  res.json(resultado)
}))

/** POST /api/alegra/:empresa/revisar { importacion_id } -> relee Alegra y actualiza estados */
alegraRouter.post('/:empresa/revisar', manejar('revisar', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'view')
  if (!ctx) return
  const importacion = String(req.body?.importacion_id || '')
  if (!UUID_RE.test(importacion)) return res.status(400).json({ error: 'Importación inválida' })
  const cred = credAlegra(empresa)
  if (!cred.ok) return res.status(400).json({ error: `Falta el token de Alegra de ${EMPRESAS[empresa].label} en el .env del servidor` })
  const alg = await datosAlegra(empresa, cred, { forzar: true })
  res.json(await revisarComprobantes(ctx, empresa, await comprobantesDe(ctx.cfg, empresa, importacion), alg))
}))

/** POST /api/alegra/:empresa/cuenta { id, categoria_id } -> cuenta elegida a mano */
alegraRouter.post('/:empresa/cuenta', manejar('cuenta', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'edit')
  if (!ctx) return
  const id = String(req.body?.id || '')
  const categoriaId = String(req.body?.categoria_id || '')
  if (!UUID_RE.test(id) || !categoriaId) return res.status(400).json({ error: 'Datos inválidos' })
  const cred = credAlegra(empresa)
  if (!cred.ok) return res.status(400).json({ error: 'Falta el token de Alegra' })
  const alg = await datosAlegra(empresa, cred)
  const cuenta = alg.categorias.find((x) => x.id === categoriaId)
  if (!cuenta) return res.status(400).json({ error: 'La cuenta no existe en Alegra' })
  const [c] = await selectTodo(ctx.cfg, `alegra_comprobantes?id=eq.${id}&empresa=eq.${empresa}&select=${COLUMNAS}`)
  if (!c) return res.status(404).json({ error: 'Comprobante no encontrado' })
  if (c.estado === 'cargado') return res.status(400).json({ error: 'Ya está cargado en Alegra: cambiá la cuenta allá' })
  c.alegra_categoria_id = cuenta.id
  const ev = evaluar(c, alg, new Map())
  await actualizarComprobante(ctx.cfg, id, {
    alegra_categoria_id: cuenta.id, alegra_categoria_nombre: cuenta.nombre, revisar: ev.revisar,
  })
  res.json({ ok: true, revisar: ev.revisar, cuenta: { id: cuenta.id, nombre: cuenta.nombre } })
}))

/** POST /api/alegra/:empresa/marcar { id, accion: 'ignorar' | 'pendiente' } */
alegraRouter.post('/:empresa/marcar', manejar('marcar', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'edit')
  if (!ctx) return
  const id = String(req.body?.id || '')
  const accion = String(req.body?.accion || '')
  if (!UUID_RE.test(id) || !['ignorar', 'pendiente'].includes(accion)) return res.status(400).json({ error: 'Datos inválidos' })
  const [c] = await selectTodo(ctx.cfg, `alegra_comprobantes?id=eq.${id}&empresa=eq.${empresa}&select=id,estado`)
  if (!c) return res.status(404).json({ error: 'Comprobante no encontrado' })
  if (c.estado === 'cargado') return res.status(400).json({ error: 'Ya está cargado en Alegra' })
  await actualizarComprobante(ctx.cfg, id, { estado: accion === 'ignorar' ? 'ignorado' : 'pendiente', alegra_error: null })
  res.json({ ok: true })
}))

/** POST /api/alegra/:empresa/cargar { ids: [] } -> crea en Alegra (hasta MAX_POR_LOTE por llamada) */
alegraRouter.post('/:empresa/cargar', manejar('cargar', async (req, res) => {
  const empresa = leerEmpresa(req, res)
  if (!empresa) return
  const ctx = await requireUsuario(req, res, empresa, 'edit')
  if (!ctx) return
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter((x) => UUID_RE.test(x)) : []
  if (ids.length === 0) return res.status(400).json({ error: 'No hay comprobantes para cargar' })
  if (ids.length > MAX_POR_LOTE) return res.status(400).json({ error: `Máximo ${MAX_POR_LOTE} por vez` })
  const cred = credAlegra(empresa)
  if (!cred.ok) return res.status(400).json({ error: `Falta el token de Alegra de ${EMPRESAS[empresa].label} en el .env del servidor` })

  const filas = await selectTodo(ctx.cfg,
    `alegra_comprobantes?empresa=eq.${empresa}&id=in.(${ids.join(',')})&select=${COLUMNAS}&order=fecha.asc,fila.asc`)
  // Facturas primero: así las notas de crédito encuentran la factura a la que aplicarse
  filas.sort((a, b) => (TIPOS[a.tipo_cod]?.clase === 'nc') - (TIPOS[b.tipo_cod]?.clase === 'nc'))
  const alg = await datosAlegra(empresa, cred)

  const resultados = []
  for (const c of filas) {
    if (enCarga.has(c.id)) {
      resultados.push({ id: c.id, ok: false, error: 'Se está cargando en otra ventana' })
      continue
    }
    enCarga.add(c.id)
    try {
      resultados.push({ id: c.id, ...(await cargarUno(ctx, empresa, cred, alg, c)) })
    } finally {
      enCarga.delete(c.id)
    }
    await esperar(300)
  }
  res.json({
    cargados: resultados.filter((r) => r.ok).length,
    errores: resultados.filter((r) => !r.ok).length,
    resultados,
  })
}))

// Exportado para pruebas
export const _internos = { mapearColumnas, aComprobante, evaluar, armarLineas, cuentaPorNombre, fechaIso, num, codigoTipo, totalLineas, facturaParaNota, existenteEnAlegra, netosPorAlicuota }
