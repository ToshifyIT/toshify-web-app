import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../../lib/supabase'
import {
  fetchFuelSummary,
  fetchFillups,
  fetchKmSemana,
  fetchEstadoYACargo,
  limitesSemana,
  normalizarPatente,
} from '../../../../services/combustibleService'
import type { FuelSummary, FuelFillup, FuelRow, CombustibleStats, RangoSemana } from '../types/combustible.types'

// Rendimientos fuera de este rango son datos incompletos (tramos cortados, sensor), no consumo real
const RENDIMIENTO_MIN = 2
const RENDIMIENTO_MAX = 40

const litrosCarga = (f: FuelFillup): number => Number(f.volume_litros ?? f.derived_volume_litros) || 0

/** Arma las filas: resumen de 30 días + métricas de la semana + estado y conductores a cargo. */
function armarFilas(
  summary: FuelSummary[],
  fillups: FuelFillup[],
  kmSemana: Map<string, number> | null,
  estados: Map<string, { estado: string | null; estadoCodigo: string | null; aCargo: string[] }>,
): FuelRow[] {
  return summary
    .map((s): FuelRow => {
      const propias = fillups.filter(f =>
        (s.vehiculo_id && f.vehiculo_id === s.vehiculo_id) || f.geotab_device_id === s.geotab_device_id,
      )
      let consumo = 0
      let hayConsumo = false
      let kmTramos = 0
      let litrosTramos = 0
      for (const f of propias) {
        const litros = Number(f.total_fuel_used_previo) || 0
        const km = Number(f.distance_previo_km) || 0
        if (litros > 0) {
          consumo += litros
          hayConsumo = true
          if (km > 0) {
            kmTramos += km
            litrosTramos += litros
          }
        }
      }
      const rendimiento = litrosTramos > 0 ? kmTramos / litrosTramos : null
      const km = kmSemana ? kmSemana.get(normalizarPatente(s.patente)) : undefined
      const est = s.vehiculo_id ? estados.get(s.vehiculo_id) : undefined
      return {
        ...s,
        km_semana: kmSemana ? Math.round((km ?? 0) * 10) / 10 : null,
        llenados_semana: propias.length,
        litros_cargados_semana: Math.round(propias.reduce((a, f) => a + litrosCarga(f), 0) * 100) / 100,
        consumo_semana: hayConsumo ? Math.round(consumo * 100) / 100 : null,
        km_tramos_semana: kmTramos,
        litros_tramos_semana: litrosTramos,
        rendimiento_semana:
          rendimiento !== null && rendimiento >= RENDIMIENTO_MIN && rendimiento <= RENDIMIENTO_MAX
            ? Math.round(rendimiento * 100) / 100
            : null,
        estado_vehiculo: est?.estado ?? null,
        estado_vehiculo_codigo: est?.estadoCodigo ?? null,
        a_cargo: est?.aCargo ?? [],
      }
    })
    .sort((a, b) => (b.consumo_semana ?? -1) - (a.consumo_semana ?? -1) || Number(b.combustible_litros) - Number(a.combustible_litros))
}

/** Indicadores calculados sobre las filas que se ven en la tabla (respetan los filtros). */
export function calcularStats(rows: FuelRow[]): CombustibleStats {
  const sum = (fn: (r: FuelRow) => number) => rows.reduce((a, r) => a + fn(r), 0)
  const combustible30 = sum(r => Number(r.combustible_litros) || 0)
  const ralentiTotal = sum(r => Number(r.ralenti_litros) || 0)
  const kmTramos = sum(r => r.km_tramos_semana)
  const litrosTramos = sum(r => r.litros_tramos_semana)
  const rendimiento = litrosTramos > 0 ? kmTramos / litrosTramos : 0
  return {
    combustibleSemana: Math.round(sum(r => r.consumo_semana ?? 0) * 100) / 100,
    distanciaSemana: Math.round(sum(r => r.km_semana ?? 0)),
    rendimientoSemana:
      rendimiento >= RENDIMIENTO_MIN && rendimiento <= RENDIMIENTO_MAX ? Math.round(rendimiento * 100) / 100 : 0,
    ralentiTotal: Math.round(ralentiTotal * 100) / 100,
    ralentiPct: combustible30 > 0 ? Math.round((ralentiTotal / combustible30) * 1000) / 10 : 0,
    llenadosSemana: sum(r => r.llenados_semana),
    litrosCargadosSemana: Math.round(sum(r => r.litros_cargados_semana)),
    vehiculosTotal: rows.length,
  }
}

export function useCombustibleData(sedeId: string | null | undefined, rango: RangoSemana) {
  const [rows, setRows] = useState<FuelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kmDisponible, setKmDisponible] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { desde, hastaExclusivo } = limitesSemana(rango)
      const [summary, fillups, kmSemana] = await Promise.all([
        fetchFuelSummary(sedeId, 30),
        fetchFillups({ sedeId, desde, hasta: new Date(hastaExclusivo.getTime() - 1) }),
        // Si la bitácora no responde, la tabla sigue funcionando sin km semanales
        fetchKmSemana(rango).catch((e) => {
          console.warn('[Combustible] Sin km semanales de la bitácora', e)
          return null
        }),
      ])
      const ids = [...new Set(summary.map(s => s.vehiculo_id).filter((x): x is string => !!x))]
      const estados = await fetchEstadoYACargo(ids).catch((e) => {
        console.warn('[Combustible] Sin estado/asignación de vehículos', e)
        return new Map()
      })
      setKmDisponible(kmSemana !== null)
      setRows(armarFilas(summary, fillups, kmSemana, estados))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [sedeId, rango])

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

  const stats = useMemo(() => calcularStats(rows), [rows])

  return {
    rows,
    stats,
    loading,
    error,
    kmDisponible,
    refrescar: cargar,
  }
}
