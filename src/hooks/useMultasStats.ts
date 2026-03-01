import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

function parseImporte(importe: string | number | null | undefined): number {
  if (!importe) return 0
  const num = typeof importe === 'string' ? parseFloat(importe.replace(/[^0-9.-]/g, '')) : importe
  return isNaN(num) ? 0 : num
}

export function useMultasStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
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
          .from('multas_historico')
          .select('importe')
          .gte('fecha_infraccion', rangeA.start.toISOString())
          .lte('fecha_infraccion', rangeA.end.toISOString())

        let queryB = supabase
          .from('multas_historico')
          .select('importe')
          .gte('fecha_infraccion', rangeB.start.toISOString())
          .lte('fecha_infraccion', rangeB.end.toISOString())

        if (sedeId) {
          queryA = queryA.eq('sede_id', sedeId)
          queryB = queryB.eq('sede_id', sedeId)
        }

        const [resA, resB] = await Promise.all([queryA, queryB])

        if (isMounted) {
          const totalA = (resA.data || []).reduce((sum, item) => sum + parseImporte(item.importe), 0)
          const totalB = (resB.data || []).reduce((sum, item) => sum + parseImporte(item.importe), 0)

          setStats({ totalA, totalB, loading: false })
        }
      } catch (error) {
        console.error('Error fetching multas stats:', error)
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
