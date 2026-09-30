// src/modules/leads/cargaMasivaSellium.ts
/**
 * Carga masiva — formato SELLIUM (reporte "Todos los leads" exportado del CRM).
 *
 * Este archivo es lógica pura (sin Supabase ni UI) para poder probarla aislada.
 * La orquestación (consultas, confirmación, escritura) está en procesarCargaSellium.ts.
 *
 * REGLAS DE NEGOCIO (acordadas 2026-09-29)
 * - Cruce: por teléfono (Móvil ↔ phone / whatsapp_number) o por Correo electrónico.
 *   Si existe → se actualiza; si no existe → se crea. Si una fila coincide con más de
 *   un lead, o dos filas apuntan al mismo lead, no se toca: queda como conflicto.
 * - Teléfono: se compara el número nacional (sin 54, sin 9, sin 0, sin 15). Si en la
 *   base está incompleto (p.ej. 68861520) coincide por sufijo, mínimo 8 dígitos.
 *   Los números extranjeros solo coinciden exactos y no reciben formato argentino.
 * - Estado del lead (prioridad de mayor a menor):
 *     1. Causal de cierre con valor      → Descartado (+ causal a Observaciones)
 *     2. Datos de vehículo con valor     → Auto del pueblo
 *     3. Document Status                 → Completa: Documentos enviados; otro: Documentos pendientes
 *     4. Estado de la postulación        → MAPA_ESTADOS (vacío o Inactivo: no se toca el estado)
 *   Al CREAR se aplica ese estado. En leads EXISTENTES solo si no tienen estado.
 *   Los leads Conductor no se tocan.
 * - Dirección: "Calle, Ciudad, Provincia", solo si viene la calle.
 * - Casillas (0/1): 1 → Sí; 0 → no se toca (el CRM pone 0 también cuando no hay dato).
 * - Leads EXISTENTES (2026-09-30): solo se completan campos vacíos del lead; lo que ya
 *   tiene valor no se toca (estado, fuente y observaciones incluidos). Excepción:
 *   created_at, que siempre toma la "Fecha de creación" del Excel.
 * - Leads NUEVOS: fuente SELLIUM, created_at y fecha_carga = "Fecha de creación" del Excel.
 * - Se ignoran: Interés, Mayor de 21, Equipo asignado, Requires Human Intervention,
 *   Last Lead Interaction, Última modificación por, Última actividad,
 *   Anuncio de origen (pauta), Asignación, Valoración.
 */
import { inferirSedeDeLead, normalizarTexto, type SedeRef } from '../../utils/sedeMatch'

/** Valor de fuente_de_lead para los leads creados Y actualizados por esta carga. */
export const FUENTE_SELLIUM = 'SELLIUM'
/** Valor que usaron las primeras cargas (2026-09-29); se sigue reconociendo como Sellium. */
export const FUENTE_SELLIUM_ANTERIOR = 'fuente_Sellium'

type Fila = Record<string, unknown>

// ───────────────────────── Lectura del archivo ─────────────────────────

/**
 * El "xls" de Sellium es en realidad una tabla HTML en ISO-8859-1. Si se lo pasa a
 * SheetJS como bytes, las tildes rompen los encabezados y los datos quedan corridos
 * de columna. Se decodifica primero con el charset declarado. Los .xlsx reales
 * siguen por el camino binario de siempre.
 */
export function leerLibroExcel(XLSX: typeof import('xlsx'), buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const inicio = new TextDecoder('latin1')
    .decode(bytes.slice(0, 4096))
    .replace(/^(\uFEFF|\u00EF\u00BB\u00BF)/, '') // BOM UTF-8 (nativo o leído como latin1)
    .trimStart()
    .toLowerCase()
  if (!inicio.startsWith('<')) return XLSX.read(buffer, { type: 'array' })

  const charset = inicio.match(/charset\s*=\s*["']?([\w-]+)/)?.[1] || 'utf-8'
  let texto: string
  try {
    texto = new TextDecoder(charset).decode(bytes)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes)
  }
  return XLSX.read(texto, { type: 'string' })
}

// ───────────────────────── Columnas ─────────────────────────

/** Encabezados del reporte, normalizados (minúsculas, sin tildes). */
const COL = {
  fecha: 'fecha de creacion',
  nombre: 'nombre',
  apellidos: 'apellidos',
  movil: 'movil',
  email: 'correo electronico',
  sede: 'sede',
  zona: 'zona',
  estado: 'estado de la postulacion',
  causal: 'causal de cierre',
  turno: 'turno',
  edad: 'edad',
  calle: 'calle de correo',
  ciudad: 'ciudad de correo',
  provincia: 'estado o provincia de correo',
  aceptaOferta: 'acepta oferta',
  licenciaD1: 'licencia d1',
  expApps: 'experiencia previa en apps',
  expManejo: 'experiencia de manejo',
  monotributo: 'monotributo',
  docStatus: 'document status',
  vehMarca: 'marca y modelo del vehiculo ofrecido',
  vehAnio: 'ano del auto',
  vehKm: 'km del auto',
  vehPatente: 'patente',
  link: 'link del anuncio (pauta)',
} as const

/** Columnas exclusivas que identifican el formato (no existen en Original ni Damaro). */
export function esFormatoSellium(headers: string[]): boolean {
  const set = new Set(headers.map(h => normalizarTexto(h)))
  return set.has(COL.movil) && set.has(COL.estado) && set.has(COL.apellidos)
}

/** Lector de celdas por nombre normalizado de columna. */
function crearLector(headers: string[]) {
  const mapa = new Map<string, string>()
  for (const h of headers) mapa.set(normalizarTexto(h), h)
  return (fila: Fila, col: string): unknown => {
    const real = mapa.get(col)
    return real === undefined ? undefined : fila[real]
  }
}

function texto(v: unknown): string | null {
  if (v == null) return null
  const s = decodificarEntidades(String(v)).trim()
  return s === '' ? null : s
}

/**
 * El reporte de Sellium es HTML en Latin-1: los emojis vienen como entidades numéricas
 * (&#129327;) y SheetJS no las traduce. Se convierten al carácter real.
 */
export function decodificarEntidades(s: string): string {
  if (!s.includes('&#')) return s
  const aChar = (n: number, original: string) => {
    try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original } catch { return original }
  }
  return s
    .replace(/&#(\d+);/g, (m, d: string) => aChar(Number(d), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => aChar(parseInt(h, 16), m))
}

/** Casilla del CRM: solo un 1 / true / "sí" cuenta. 0 = "sin dato" → null. */
function casilla(v: unknown): true | null {
  if (v === true || v === 1) return true
  const s = normalizarTexto(texto(v))
  return s === '1' || s === 'true' || s === 'si' || s === 'verdadero' ? true : null
}

function entero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Fecha del CRM → "YYYY-MM-DD". Acepta lo que puede venir según cómo se guardó el archivo:
 *   texto "29/9/2026", "29/9/2026, 13:24", "18/09/26" (año de 2 dígitos → 20xx),
 *   número de serie de Excel (celda con formato fecha en un .xlsx) u objeto Date.
 */
export function fechaISO(v: unknown): string | null {
  const iso = (a: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1900 && a <= 2100
      ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') {
    // Serie de Excel: días desde 1899-12-30 (fecha sin zona horaria → se leen partes UTC).
    const f = new Date(Math.round((v - 25569) * 86400000))
    return isNaN(f.getTime()) ? null : iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate())
  }
  const s = texto(v)
  if (!s) return null
  const isoTxt = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoTxt) return iso(Number(isoTxt[1]), Number(isoTxt[2]), Number(isoTxt[3]))
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/)
  if (!m) return null
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return iso(anio, Number(m[2]), Number(m[1]))
}

/**
 * "YYYY-MM-DD" → created_at a las 00:00 hora Argentina (la tabla muestra en ART, así
 * el lead aparece con el mismo día que en el CRM). El reporte no trae la hora.
 */
export function createdAtDesdeFecha(fecha: string): string {
  return `${fecha}T00:00:00-03:00`
}

function mismoInstante(a: unknown, b: string): boolean {
  if (a == null || a === '') return false
  const ta = new Date(String(a)).getTime()
  return !isNaN(ta) && ta === new Date(b).getTime()
}

export function escaparHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// ───────────────────────── Teléfono ─────────────────────────

export interface Telefono {
  /** Clave de comparación: número nacional AR (10 dígitos o menos si está incompleto) o dígitos completos si es extranjero. */
  clave: string
  argentino: boolean
  /** Dígitos tal como vinieron. */
  digitos: string
}

/**
 * Normaliza un teléfono a su clave de comparación. Se aplica igual a los datos del
 * Excel y de la base, así formatos distintos del mismo número dan la misma clave:
 *   +5491168861520, 5491168861520, 541168861520, 01168861520, 91168861520,
 *   1168861520, 11 15 68861520  → "1168861520"
 *   68861520 (sin código de área) → "68861520" (incompleto: coincide por sufijo)
 *   +33686251232 → "33686251232" (extranjero)
 */
export function analizarTelefono(raw: unknown): Telefono | null {
  if (raw == null) return null
  const digitos = (typeof raw === 'number' ? Math.round(raw).toString() : String(raw)).replace(/\D/g, '')
  if (digitos.length < 6) return null

  let d = digitos
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2)       // código de país
  if (d.startsWith('0')) d = d.slice(1)                          // prefijo troncal (011…)
  if (d.startsWith('9') && d.length >= 11) d = d.slice(1)       // 9 de celular internacional
  if (d.length === 12) d = quitar15(d)                           // 15 intercalado
  if (d.length === 10 && d.startsWith('15')) d = d.slice(2)      // 15 + número local sin área

  // Un número nacional argentino tiene como máximo 10 dígitos.
  if (d.length <= 10) return { clave: d, argentino: true, digitos }
  return { clave: digitos, argentino: false, digitos }
}

/** Mismo criterio y orden que formatPhoneAR (LeadsModule). */
function quitar15(d: string): string {
  if (/^[23]\d{3}15\d+/.test(d)) return d.slice(0, 4) + d.slice(6)
  if (/^[23]\d{2}15\d+/.test(d)) return d.slice(0, 3) + d.slice(5)
  if (/^1115\d+/.test(d)) return '11' + d.slice(4)
  return d
}

/** Formato en que se guarda un teléfono NUEVO. */
export function telefonoParaGuardar(t: Telefono): string {
  return t.argentino ? `+549${t.clave}` : `+${t.digitos}`
}

const LARGO_MIN_SUFIJO = 8

// ───────────────────────── Estado ─────────────────────────

/** Estado de la postulación (Sellium, normalizado) → estado de lead (Toshify). null = no tocar. */
const MAPA_ESTADOS: Record<string, string | null> = {
  'inicio': 'Inicio conversación',
  'datos personales': 'Inicio conversación',
  'no cumple edad': 'No cumple edad',
  'inactivo': null,
  'edad aprobada': 'Edad aprobada',
  'documentacion': 'Documentos enviados',
  'direccion validada': 'Zona aprobada',
  'propuesta enviada': 'Propuesta enviada',
  'video recibido': 'Video recibido',
}

export interface ResultadoEstado {
  estado: string | null
  /** Regla que lo decidió (para el resumen). */
  regla: 'causal' | 'vehiculo' | 'documentos' | 'postulacion' | 'vacio' | 'ignorado' | 'no_reconocido'
  /** Valor original si no se reconoció. */
  valorOriginal?: string
}

function calcularEstado(causal: string | null, tieneVehiculo: boolean, docStatus: string | null, postulacion: string | null): ResultadoEstado {
  if (causal) return { estado: 'Descartado', regla: 'causal' }
  if (tieneVehiculo) return { estado: 'Auto del pueblo', regla: 'vehiculo' }
  if (docStatus) {
    return normalizarTexto(docStatus) === 'completa'
      ? { estado: 'Documentos enviados', regla: 'documentos' }
      : { estado: 'Documentos pendientes', regla: 'documentos' }
  }
  if (!postulacion) return { estado: null, regla: 'vacio' }
  const clave = normalizarTexto(postulacion)
  if (!(clave in MAPA_ESTADOS)) return { estado: null, regla: 'no_reconocido', valorOriginal: postulacion }
  const estado = MAPA_ESTADOS[clave]
  return estado ? { estado, regla: 'postulacion' } : { estado: null, regla: 'ignorado' }
}

/** El estado solo avanza (o se mueve dentro del mismo nivel); nunca retrocede. */
export function puedeAplicarEstado(actual: string | null | undefined, nuevo: string | null, orden: Record<string, number>): boolean {
  if (!nuevo || actual === nuevo) return false
  if (!actual) return true
  return (orden[nuevo] ?? 0) >= (orden[actual] ?? 0)
}

// ───────────────────────── Id fuente ─────────────────────────

export function derivarIdFuente(link: string | null): string | null {
  if (!link) return null
  const l = link.toLowerCase()
  if (l.includes('tiktok')) return 'TikTok'
  if (/(^|[/.])wa\.me\b|whatsapp/.test(l)) return 'Estado'
  if (l.includes('instagram') || l.includes('instagr.am')) return 'Instagram'
  if (/fb\.me|fb\.com|facebook/.test(l)) return 'Facebook'
  return null
}

// ───────────────────────── Mapeo de filas ─────────────────────────

export interface FilaSellium {
  /** Número de fila en el Excel (1 = encabezado). */
  numero: number
  nombre: string | null
  apellido: string | null
  nombreCompleto: string | null
  telefono: Telefono | null
  email: string | null
  causal: string | null
  estado: ResultadoEstado
  fechaCreacion: string | null
  /** Datos para inferir sede (no se guardan ciudad/provincia por separado). */
  ubicacion: { sede: string | null; zona: string | null; direccion: string | null; city: string | null; region: string | null }
  /** Columnas que se escriben tal cual cuando tienen valor. */
  campos: Record<string, string | number>
  /** Casillas en 1: se escriben solo si el lead no las tiene ya en "sí". */
  casillas: Partial<Record<'acepta_oferta' | 'd1' | 'monotributo' | 'experiencia_previa', true>>
  /** Fila tal cual vino en el archivo (para re-exportarla en el mismo formato). */
  original: Fila
}

export function mapearFilasSellium(filas: Fila[], headers: string[]): FilaSellium[] {
  const leer = crearLector(headers)
  return filas.map((fila, i) => {
    const t = (c: string) => texto(leer(fila, c))

    const nombre = t(COL.nombre)
    const apellido = t(COL.apellidos)
    const nombreCompleto = [nombre, apellido].filter(Boolean).join(' ').trim() || null
    const email = t(COL.email)?.toLowerCase() ?? null

    const calle = t(COL.calle)
    const ciudad = t(COL.ciudad)
    const provincia = t(COL.provincia)
    // Sin calle, ciudad/provincia son el valor por defecto del CRM: no se arma dirección
    // (evita que el mapa ubique el lead en el centro de CABA y le apruebe la zona).
    const direccion = calle ? [calle, ciudad, provincia].filter(Boolean).join(', ') : null

    const vehMarca = t(COL.vehMarca)
    const vehAnio = entero(leer(fila, COL.vehAnio))
    const vehKm = t(COL.vehKm)
    const vehPatente = t(COL.vehPatente)
    const tieneVehiculo = !!(vehMarca || vehAnio != null || vehKm || vehPatente)

    const causal = t(COL.causal)
    const link = t(COL.link)
    const edad = entero(leer(fila, COL.edad))

    const campos: Record<string, string | number> = {}
    const poner = (k: string, v: string | number | null) => { if (v != null && v !== '') campos[k] = v }
    poner('zona', t(COL.zona))
    poner('turno', t(COL.turno))
    poner('edad', edad != null && edad > 0 && edad < 120 ? edad : null)
    poner('experiencia_manejo', t(COL.expManejo))
    poner('direccion', direccion)
    poner('marca_y_modelo_de_vehiculo', vehMarca)
    poner('anio_de_auto', vehAnio != null ? String(vehAnio) : null)
    poner('km_de_auto', vehKm)
    poner('patente', vehPatente)
    poner('fuente_pauta', link)
    poner('id_fuente', derivarIdFuente(link))

    const casillas: FilaSellium['casillas'] = {}
    if (casilla(leer(fila, COL.aceptaOferta))) casillas.acepta_oferta = true
    if (casilla(leer(fila, COL.licenciaD1))) casillas.d1 = true
    if (casilla(leer(fila, COL.monotributo))) casillas.monotributo = true
    if (casilla(leer(fila, COL.expApps))) casillas.experiencia_previa = true

    return {
      numero: i + 2,
      nombre,
      apellido,
      nombreCompleto,
      telefono: analizarTelefono(leer(fila, COL.movil)),
      email,
      causal,
      estado: calcularEstado(causal, tieneVehiculo, t(COL.docStatus), t(COL.estado)),
      fechaCreacion: fechaISO(leer(fila, COL.fecha)),
      ubicacion: { sede: t(COL.sede), zona: t(COL.zona), direccion, city: ciudad, region: provincia },
      campos,
      casillas,
      original: fila,
    }
  })
}

// ───────────────────────── Cruce con la base ─────────────────────────

/**
 * Se leen todas las columnas: además de cruzar, hacen falta los valores actuales de
 * cada campo que el Excel puede modificar, para escribir solo lo que cambia y poder
 * mostrar "antes → después" en el detalle. (No depende de que ya existan las
 * columnas nuevas fuente_pauta / id_fuente.)
 */
export const COLUMNAS_INDICE = '*'

export interface LeadExistente {
  id: string
  phone?: string | null
  whatsapp_number?: string | null
  email?: string | null
  estado_de_lead?: string | null
  proceso?: string | null
  nombre_completo?: string | null
  primer_nombre?: string | null
  apellido?: string | null
  observaciones?: string | null
  direccion?: string | null
  acepta_oferta?: boolean | null
  d1?: string | null
  monotributo?: string | null
  experiencia_previa?: string | null
  [campo: string]: unknown
}

export interface IndiceLeads {
  leads: Map<string, LeadExistente>
  porClave: Map<string, Set<string>>
  /** Sufijos de 8 y 9 dígitos de claves completas (para Excel con número incompleto). */
  porSufijo: Map<string, Set<string>>
  porEmail: Map<string, Set<string>>
}

function agregar(m: Map<string, Set<string>>, k: string, id: string) {
  const s = m.get(k)
  if (s) s.add(id)
  else m.set(k, new Set([id]))
}

export function construirIndice(leads: LeadExistente[]): IndiceLeads {
  const idx: IndiceLeads = { leads: new Map(), porClave: new Map(), porSufijo: new Map(), porEmail: new Map() }
  for (const l of leads) {
    idx.leads.set(l.id, l)
    for (const raw of [l.phone, l.whatsapp_number]) {
      const t = analizarTelefono(raw)
      if (!t) continue
      agregar(idx.porClave, t.clave, l.id)
      if (t.argentino && t.clave.length === 10) {
        agregar(idx.porSufijo, t.clave.slice(-8), l.id)
        agregar(idx.porSufijo, t.clave.slice(-9), l.id)
      }
    }
    const e = texto(l.email)?.toLowerCase()
    if (e) agregar(idx.porEmail, e, l.id)
  }
  return idx
}

export type TipoCruce = 'telefono' | 'telefono_parcial' | 'email'

export interface Cruce {
  ids: string[]
  tipo: TipoCruce | null
}

export function buscarLead(f: FilaSellium, idx: IndiceLeads): Cruce {
  const exactos = new Set<string>()
  const parciales = new Set<string>()
  const t = f.telefono
  if (t) {
    idx.porClave.get(t.clave)?.forEach(id => exactos.add(id))
    if (t.argentino && t.clave.length === 10) {
      // Base con el número incompleto (68861520): clave de 8/9 dígitos = sufijo del Excel.
      for (let largo = LARGO_MIN_SUFIJO; largo < 10; largo++) {
        idx.porClave.get(t.clave.slice(-largo))?.forEach(id => { if (!exactos.has(id)) parciales.add(id) })
      }
    } else if (t.argentino && t.clave.length >= LARGO_MIN_SUFIJO) {
      // Excel incompleto, base completa.
      idx.porSufijo.get(t.clave)?.forEach(id => { if (!exactos.has(id)) parciales.add(id) })
    }
  }
  const porEmail = f.email ? idx.porEmail.get(f.email) : undefined

  const ids = new Set<string>([...exactos, ...parciales, ...(porEmail ?? [])])
  if (ids.size === 0) return { ids: [], tipo: null }
  const tipo: TipoCruce = exactos.size > 0 ? 'telefono' : parciales.size > 0 ? 'telefono_parcial' : 'email'
  return { ids: [...ids], tipo }
}

// ───────────────────────── Plan de carga ─────────────────────────

export type Accion =
  | { tipo: 'crear'; fila: FilaSellium; payload: Record<string, unknown> }
  | { tipo: 'actualizar'; fila: FilaSellium; lead: LeadExistente; cruce: TipoCruce; payload: Record<string, unknown>; estadoBloqueado: boolean }
  | { tipo: 'sin_cambios'; fila: FilaSellium; lead: LeadExistente; cruce: TipoCruce; estadoBloqueado: boolean }
  | { tipo: 'conductor'; fila: FilaSellium; lead: LeadExistente }
  | { tipo: 'conflicto'; fila: FilaSellium; motivo: string }
  | { tipo: 'invalida'; fila: FilaSellium; motivo: string }

/** Campo sin dato: null, undefined o texto vacío. false / "No" / 0 SÍ son datos. */
function vacio(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

function esConductor(l: LeadExistente): boolean {
  const proceso = (l.proceso || '').toLowerCase()
  return l.estado_de_lead === 'Conductor' || proceso === 'convertido' || proceso === 'conductor'
}

function lineaCausal(causal: string): string {
  return `Causal de cierre: ${causal}`
}

function payloadCreacion(f: FilaSellium, sedes: SedeRef[]): Record<string, unknown> {
  const p: Record<string, unknown> = {
    ...f.campos,
    nombre_completo: f.nombreCompleto || f.apellido || f.nombre || 'Sin nombre',
    fuente_de_lead: FUENTE_SELLIUM,
  }
  if (f.nombre) p.primer_nombre = f.nombre
  if (f.apellido) p.apellido = f.apellido
  if (f.email) p.email = f.email
  if (f.telefono) p.phone = telefonoParaGuardar(f.telefono)
  if (f.fechaCreacion) {
    p.fecha_carga = f.fechaCreacion
    p.created_at = createdAtDesdeFecha(f.fechaCreacion)
  }
  if (f.estado.estado) p.estado_de_lead = f.estado.estado
  if (f.causal) p.observaciones = lineaCausal(f.causal)
  if (f.casillas.acepta_oferta) p.acepta_oferta = true
  if (f.casillas.d1) p.d1 = 'Si'
  if (f.casillas.monotributo) p.monotributo = 'Si'
  if (f.casillas.experiencia_previa) p.experiencia_previa = 'Si'
  const sede = inferirSedeDeLead(f.ubicacion, sedes)
  if (sede) { p.sede_id = sede.id; p.sede = sede.nombre }
  return p
}

/**
 * Lead EXISTENTE (regla 2026-09-30): solo se completan campos VACÍOS del lead; lo que
 * ya tiene valor no se toca (un "No" o false también es un valor). Única excepción:
 * created_at, que siempre toma la "Fecha de creación" del Excel.
 */
function payloadActualizacion(
  f: FilaSellium, l: LeadExistente, sedes: SedeRef[],
): { payload: Record<string, unknown>; estadoBloqueado: boolean } {
  const p: Record<string, unknown> = {}
  const completar = (campo: string, valor: unknown) => {
    if (valor != null && valor !== '' && vacio(l[campo])) p[campo] = valor
  }

  // created_at: siempre (se compara por instante; la base lo devuelve en otro formato).
  if (f.fechaCreacion) {
    const nuevaCreacion = createdAtDesdeFecha(f.fechaCreacion)
    if (!mismoInstante(l.created_at, nuevaCreacion)) p.created_at = nuevaCreacion
  }
  completar('fecha_carga', f.fechaCreacion)

  // Columnas directas del Excel (zona, turno, edad, dirección, vehículo, pauta…).
  for (const [campo, valor] of Object.entries(f.campos)) completar(campo, valor)
  // Dirección cargada ahora: coordenadas en blanco para que el módulo la geocodifique.
  if (p.direccion !== undefined) {
    Object.assign(p, { direccion_latitud: null, direccion_longitud: null, direccion_geocode_estado: null, direccion_geocode_fecha: null })
  }

  completar('nombre_completo', f.nombreCompleto)
  completar('primer_nombre', f.nombre)
  completar('apellido', f.apellido)
  completar('email', f.email)

  if (f.casillas.acepta_oferta) completar('acepta_oferta', true)
  if (f.casillas.d1) completar('d1', 'Si')
  if (f.casillas.monotributo) completar('monotributo', 'Si')
  if (f.casillas.experiencia_previa) completar('experiencia_previa', 'Si')

  // Fuente: se completa si está vacía, y el valor viejo 'fuente_Sellium' se corrige
  // SIEMPRE a SELLIUM (pedido 2026-09-30: nunca debe quedar "fuente_Sellium").
  const fuenteActual = (texto(l.fuente_de_lead) || '').toLowerCase()
  if (fuenteActual === FUENTE_SELLIUM_ANTERIOR.toLowerCase()) p.fuente_de_lead = FUENTE_SELLIUM
  else completar('fuente_de_lead', FUENTE_SELLIUM)

  if (f.ubicacion.sede && vacio(l.sede_id)) {
    const sede = inferirSedeDeLead(f.ubicacion, sedes)
    if (sede) { p.sede_id = sede.id; p.sede = sede.nombre }
  }

  // Estado: solo si el lead no tiene. Si tiene otro, se informa como "no aplicado".
  let estadoBloqueado = false
  const nuevo = f.estado.estado
  if (nuevo) {
    if (vacio(l.estado_de_lead)) p.estado_de_lead = nuevo
    else if (l.estado_de_lead !== nuevo) estadoBloqueado = true
  }

  if (f.causal) completar('observaciones', lineaCausal(f.causal))

  return { payload: p, estadoBloqueado }
}

export interface PlanCarga {
  acciones: Accion[]
  crear: Extract<Accion, { tipo: 'crear' }>[]
  actualizar: Extract<Accion, { tipo: 'actualizar' }>[]
  sinCambios: Extract<Accion, { tipo: 'sin_cambios' }>[]
  conductores: Extract<Accion, { tipo: 'conductor' }>[]
  conflictos: Extract<Accion, { tipo: 'conflicto' }>[]
  invalidas: Extract<Accion, { tipo: 'invalida' }>[]
}

export function planificarCarga(
  filas: FilaSellium[], idx: IndiceLeads, sedes: SedeRef[],
): PlanCarga {
  // 1) Cruce de cada fila.
  const cruces = filas.map(f => ({ f, c: buscarLead(f, idx) }))

  // 2) Filas del archivo que compiten por el mismo lead o el mismo teléfono nuevo.
  const porDestino = new Map<string, number>()
  for (const { f, c } of cruces) {
    const destino = c.ids.length === 1 ? `lead:${c.ids[0]}` : c.ids.length === 0 && f.telefono ? `nuevo:${f.telefono.clave}` : null
    if (destino) porDestino.set(destino, (porDestino.get(destino) ?? 0) + 1)
  }

  const acciones: Accion[] = cruces.map(({ f, c }): Accion => {
    if (!f.telefono && !f.email) return { tipo: 'invalida', fila: f, motivo: 'Sin teléfono ni correo' }
    if (c.ids.length > 1) return { tipo: 'conflicto', fila: f, motivo: `Coincide con ${c.ids.length} leads distintos` }

    if (c.ids.length === 0) {
      if (f.telefono && (porDestino.get(`nuevo:${f.telefono.clave}`) ?? 0) > 1) {
        return { tipo: 'conflicto', fila: f, motivo: 'Teléfono repetido en el archivo' }
      }
      return { tipo: 'crear', fila: f, payload: payloadCreacion(f, sedes) }
    }

    const lead = idx.leads.get(c.ids[0])!
    if ((porDestino.get(`lead:${lead.id}`) ?? 0) > 1) {
      return { tipo: 'conflicto', fila: f, motivo: 'Varias filas del archivo apuntan al mismo lead' }
    }
    if (esConductor(lead)) return { tipo: 'conductor', fila: f, lead }
    const { payload, estadoBloqueado } = payloadActualizacion(f, lead, sedes)
    return Object.keys(payload).length === 0
      ? { tipo: 'sin_cambios', fila: f, lead, cruce: c.tipo!, estadoBloqueado }
      : { tipo: 'actualizar', fila: f, lead, cruce: c.tipo!, payload, estadoBloqueado }
  })

  return {
    acciones,
    crear: acciones.filter((a): a is Extract<Accion, { tipo: 'crear' }> => a.tipo === 'crear'),
    actualizar: acciones.filter((a): a is Extract<Accion, { tipo: 'actualizar' }> => a.tipo === 'actualizar'),
    sinCambios: acciones.filter((a): a is Extract<Accion, { tipo: 'sin_cambios' }> => a.tipo === 'sin_cambios'),
    conductores: acciones.filter((a): a is Extract<Accion, { tipo: 'conductor' }> => a.tipo === 'conductor'),
    conflictos: acciones.filter((a): a is Extract<Accion, { tipo: 'conflicto' }> => a.tipo === 'conflicto'),
    invalidas: acciones.filter((a): a is Extract<Accion, { tipo: 'invalida' }> => a.tipo === 'invalida'),
  }
}
