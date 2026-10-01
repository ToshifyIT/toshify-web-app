import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'
import { getCache, setCache } from './useSessionCache'

const CACHE_NS = 'useKilometrajeStats-v2-uss-geotab'

export function useKilometrajeStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
  const [stats, setStats] = useState({
    totalA: 0,
    totalB: 0,
    loading: true
  })

  const lastParams = useRef({ granularity, periodA, periodB, sedeId })
  const paramsChanged = 
    lastParams.current.granularity !== granularity ||
    lastParams.current.periodA !== periodA ||
    lastParams.current.periodB !== periodB ||
    lastParams.current.sedeId !== sedeId

  useEffect(() => {
    lastParams.current = { granularity, periodA, periodB, sedeId }

    let isMounted = true

    async function fetchStats() {
      const paramsKey = JSON.stringify({ granularity, periodA, periodB, sedeId })
      const cached = getCache<{ totalA: number; totalB: number }>(CACHE_NS, paramsKey)
      if (cached) {
        setStats({ ...cached, loading: false })
        return
      }

      setStats(prev => ({ ...prev, loading: true }))

      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // Km = USS (histórico, sum_kilometraje_range) + Geotab (bitácora, dashboard_km_geotab).
        // Si dashboard_km_geotab no está instalada (sql/dashboard_km_geotab.sql) se toma 0.
        const params = (r: { start: Date; end: Date }) => ({
          p_start: r.start.toISOString().split('T')[0],
          p_end: r.end.toISOString().split('T')[0],
          p_sede_id: sedeId || null,
        })
        const [ussA, ussB, geoA, geoB] = await Promise.all([
          supabase.rpc('sum_kilometraje_range', params(rangeA)),
          supabase.rpc('sum_kilometraje_range', params(rangeB)),
          supabase.rpc('dashboard_km_geotab', params(rangeA)),
          supabase.rpc('dashboard_km_geotab', params(rangeB)),
        ])
        const km = (r: { data: unknown; error: unknown }) => (r.error ? 0 : Number(r.data) || 0)

        if (isMounted) {
          const result = {
            totalA: km(ussA) + km(geoA),
            totalB: km(ussB) + km(geoB),
          }
          setCache(CACHE_NS, paramsKey, result)
          setStats({ ...result, loading: false })
        }
      } catch {
        if (isMounted) {
          setStats(prev => ({ ...prev, loading: false }))
        }
      }
    }

    fetchStats()

    return () => {
      isMounted = false
    }
  }, [granularity, periodA, periodB, sedeId])

  if (paramsChanged) {
    return { ...stats, loading: true }
  }

  return stats
}
