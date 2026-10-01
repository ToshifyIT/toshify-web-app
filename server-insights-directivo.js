/**
 * Análisis con IA del Dashboard KPI Directivo ("Key Insights").
 *
 * Mismo enfoque que el chatbot de la web (toshify-web): la clave de Gemini vive
 * SOLO en el servidor, en la variable GEMINI_API_KEY (nunca con prefijo VITE_,
 * que la expondría en el navegador).
 *
 * Se monta en server.js:
 *   import { insightsDirectivoRouter } from './server-insights-directivo.js'
 *   app.use('/api/insights-directivo', insightsDirectivoRouter)
 * y en desarrollo lo monta vite.config.ts (npm run dev), sin levantar dev:api.
 *
 * Consumo mínimo:
 *  - Como máximo UNA generación por semana, sede y período: queda guardada en
 *    public.dashboard_insights (sql/dashboard_insights.sql) y se reutiliza.
 *  - Al modelo solo le llega un resumen agregado (sin nombres, DNI ni datos
 *    personales) con los porcentajes ya calculados.
 *  - gemini-2.5-flash, razonamiento desactivado y tope de salida.
 *
 * Veracidad: si la respuesta menciona un número que no está en el resumen
 * enviado, se descarta y la pantalla muestra las lecturas por reglas.
 *
 * Variables de entorno:
 *  - GEMINI_API_KEY             (obligatoria para la IA)
 *  - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (ya existen)
 *  - SUPABASE_SERVICE_ROLE_KEY  (ya la usa server.js; para la caché)
 */

import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_OUTPUT_TOKENS = 900
const REQUEST_TIMEOUT_MS = 20000
const REINTENTO_FALLO_MS = 6 * 60 * 60 * 1000 // tras un fallo, reintentar recién a las 6 h
const MAX_INSIGHTS = 4

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* -------------------------------------------------------------------------- */
/* Credenciales                                                               */
/* -------------------------------------------------------------------------- */

/**
 * server.js no carga dotenv (en producción las vars vienen del entorno).
 * Para desarrollo local leemos el .env y tomamos SOLO las claves que usa este
 * módulo. Nunca pisamos una variable ya definida.
 */
const CLAVES_ENV = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

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
    console.warn('[insights-directivo] No se pudo leer .env:', err.message)
  }
}

loadEnv()

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `Sos analista de negocio de Toshify, una startup argentina que alquila vehículos habilitados a conductores de Cabify (turnos diurnos y nocturnos de 12 horas o vehículo a cargo) y gestiona la flota.
Tu lector es la dirección y posibles inversores. Recibís un JSON con indicadores ya calculados de un período (con comparación contra el período anterior), la foto de hoy, el alcance por zona y el perfil de los conductores que más duran.

Tarea: escribí exactamente ${MAX_INSIGHTS} insights accionables, ordenados por impacto en el crecimiento del negocio.
Cada insight tiene:
- "tono": "positivo" si es una fortaleza para aprovechar, "atencion" si es un riesgo o cuello de botella.
- "titulo": una frase corta (máximo 90 caracteres) con la conclusión.
- "detalle": 1 o 2 frases (máximo 260 caracteres) con el dato que la respalda y una acción concreta.

Reglas obligatorias:
- Usá SOLO números que aparecen en el JSON, tal como están escritos. No calcules números nuevos (ni sumas, ni restas, ni promedios, ni proyecciones).
- No inventes causas: si sugerís un motivo, decí "posible" o "conviene validar".
- Priorizá: conversión de leads a conductores en la calle, retención de conductores nuevos, uso de la flota (turnos libres) y en qué zonas, fuentes o perfiles enfocar la búsqueda de leads y la pauta.
- Ignorá segmentos con muestra chica (los que no aparecen en el perfil ya fueron filtrados).
- La herramienta de captación de leads actual es Sellium. No recomiendes volver a otras herramientas.
- Para los indicadores usá los mismos nombres que la pantalla: Active Drivers, Lead-to-Driver Conversion, Time to Driver, 12-Week Retention, Churn, Driver Lifetime, Net Adds, Cohort Retention, Ideal Driver Profile. El resto, en español.
- Si nombrás semanas, usá el formato "Semana N-AA" tal como figura en el JSON.
- No menciones personas, nacionalidad ni estado civil.
- Vocabulario de Toshify: decí "vehículos" (no "autos") y "Logística" para el equipo que entrega y mantiene los vehículos.
- Español rioplatense, directo, sin exageraciones ni emojis.`

/* -------------------------------------------------------------------------- */
/* Resumen para el modelo                                                     */
/* -------------------------------------------------------------------------- */

const pct = (a, b) => (b > 0 ? Math.round(Math.min(a / b, 1) * 1000) / 10 : null)
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10)
const pp = (a, b) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10)

// Mismo cálculo que caminoALaCalle() del frontend: el total es la mediana y
// las etapas lo reparten según su proporción, así suman exacto.
function repartoCamino(m) {
  if (m.dias_a_la_calle_mediana === null || m.dias_a_la_calle_mediana === undefined || !m.nuevos_con_desglose) return {}
  const total = Math.round(m.dias_a_la_calle_mediana)
  const suma = (m.dias_captacion_suma ?? 0) + (m.dias_entrega_suma ?? 0)
  const share = suma > 0 ? m.dias_captacion_suma / suma : 1
  const captacion = Math.round(total * share)
  return {
    dias_captacion_y_documentacion: captacion,
    dias_entrega_del_vehiculo: total - captacion,
    captacion_pct_del_tiempo: Math.round(share * 100),
    entrega_pct_del_tiempo: 100 - Math.round(share * 100),
  }
}

function resumenPeriodo(m) {
  const retencion = m.retencion ?? []
  const ret12 = retencion.find((h) => h.semanas === 12)
  return {
    leads_creados: m.leads,
    aceptan_oferta: m.aceptan_oferta,
    convertidos_a_conductor: m.convertidos,
    salieron_a_la_calle: m.con_primer_turno,
    conversion_real_pct: pct(m.con_primer_turno, m.leads),
    dias_hasta_salir_a_la_calle_mediana: r1(m.dias_a_la_calle_mediana),
    ...repartoCamino(m),
    programados_que_no_llegaron_a_la_calle: m.caidas ?? 0,
    conductores_nuevos_en_la_calle: m.conductores_nuevos,
    altas: m.altas,
    reactivaciones: m.reactivaciones,
    bajas: m.bajas,
    activos_al_inicio: m.activos_inicio,
    activos_al_final: m.activos_fin,
    churn_pct: pct(m.bajas, m.activos_inicio),
    permanencia_mediana_semanas_de_las_bajas: r1(m.permanencia_mediana_semanas),
    retencion_12_semanas_pct: ret12 && ret12.base > 0 ? pct(ret12.retenidos, ret12.base) : null,
    retencion_por_semana: retencion
      .filter((h) => h.base > 0)
      .map((h) => ({ semana: h.semanas, conductores: h.base, retencion_pct: pct(h.retenidos, h.base) })),
  }
}

// Numeración de semanas igual que Facturación (date-fns getWeek con semana de
// lunes a domingo): la semana 1 es la que contiene el 1 de enero y el año de la
// semana es el del domingo.
const DIA_MS = 86_400_000
function lunesUTC(ms) {
  return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DIA_MS
}
export function etiquetaSemana(iso) {
  const [y, m, dd] = String(iso).split('-').map(Number)
  const lunes = lunesUTC(Date.UTC(y, m - 1, dd))
  const anio = new Date(lunes + 6 * DIA_MS).getUTCFullYear()
  const numero = Math.round((lunes - lunesUTC(Date.UTC(anio, 0, 1))) / (7 * DIA_MS)) + 1
  return `Semana ${numero}-${String(anio).slice(-2)}`
}

export function construirResumen(d) {
  const actual = resumenPeriodo(d.periodo.actual)
  const anterior = resumenPeriodo(d.periodo.anterior)
  const s = d.hoy_snapshot
  const sinDato = /^sin (dato|lead)$/i
  // Fuentes de lead fuera del análisis: marginales (Referido, redes, Página Web) e
  // históricas (Intercom: la herramienta actual es Sellium). Mismo criterio que el frontend.
  const sinTildes = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const FUENTES_FUERA = ['referido', 'tiktok', 'pagina web', 'instagram', 'facebook', 'intercom']
  const segmentoValido = (x) =>
    !sinDato.test(x.valor) && !(x.dimension === 'Fuente del lead' && FUENTES_FUERA.includes(sinTildes(x.valor)))

  const perfilRet = (d.perfil_retencion ?? []).filter((x) => x.base >= 10 && segmentoValido(x))
  const baseZona = (d.perfil_retencion ?? []).filter((x) => x.dimension === 'Zona')
  const totBase = baseZona.reduce((a, x) => a + x.base, 0)
  const totRet = baseZona.reduce((a, x) => a + x.retenidos, 0)

  return {
    periodo: {
      desde: d.periodo.actual.desde,
      hasta: d.periodo.actual.hasta,
      semanas: `${etiquetaSemana(d.periodo.actual.desde)} a ${etiquetaSemana(d.periodo.actual.hasta)}`,
      semana_de_hoy: etiquetaSemana(d.hoy),
      comparado_con: { desde: d.periodo.anterior.desde, hasta: d.periodo.anterior.hasta },
    },
    hoy: {
      conductores_en_la_calle: s.conductores_en_la_calle,
      conductores_en_espera_de_vehiculo: s.conductores_en_espera,
      vehiculos_en_flota: s.total_flota,
      vehiculos_en_uso: s.en_uso,
      turnos_libres: s.turnos_disponibles,
      turnos_totales: s.turnos_totales,
      ocupacion_pct: s.ocupacion === null ? null : r1(s.ocupacion * 100),
      operatividad_pct: s.operatividad === null ? null : r1(s.operatividad * 100),
    },
    periodo_actual: actual,
    periodo_anterior: anterior,
    variacion_vs_anterior: {
      conversion_real_pp: pp(actual.conversion_real_pct, anterior.conversion_real_pct),
      churn_pp: pp(actual.churn_pct, anterior.churn_pct),
      retencion_12_semanas_pp: pp(actual.retencion_12_semanas_pct, anterior.retencion_12_semanas_pct),
      dias_hasta_salir_a_la_calle: pp(actual.dias_hasta_salir_a_la_calle_mediana, anterior.dias_hasta_salir_a_la_calle_mediana),
    },
    motivos_de_leads_perdidos: (d.motivos_cierre ?? []).map((m) => ({ motivo: m.motivo, leads: m.cantidad })),
    motivos_de_programados_que_no_llegaron: (d.motivos_caidas ?? []).map((m) => ({ motivo: m.motivo, personas: Number(m.cantidad) })),
    zonas_del_periodo: (d.zonas ?? [])
      .filter((z) => z.zona !== 'Sin dato' && (z.leads > 0 || z.activos_hoy > 0))
      .slice(0, 8)
      .map((z) => ({
        zona: z.zona,
        leads: z.leads,
        salieron_a_la_calle: z.leads_con_turno,
        conversion_real_pct: z.leads >= 10 ? pct(z.leads_con_turno, z.leads) : null,
        conductores_nuevos: z.nuevos_en_la_calle,
        conductores_en_la_calle_hoy: z.activos_hoy,
      })),
    perfil_ultimos_12_meses: {
      retencion_12_semanas_promedio_pct: pct(totRet, totBase),
      retencion_por_segmento: perfilRet.map((x) => ({
        dimension: x.dimension,
        segmento: x.valor,
        conductores: x.base,
        retencion_12_semanas_pct: pct(x.retenidos, x.base),
      })),
      conversion_por_segmento: (d.perfil_conversion ?? [])
        .filter((x) => x.leads >= 30 && segmentoValido(x))
        .map((x) => ({
          dimension: x.dimension,
          segmento: x.valor,
          leads: x.leads,
          conversion_real_pct: pct(x.con_turno, x.leads),
        })),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Validación y control de números inventados                                 */
/* -------------------------------------------------------------------------- */

function numerosDelResumen(valor, out) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    out.add(valor)
    out.add(Math.round(valor))
    out.add(Math.round(valor * 10) / 10)
    out.add(Math.abs(valor))
    out.add(Math.round(Math.abs(valor)))
  } else if (typeof valor === 'string') {
    for (const n of valor.match(/\d+/g) ?? []) out.add(Number(n))
  } else if (Array.isArray(valor)) {
    for (const v of valor) numerosDelResumen(v, out)
  } else if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor)) numerosDelResumen(v, out)
  }
}

function numerosDelTexto(texto) {
  const out = []
  for (const token of texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) ?? []) {
    const esMiles = /^\d{1,3}(?:\.\d{3})+/.test(token) && !/^\d+\.\d{1,2}$/.test(token)
    const normal = esMiles ? token.replace(/\./g, '').replace(',', '.') : token.replace(',', '.')
    const n = Number(normal)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** Números del texto que no están en el resumen (con tolerancia de redondeo). */
export function numerosInventados(insights, resumen) {
  const permitidos = new Set([4, 8, 12, 26, 90, 100])
  numerosDelResumen(resumen, permitidos)
  const lista = [...permitidos]
  const inventados = []
  for (const ins of insights) {
    for (const n of numerosDelTexto(`${ins.titulo} ${ins.detalle}`)) {
      if (!lista.some((p) => Math.abs(p - n) <= 0.5)) inventados.push(n)
    }
  }
  return inventados
}

export function validarInsights(crudo) {
  if (!Array.isArray(crudo)) return null
  const limpios = []
  for (const item of crudo) {
    if (!item || typeof item !== 'object') continue
    const { tono, titulo, detalle } = item
    if ((tono !== 'positivo' && tono !== 'atencion') || typeof titulo !== 'string' || typeof detalle !== 'string') continue
    const t = titulo.trim()
    const dt = detalle.trim()
    if (!t || !dt) continue
    limpios.push({ tono, titulo: t.slice(0, 140), detalle: dt.slice(0, 400) })
  }
  return limpios.length > 0 ? limpios.slice(0, MAX_INSIGHTS) : null
}

/* -------------------------------------------------------------------------- */
/* Llamadas externas                                                          */
/* -------------------------------------------------------------------------- */

async function pedirAGemini(resumen, apiKey) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(resumen) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Igual que el chatbot de la web: sin razonamiento interno (ahorra tokens).
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                tono: { type: 'STRING', enum: ['positivo', 'atencion'] },
                titulo: { type: 'STRING' },
                detalle: { type: 'STRING' },
              },
              required: ['tono', 'titulo', 'detalle'],
            },
          },
        },
      }),
    })
    if (!response.ok) throw new Error(`Gemini respondió ${response.status}`)
    const data = await response.json()
    const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
    if (!texto) throw new Error('Gemini no devolvió texto')
    return JSON.parse(texto)
  } finally {
    clearTimeout(timeout)
  }
}

function hoyArgentina() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function lunesDe(d) {
  const [y, m, dd] = d.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, dd))
  fecha.setUTCDate(fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7))
  return fecha.toISOString().slice(0, 10)
}

async function leerCache(url, serviceKey, clave) {
  const params = new URLSearchParams({
    select: 'insights,generado_en',
    sede_key: `eq.${clave.sede_key}`,
    desde: `eq.${clave.desde}`,
    hasta: `eq.${clave.hasta}`,
    semana: `eq.${clave.semana}`,
  })
  const res = await fetch(`${url}/rest/v1/dashboard_insights?${params}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) return null
  const filas = await res.json()
  return filas[0] ?? null
}

async function guardarCache(url, serviceKey, fila) {
  await fetch(`${url}/rest/v1/dashboard_insights`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(fila),
  })
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

// Sub-app de Express (no un Router suelto): montada como middleware de Vite en
// desarrollo necesita res.json()/res.status().
export const insightsDirectivoRouter = express()
insightsDirectivoRouter.use(express.json())

insightsDirectivoRouter.post('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'no_autorizado' })
    }

    const sedeId = req.body?.sede_id ?? null
    const desde = req.body?.desde
    const hasta = req.body?.hasta
    if ((sedeId !== null && !UUID_RE.test(sedeId)) || !FECHA_RE.test(desde ?? '') || !FECHA_RE.test(hasta ?? '')) {
      return res.status(400).json({ error: 'parametros_invalidos' })
    }

    const url = process.env.VITE_SUPABASE_URL
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const apiKey = process.env.GEMINI_API_KEY
    if (!url || !anonKey) return res.json({ insights: null, motivo: 'configuracion_incompleta' })

    // Usuario válido de Toshibase
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anonKey },
    })
    if (!userRes.ok) return res.status(401).json({ error: 'token_invalido' })

    const clave = { sede_key: sedeId ?? 'todas', desde, hasta, semana: lunesDe(hoyArgentina()) }

    // Caché semanal (requiere la service role key; sin ella se genera sin guardar)
    if (serviceKey) {
      const cache = await leerCache(url, serviceKey, clave)
      if (cache) {
        const guardados = Array.isArray(cache.insights) ? cache.insights : []
        if (guardados.length > 0) {
          return res.json({ insights: guardados, generado_en: cache.generado_en, origen: 'cache' })
        }
        if (Date.now() - new Date(cache.generado_en).getTime() < REINTENTO_FALLO_MS) {
          return res.json({ insights: null, motivo: 'fallo_reciente' })
        }
      }
    }

    if (!apiKey) return res.json({ insights: null, motivo: 'sin_clave' })

    // Indicadores con el token del usuario (respeta sus permisos)
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_dashboard_directivo`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_sede_id: sedeId, p_desde: desde, p_hasta: hasta }),
    })
    if (!rpcRes.ok) return res.json({ insights: null, motivo: 'sin_indicadores' })
    const indicadores = await rpcRes.json()

    const resumen = construirResumen(indicadores)
    let insights = null
    let motivo = null
    try {
      insights = validarInsights(await pedirAGemini(resumen, apiKey))
      if (!insights) {
        motivo = 'respuesta_invalida'
      } else {
        const inventados = numerosInventados(insights, resumen)
        if (inventados.length > 0) {
          motivo = `numeros_no_verificados: ${inventados.slice(0, 5).join(', ')}`
          insights = null
        }
      }
    } catch (err) {
      motivo = err instanceof Error ? err.message : 'error_gemini'
    }

    const generadoEn = new Date().toISOString()
    if (serviceKey) {
      await guardarCache(url, serviceKey, {
        ...clave,
        insights: insights ?? [],
        modelo: GEMINI_MODEL,
        motivo,
        generado_en: generadoEn,
      }).catch((err) => console.warn('[insights-directivo] No se pudo guardar la caché:', err.message))
    }

    if (!insights) {
      console.warn(`[insights-directivo] Sin análisis: ${motivo}`)
      return res.json({ insights: null, motivo })
    }
    return res.json({ insights, generado_en: generadoEn, origen: 'nuevo' })
  } catch (err) {
    console.error('[insights-directivo] Error:', err)
    return res.json({ insights: null, motivo: 'error_interno' })
  }
})
