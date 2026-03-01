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

    async function calculateAveragePermanencia(range: { start: Date; end: Date }, periodLabel: string) {
      // 1. Buscar conductores dados de baja en el periodo
      let query = supabase
        .from('conductores')
        .select('id, nombres, apellidos, fecha_terminacion')
        .gte('fecha_terminacion', range.start.toISOString())
        .lte('fecha_terminacion', range.end.toISOString())
      
      if (sedeId) {
        query = query.eq('sede_id', sedeId)
      }

      const { data: conductores, error } = await query

      if (error) {
        console.error(`Error fetching conductores for ${periodLabel}:`, error)
        return 0
      }

      console.log(`[${periodLabel}] Conductores baja encontrados en periodo ${range.start.toISOString()} - ${range.end.toISOString()}: ${conductores?.length || 0} conductores`)

      if (!conductores || conductores.length === 0) {
        return 0
      }

      let totalDaysAll = 0

      // 2. Procesar cada conductor
      for (const conductor of conductores) {
        console.log(`[${periodLabel}] Procesando Conductor [${conductor.id}]: ${conductor.nombres} ${conductor.apellidos}`)
        
        // 3. Obtener asignaciones históricas
        // Cruzamos con asignaciones para obtener fechas
        const { data: asignacionesData, error: asigError } = await supabase
          .from('asignaciones_conductores')
          .select(`
            asignaciones (
              id,
              fecha_inicio,
              fecha_fin
            )
          `)
          .eq('conductor_id', conductor.id)

        if (asigError) {
          console.error(`Error fetching asignaciones for conductor ${conductor.id}:`, asigError)
          continue
        }

        let conductorDays = 0

        if (asignacionesData) {
          for (const item of asignacionesData) {
            // item.asignaciones puede ser un array o un objeto dependiendo de la relación, 
            // pero con asignaciones_conductores -> asignaciones (one-to-one per link record) suele ser objeto.
            // Supabase devuelve array si es one-to-many, objeto si es many-to-one.
            // asignaciones_conductores.asignacion_id -> asignaciones.id es many-to-one.
            const asig = item.asignaciones as any // Type assertion for simplicity

            if (asig && asig.fecha_inicio) {
              const inicio = new Date(asig.fecha_inicio)
              // Si no tiene fecha_fin, usamos la fecha actual como fallback o fecha_terminacion del conductor?
              // El requerimiento dice "se saca el numero de dias que hay entre el campo fecha_inicio y fecha_fin"
              // Asumimos que si está de baja, la asignación debería tener fin. Si no, usamos fecha actual.
              const fin = asig.fecha_fin ? new Date(asig.fecha_fin) : new Date()
              
              const diffTime = Math.abs(fin.getTime() - inicio.getTime())
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) 
              
              conductorDays += days
              
              console.log(`  -> Asignación [${asig.id}]: Inicio [${asig.fecha_inicio}] Fin [${asig.fecha_fin || 'Activa'}] -> Dias: [${days}]`)
            }
          }
        }

        console.log(`Total días conductor ${conductor.nombres}: ${conductorDays}`)
        totalDaysAll += conductorDays
      }

      const average = totalDaysAll / conductores.length
      console.log(`[${periodLabel}] Promedio Final: ${totalDaysAll} / ${conductores.length} = ${average.toFixed(2)}`)
      
      return average
    }

    async function fetchStats() {
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        // Ejecutar en paralelo
        const [avgA, avgB] = await Promise.all([
          calculateAveragePermanencia(rangeA, 'Periodo A'),
          calculateAveragePermanencia(rangeB, 'Periodo B')
        ])

        if (isMounted) {
          setStats({ avgDaysA: avgA, avgDaysB: avgB, loading: false })
        }
      } catch (error) {
        console.error('Error fetching permanencia stats:', error)
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
