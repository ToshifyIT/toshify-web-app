import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

export function useTelepaseStats(granularity: Granularity, periodA: string, periodB: string, sedeId?: string) {
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

  const parseImporte = (importe: any): number => {
    if (!importe) return 0
    if (typeof importe === 'number') return importe
    
    // Remove everything except digits, minus sign, dot and comma
    const clean = String(importe).trim().replace(/[^\d.,-]/g, '')
    
    const lastDotIndex = clean.lastIndexOf('.')
    const lastCommaIndex = clean.lastIndexOf(',')

    // Case 1: Mixed separators (e.g. 1.234,56 or 1,234.56)
    if (lastCommaIndex > -1 && lastDotIndex > -1) {
      if (lastCommaIndex > lastDotIndex) {
        // Dot then Comma: 1.234,56 (Argentine/European)
        // Remove dots (thousands), replace comma with dot (decimal)
        return parseFloat(clean.replace(/\./g, '').replace(',', '.'))
      } else {
        // Comma then Dot: 1,234.56 (US/Standard)
        // Remove commas (thousands)
        return parseFloat(clean.replace(/,/g, ''))
      }
    } 
    // Case 2: Only comma (e.g. 123,45 or 1,234)
    else if (lastCommaIndex > -1) {
      // Assume Argentine decimal (123,45) based on context of mixed data
      // e.g. "3.622,54" or "1.509,24" (once dots are removed in clean, if any? no clean keeps dots)
      // Wait, clean regex `[^\d.,-]` keeps dots and commas.
      // So if input is "3.622,54", clean is "3.622,54".
      // lastDotIndex = 1, lastCommaIndex = 5. Comma > Dot. Enters Case 1.
      // Correct.
      
      // If input is "123,45", clean is "123,45". lastDotIndex = -1. Enters Case 2.
      return parseFloat(clean.replace(',', '.'))
    }
    // Case 3: Only dot or neither (e.g. 123.45 or 1234)
    else {
      // Assume Standard float (123.45)
      return parseFloat(clean)
    }
  }

  useEffect(() => {
    lastParams.current = { granularity, periodA, periodB, sedeId }

    let isMounted = true

    async function fetchStats() {
      setStats(prev => ({ ...prev, loading: true }))
      
      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        let dnisFilter: string[] | null = null

        if (sedeId) {
          const { data: conductores } = await supabase
            .from('conductores')
            .select('numero_dni')
            .eq('sede_id', sedeId)
          
          if (conductores && conductores.length > 0) {
            dnisFilter = conductores.map(c => c.numero_dni)
          } else {
            // Sede seleccionada pero sin conductores
            if (isMounted) {
              setStats({ totalA: 0, totalB: 0, loading: false })
            }
            return
          }
        }

        // Run queries in parallel
        // Table: cabify_historico
        // Field: fecha_guardado (timestamp with timezone)
        // Value: peajes (float/numeric)
        let queryA = supabase
          .from('cabify_historico')
          .select('peajes')
          .gte('fecha_guardado', rangeA.start.toISOString())
          .lte('fecha_guardado', rangeA.end.toISOString())

        let queryB = supabase
          .from('cabify_historico')
          .select('peajes')
          .gte('fecha_guardado', rangeB.start.toISOString())
          .lte('fecha_guardado', rangeB.end.toISOString())

        if (dnisFilter) {
          queryA = queryA.in('dni', dnisFilter)
          queryB = queryB.in('dni', dnisFilter)
        }

        const [resA, resB] = await Promise.all([queryA, queryB])

        if (isMounted) {
          const totalA = (resA.data || []).reduce((sum, item) => sum + parseImporte(item.peajes), 0)
          const totalB = (resB.data || []).reduce((sum, item) => sum + parseImporte(item.peajes), 0)

          setStats({ totalA, totalB, loading: false })
        }
      } catch (error) {
        console.error('Error fetching telepase stats from cabify_historico:', error)
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
