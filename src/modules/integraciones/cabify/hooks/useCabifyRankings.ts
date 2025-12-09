// src/modules/integraciones/cabify/hooks/useCabifyRankings.ts
/**
 * Hook para obtener rankings de conductores desde histórico de Cabify
 * Soporta filtros por período (semana actual, día anterior, etc.)
 */

import { useState, useEffect, useCallback } from 'react'
import { cabifyIntegrationService, type CabifyRankingDriver } from '../../../../services/cabifyIntegrationService'

interface UseCabifyRankingsProps {
  fechaInicio?: string
  fechaFin?: string
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

  const fetchRankings = useCallback(async () => {
    console.log('🏆 useCabifyRankings - fetchRankings llamado con:', {
      fechaInicio: props?.fechaInicio,
      fechaFin: props?.fechaFin
    })

    try {
      setIsLoading(true)
      setError(null)

      const [mejores, peores] = await Promise.all([
        cabifyIntegrationService.getTopMejoresFromHistorico(
          props?.fechaInicio,
          props?.fechaFin
        ),
        cabifyIntegrationService.getTopPeoresFromHistorico(
          props?.fechaInicio,
          props?.fechaFin
        )
      ])

      console.log('🏆 Rankings obtenidos:', {
        mejores: mejores.length,
        peores: peores.length,
        mejoresData: mejores.slice(0, 2)
      })

      setTopMejores(mejores)
      setTopPeores(peores)
    } catch (err) {
      console.error('❌ Error fetching rankings:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [props?.fechaInicio, props?.fechaFin])

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
