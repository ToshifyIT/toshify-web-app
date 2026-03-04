import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

export function useIncidenciasStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
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

        let queryA = supabase
          .from('v_penalidades_completas')
          .select('monto')
          .eq('aplicado', true)
          .gte('fecha', rangeA.start.toISOString())
          .lte('fecha', rangeA.end.toISOString())

        let queryB = supabase
          .from('v_penalidades_completas')
          .select('monto')
          .eq('aplicado', true)
          .gte('fecha', rangeB.start.toISOString())
          .lte('fecha', rangeB.end.toISOString())

        if (sedeId) {
          // Optimización: Filtrar directamente por sede_id en la vista v_penalidades_completas
          // Esto evita traer todos los conductores y previene el error 414 URI Too Long (CORS)
          queryA = queryA.eq('sede_id', sedeId)
          queryB = queryB.eq('sede_id', sedeId)
        }

        const [resA, resB] = await Promise.all([queryA, queryB])

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
