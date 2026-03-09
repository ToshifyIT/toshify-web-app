import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

/** Formatea Date a 'YYYY-MM-DD' usando componentes locales, sin conversión UTC */
function formatDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useBajasConductoresStats(
  granularity: Granularity,
  periodA: string,
  periodB: string,
  sedeId?: string
) {
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
        // 1. Obtener el estado_id correspondiente al código 'baja'
        const { data: estadoBaja } = await supabase
          .from('conductores_estados')
          .select('id')
          .ilike('codigo', 'baja')
          .single()

        if (!estadoBaja) {
          if (isMounted) {
            setStats({ totalA: 0, totalB: 0, loading: false })
          }
          return
        }

        const bajaEstadoId = estadoBaja.id

        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // 2. Contar conductores con estado BAJA y fecha_terminacion dentro del rango
        let queryA = supabase
          .from('conductores')
          .select('id', { count: 'exact', head: true })
          .eq('estado_id', bajaEstadoId)
          .gte('fecha_terminacion', formatDateOnly(rangeA.start))
          .lte('fecha_terminacion', formatDateOnly(rangeA.end))

        let queryB = supabase
          .from('conductores')
          .select('id', { count: 'exact', head: true })
          .eq('estado_id', bajaEstadoId)
          .gte('fecha_terminacion', formatDateOnly(rangeB.start))
          .lte('fecha_terminacion', formatDateOnly(rangeB.end))

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
