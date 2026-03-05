import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

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
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // Use server-side RPC for SUM — no row transfer
        const [resA, resB] = await Promise.all([
          supabase.rpc('sum_kilometraje_range', {
            p_start: rangeA.start.toISOString().split('T')[0],
            p_end: rangeA.end.toISOString().split('T')[0],
            p_sede_id: sedeId || null
          }),
          supabase.rpc('sum_kilometraje_range', {
            p_start: rangeB.start.toISOString().split('T')[0],
            p_end: rangeB.end.toISOString().split('T')[0],
            p_sede_id: sedeId || null
          })
        ])

        if (isMounted) {
          setStats({
            totalA: Number(resA.data) || 0,
            totalB: Number(resB.data) || 0,
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
