// src/modules/onboarding/programacion-v2/distanciaParService.ts
//
// Minutos de viaje entre las dos personas de una programacion (diurno <->
// nocturno), para autocompletar el campo "Distancia (minutos)" del paso 5.
//
// NUNCA llama a la API de Google. El orden es:
//
//   1. `mediciones_rutas` — el cache de mediciones REALES que dejo el modulo de
//      distribucion en mapa. Es tiempo de calle de verdad, y leerlo es gratis.
//   2. Haversine — linea recta convertida a minutos con la misma velocidad
//      estimada que usa el emparejamiento (VELOCIDAD_ESTIMADA_KMH). Aritmetica
//      local, tambien gratis.
//
// Distance Matrix esta apagado (ver distribucion-mapa-v2/apisGoogle.ts) y este
// servicio no lo despierta: si no hay medicion cacheada, se estima. El operador
// siempre puede corregir el numero a mano.

import { haversineKm } from '../distribucion-mapa-v2/utils'
import { claveTramo, VELOCIDAD_ESTIMADA_KMH } from '../distribucion-mapa-v2/emparejamientoService'
import { leerMediciones } from '../distribucion-mapa-v2/medicionesCacheService'

export interface Coordenada {
  lat: number
  lng: number
}

export type FuenteDistancia = 'medido' | 'estimado'

export interface DistanciaPar {
  minutos: number
  /** 'medido' = tiempo real cacheado; 'estimado' = linea recta. */
  fuente: FuenteDistancia
}

/** true si el objeto trae coordenadas utilizables. */
export function tieneCoordenadas(c: Partial<Coordenada> | null | undefined): c is Coordenada {
  return (
    !!c &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  )
}

/**
 * Minutos entre dos puntos. Devuelve null solo si falta alguna coordenada.
 *
 * El caso de dos personas en el mismo domicilio da 0, que es correcto y es lo
 * que se quiere ver en el campo.
 */
export async function calcularMinutosEntre(
  a: Coordenada,
  b: Coordenada
): Promise<DistanciaPar | null> {
  if (!tieneCoordenadas(a) || !tieneCoordenadas(b)) return null

  // 1) Medicion real cacheada. La clave se arma igual que en el modulo de
  //    distribucion (redondeo a 3 decimales y orden simetrico), asi que un
  //    tramo ya medido ahi se reusa aca sin volver a pagarlo.
  try {
    const clave = claveTramo(a, b)
    const cacheadas = await leerMediciones([clave])
    const medida = cacheadas.get(clave)
    if (medida && Number.isFinite(medida.tiempoMinutos)) {
      return { minutos: medida.tiempoMinutos, fuente: 'medido' }
    }
  } catch {
    // El cache es best-effort: si falla se estima igual.
  }

  // 2) Estimacion local.
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
  return {
    minutos: Math.round((km / VELOCIDAD_ESTIMADA_KMH) * 60),
    fuente: 'estimado',
  }
}
