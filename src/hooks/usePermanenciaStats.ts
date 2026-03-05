import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

export function usePermanenciaStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
  const [stats, setStats] = useState({
    avgDaysA: 0,
    avgDaysB: 0,
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

    async function calculateAveragePermanencia(range: { start: Date; end: Date }) {
      // 1. Buscar conductores dados de baja en el periodo
      let query = supabase
        .from('conductores')
        .select('id')
        .gte('fecha_terminacion', range.start.toISOString())
        .lte('fecha_terminacion', range.end.toISOString())
      
      if (sedeId) {
        query = query.eq('sede_id', sedeId)
      }

      const { data: conductores, error } = await query

      if (error || !conductores || conductores.length === 0) {
        return 0
      }

      // 2. Obtener TODAS las asignaciones de todos los conductores en UNA sola query
      const conductorIds = conductores.map(c => c.id)
      const { data: asignacionesData, error: asigError } = await supabase
        .from('asignaciones_conductores')
        .select('conductor_id, asignaciones(fecha_inicio, fecha_fin)')
        .in('conductor_id', conductorIds)

      if (asigError || !asignacionesData) {
        return 0
      }

      // 3. Agrupar días por conductor
      const daysByDriver = new Map<string, number>()
      for (const item of asignacionesData) {
        const asig = item.asignaciones as any
        if (!asig?.fecha_inicio) continue

        const inicio = new Date(asig.fecha_inicio)
        const fin = asig.fecha_fin ? new Date(asig.fecha_fin) : new Date()
        const days = Math.ceil(Math.abs(fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))

        daysByDriver.set(item.conductor_id, (daysByDriver.get(item.conductor_id) || 0) + days)
      }

      // 4. Calcular promedio
      let totalDays = 0
      for (const id of conductorIds) {
        totalDays += daysByDriver.get(id) || 0
      }

      return totalDays / conductores.length
    }

    async function fetchStats() {
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        const [avgA, avgB] = await Promise.all([
          calculateAveragePermanencia(rangeA),
          calculateAveragePermanencia(rangeB)
        ])

        if (isMounted) {
          setStats({ avgDaysA: avgA, avgDaysB: avgB, loading: false })
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
