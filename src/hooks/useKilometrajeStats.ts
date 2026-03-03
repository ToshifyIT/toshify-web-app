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

        // 3. Lógica de Diagnóstico y Logs (Centrado en Periodo B)
        console.groupCollapsed('🔍 Diagnóstico KPI KILÓMETROS RECORRIDOS')
        console.log(`📅 Período: ${rangeB.start.toISOString().split('T')[0]} al ${rangeB.end.toISOString().split('T')[0]}`)
        console.log(`🏢 Sede Filtro: ${sedeId || 'Todas'}`)
        console.log('ℹ️ Usando campo: wialon_bitacora.patente_normalizada')

        const rawDataB = dataB || []
        
        // Agrupar por patente para mostrar totales por auto
        const porPatente = rawDataB.reduce((acc, item) => {
          const km = parseKilometraje(item.kilometraje)
          // Usamos patente_normalizada
          const key = item.patente_normalizada || 'SIN_PATENTE'
          acc[key] = (acc[key] || 0) + km
          return acc
        }, {} as Record<string, number>)

        const totalSinFiltro = Object.values(porPatente).reduce((a, b) => a + b, 0)

        console.log('🚗 1. Autos encontrados en wialon_bitacora (TODOS):', Object.keys(porPatente).length)
        console.table(Object.entries(porPatente)
          .map(([patente, km]) => ({ patente, km }))
          .sort((a, b) => b.km - a.km)
        )
        console.log(`💰 Total KM (Sin Filtro Sede): ${totalSinFiltro.toLocaleString()}`)

        let totalA = 0
        let totalB = 0

        if (sedeId && patentesSede) {
          // Filtrar en memoria
          const incluidos: Record<string, number> = {}
          const excluidos: Record<string, number> = {}

          Object.entries(porPatente).forEach(([patente, km]) => {
            if (patentesSede!.has(patente)) {
              incluidos[patente] = km
            } else {
              excluidos[patente] = km
            }
          })

          console.log(`✅ 2. Autos de la Sede (${sedeId}) - INCLUIDOS:`, Object.keys(incluidos).length)
          console.table(Object.entries(incluidos)
            .map(([patente, km]) => ({ patente, km }))
            .sort((a, b) => b.km - a.km)
          )
          
          console.log(`🚫 3. Autos NO de la Sede (o sin sede asignada) - EXCLUIDOS:`, Object.keys(excluidos).length)
          console.table(Object.entries(excluidos)
            .map(([patente, km]) => ({ patente, km }))
            .sort((a, b) => b.km - a.km)
          )

          // Calcular totales finales usando el filtro
          totalA = (dataA || []).reduce((sum, item) => patentesSede!.has(item.patente_normalizada || '') ? sum + parseKilometraje(item.kilometraje) : sum, 0)
          totalB = (dataB || []).reduce((sum, item) => patentesSede!.has(item.patente_normalizada || '') ? sum + parseKilometraje(item.kilometraje) : sum, 0)
          
          console.log(`📊 Total KM Final (Filtrado): ${totalB.toLocaleString()}`)
        } else {
          console.log('ℹ️ No hay filtro de sede activo (o sede "Ver Todas"). Se muestran todos.')
          totalA = (dataA || []).reduce((sum, item) => sum + parseKilometraje(item.kilometraje), 0)
          totalB = totalSinFiltro
        }
        console.groupEnd()

        if (isMounted) {
          setStats({ totalA, totalB, loading: false })
        }
      } catch (error) {
        console.error('Error fetching kilometraje stats:', error)
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
