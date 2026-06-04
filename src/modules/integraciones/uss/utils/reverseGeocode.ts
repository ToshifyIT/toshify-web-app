// src/modules/integraciones/uss/utils/reverseGeocode.ts
// Reverse geocoding (lat/lng -> direccion) en el FRONT usando el Geocoder de
// Google Maps JS, con cache en memoria + localStorage.
//
// Por que Google Maps y no Nominatim:
// La CSP de la app (index.html, connect-src) solo permite fetch a 'self',
// Supabase y https://maps.googleapis.com. Un fetch a Nominatim/Photon es
// bloqueado por el navegador ("Failed to fetch"). En cambio el SDK de Google
// Maps ya esta habilitado por la CSP (script-src + connect-src maps.googleapis.com),
// y su Geocoder corre en el front sin problemas de CORS.
//
// Por que en el front: el GPS crudo de USS (Wialon messages/load_interval) solo
// entrega coordenadas, no direccion. El front solo necesita resolver las ~50 filas
// visibles, y el cache evita repetir las mismas zonas.

import {
  GOOGLE_MAPS_SCRIPT_URL,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../../lib/googleMaps'

const CACHE_KEY = 'uss-revgeo-cache-v1'

// Redondeo a ~3 decimales (~110m) para cachear por zona: excesos cercanos
// reusan la misma direccion sin volver a geocodificar.
function cacheKeyFor(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

// --- Cache en memoria + persistente (localStorage) ---
const memCache = new Map<string, string>()
let loadedFromStorage = false

function loadStorage(): void {
  if (loadedFromStorage) return
  loadedFromStorage = true
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(obj)) memCache.set(k, v)
    }
  } catch {
    // ignorar: si falla el storage seguimos solo con memoria
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const obj: Record<string, string> = {}
      for (const [k, v] of memCache.entries()) obj[k] = v
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj))
    } catch {
      try { localStorage.removeItem(CACHE_KEY) } catch { /* noop */ }
    }
  }, 1500)
}

// --- Carga on-demand del SDK de Google Maps ---
let mapsLoadPromise: Promise<void> | null = null

function loadGoogleMaps(): Promise<void> {
  const g = (window as any).google
  if (g?.maps?.Geocoder) return Promise.resolve()
  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    // Si ya hay un <script> del SDK en la pagina, esperar a que termine.
    const existing = document.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com/maps/api/js"]')
    if (existing) {
      const checkReady = () => {
        if ((window as any).google?.maps?.Geocoder) resolve()
        else setTimeout(checkReady, 200)
      }
      checkReady()
      return
    }
    const script = document.createElement('script')
    script.src = GOOGLE_MAPS_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps JS'))
    document.head.appendChild(script)
  })
  return mapsLoadPromise
}

// --- Geocoder de Google (singleton) + cola serializada con throttle ---
let geocoder: any = null
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- Semaforo: limita la concurrencia de llamadas a Google ---
// Paralelizamos hasta MAX_CONCURRENT a la vez para resolver rapido las ~50 filas
// visibles, sin gatillar OVER_QUERY_LIMIT (Google tolera bien rafagas moderadas).
const MAX_CONCURRENT = 8
let activeCount = 0
const waiters: Array<() => void> = []

async function acquire(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) { activeCount++; return }
  await new Promise<void>(resolve => waiters.push(resolve))
  activeCount++
}
function release(): void {
  activeCount--
  const next = waiters.shift()
  if (next) next()
}

// Resultado del geocode: {ok:true, addr} | {ok:false, retry:boolean}
// retry=true cuando Google pide reintentar (rate-limit), para NO cachear el fallo.
type GeoOutcome = { ok: true; addr: string | null } | { ok: false; retry: boolean }

async function geocodeOnce(lat: number, lng: number): Promise<GeoOutcome> {
  await loadGoogleMaps()
  const g = (window as any).google
  if (!g?.maps?.Geocoder) return { ok: false, retry: true }
  if (!geocoder) geocoder = new g.maps.Geocoder()

  try {
    const res: any = await geocoder.geocode({
      location: { lat, lng },
      language: GOOGLE_MAPS_LANGUAGE,
      region: GOOGLE_MAPS_REGION,
    })
    const first = res?.results?.[0]
    if (!first) return { ok: true, addr: null }
    return { ok: true, addr: compactAddress(first) || first.formatted_address || null }
  } catch (e: any) {
    // El SDK rechaza con un objeto que trae `code`/`status`. OVER_QUERY_LIMIT => reintentar.
    const status = e?.code || e?.status || String(e?.message || e)
    const isRateLimit = /OVER_QUERY_LIMIT|UNKNOWN_ERROR/i.test(String(status))
    return { ok: false, retry: isRateLimit }
  }
}

// Devuelve { addr, cacheable }. cacheable=false si fue un fallo transitorio (rate-limit),
// para no envenenar el cache con vacios que nunca reintentan.
// Corre en paralelo (limitado por el semaforo) con reintentos/backoff ante rate-limit.
async function geocodeWithGoogle(lat: number, lng: number): Promise<{ addr: string | null; cacheable: boolean }> {
  await acquire()
  try {
    let delay = 400
    for (let intento = 0; intento < 4; intento++) {
      const out = await geocodeOnce(lat, lng)
      if (out.ok) return { addr: out.addr, cacheable: true }
      if (!out.retry) return { addr: null, cacheable: true } // error definitivo: cachear vacio
      await sleep(delay)
      delay *= 2
    }
    return { addr: null, cacheable: false } // se agotaron reintentos: NO cachear, reintentar luego
  } finally {
    release()
  }
}

// Direccion compacta: "Calle 1234, Barrio" en vez del formatted_address completo
// que incluye ciudad, provincia, pais y codigo postal.
function compactAddress(result: any): string | null {
  const comps: any[] = result?.address_components || []
  const get = (type: string) =>
    comps.find(c => (c.types || []).includes(type))?.long_name || null
  const ruta = get('route')
  const altura = get('street_number')
  const barrio =
    get('sublocality_level_1') || get('sublocality') || get('neighborhood') || get('locality') || null
  const parts: string[] = []
  if (ruta) parts.push(altura ? `${ruta} ${altura}` : ruta)
  if (barrio && barrio !== ruta) parts.push(barrio)
  return parts.length ? parts.join(', ') : null
}

// --- Dedup de llamadas en vuelo para la misma zona ---
const inFlight = new Map<string, Promise<string | null>>()

/**
 * Devuelve la direccion para lat/lng. Resuelve desde cache al instante si existe;
 * si no, geocodifica con Google Maps y cachea. Devuelve null si no se pudo resolver.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  loadStorage()
  const key = cacheKeyFor(lat, lng)
  const cached = memCache.get(key)
  if (cached !== undefined) return cached || null

  const pending = inFlight.get(key)
  if (pending) return pending

  const p = geocodeWithGoogle(lat, lng).then(({ addr, cacheable }) => {
    // Solo cachear resultados definitivos (direccion o "no existe").
    // Los fallos por rate-limit (cacheable=false) NO se cachean -> se reintentan luego.
    if (cacheable) {
      memCache.set(key, addr || '')
      persist()
    }
    inFlight.delete(key)
    return addr
  })
  inFlight.set(key, p)
  return p
}

/** Lectura sincrona del cache (sin disparar geocoding). Para el primer render. */
export function reverseGeocodeFromCache(lat: number, lng: number): string | null {
  loadStorage()
  const v = memCache.get(cacheKeyFor(lat, lng))
  return v ? v : null
}
