// src/modules/reportes/marketing/useMarketingData.ts
// Lee los indicadores del Dashboard Marketing (función SQL get_dashboard_marketing,
// sql/dashboard_marketing.sql). Se recarga al cambiar el período o la sede; no hay
// actualización automática.
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import type { MarketingRaw } from './marketingTypes'

export function useMarketingData(desde: string, hasta: string) {
  const { sedeActualId } = useSede()
  const [data, setData] = useState<MarketingRaw | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function cargar() {
      setIsLoading(true)
      try {
        const { data: result, error: err } = await supabase.rpc('get_dashboard_marketing', {
          p_sede_id: sedeActualId ?? null,
          p_desde: desde,
          p_hasta: hasta,
        })
        if (!isMounted) return
        if (err) {
          console.error('[DashboardMarketing] Error cargando indicadores', err)
          setData(null)
          // PGRST202: PostgREST no encuentra la función (no se ejecutó el SQL)
          setError(err.code === 'PGRST202'
            ? 'Falta instalar la función de indicadores en la base (sql/dashboard_marketing.sql).'
            : 'No se pudieron cargar los indicadores. Reintentá en unos minutos.')
          return
        }
        setData(result as MarketingRaw)
        setError(null)
      } catch (err) {
        console.error('[DashboardMarketing] Error cargando indicadores', err)
        if (isMounted) {
          setData(null)
          setError('No se pudieron cargar los indicadores. Reintentá en unos minutos.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    cargar()
    return () => {
      isMounted = false
    }
  }, [sedeActualId, desde, hasta])

  return { data, isLoading, error }
}
