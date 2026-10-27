// src/modules/reportes/kpis-v2/useKpisV2Data.ts
// Se carga al abrir la pantalla o al cambiar sede/rango, y se recalcula sola
// cada 5 minutos mientras la pestaña está visible (el día de hoy es en vivo).
import { useCallback, useEffect, useState } from 'react'
import type { KpisV2Raw } from './kpisV2Types'
import { useSede } from '../../../contexts/SedeContext'
import { getCache, setCache } from '../../../hooks/useSessionCache'
import { fetchKpisV2, FuncionKpisV2DesactualizadaError, FuncionKpisV2NoInstaladaError } from './kpisV2Service'

const REFRESH_MS = 5 * 60_000
const CACHE_NS = 'useKpisV2Data'
// Al volver a la pantalla se muestra lo último que se cargó y se actualiza en segundo plano
const CACHE_TTL = 60 * 60_000

export function useKpisV2Data(desde: string, hasta: string) {
  const { sedeActualId } = useSede()
  const [data, setData] = useState<KpisV2Raw | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let isMounted = true
    let isFetching = false
    const cacheKey = JSON.stringify({ sedeActualId, desde, hasta })
    const enCache = getCache<KpisV2Raw>(CACHE_NS, cacheKey, CACHE_TTL)
    if (enCache) {
      setData(enCache)
      setError(null)
      setIsLoading(false)
    }

    // silencioso = actualización en segundo plano: sin overlay y, si falla,
    // se conservan los últimos datos en pantalla.
    async function load(silencioso: boolean) {
      if (isFetching) return
      isFetching = true
      if (!silencioso) setIsLoading(true)
      try {
        const result = await fetchKpisV2(sedeActualId ?? null, desde, hasta)
        setCache(CACHE_NS, cacheKey, result)
        if (isMounted) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        console.error('[DashboardKpisV2] Error cargando indicadores', err)
        if (isMounted && !silencioso) {
          setData(null)
          setError(err instanceof FuncionKpisV2NoInstaladaError
            ? 'Falta instalar las funciones de indicadores en la base (sql/dashboard_kpis_v2.sql).'
            : err instanceof FuncionKpisV2DesactualizadaError
              ? 'La base tiene una versión anterior de los indicadores: volver a ejecutar sql/dashboard_kpis_v2.sql en Supabase.'
              : 'No se pudieron cargar los indicadores. Reintentá en unos minutos.')
        }
      } finally {
        isFetching = false
        if (isMounted && !silencioso) setIsLoading(false)
      }
    }

    load(enCache !== null)

    const intervalId = window.setInterval(() => {
      if (!document.hidden) load(true)
    }, REFRESH_MS)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [sedeActualId, desde, hasta, recarga])

  /** Vuelve a pedir los datos (p. ej. después de cargar el forecast). */
  const recargar = useCallback(() => setRecarga(n => n + 1), [])

  return { data, isLoading, error, recargar }
}
