import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fetchFuelSummary } from '../../../../services/combustibleService'
import type { FuelSummary, CombustibleStats } from '../types/combustible.types'

export function useCombustibleData(sedeId?: string | null) {
  const [summary, setSummary] = useState<FuelSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFuelSummary(sedeId, 30)
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [sedeId])

  useEffect(() => { cargar() }, [cargar])

  // Realtime: cuando el cron actualiza el summary, refrescamos.
  useEffect(() => {
    const channel = supabase
      .channel('geotab_fuel_summary_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'geotab_fuel_summary' },
        () => { cargar() }
      )
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [cargar])

  const stats: CombustibleStats = useMemo(() => {
    const combustibleTotal = summary.reduce((s, v) => s + (Number(v.combustible_litros) || 0), 0)
    const distanciaTotal = summary.reduce((s, v) => s + (Number(v.distancia_km) || 0), 0)
    const ralentiTotal = summary.reduce((s, v) => s + (Number(v.ralenti_litros) || 0), 0)
    const llenadosTotal = summary.reduce((s, v) => s + (Number(v.llenados_count) || 0), 0)
    const conData = summary.filter(v => v.tiene_telemetria && Number(v.rendimiento_km_litro) > 0)
    const rendimientoPromedio = conData.length > 0
      ? conData.reduce((s, v) => s + Number(v.rendimiento_km_litro), 0) / conData.length
      : 0
    const ralentiPct = combustibleTotal > 0 ? (ralentiTotal / combustibleTotal) * 100 : 0

    return {
      combustibleTotal: Math.round(combustibleTotal * 100) / 100,
      distanciaTotal: Math.round(distanciaTotal),
      rendimientoPromedio: Math.round(rendimientoPromedio * 100) / 100,
      ralentiTotal: Math.round(ralentiTotal * 100) / 100,
      ralentiPct: Math.round(ralentiPct * 10) / 10,
      llenadosTotal,
      vehiculosConData: conData.length,
      vehiculosTotal: summary.length,
    }
  }, [summary])

  return {
    summary,
    stats,
    loading,
    error,
    refrescar: cargar,
  }
}
