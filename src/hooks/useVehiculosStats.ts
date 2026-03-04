import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

export function useVehiculosStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
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
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // Consultas a vehiculos (count)
        // Filtramos por created_at
        let queryA = supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', rangeA.start.toISOString())
          .lte('created_at', rangeA.end.toISOString())
          .is('deleted_at', null)

        let queryB = supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', rangeB.start.toISOString())
          .lte('created_at', rangeB.end.toISOString())
          .is('deleted_at', null)

        // Aplicar filtro de sede si existe
        if (sedeId) {
          queryA = queryA.eq('sede_id', sedeId)
          queryB = queryB.eq('sede_id', sedeId)
        }

        const [resA, resB] = await Promise.all([queryA, queryB])

        if (isMounted) {
          setStats({ 
            totalA: resA.count || 0, 
            totalB: resB.count || 0, 
            loading: false 
          })
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
