// src/modules/integraciones/cabify/hooks/useCabifyRankings.ts
/**
 * Hook para obtener rankings de conductores desde histórico de Cabify
 * Soporta filtros por período (semana actual, día anterior, etc.)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { cabifyIntegrationService, type CabifyRankingDriver } from '../../../../services/cabifyIntegrationService'

interface UseCabifyRankingsProps {
  fechaInicio?: string
  fechaFin?: string
  sedeId?: string | null
}

interface UseCabifyRankingsReturn {
  topMejores: CabifyRankingDriver[]
  topPeores: CabifyRankingDriver[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useCabifyRankings(props?: UseCabifyRankingsProps): UseCabifyRankingsReturn {
  const [topMejores, setTopMejores] = useState<CabifyRankingDriver[]>([])
  const [topPeores, setTopPeores] = useState<CabifyRankingDriver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const fetchRankings = useCallback(async () => {
    // No fetch si no tenemos fecha o sede definida (evita race condition con "todas" al inicio)
    if (!props?.fechaInicio || !props?.fechaFin) {
      setIsLoading(false)
      return
    }

    const currentFetchId = ++fetchIdRef.current

    try {
      setIsLoading(true)
      setError(null)

      const [mejores, peores] = await Promise.all([
        cabifyIntegrationService.getTopMejoresFromHistorico(
          props.fechaInicio,
          props.fechaFin,
          props.sedeId
        ),
        cabifyIntegrationService.getTopPeoresFromHistorico(
          props.fechaInicio,
          props.fechaFin,
          props.sedeId
        )
      ])

      // Solo actualizar si este fetch sigue siendo el más reciente (evita race condition)
      if (currentFetchId !== fetchIdRef.current) return

      // Ordenar en frontend para garantizar el orden correcto
      const sortedMejores = [...mejores].sort((a, b) => b.gananciaTotal - a.gananciaTotal)
      const sortedPeores = [...peores].sort((a, b) => a.gananciaTotal - b.gananciaTotal)

      setTopMejores(sortedMejores)
      setTopPeores(sortedPeores)
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [props?.fechaInicio, props?.fechaFin, props?.sedeId])

  useEffect(() => {
    fetchRankings()
  }, [fetchRankings])

  return {
    topMejores,
    topPeores,
    isLoading,
    error,
    refetch: fetchRankings
  }
}
