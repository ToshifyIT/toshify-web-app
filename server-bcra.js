/**
 * Consulta automática de leads en la Central de Deudores del BCRA.
 *
 * Cada 5 minutos busca los leads con CUIT que todavía no se consultaron
 * (bcra_consultado_at vacío, creados desde CONSULTAR_DESDE) y le pregunta al
 * BCRA su situación actual y si tiene cheques rechazados. Guarda el resultado
 * en las columnas bcra_* de leads (sql/leads_bcra_consulta.sql).
 *
 * La API del BCRA es pública (sin clave):
 *   GET https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/{cuit}
 *   GET https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/{cuit}
 * Un 404 quiere decir que no hay nada informado para ese CUIT. Los montos vienen
 * en miles de pesos.
 *
 * Variables (ya existen): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * BCRA_CONSULTA_AUTO=0 la apaga. La arranca server.js (producción); el dev server
 * de vite no, para no duplicar las consultas.
 */

const BCRA_API = 'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas'
const TIMEOUT_MS = 20000
const CADA_MIN = 5
const MAX_POR_TURNO = 25
const PAUSA_ENTRE_CONSULTAS_MS = 1500
const MAX_INTENTOS = 5
// Solo leads nuevos: los creados antes de esta fecha no se consultan solos
const CONSULTAR_DESDE = '2026-11-20T00:00:00-03:00'
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

const SITUACIONES = {
  0: 'sin deudas',
  1: 'normal',
  2: 'riesgo bajo',
  3: 'riesgo medio',
  4: 'riesgo alto',
  5: 'irrecuperable',
  6: 'irrecuperable por disposición técnica',
}

function config() {
  return {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

function headersServicio(cfg) {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
  }
}

async function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/** Deja solo los dígitos y valida el dígito verificador. Devuelve null si no es válido. */
export function normalizarCuit(valor) {
  const cuit = String(valor ?? '').replace(/\D/g, '')
  if (cuit.length !== 11) return null
  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto
  if (verificador === 10 || verificador !== Number(cuit[10])) return null
  return cuit
}

const formatoPesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** GET al BCRA. 404 = sin datos. Devuelve { ok, data } o tira error si es de red o del servidor. */
async function getBcra(ruta) {
  const res = await fetchConTimeout(`${BCRA_API}/${ruta}`, { headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`BCRA respondió ${res.status}`)
  const json = await res.json()
  return json?.results ?? null
}

/** Consulta deudas actuales y cheques rechazados de un CUIT ya validado. */
export async function consultarBcra(cuit) {
  const deudas = await getBcra(cuit)
  await esperar(300)
  const cheques = await getBcra(`ChequesRechazados/${cuit}`)

  // El BCRA devuelve un período (el último informado) con una fila por entidad
  const periodo = deudas?.periodos?.[0] ?? null
  const entidades = (periodo?.entidades ?? []).map((e) => ({
    entidad: e.entidad,
    situacion: Number(e.situacion) || 0,
    monto: (Number(e.monto) || 0) * 1000,
    dias_atraso: e.diasAtrasoPago ?? null,
    proceso_judicial: Boolean(e.procesoJud),
    en_revision: Boolean(e.enRevision),
  }))

  let cantCheques = 0
  for (const causal of cheques?.causales ?? []) {
    for (const entidad of causal.entidades ?? []) cantCheques += (entidad.detalle ?? []).length
  }

  const situacion = entidades.reduce((max, e) => Math.max(max, e.situacion), 0)
  const total = entidades.reduce((acc, e) => acc + e.monto, 0)
  const judicial = entidades.some((e) => e.proceso_judicial)

  let resumen
  if (entidades.length === 0) {
    resumen = 'Sin deudas informadas'
  } else {
    const n = entidades.length
    resumen = `Situación ${situacion} (${SITUACIONES[situacion] ?? '?'}) - ${formatoPesos(total)} ` +
      `en ${n} ${n === 1 ? 'entidad' : 'entidades'}`
  }
  if (judicial) resumen += ' - con proceso judicial'
  if (cantCheques > 0) resumen += ` - ${cantCheques} cheque${cantCheques === 1 ? '' : 's'} rechazado${cantCheques === 1 ? '' : 's'}`

  return {
    nombre: deudas?.denominacion ?? cheques?.denominacion ?? null,
    periodo: periodo?.periodo ?? null,
    situacion,
    total,
    cantCheques,
    entidades,
    resumen,
  }
}

async function leadsPendientes(cfg) {
  const q = new URLSearchParams({
    select: 'id,cuit,bcra,bcra_resumen,bcra_intentos',
    bcra_consultado_at: 'is.null',
    cuit: 'not.is.null',
    created_at: `gte.${CONSULTAR_DESDE}`,
    order: 'created_at.asc',
    limit: String(MAX_POR_TURNO),
  })
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/leads?${q}`, { headers: headersServicio(cfg) })
  if (!res.ok) throw new Error(`Supabase leads ${res.status}: ${await res.text()}`)
  return res.json()
}

async function actualizarLead(cfg, id, cambios) {
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/leads?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  })
  if (!res.ok) throw new Error(`Supabase PATCH lead ${res.status}: ${await res.text()}`)
}

/** Consulta un lead y guarda el resultado (o el error). Devuelve 'ok' | 'invalido' | 'reintentar'. */
async function procesarLead(cfg, lead) {
  const ahora = new Date().toISOString()
  const cuit = normalizarCuit(lead.cuit)
  if (!cuit) {
    await actualizarLead(cfg, lead.id, { bcra_consultado_at: ahora, bcra_error: 'CUIT inválido' })
    return 'invalido'
  }
  try {
    const r = await consultarBcra(cuit)
    const cambios = {
      bcra_consultado_at: ahora,
      bcra_situacion: r.situacion,
      bcra_deuda_total: r.total,
      bcra_cheques: r.cantCheques,
      bcra_nombre: r.nombre,
      bcra_resumen: r.resumen,
      bcra_detalle: { periodo: r.periodo, entidades: r.entidades },
      bcra_error: null,
      bcra_intentos: 0,
    }
    // El texto `bcra` se completa solo si está vacío o tenía el resumen automático anterior
    const textoActual = (lead.bcra ?? '').trim()
    if (!textoActual || textoActual === (lead.bcra_resumen ?? '').trim()) cambios.bcra = r.resumen
    await actualizarLead(cfg, lead.id, cambios)
    return 'ok'
  } catch (err) {
    const intentos = (lead.bcra_intentos ?? 0) + 1
    const cambios = { bcra_intentos: intentos, bcra_error: err.message }
    if (intentos >= MAX_INTENTOS) cambios.bcra_consultado_at = ahora
    await actualizarLead(cfg, lead.id, cambios)
    return 'reintentar'
  }
}

/** Procesa un lote de pendientes. Devuelve los contadores. */
export async function consultarPendientes(cfg = config()) {
  const leads = await leadsPendientes(cfg)
  const r = { revisados: leads.length, ok: 0, invalidos: 0, fallidos: 0 }
  for (const lead of leads) {
    const estado = await procesarLead(cfg, lead)
    if (estado === 'ok') r.ok += 1
    else if (estado === 'invalido') r.invalidos += 1
    else r.fallidos += 1
    await esperar(PAUSA_ENTRE_CONSULTAS_MS)
  }
  return r
}

/** Cada 5 minutos (:00, :05, :10..., hora Argentina) consulta los leads pendientes. */
export function iniciarConsultaAutomaticaBcra() {
  if (process.env.BCRA_CONSULTA_AUTO === '0') {
    console.log('[bcra] Consulta automática apagada (BCRA_CONSULTA_AUTO=0)')
    return
  }
  if (globalThis.__bcraConsultaAuto) return
  globalThis.__bcraConsultaAuto = true
  let ultimoTurno = null
  let corriendo = false
  const revisar = async () => {
    if (corriendo) return
    const art = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const minuto = art.getUTCMinutes()
    if (minuto % CADA_MIN > 2) return
    const turnoMin = String(minuto - (minuto % CADA_MIN)).padStart(2, '0')
    const clave = `${art.toISOString().slice(0, 10)} ${String(art.getUTCHours()).padStart(2, '0')}:${turnoMin}`
    if (ultimoTurno === clave) return
    ultimoTurno = clave
    const cfg = config()
    if (!cfg.url || !cfg.serviceKey) return
    corriendo = true
    try {
      const r = await consultarPendientes(cfg)
      if (r.revisados > 0) {
        console.log(`[bcra] ${clave} ART: ${r.ok} consultados, ${r.invalidos} CUIT inválidos, ${r.fallidos} con error`)
      }
    } catch (err) {
      console.error(`[bcra] ${clave} ART falló:`, err.message)
    } finally {
      corriendo = false
    }
  }
  setInterval(() => { void revisar() }, 60 * 1000).unref?.()
  console.log(`[bcra] Consulta automática activa: leads nuevos con CUIT, cada ${CADA_MIN} minutos`)
}
