// src/modules/reportes/directivo/useDirectivoData.ts
// Números: se cargan al abrir la pantalla o cambiar el período y se recalculan
// solos cada minuto mientras la pestaña está visible (sin caché).
// Análisis con IA: se pide una vez por sede y período (el servidor lo guarda
// por semana), no en cada actualización automática.
import { useEffect, useState } from 'react'
import type { DirectivoRaw } from './directivoTypes'
import type { InsightsIA } from './directivoService'
import { useSede } from '../../../contexts/SedeContext'
import {
  fetchDashboardDirectivo,
  fetchInsightsIA,
  FuncionDirectivoNoInstaladaError,
} from './directivoService'

const REFRESH_MS = 60_000

export function useDirectivoData(desde: string, hasta: string) {
  const { sedeActualId } = useSede()
  const [data, setData] = useState<DirectivoRaw | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let isFetching = false

    // silencioso = actualización en segundo plano: sin overlay y, si falla,
    // se conservan los últimos datos en pantalla.
    async function load(silencioso: boolean) {
      if (isFetching) return
      isFetching = true
      if (!silencioso) setIsLoading(true)
      try {
        const result = await fetchDashboardDirectivo(sedeActualId ?? null, desde, hasta)
        if (isMounted) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        console.error('[DashboardDirectivo] Error cargando indicadores', err)
        if (isMounted && !silencioso) {
          setData(null)
          setError(err instanceof FuncionDirectivoNoInstaladaError
            ? 'Falta instalar la función de indicadores en la base (sql/dashboard_directivo.sql).'
            : 'No se pudieron cargar los indicadores. Reintentá en unos minutos.')
        }
      } finally {
        isFetching = false
        if (isMounted && !silencioso) setIsLoading(false)
      }
    }

    load(false)

    const intervalId = window.setInterval(() => {
      if (!document.hidden) load(true)
    }, REFRESH_MS)

    const onVisibilityChange = () => {
      if (!document.hidden) load(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sedeActualId, desde, hasta])

  return { data, isLoading, error }
}

export function useInsightsIA(desde: string, hasta: string) {
  const { sedeActualId } = useSede()
  const [insights, setInsights] = useState<InsightsIA | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setInsights(null)
    fetchInsightsIA(sedeActualId ?? null, desde, hasta)
      .then(result => {
        if (isMounted) setInsights(result)
      })
      .catch(err => {
        console.error('[DashboardDirectivo] Análisis con IA no disponible', err)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [sedeActualId, desde, hasta])

  return { insights, isLoading }
}
