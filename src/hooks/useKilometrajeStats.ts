import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

function parseKilometraje(km: string | number | null | undefined): number {
  if (!km) return 0
  const num = typeof km === 'string' ? parseFloat(km) : km
  return isNaN(num) ? 0 : num
}

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

        // 1. Obtener patentes de la sede si corresponde
        let patentesSede: Set<string> | null = null
        if (sedeId) {
          const { data: vehiculos } = await supabase
            .from('vehiculos')
            .select('patente')
            .eq('sede_id', sedeId)
          
          if (vehiculos) {
            patentesSede = new Set(vehiculos.map(v => v.patente))
          }
        }

        // 2. Obtener TODOS los datos de wialon_bitacora para los rangos (sin filtrar por patente en DB)
        // Traemos patente_normalizada y kilometraje para poder filtrar en memoria y hacer logs
        const { data: dataA } = await supabase
          .from('wialon_bitacora')
          .select('patente_normalizada, kilometraje')
          .gte('fecha_turno', rangeA.start.toISOString().split('T')[0])
          .lte('fecha_turno', rangeA.end.toISOString().split('T')[0])

        const { data: dataB } = await supabase
          .from('wialon_bitacora')
          .select('patente_normalizada, kilometraje')
          .gte('fecha_turno', rangeB.start.toISOString().split('T')[0])
          .lte('fecha_turno', rangeB.end.toISOString().split('T')[0])

        let totalA = 0
        let totalB = 0

        if (sedeId && patentesSede) {
          totalA = (dataA || []).reduce((sum, item) => patentesSede!.has(item.patente_normalizada || '') ? sum + parseKilometraje(item.kilometraje) : sum, 0)
          totalB = (dataB || []).reduce((sum, item) => patentesSede!.has(item.patente_normalizada || '') ? sum + parseKilometraje(item.kilometraje) : sum, 0)
        } else {
          totalA = (dataA || []).reduce((sum, item) => sum + parseKilometraje(item.kilometraje), 0)
          totalB = (dataB || []).reduce((sum, item) => sum + parseKilometraje(item.kilometraje), 0)
        }

        if (isMounted) {
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
