import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

export function useIncidenciasStats(granularity: Granularity, periodA: string, periodB: string) {
  const [stats, setStats] = useState({
    totalA: 0,
    totalB: 0,
    loading: true
  })

  const lastParams = useRef({ granularity, periodA, periodB })
  const paramsChanged = 
    lastParams.current.granularity !== granularity ||
    lastParams.current.periodA !== periodA ||
    lastParams.current.periodB !== periodB

  useEffect(() => {
    lastParams.current = { granularity, periodA, periodB }
    
    let isMounted = true

    async function fetchStats() {
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // Run queries in parallel
        const [resA, resB] = await Promise.all([
          supabase
            .from('v_penalidades_completas')
            .select('monto')
            .eq('aplicado', true)
            .gte('created_at', rangeA.start.toISOString())
            .lte('created_at', rangeA.end.toISOString()),
          supabase
            .from('v_penalidades_completas')
            .select('monto')
            .eq('aplicado', true)
            .gte('created_at', rangeB.start.toISOString())
            .lte('created_at', rangeB.end.toISOString())
        ])

        if (isMounted) {
          const totalA = (resA.data || []).reduce((sum, item) => {
            const val = typeof item.monto === 'string' ? parseFloat(item.monto) : (item.monto || 0)
            return sum + val
          }, 0)
          
          const totalB = (resB.data || []).reduce((sum, item) => {
             const val = typeof item.monto === 'string' ? parseFloat(item.monto) : (item.monto || 0)
             return sum + val
          }, 0)

          setStats({ totalA, totalB, loading: false })
        }
      } catch (error) {
        console.error('Error fetching incidencias stats:', error)
        if (isMounted) {
          setStats(prev => ({ ...prev, loading: false }))
        }
      }
    }

    fetchStats()

    return () => {
      isMounted = false
    }
  }, [granularity, periodA, periodB])

  if (paramsChanged) {
    return { ...stats, loading: true }
  }

  return stats
}
