// src/modules/onboarding/distribucion-mapa-v2/celdasGeograficasService.ts
//
// Traduce coordenadas a país / provincia / ciudad, con caché permanente en
// Supabase (tabla `celdas_geograficas`, ver sql/celdas_geograficas_table.sql).
//
// El campo `direccion` de los leads es texto libre escrito por la persona, así
// que parsearlo no es viable. Las coordenadas sí son confiables, y el reverse
// geocoding las convierte en nombres. Como se cachea por celda de ~1,1 km, es
// un costo que se paga una sola vez y después tiende a cero.

import { supabase } from '../../../lib/supabase'
import { GOOGLE_MAPS_LANGUAGE, GOOGLE_MAPS_REGION } from '../../../lib/googleMaps'
import { API_GEOCODING } from './apisGoogle'

export interface UbicacionCelda {
  pais: string | null
  provincia: string | null
  ciudad: string | null
}

const TABLA = 'celdas_geograficas'

/** Claves por request: un `.in()` muy largo revienta la URL de PostgREST. */
const LOTE_CLAVES = 100

/** Si la tabla no está disponible se deja de intentar por el resto de la sesión. */
let cacheDisponible = true

/**
 * Celda de ~1,1 km. Dos decimales: una ciudad es mucho más grande que eso, así
 * que el error sólo aparece justo sobre el límite entre dos partidos, y a
 * cambio mucha gente del mismo barrio comparte una sola resolución.
 */
export function claveCelda(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

/** Centro aproximado de la celda, que es lo que se le pregunta a Google. */
function centroDeCelda(clave: string): { lat: number; lng: number } | null {
  const [lat, lng] = clave.split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function enLotes<T>(items: T[], tamano: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano))
  return out
}

// =====================================================
// Caché en Supabase
// =====================================================

/** Trae del caché las celdas que ya estén resueltas. Best-effort. */
export async function leerCeldas(claves: string[]): Promise<Map<string, UbicacionCelda>> {
  const out = new Map<string, UbicacionCelda>()
  if (!cacheDisponible || claves.length === 0) return out

  try {
    const respuestas = await Promise.all(
      enLotes(claves, LOTE_CLAVES).map((lote) =>
        supabase.from(TABLA).select('celda, pais, provincia, ciudad').in('celda', lote)
      )
    )
    for (const { data, error } of respuestas) {
      if (error) {
        console.warn('[celdasGeograficas] lectura deshabilitada:', error.message)
        cacheDisponible = false
        return new Map()
      }
      for (const fila of (data || []) as Array<{ celda: string } & UbicacionCelda>) {
        out.set(fila.celda, {
          pais: fila.pais,
          provincia: fila.provincia,
          ciudad: fila.ciudad,
        })
      }
    }
  } catch (err) {
    console.warn('[celdasGeograficas] error leyendo:', err)
    cacheDisponible = false
    return new Map()
  }

  return out
}

async function guardarCeldas(
  entradas: Array<{ celda: string } & UbicacionCelda>
): Promise<void> {
  if (!cacheDisponible || entradas.length === 0) return
  try {
    const { error } = await supabase
      .from(TABLA)
      .upsert(entradas, { onConflict: 'celda', ignoreDuplicates: true })
    if (error) {
      console.warn('[celdasGeograficas] escritura deshabilitada:', error.message)
      cacheDisponible = false
    }
  } catch (err) {
    console.warn('[celdasGeograficas] error guardando:', err)
    cacheDisponible = false
  }
}

// =====================================================
// Reverse geocoding
// =====================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Concurrencia limitada: Google tolera ráfagas moderadas pero devuelve
 * OVER_QUERY_LIMIT si se lo satura. Mismo criterio que usa el módulo USS.
 */
const MAX_CONCURRENTES = 6

/** Variantes con las que Google escribe la Ciudad de Buenos Aires. */
const CABA_VARIANTES = /ciudad aut[oó]noma de buenos aires|capital federal|^caba$/i
const CABA_LABEL = 'Ciudad Autónoma de Buenos Aires'

interface ComponenteDireccion {
  long_name: string
  types: string[]
}

/**
 * País, provincia y ciudad a partir de los `address_components`.
 *
 * "Ciudad" es el nivel que la gente usa al hablar: en Argentina eso es el
 * PARTIDO (`administrative_area_level_2`: Tigre, Morón, Quilmes), no la
 * localidad. Se cae a `locality` y después a `sublocality` para los países o
 * zonas donde ese nivel no existe.
 *
 * CABA es la excepción: es provincia y ciudad a la vez, y no trae partido.
 */
function extraerUbicacion(componentes: ComponenteDireccion[]): UbicacionCelda {
  const buscar = (tipo: string) =>
    componentes.find((c) => (c.types || []).includes(tipo))?.long_name || null

  const pais = buscar('country')
  const provincia = buscar('administrative_area_level_1')

  if (provincia && CABA_VARIANTES.test(provincia)) {
    return { pais, provincia: CABA_LABEL, ciudad: CABA_LABEL }
  }

  const ciudad =
    buscar('administrative_area_level_2') || buscar('locality') || buscar('sublocality') || null

  return { pais, provincia, ciudad }
}

type ResultadoGeo =
  | { ok: true; ubicacion: UbicacionCelda }
  /** `reintentar` distingue el rate-limit (transitorio) de un error definitivo. */
  | { ok: false; reintentar: boolean }

async function resolverUna(lat: number, lng: number): Promise<ResultadoGeo> {
  const google = (window as any).google
  if (!google?.maps?.Geocoder) return { ok: false, reintentar: false }

  try {
    const res: any = await new google.maps.Geocoder().geocode({
      location: { lat, lng },
      language: GOOGLE_MAPS_LANGUAGE,
      region: GOOGLE_MAPS_REGION,
    })
    const primero = res?.results?.[0]
    if (!primero) return { ok: true, ubicacion: { pais: null, provincia: null, ciudad: null } }
    return { ok: true, ubicacion: extraerUbicacion(primero.address_components || []) }
  } catch (e: any) {
    const estado = e?.code || e?.status || String(e?.message || e)
    const esRateLimit = /OVER_QUERY_LIMIT|UNKNOWN_ERROR/i.test(String(estado))
    return { ok: false, reintentar: esRateLimit }
  }
}

async function resolverConReintentos(clave: string): Promise<UbicacionCelda | null> {
  const centro = centroDeCelda(clave)
  if (!centro) return null

  let espera = 400
  for (let intento = 0; intento < 4; intento++) {
    const out = await resolverUna(centro.lat, centro.lng)
    if (out.ok) return out.ubicacion
    // Error definitivo (no es rate-limit): se cachea vacío para no reintentar
    // eternamente una celda que Google no sabe resolver.
    if (!out.reintentar) return { pais: null, provincia: null, ciudad: null }
    await sleep(espera)
    espera *= 2
  }
  // Se agotaron los reintentos por rate-limit: NO se cachea, se reintenta luego.
  return null
}

/**
 * Resuelve las celdas indicadas contra Google y las guarda en el caché.
 *
 * Es explícito a propósito: no se dispara solo al abrir el módulo. Cada celda
 * es una llamada a Geocoding, y después del susto de facturación conviene que
 * cualquier consumo sea una decisión y no un efecto secundario.
 *
 * @param onProgreso  se llama tras cada celda resuelta, para la barra de avance.
 */
export async function resolverCeldas(
  claves: string[],
  onProgreso?: (hechas: number, total: number) => void
): Promise<Map<string, UbicacionCelda>> {
  const resueltas = new Map<string, UbicacionCelda>()
  // Interruptor del módulo: apagado, no se resuelve nada contra Google. La
  // lectura del caché en Supabase sigue funcionando: eso no cuesta.
  if (!API_GEOCODING || claves.length === 0) return resueltas

  let hechas = 0
  const pendientes = [...claves]

  // Pool de trabajadores: cada uno toma la siguiente clave libre. Mantiene
  // MAX_CONCURRENTES llamadas en vuelo sin armar una ráfaga de golpe.
  const trabajador = async () => {
    for (;;) {
      const clave = pendientes.shift()
      if (!clave) return
      const ubicacion = await resolverConReintentos(clave)
      if (ubicacion) resueltas.set(clave, ubicacion)
      hechas++
      onProgreso?.(hechas, claves.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENTES, claves.length) }, trabajador)
  )

  await guardarCeldas(
    [...resueltas.entries()].map(([celda, u]) => ({ celda, ...u }))
  )

  return resueltas
}
