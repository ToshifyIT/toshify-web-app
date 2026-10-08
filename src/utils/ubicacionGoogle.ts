// src/utils/ubicacionGoogle.ts
//
// País y ciudad a partir de lo que devuelve Google (address_components).
//
// Mismo criterio que usa el módulo Leads (ubicacionDeComponentes en
// LeadsModule.tsx), para que leads y conductores muestren la misma ciudad con
// el mismo nombre en los filtros. Si se cambia el criterio acá, cambiarlo
// también allá.

import { GOOGLE_MAPS_SCRIPT_URL } from '../lib/googleMaps'

export interface UbicacionDireccion {
  pais: string | null
  ciudad: string | null
}

const CABA_LABEL = 'Ciudad Autónoma de Buenos Aires'

/**
 * Qué se toma como "ciudad":
 *  - CABA: Google pone administrative_area_level_1 = "Ciudad Autónoma de
 *    Buenos Aires" y locality = "Buenos Aires". Se usa la etiqueta de CABA.
 *  - Resto: locality (la localidad) y, si no vino, el partido
 *    (administrative_area_level_2).
 */
export function ubicacionDeComponentes(componentes: any[] | undefined | null): UbicacionDireccion {
  if (!Array.isArray(componentes)) return { pais: null, ciudad: null }
  const porTipo = (tipo: string): string | null =>
    componentes.find((c: any) => Array.isArray(c?.types) && c.types.includes(tipo))?.long_name || null

  const pais = porTipo('country')
  const admin1 = porTipo('administrative_area_level_1')
  const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  if (admin1 && sinAcentos(admin1).includes('autonoma de buenos aires')) {
    return { pais, ciudad: CABA_LABEL }
  }
  return { pais, ciudad: porTipo('locality') || porTipo('administrative_area_level_2') }
}

/**
 * Carga el SDK de Google Maps con la URL canónica (ver src/lib/googleMaps.ts)
 * y espera a que la librería de geocoding esté lista.
 */
export function cargarGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    const asegurarGeocoding = async () => {
      const g = (window as any).google
      if (g?.maps?.Geocoder) {
        resolve()
        return
      }
      if (g?.maps?.importLibrary) {
        try {
          await g.maps.importLibrary('geocoding')
          resolve()
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }
      setTimeout(asegurarGeocoding, 50)
    }

    if ((window as any).google?.maps) {
      asegurarGeocoding()
      return
    }
    const existente = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existente) {
      existente.addEventListener('load', () => asegurarGeocoding())
      // Si ya había terminado de cargar, el evento no vuelve a dispararse.
      asegurarGeocoding()
      return
    }
    const script = document.createElement('script')
    script.src = GOOGLE_MAPS_SCRIPT_URL
    script.async = true
    script.onload = () => asegurarGeocoding()
    script.onerror = () => reject(new Error('Error cargando Google Maps'))
    document.head.appendChild(script)
  })
}

export type ResultadoReverse =
  | { ok: true; ubicacion: UbicacionDireccion }
  /** reintentar = error transitorio (rate limit); false = Google no sabe ubicarlo. */
  | { ok: false; reintentar: boolean }

const TIMEOUT_GEOCODING_MS = 15000

/**
 * País y ciudad de un punto (reverse geocoding). UNA llamada a Google.
 * Requiere haber llamado antes a cargarGoogleMaps().
 */
export function ubicacionDesdeCoordenadas(lat: number, lng: number): Promise<ResultadoReverse> {
  return new Promise((resolve) => {
    const google = (window as any).google
    if (!google?.maps?.Geocoder) {
      resolve({ ok: false, reintentar: false })
      return
    }
    // Tope de tiempo: si la API no responde, el callback puede no llamarse nunca.
    const timeout = setTimeout(() => resolve({ ok: false, reintentar: true }), TIMEOUT_GEOCODING_MS)
    new google.maps.Geocoder().geocode(
      { location: { lat, lng } },
      (results: any[] | null, status: string) => {
        clearTimeout(timeout)
        if (status === 'OK' && results && results[0]) {
          resolve({ ok: true, ubicacion: ubicacionDeComponentes(results[0].address_components) })
        } else if (status === 'ZERO_RESULTS') {
          resolve({ ok: true, ubicacion: { pais: null, ciudad: null } })
        } else {
          resolve({ ok: false, reintentar: status === 'OVER_QUERY_LIMIT' || status === 'UNKNOWN_ERROR' })
        }
      }
    )
  })
}
