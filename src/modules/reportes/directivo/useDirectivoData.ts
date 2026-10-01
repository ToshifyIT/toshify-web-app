// src/modules/reportes/directivo/useDirectivoData.ts
// Números: se cargan al abrir la pantalla o cambiar el período y se recalculan
// solos cada minuto mientras la pestaña está visible (sin caché).
// Análisis con IA: no se regenera con la actualización automática. Período por
// defecto: se genera solo la primera vez de la semana (lunes, hora Argentina).
// Otros períodos o pedir uno nuevo: botón "Actualizar" (solo si hay cambios).
import { useCallback, useEffect, useState } from 'react'
import type { DirectivoRaw } from './directivoTypes'
import type { InsightsIA, ModoInsights } from './directivoService'
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

const AVISOS: Record<string, string> = {
  nuevo: 'Análisis actualizado con los últimos datos.',
  sin_cambios: 'Los indicadores no cambiaron desde el último análisis: se mantiene.',
  reciente: 'Se actualizó hace menos de 10 minutos: se mantiene el último análisis.',
}

export function useInsightsIA(desde: string, hasta: string, esPeriodoPorDefecto: boolean) {
  const { sedeActualId } = useSede()
  const [insights, setInsights] = useState<InsightsIA | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setInsights(null)
    setAviso(null)
    const modo: ModoInsights = esPeriodoPorDefecto ? 'auto' : 'leer'
    fetchInsightsIA(sedeActualId ?? null, desde, hasta, modo)
      .then(r => {
        if (isMounted) setInsights(r.analisis)
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
  }, [sedeActualId, desde, hasta, esPeriodoPorDefecto])

  const actualizar = useCallback(async () => {
    setActualizando(true)
    setAviso(null)
    try {
      const r = await fetchInsightsIA(sedeActualId ?? null, desde, hasta, 'actualizar')
      if (r.analisis) setInsights(r.analisis)
      setAviso(
        r.analisis
          ? (r.motivo ? 'No se pudo generar uno nuevo: se mantiene el último análisis.' : AVISOS[r.origen ?? ''] ?? null)
          : 'No se pudo generar el análisis con IA. Se muestran las lecturas automáticas.',
      )
    } catch (err) {
      console.error('[DashboardDirectivo] No se pudo actualizar el análisis', err)
      setAviso('No se pudo generar el análisis con IA. Reintentá en unos minutos.')
    } finally {
      setActualizando(false)
    }
  }, [sedeActualId, desde, hasta])

  return { insights, isLoading, actualizando, aviso, actualizar }
}
