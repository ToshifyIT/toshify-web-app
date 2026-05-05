import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fetchCargas } from '../../../../services/combustibleService'
import type { CargaCombustible, CombustibleStats } from '../types/combustible.types'

function getInicioSemana(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function useCombustibleData(sedeId?: string | null) {
  const [cargas, setCargas] = useState<CargaCombustible[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [desde] = useState<Date>(() => getInicioSemana())
  const [hasta] = useState<Date>(() => new Date())

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCargas(sedeId, desde, hasta)
      setCargas(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [sedeId, desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('geotab_fuel_transactions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'geotab_fuel_transactions' },
        () => { cargar() }
      )
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [cargar])

  // Stats
  const stats: CombustibleStats = useMemo(() => {
    const litros = cargas.reduce((s, c) => s + (Number(c.volumen_litros) || 0), 0)
    const gasto = cargas.reduce((s, c) => s + (Number(c.costo) || 0), 0)
    const conKmL = cargas.filter(c => c.km_por_litro != null && Number(c.km_por_litro) > 0)
    const kmLPromedio = conKmL.length > 0
      ? conKmL.reduce((s, c) => s + Number(c.km_por_litro), 0) / conKmL.length
      : 0

    // Top consumo: conductor con peor variacion vs promedio (kmL bajo = consume mas)
    let topNombre: string | null = null
    let topVar: number | null = null
    const porConductor = new Map<string, { sum: number; n: number }>()
    for (const c of conKmL) {
      const k = c.conductor_name || c.conductor_id || ''
      if (!k) continue
      const prev = porConductor.get(k) || { sum: 0, n: 0 }
      prev.sum += Number(c.km_por_litro); prev.n += 1
      porConductor.set(k, prev)
    }
    if (kmLPromedio > 0 && porConductor.size > 0) {
      let peor: { nombre: string; promCond: number } | null = null
      for (const [nombre, s] of porConductor) {
        const promCond = s.sum / s.n
        if (!peor || promCond < peor.promCond) peor = { nombre, promCond }
      }
      if (peor) {
        topNombre = peor.nombre
        topVar = Math.round(((peor.promCond - kmLPromedio) / kmLPromedio) * 100)
      }
    }

    return {
      litros: Math.round(litros * 10) / 10,
      gasto: Math.round(gasto),
      kmLPromedio: Math.round(kmLPromedio * 10) / 10,
      cargas: cargas.length,
      topConsumoNombre: topNombre,
      topConsumoVariacion: topVar,
    }
  }, [cargas])

  return {
    cargas,
    stats,
    loading,
    error,
    desde,
    hasta,
    refrescar: cargar,
  }
}
