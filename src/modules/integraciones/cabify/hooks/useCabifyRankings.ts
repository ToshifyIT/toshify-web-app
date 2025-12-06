// src/modules/integraciones/cabify/hooks/useCabifyRankings.ts
/**
 * Hook para obtener rankings de conductores desde histórico de Cabify
 * Los datos vienen de las vistas que se actualizan cada 5 minutos
 */

import { useState, useEffect, useCallback } from 'react'
import { cabifyIntegrationService, type CabifyRankingDriver } from '../../../../services/cabifyIntegrationService'

interface UseCabifyRankingsReturn {
  topMejores: CabifyRankingDriver[]
  topPeores: CabifyRankingDriver[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useCabifyRankings(): UseCabifyRankingsReturn {
  const [topMejores, setTopMejores] = useState<CabifyRankingDriver[]>([])
  const [topPeores, setTopPeores] = useState<CabifyRankingDriver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRankings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [mejores, peores] = await Promise.all([
        cabifyIntegrationService.getTopMejoresFromHistorico(),
        cabifyIntegrationService.getTopPeoresFromHistorico()
      ])

      setTopMejores(mejores)
      setTopPeores(peores)
    } catch (err) {
      console.error('Error fetching rankings:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
