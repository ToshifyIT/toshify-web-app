/**
 * Consulta automática de leads en la Central de Deudores del BCRA.
 *
 * Cada 5 minutos busca los leads con CUIT o DNI que todavía no se consultaron
 * (bcra_consultado_at vacío), los más nuevos primero, y le pregunta al
 * BCRA su situación actual y si tiene cheques rechazados. Guarda el resultado
 * en las columnas bcra_* de leads (sql/leads_bcra_consulta.sql).
 *
 * Sin CUIT, arma el CUIL desde el DNI (prefijos 20, 27, 23, 24). Doble validación:
 * el nombre que devuelve el BCRA tiene que coincidir con el del lead (con CUIT
 * cargado o armado). Si no coincide, la consulta no se acepta y queda el error
 * para revisar.
 *
 * Nombre mal cargado (2026-11-25): si el apellido del BCRA aparece en el nombre o en
 * el mail del lead (p. ej. "Lucas beltranlucaseloy@gmail com" -> BELTRAN LUCAS ELOY),
 * es la misma persona: se acepta la consulta y se corrige el nombre del lead con el
 * del BCRA. Si ni el apellido coincide, el DNI es de otra persona y queda sin validar.
 * Con la consulta validada, el CUIL se guarda como CUIT del lead si estaba vacío o
 * era inválido (un CUIT inválido ya no frena la consulta: se usa el DNI). Cada
 * corrección queda en la bitácora de Observaciones.
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
 *
 * Conductores (sql/conductores_bcra.sql): en la misma vuelta, después de los leads, se
 * consultan los conductores ACTIVOS sin consulta o con la última de hace más de 30 días
 * (el BCRA informa una vez por mes). Se ven en Seguimiento de conductores.
 *
 * Además, POST /api/bcra/consultar/:id consulta un lead en el momento (la ficha lo
 * llama al guardar un lead con DNI o CUIT nuevo o cambiado). La vuelta de 5 minutos
 * queda de respaldo para los que entran por otro lado o si el BCRA corta.
 */

import express from 'express'

const BCRA_API = 'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas'
const TIMEOUT_MS = 20000
const CADA_MIN = 5
// El BCRA corta con 429 si se le pregunta muy seguido: pocos leads por turno y con pausa
const MAX_POR_TURNO = 15
const PAUSA_ENTRE_CONSULTAS_MS = 2000
const MAX_INTENTOS = 5
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
// Prefijos del CUIL a probar desde el DNI: hombre, mujer y los de desempate
const PREFIJOS_CUIL = ['20', '27', '23', '24']
// Palabras que no cuentan para comparar nombres
const PALABRAS_IGNORADAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DI', 'VON', 'VAN'])

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

/** CUIL armado con el prefijo y el DNI, o null si ese prefijo no da un verificador válido. */
export function cuilDesdeDni(prefijo, dni) {
  const digitos = String(dni ?? '').replace(/\D/g, '')
  if (digitos.length < 7 || digitos.length > 8) return null
  const base = prefijo + digitos.padStart(8, '0')
  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(base[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto
  return verificador === 10 ? null : base + verificador
}

/** El BCRA manda la Ñ como "¨" (FANDI¨O). */
function limpiarNombreBcra(nombre) {
  return nombre ? String(nombre).replace(/¨/g, 'Ñ').replace(/\s+/g, ' ').trim() : nombre
}

function palabrasNombre(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= 2 && !PALABRAS_IGNORADAS.has(p))
}

/** Distancia de edición, cortada en 2 (solo interesa si es 0 o 1). */
function distanciaCorta(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const nueva = [i]
    for (let j = 1; j <= b.length; j += 1) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    fila = nueva
  }
  return Math.min(fila[b.length], 2)
}

/**
 * Nombre del lead contra el del BCRA ("APELLIDO NOMBRES"). Sin importar tildes ni
 * orden: tienen que coincidir al menos 2 palabras (o la única que tenga el lead).
 * Palabras de 5 letras o más aceptan una letra de diferencia (Mercedez / Mercedes).
 */
export function nombresCoinciden(nombresLead, nombreBcra) {
  const lead = new Set(nombresLead.flatMap(palabrasNombre))
  const bcra = palabrasNombre(nombreBcra)
  if (lead.size === 0 || bcra.length === 0) return false
  let iguales = 0
  for (const p of lead) {
    if (bcra.some((b) => b === p || (p.length >= 5 && b.length >= 5 && distanciaCorta(p, b) <= 1))) iguales += 1
  }
  return iguales >= Math.min(2, lead.size)
}

/** Todo el texto del lead (nombres y usuario del mail) en mayúsculas, sin espacios ni tildes. */
function textoPegado(...textos) {
  return textos.flatMap(palabrasNombre).join('')
}

/**
 * El nombre no coincide, pero el apellido del BCRA (la primera palabra, de 3 letras o
 * más) aparece en el nombre o en el mail del lead: es la misma persona con el nombre
 * mal cargado. Si ni el apellido aparece, el DNI es de otra persona.
 */
export function mismaPersonaProbable(lead, nombreBcra) {
  const apellido = palabrasNombre(nombreBcra)[0]
  if (!apellido || apellido.length < 3) return false
  const usuarioMail = String(lead.email ?? '').split('@')[0]
  const texto = textoPegado(lead.nombre_completo, lead.nombre_completo_2, lead.primer_nombre, lead.apellido, usuarioMail)
  return texto.includes(apellido)
}

const titulo = (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()

/**
 * "BELTRAN LUCAS ELOY" -> { primer_nombre: 'Lucas Eloy', apellido: 'Beltran' }.
 * El BCRA no separa apellido y nombres: el apellido es la primera palabra y las que
 * siguen mientras estén en el apellido que cargó el lead y no en su nombre
 * (PRIETO CANE RODRIGO con "PrietoCane"). Siempre queda al menos un nombre.
 */
export function separarNombreBcra(nombreBcra, lead) {
  const palabras = String(nombreBcra).split(' ').filter(Boolean)
  const enApellido = textoPegado(lead.apellido)
  const enNombre = textoPegado(lead.primer_nombre)
  let corte = 1
  while (corte < palabras.length - 1) {
    const p = palabrasNombre(palabras[corte])[0]
    if (!p || !enApellido.includes(p) || enNombre.includes(p)) break
    corte += 1
  }
  const apellido = palabras.slice(0, corte).map(titulo).join(' ')
  const nombres = palabras.slice(corte).map(titulo).join(' ')
  return { primer_nombre: nombres, apellido, nombre_completo: `${nombres} ${apellido}`.trim() }
}

/** Línea de bitácora para Observaciones, mismo formato que las del sistema. */
function lineaBitacora(texto) {
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '')
  return `[${ahora} · BCRA] ${texto}`
}

const formatoPesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** GET al BCRA. 404 = sin datos. Devuelve { ok, data } o tira error si es de red o del servidor. */
async function getBcra(ruta) {
  const res = await fetchConTimeout(`${BCRA_API}/${ruta}`, { headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  if (res.status === 429) {
    const err = new Error('El BCRA limitó las consultas (429)')
    err.limite = true
    throw err
  }
  if (!res.ok) throw new Error(`BCRA respondió ${res.status}`)
  const json = await res.json()
  return json?.results ?? null
}

/**
 * Consulta deudas actuales y cheques rechazados de un CUIT ya validado.
 * `deudasPrevias`: respuesta de deudas ya pedida (para no repetir la llamada).
 */
export async function consultarBcra(cuit, deudasPrevias) {
  const deudas = deudasPrevias === undefined ? await getBcra(cuit) : deudasPrevias
  await esperar(500)
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
    nombre: limpiarNombreBcra(deudas?.denominacion ?? cheques?.denominacion ?? null),
    periodo: periodo?.periodo ?? null,
    situacion,
    total,
    cantCheques,
    entidades,
    resumen,
  }
}

const COLUMNAS_CONSULTA = 'id,cuit,dni,nombre_completo,nombre_completo_2,primer_nombre,apellido,email,observaciones,' +
  'bcra,bcra_resumen,bcra_intentos'

// Leads que se están consultando ahora (al instante o en la vuelta): no se consultan dos veces
const enCurso = new Set()

async function leadsPendientes(cfg) {
  const q = new URLSearchParams({
    select: COLUMNAS_CONSULTA,
    bcra_consultado_at: 'is.null',
    or: '(cuit.not.is.null,dni.not.is.null)',
    // Los más nuevos primero: los que entran hoy no esperan a que terminen los viejos
    order: 'created_at.desc',
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

// ---------- Conductores ----------
const ESTADO_CONDUCTOR_ACTIVO = 'ACTIVO'
const DIAS_VIGENCIA_CONDUCTOR = 30
const COLUMNAS_CONDUCTOR = 'id,numero_cuit,numero_dni,nombres,apellidos,bcra_intentos,conductores_estados!inner(codigo)'

/** Conductores activos sin consulta o con una de hace más de 30 días (los sin consulta primero). */
async function conductoresPendientes(cfg, limite) {
  const vence = new Date(Date.now() - DIAS_VIGENCIA_CONDUCTOR * 24 * 60 * 60 * 1000).toISOString()
  const q = new URLSearchParams({
    select: COLUMNAS_CONDUCTOR,
    'conductores_estados.codigo': `eq.${ESTADO_CONDUCTOR_ACTIVO}`,
    or: `(bcra_consultado_at.is.null,bcra_consultado_at.lt.${vence})`,
    order: 'bcra_consultado_at.asc.nullsfirst',
    limit: String(limite),
  })
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/conductores?${q}`, { headers: headersServicio(cfg) })
  if (!res.ok) throw new Error(`Supabase conductores ${res.status}: ${await res.text()}`)
  const filas = await res.json()
  // Mismo formato que un lead para buscarEnBcra. Un CUIT mal cargado (p. ej. con un dígito
  // de más) no frena la consulta: se arma el CUIL desde el DNI.
  return filas
    .filter((c) => String(c.numero_cuit ?? '').trim() || String(c.numero_dni ?? '').trim())
    .map((c) => ({
      id: c.id,
      cuit: normalizarCuit(c.numero_cuit) ? c.numero_cuit : null,
      dni: c.numero_dni,
      nombre_completo: `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim(),
      bcra_intentos: c.bcra_intentos,
    }))
}

async function actualizarConductor(cfg, id, cambios) {
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/conductores?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headersServicio(cfg), Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  })
  if (!res.ok) throw new Error(`Supabase PATCH conductor ${res.status}: ${await res.text()}`)
}

/**
 * Busca el resultado del BCRA para el lead: con el CUIT cargado o, si no hay, con el
 * CUIL armado desde el DNI. Devuelve { resultado, cuil, origen, corregirNombre } o { error }.
 * `corregirNombre`: el nombre del BCRA, cuando es la misma persona con el nombre mal cargado.
 */
async function buscarEnBcra(lead) {
  const nombres = [lead.nombre_completo, lead.nombre_completo_2, lead.primer_nombre, lead.apellido]
  if (nombres.flatMap(palabrasNombre).length === 0) return { error: 'Falta el nombre del lead para validar' }

  const tieneCuit = String(lead.cuit ?? '').trim() !== ''
  const cuitValido = tieneCuit ? normalizarCuit(lead.cuit) : null
  // CUIT inválido: sin DNI no hay con qué consultar; con DNI se sigue por el DNI
  if (tieneCuit && !cuitValido && !String(lead.dni ?? '').trim()) return { error: 'CUIT inválido' }
  if (cuitValido) {
    const cuit = cuitValido
    const r = await consultarBcra(cuit)
    // Sin nada informado no hay nombre para comparar: el CUIT es el del lead
    if (r.nombre && !nombresCoinciden(nombres, r.nombre)) {
      if (mismaPersonaProbable(lead, r.nombre)) {
        return { resultado: r, cuil: cuit, origen: 'cuit', corregirNombre: r.nombre }
      }
      return { error: `El nombre en el BCRA (${r.nombre}) no coincide con el del lead`, nombre: r.nombre, cuil: cuit }
    }
    return { resultado: r, cuil: cuit, origen: 'cuit' }
  }

  // Sin CUIT: se prueba el CUIL con cada prefijo hasta que el nombre coincida
  let otroNombre = null
  let probable = null
  for (const prefijo of PREFIJOS_CUIL) {
    const cuil = cuilDesdeDni(prefijo, lead.dni)
    if (!cuil) continue
    // Primero solo las deudas (trae el nombre); los cheques, cuando el nombre coincide
    const deudas = await getBcra(cuil)
    const nombre = limpiarNombreBcra(deudas?.denominacion ?? null)
    if (nombre && nombresCoinciden(nombres, nombre)) {
      return { resultado: await consultarBcra(cuil, deudas), cuil, origen: 'dni' }
    }
    if (nombre && !probable && mismaPersonaProbable(lead, nombre)) probable = { nombre, cuil, deudas }
    if (nombre && !otroNombre) otroNombre = { nombre, cuil }
    await esperar(500)
  }
  if (probable) {
    return {
      resultado: await consultarBcra(probable.cuil, probable.deudas),
      cuil: probable.cuil,
      origen: 'dni',
      corregirNombre: probable.nombre,
    }
  }
  if (otroNombre) {
    return {
      error: `Con el DNI aparece ${otroNombre.nombre} (CUIL ${otroNombre.cuil}), que no coincide con el lead`,
      nombre: otroNombre.nombre,
      cuil: otroNombre.cuil,
    }
  }
  if (!cuilDesdeDni('20', lead.dni) && !cuilDesdeDni('27', lead.dni)) return { error: 'DNI inválido' }
  // Ningún CUIL posible tiene nada informado: sin deudas
  return {
    resultado: { nombre: null, periodo: null, situacion: 0, total: 0, cantCheques: 0, entidades: [], resumen: 'Sin deudas informadas' },
    cuil: null,
    origen: 'dni',
  }
}

/**
 * Con la consulta validada: nombre del BCRA si el del lead estaba mal cargado, y el CUIL
 * como CUIT si estaba vacío o era inválido. Cada cambio deja una línea en Observaciones.
 */
function correccionesLead(lead, b) {
  const cambios = {}
  const lineas = []
  if (b.corregirNombre) {
    const antes = [lead.primer_nombre, lead.apellido].filter(Boolean).join(' ') || lead.nombre_completo || ''
    Object.assign(cambios, separarNombreBcra(b.corregirNombre, lead))
    lineas.push(`Nombre corregido según el BCRA: ${cambios.nombre_completo} (antes: ${antes.trim()})`)
  }
  const cuitActual = String(lead.cuit ?? '').trim()
  if (b.cuil && !normalizarCuit(cuitActual)) {
    cambios.cuit = b.cuil
    // Completar uno vacío no va a la bitácora; corregir uno mal cargado sí
    if (cuitActual) lineas.push(`CUIT corregido según el BCRA: ${b.cuil} (antes: ${cuitActual})`)
  }
  if (lineas.length) {
    const nuevas = lineas.map(lineaBitacora).join('\n')
    const previas = String(lead.observaciones ?? '').trim()
    cambios.observaciones = previas ? `${previas}\n${nuevas}` : nuevas
  }
  return cambios
}

/**
 * Consulta un lead y guarda el resultado (o el error).
 * Devuelve 'ok' | 'invalido' | 'reintentar' | 'limite' (el BCRA cortó: no cuenta como intento).
 */
async function procesarLead(cfg, lead, tabla = 'leads') {
  const ahora = new Date().toISOString()
  const guardar = tabla === 'conductores'
    ? (id, cambios) => actualizarConductor(cfg, id, cambios)
    : (id, cambios) => actualizarLead(cfg, id, cambios)
  try {
    const b = await buscarEnBcra(lead)
    if (b.error) {
      await guardar(lead.id, {
        bcra_consultado_at: ahora,
        bcra_error: b.error,
        bcra_nombre: b.nombre ?? null,
        bcra_cuil: b.cuil ?? null,
        bcra_intentos: 0,
      })
      return 'invalido'
    }
    const r = b.resultado
    const cambios = {
      bcra_consultado_at: ahora,
      bcra_situacion: r.situacion,
      bcra_deuda_total: r.total,
      bcra_cheques: r.cantCheques,
      bcra_nombre: r.nombre,
      bcra_resumen: r.resumen,
      bcra_detalle: { periodo: r.periodo, entidades: r.entidades },
      bcra_cuil: b.cuil,
      bcra_cuil_origen: b.origen,
      bcra_error: null,
      bcra_intentos: 0,
    }
    // El texto `bcra` (solo leads) se completa si está vacío o tenía el resumen automático anterior
    if (tabla === 'leads') {
      const textoActual = (lead.bcra ?? '').trim()
      if (!textoActual || textoActual === (lead.bcra_resumen ?? '').trim()) cambios.bcra = r.resumen
      Object.assign(cambios, correccionesLead(lead, b))
    }
    await guardar(lead.id, cambios)
    return 'ok'
  } catch (err) {
    if (err.limite) return 'limite'
    const intentos = (lead.bcra_intentos ?? 0) + 1
    const cambios = { bcra_intentos: intentos, bcra_error: err.message }
    if (intentos >= MAX_INTENTOS) cambios.bcra_consultado_at = ahora
    await guardar(lead.id, cambios)
    return 'reintentar'
  }
}

/** Procesa un lote de pendientes. Devuelve los contadores. */
export { buscarEnBcra }

export async function consultarPendientes(cfg = config()) {
  const leads = await leadsPendientes(cfg)
  // Los leads van primero; si sobra lugar en la vuelta, conductores activos
  let conductores = []
  if (leads.length < MAX_POR_TURNO) {
    try {
      conductores = await conductoresPendientes(cfg, MAX_POR_TURNO - leads.length)
    } catch (err) {
      // Sin sql/conductores_bcra.sql todavía: los leads siguen igual
      console.error('[bcra] Conductores pendientes:', err.message)
    }
  }
  const cola = [
    ...leads.map((registro) => ({ tabla: 'leads', registro })),
    ...conductores.map((registro) => ({ tabla: 'conductores', registro })),
  ]
  const r = { revisados: 0, ok: 0, invalidos: 0, fallidos: 0, limitado: false }
  for (const { tabla, registro: lead } of cola) {
    if (enCurso.has(lead.id)) continue
    enCurso.add(lead.id)
    let estado
    try {
      estado = await procesarLead(cfg, lead, tabla)
    } finally {
      enCurso.delete(lead.id)
    }
    // Límite del BCRA: se corta el turno y el resto queda para dentro de 5 minutos
    if (estado === 'limite') { r.limitado = true; break }
    r.revisados += 1
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
        console.log(`[bcra] ${clave} ART: ${r.ok} consultados, ${r.invalidos} sin validar, ${r.fallidos} con error`)
      }
      if (r.limitado) console.warn(`[bcra] ${clave} ART: el BCRA limitó las consultas, se sigue en el próximo turno`)
    } catch (err) {
      console.error(`[bcra] ${clave} ART falló:`, err.message)
    } finally {
      corriendo = false
    }
  }
  setInterval(() => { void revisar() }, 60 * 1000).unref?.()
  console.log(`[bcra] Consulta automática activa: leads con CUIT o DNI y conductores activos, cada ${CADA_MIN} minutos`)
}

// =====================================================
// Consulta al instante de un lead: POST /api/bcra/consultar/:id
// =====================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Solo usuarios con sesión iniciada y activos. Devuelve el cfg o responde el error. */
async function requireUsuario(req, res) {
  const cfg = config()
  if (!cfg.url || !cfg.serviceKey) {
    res.status(500).json({ error: 'Configuración del servidor incompleta' })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  const userRes = await fetchConTimeout(`${cfg.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: cfg.serviceKey },
  })
  if (!userRes.ok) {
    res.status(401).json({ error: 'Sesión inválida, volvé a iniciar sesión' })
    return null
  }
  const user = await userRes.json()
  const perfilRes = await fetchConTimeout(
    `${cfg.url}/rest/v1/user_profiles?id=eq.${user.id}&select=is_active`,
    { headers: headersServicio(cfg) },
  )
  const perfil = perfilRes.ok ? (await perfilRes.json())[0] : null
  if (!perfil || perfil.is_active === false) {
    res.status(403).json({ error: 'Usuario inactivo' })
    return null
  }
  return cfg
}

export const bcraRouter = express.Router()

/**
 * Consulta el lead si está pendiente (bcra_consultado_at vacío y con CUIT o DNI).
 * Responde { estado }: 'ok' | 'invalido' | 'reintentar' | 'limite' | 'en_curso'
 * | 'ya_consultado' | 'sin_documento'. Con 'limite' o 'reintentar' lo toma la vuelta de 5 minutos.
 */
bcraRouter.post('/consultar/:id', async (req, res) => {
  try {
    const cfg = await requireUsuario(req, res)
    if (!cfg) return
    const { id } = req.params
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Lead inválido' })

    const q = new URLSearchParams({ select: `${COLUMNAS_CONSULTA},bcra_consultado_at`, id: `eq.${id}` })
    const r = await fetchConTimeout(`${cfg.url}/rest/v1/leads?${q}`, { headers: headersServicio(cfg) })
    if (!r.ok) throw new Error(`Supabase leads ${r.status}`)
    const lead = (await r.json())[0]
    if (!lead) return res.status(404).json({ error: 'No se encontró el lead' })
    if (lead.bcra_consultado_at) return res.json({ estado: 'ya_consultado' })
    if (!String(lead.cuit ?? '').trim() && !String(lead.dni ?? '').trim()) {
      return res.json({ estado: 'sin_documento' })
    }
    if (enCurso.has(id)) return res.json({ estado: 'en_curso' })

    enCurso.add(id)
    try {
      const estado = await procesarLead(cfg, lead)
      res.json({ estado })
    } finally {
      enCurso.delete(id)
    }
  } catch (err) {
    console.error('[bcra] Consulta al instante falló:', err.message)
    res.status(500).json({ error: 'No se pudo consultar el BCRA' })
  }
})
