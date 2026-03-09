// ============================================================
// Hook para KPIs de incidencias divididas en "A Favor" y "En Contra"
// Consulta penalidades aplicadas (aplicado=true, rechazado=false)
// y separa por el campo es_a_favor del tipo_cobro_descuento
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

interface IncidenciasSplitResult {
  aFavorA: number
  aFavorB: number
  enContraA: number
  enContraB: number
  tiposAFavor: string[]
  loading: boolean
}

/**
 * Obtiene la suma de montos de penalidades aplicadas para un rango de fechas,
 * separada por es_a_favor (true = a favor, false = en contra).
 * También devuelve los nombres de los tipos "a favor" para el tooltip.
 */
async function fetchSplitIncidencias(
  start: string,
  end: string,
  sedeId?: string | null
): Promise<{ aFavor: number; enContra: number; tiposAFavor: string[] }> {
  // Consultar penalidades aplicadas con su tipo
  let query = supabase
    .from('penalidades')
    .select(`
      monto,
      tipos_cobro_descuento!inner (
        es_a_favor,
        nombre
      )
    `)
    .eq('aplicado', true)
    .eq('rechazado', false)
    .gte('fecha', start)
    .lte('fecha', end)

  if (sedeId) {
    query = query.eq('sede_id', sedeId)
  }

  const { data, error } = await query

  if (error) throw error

  let aFavor = 0
  let enContra = 0
  const tiposAFavorSet = new Set<string>()

  for (const row of (data || []) as any[]) {
    const tipo = row.tipos_cobro_descuento
    const monto = Number(row.monto) || 0

    if (tipo?.es_a_favor) {
      aFavor += monto
      if (tipo.nombre) tiposAFavorSet.add(tipo.nombre)
    } else {
      enContra += monto
    }
  }

  return {
    aFavor,
    enContra,
    tiposAFavor: Array.from(tiposAFavorSet).sort(),
  }
}

export function useIncidenciasSplitStats(
  granularity: Granularity,
  periodA: string,
  periodB: string,
  sedeId?: string
): IncidenciasSplitResult {
  const [stats, setStats] = useState<IncidenciasSplitResult>({
    aFavorA: 0,
    aFavorB: 0,
    enContraA: 0,
    enContraB: 0,
    tiposAFavor: [],
    loading: true,
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
      setStats((prev) => ({ ...prev, loading: true }))

      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        const [resultA, resultB] = await Promise.all([
          fetchSplitIncidencias(
            rangeA.start.toISOString(),
            rangeA.end.toISOString(),
            sedeId || null
          ),
          fetchSplitIncidencias(
            rangeB.start.toISOString(),
            rangeB.end.toISOString(),
            sedeId || null
          ),
        ])

        if (isMounted) {
          // Combinar tipos a favor de ambos periodos
          const allTipos = new Set([
            ...resultA.tiposAFavor,
            ...resultB.tiposAFavor,
          ])

          setStats({
            aFavorA: resultA.aFavor,
            aFavorB: resultB.aFavor,
            enContraA: resultA.enContra,
            enContraB: resultB.enContra,
            tiposAFavor: Array.from(allTipos).sort(),
            loading: false,
          })
        }
      } catch {
        if (isMounted) {
          setStats((prev) => ({ ...prev, loading: false }))
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
