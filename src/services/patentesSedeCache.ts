/**
 * Cache compartido de patentes normalizadas por sede.
 * Usado por wialonBitacoraService y ussHistoricoService para NO pedir vehiculos?select=patente
 * dos veces (cada request cruza ARG->EU ~530ms). (OPT-05)
 *
 * Cachea la PROMISE en vuelo (in-flight dedup): si dos servicios la piden a la vez, comparten
 * la misma request. NO cachea promesas rechazadas (un fallo de red no debe quedar pegado 5 min).
 */
import { supabase } from '../lib/supabase'

/** Normaliza patente: quita espacios y guiones, mayúsculas. */
export function normalizarPatente(p: string): string {
  return p.replace(/[\s\-]/g, '').toUpperCase()
}

const PATENTES_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

type CacheEntry = { promise: Promise<string[] | null>; expires: number }
const cache = new Map<string, CacheEntry>()

/**
 * Devuelve las patentes normalizadas de una sede (cacheado 5 min, dedup de request en vuelo).
 * null si la sede no tiene vehículos.
 */
export function getPatentesPorSede(sedeId: string): Promise<string[] | null> {
  const cached = cache.get(sedeId)
  if (cached && Date.now() < cached.expires) {
    return cached.promise
  }

  const promise = (async (): Promise<string[] | null> => {
    const { data: vehiculos, error } = await supabase
      .from('vehiculos')
      .select('patente')
      .eq('sede_id', sedeId)
      .is('deleted_at', null)

    // Si falló o no hay datos, NO dejar la promesa cacheada (para reintentar en la próxima).
    if (error) {
      cache.delete(sedeId)
      throw error
    }
    if (!vehiculos || vehiculos.length === 0) {
      cache.delete(sedeId)
      return null
    }
    return vehiculos.map((v: { patente: string }) => normalizarPatente(v.patente))
  })()

  // Si la promise se rechaza, quitarla del cache para no servir un fallo pegado.
  promise.catch(() => cache.delete(sedeId))

  cache.set(sedeId, { promise, expires: Date.now() + PATENTES_CACHE_TTL })
  return promise
}
