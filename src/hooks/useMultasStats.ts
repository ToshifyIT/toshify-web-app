import { useState, useEffect, useRef } from 'react'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'
import { getCache, setCache } from './useSessionCache'
import { fetchCobroMultasStats } from '../services/cobroMultasStatsService'

const CACHE_NS = 'useCobroMultasP007PenalidadesStats'

function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseSemanaLabel(label: string): { semana: number; anio: number } | null {
  const match = label.match(/Sem\s+(\d+)(?:\s+(\d{4}))?/)
  if (!match) return null
  return {
    semana: parseInt(match[1], 10),
    anio: match[2] ? parseInt(match[2], 10) : new Date().getFullYear(),
  }
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

        const parsedSemanaA = granularity === 'semana' ? parseSemanaLabel(periodA) : null
        const parsedSemanaB = granularity === 'semana' ? parseSemanaLabel(periodB) : null

        const [resA, resB] = await Promise.all([
          parsedSemanaA
            ? fetchCobroMultasStats({
                semana: parsedSemanaA.semana,
                anio: parsedSemanaA.anio,
                sedeId: sedeId || null
              })
            : fetchCobroMultasStats({
                start: formatDateOnly(rangeA.start),
                end: formatDateOnly(rangeA.end),
                sedeId: sedeId || null
              }),
          parsedSemanaB
            ? fetchCobroMultasStats({
                semana: parsedSemanaB.semana,
                anio: parsedSemanaB.anio,
                sedeId: sedeId || null
              })
            : fetchCobroMultasStats({
                start: formatDateOnly(rangeB.start),
                end: formatDateOnly(rangeB.end),
                sedeId: sedeId || null
              })
        ])

        if (isMounted) {
          const result = {
            totalA: resA.total,
            totalB: resB.total,
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
