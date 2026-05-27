/**
 * Cache de sesión para hooks del dashboard.
 * Evita re-fetchear datos cuando el usuario navega entre módulos y vuelve.
 * Los datos se mantienen en memoria mientras la app esté abierta.
 * Cada hook usa una clave + parámetros para identificar su cache.
 *
 * TTL por defecto: 5 minutos. Pasado ese tiempo se re-fetchea.
 */

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutos

interface CacheEntry<T> {
  data: T
  timestamp: number
  paramsKey: string
}

const store = new Map<string, CacheEntry<unknown>>()

/**
 * Obtiene datos del cache si existen y no han expirado.
 * @param namespace - Nombre del hook (ej: 'useDashboardStats')
 * @param paramsKey - Serialización de los parámetros (ej: JSON.stringify({sedeId, granularity}))
 * @param ttl - Tiempo de vida en ms (default 5 min)
 */
export function getCache<T>(namespace: string, paramsKey: string, ttl = DEFAULT_TTL): T | null {
  const entry = store.get(namespace) as CacheEntry<T> | undefined
  if (!entry) return null
  if (entry.paramsKey !== paramsKey) return null
  if (Date.now() - entry.timestamp > ttl) {
    store.delete(namespace)
    return null
  }
  return entry.data
}

/**
 * Guarda datos en el cache.
 */
export function setCache<T>(namespace: string, paramsKey: string, data: T): void {
  store.set(namespace, {
    data,
    timestamp: Date.now(),
    paramsKey,
  })
}

/**
 * Invalida el cache de un namespace específico o de todos.
 */
export function clearCache(namespace?: string): void {
  if (namespace) {
    store.delete(namespace)
  } else {
    store.clear()
  }
}
