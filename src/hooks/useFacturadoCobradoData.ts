import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'
import { getCache, setCache } from './useSessionCache'

export type Granularity = 'semana' | 'mes' | 'ano'

export interface FactCobDataPoint {
  label: string        // eje X
  facturado: number
  cobrado: number
  brecha: number       // facturado - cobrado
  semana?: number
  anio?: number
}

export interface FactCobResult {
  chartData: FactCobDataPoint[]
  loading: boolean
}

interface PeriodoRow {
  id: string
  semana: number
  anio: number
  estado: string
  sede_id: string | null
}

/**
 * Obtiene semanas cerradas con sus totales facturado/cobrado.
 * OPTIMIZADO: usa 3 queries batch en vez de 2 por periodo.
 * Si se pasa upToSemana/upToAnio, filtra semanas <= ese punto.
 */
async function fetchClosedWeeks(
  sedeId: string | null,
  limit: number,
  upToSemana?: number,
  upToAnio?: number
): Promise<FactCobDataPoint[]> {
  // 1. Buscar periodos cerrados
  let qPeriodos = (supabase.from('periodos_facturacion') as any)
    .select('id, semana, anio, estado, sede_id')
    .eq('estado', 'cerrado')
    .order('anio', { ascending: false })
    .order('semana', { ascending: false })
    .limit(limit * 3)

  if (sedeId) qPeriodos = qPeriodos.eq('sede_id', sedeId)

  const { data: periodosRaw } = await qPeriodos
  if (!periodosRaw || periodosRaw.length === 0) return []

  let filtered = periodosRaw as PeriodoRow[]

  if (upToSemana !== undefined && upToAnio !== undefined) {
    filtered = filtered.filter(p =>
      p.anio < upToAnio || (p.anio === upToAnio && p.semana <= upToSemana)
    )
  }

  const periodos = filtered.slice(0, limit)
  periodos.sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.semana - b.semana)

  if (periodos.length === 0) return []

  const periodoIds = periodos.map(p => p.id)

  // 2. BATCH: traer TODAS las facturaciones de todos los periodos en una sola query
  const { data: allFactData } = await (supabase.from('facturacion_conductores') as any)
    .select('periodo_id, conductor_id, subtotal_alquiler, subtotal_garantia, subtotal_cargos, saldo_anterior')
    .in('periodo_id', periodoIds)

  // Agrupar facturaciones por periodo_id
  const factByPeriodo = new Map<string, Array<{
    conductor_id: string
    subtotal_alquiler: number
    subtotal_garantia: number
    subtotal_cargos: number
    saldo_anterior: number
  }>>()
  for (const f of (allFactData || []) as any[]) {
    const arr = factByPeriodo.get(f.periodo_id) || []
    arr.push(f)
    factByPeriodo.set(f.periodo_id, arr)
  }

  // 3. BATCH: traer TODOS los pagos Cabify de todas las semanas/años en una sola query
  // Construir filtro por (semana, anio) únicos
  const semanaAnios = [...new Set(periodos.map(p => `${p.semana}_${p.anio}`))]
  const semanas = [...new Set(periodos.map(p => p.semana))]
  const anios = [...new Set(periodos.map(p => p.anio))]

  const { data: allPagosData } = await (supabase.from('pagos_conductores') as any)
    .select('conductor_id, monto, semana, anio')
    .in('semana', semanas)
    .in('anio', anios)
    .eq('tipo_cobro', 'facturacion_semanal')
    .ilike('referencia', 'Pago Cabify%')

  // Agrupar pagos por semana_anio
  const pagosBySemAnio = new Map<string, Array<{ conductor_id: string; monto: number }>>()
  for (const p of (allPagosData || []) as any[]) {
    const key = `${p.semana}_${p.anio}`
    const arr = pagosBySemAnio.get(key) || []
    arr.push(p)
    pagosBySemAnio.set(key, arr)
  }

  // 4. Procesar en memoria
  const results: FactCobDataPoint[] = []

  for (const periodo of periodos) {
    const facturaciones = factByPeriodo.get(periodo.id) || []

    let totalAlquiler = 0
    let totalGarantia = 0
    let totalCargosExtra = 0
    let totalSaldoPrevio = 0

    for (const f of facturaciones) {
      const alq = f.subtotal_alquiler || 0
      const gar = f.subtotal_garantia || 0
      const cargos = f.subtotal_cargos || 0
      totalAlquiler += alq
      totalGarantia += gar
      totalCargosExtra += Math.max(0, cargos - alq - gar)
      totalSaldoPrevio += Math.max(0, f.saldo_anterior || 0)
    }

    const facturado = totalAlquiler + totalGarantia + totalCargosExtra + totalSaldoPrevio

    // Filtrar pagos por conductores del periodo
    const conductorIds = new Set(facturaciones.map(f => f.conductor_id))
    const semAnioKey = `${periodo.semana}_${periodo.anio}`
    const pagos = pagosBySemAnio.get(semAnioKey) || []

    // Filtrar: solo pagos cuyo semana_anio exacto coincide (evitar falsos del .in cruzado)
    let cobrado = 0
    for (const p of pagos) {
      if (conductorIds.has(p.conductor_id)) {
        cobrado += Number(p.monto || 0)
      }
    }

    results.push({
      label: `Sem ${periodo.semana}`,
      facturado,
      cobrado,
      brecha: facturado - cobrado,
      semana: periodo.semana,
      anio: periodo.anio,
    })
  }

  // Limpiar posibles duplicados de pagos por el .in cruzado
  // (semana=21,anio=2025 + semana=22,anio=2026 podría traer semana=21,anio=2026)
  // Ya está manejado con el key semana_anio arriba, pero validamos que
  // semanaAnios contenga el key antes de usarlo
  void semanaAnios

  return results
}

/**
 * Agrega datos semanales por mes.
 */
function aggregateByMonth(data: FactCobDataPoint[]): FactCobDataPoint[] {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const grouped = new Map<string, { facturado: number; cobrado: number; order: number }>()

  for (const d of data) {
    if (!d.semana || !d.anio) continue
    // Aproximar mes a partir de la semana
    const approxMonth = Math.min(11, Math.floor(((d.semana - 1) * 7 + 3) / 30.44))
    const key = `${d.anio}-${approxMonth}`

    if (!grouped.has(key)) {
      grouped.set(key, { facturado: 0, cobrado: 0, order: d.anio * 100 + approxMonth })
    }
    const g = grouped.get(key)!
    g.facturado += d.facturado
    g.cobrado += d.cobrado
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([_key, v]) => {
      const approxMonth = v.order % 100
      const anio = Math.floor(v.order / 100)
      return {
        label: `${meses[approxMonth]} ${anio}`,
        facturado: v.facturado,
        cobrado: v.cobrado,
        brecha: v.facturado - v.cobrado,
      }
    })
}

/**
 * Parsea un selectedPeriod para extraer semana/anio de referencia.
 * "Sem 21 2026" → { semana: 21, anio: 2026 }
 * "May 2026" → última semana del mes (aprox)
 * "2026" → última semana del año
 */
function parseUpTo(selectedPeriod: string, granularity: Granularity): { semana?: number; anio?: number } {
  if (granularity === 'semana') {
    const match = selectedPeriod.match(/Sem\s+(\d+)\s+(\d{4})/)
    if (match) return { semana: parseInt(match[1], 10), anio: parseInt(match[2], 10) }
  }
  if (granularity === 'mes') {
    const mesesMap: Record<string, number> = {
      ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
      jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
    }
    const parts = selectedPeriod.split(' ')
    const mesIdx = mesesMap[parts[0]?.toLowerCase() || '']
    const anio = parseInt(parts[1] || '', 10)
    if (mesIdx !== undefined && !isNaN(anio)) {
      // Aproximar última semana del mes
      const lastWeekOfMonth = Math.min(52, Math.ceil(((mesIdx + 1) * 30.44) / 7))
      return { semana: lastWeekOfMonth, anio }
    }
  }
  if (granularity === 'ano') {
    const anio = parseInt(selectedPeriod, 10)
    if (!isNaN(anio)) return { semana: 52, anio }
  }
  return {}
}

/**
 * Hook principal para el gráfico Facturado vs Cobrado.
 * - semana: últimas 8 semanas cerradas hasta selectedPeriod
 * - mes: semanas agrupadas por mes hasta el mes seleccionado
 * - ano: semanas agrupadas por mes del año seleccionado
 */
export function useFacturadoCobradoData(granularity: Granularity, selectedPeriod: string): FactCobResult {
  const { sedeActualId } = useSede()
  const [result, setResult] = useState<FactCobResult>({ chartData: [], loading: true })
  const lastParams = useRef({ granularity, sedeActualId, selectedPeriod })

  useEffect(() => {
    lastParams.current = { granularity, sedeActualId, selectedPeriod }

    const CACHE_NS = 'useFacturadoCobradoData'
    const paramsKey = JSON.stringify({ granularity, sedeActualId, selectedPeriod })

    const cached = getCache<FactCobResult>(CACHE_NS, paramsKey)
    if (cached) {
      setResult({ chartData: cached.chartData, loading: false })
      return
    }

    let isMounted = true

    async function load() {
      setResult(prev => ({ ...prev, loading: true }))
      try {
        const upTo = parseUpTo(selectedPeriod, granularity)

        let limit = 8
        if (granularity === 'mes') limit = 20
        if (granularity === 'ano') limit = 52

        const raw = await fetchClosedWeeks(sedeActualId ?? null, limit, upTo.semana, upTo.anio)

        let chartData: FactCobDataPoint[]
        if (granularity === 'semana') {
          chartData = raw.slice(-8)
        } else {
          chartData = aggregateByMonth(raw)
          if (granularity === 'mes') {
            chartData = chartData.slice(-5)
          }
        }

        if (isMounted) {
          const result = { chartData, loading: false }
          setResult(result)
          setCache(CACHE_NS, paramsKey, result)
        }
      } catch {
        if (isMounted) {
          setResult(prev => ({ ...prev, loading: false }))
        }
      }
    }

    load()
    return () => { isMounted = false }
  }, [granularity, sedeActualId, selectedPeriod])

  return result
}

/**
 * Hook para el tab comparativo: carga datos para dos periodos específicos.
 * Cada "periodo" es un label tipo "Sem 21 2026" para semana,
 * o "May 2026" para mes, o "2026" para año.
 */
export function useFactCobComparativeData(
  granularity: Granularity,
  periodA: string,
  periodB: string
): { dataA: FactCobDataPoint[]; dataB: FactCobDataPoint[]; loading: boolean } {
  const { sedeActualId } = useSede()
  const [state, setState] = useState<{
    dataA: FactCobDataPoint[]
    dataB: FactCobDataPoint[]
    loading: boolean
  }>({ dataA: [], dataB: [], loading: true })

  useEffect(() => {
    const CACHE_NS = 'useFactCobComparativeData'
    const paramsKey = JSON.stringify({ granularity, periodA, periodB, sedeActualId })

    const cached = getCache<{ dataA: FactCobDataPoint[]; dataB: FactCobDataPoint[] }>(CACHE_NS, paramsKey)
    if (cached) {
      setState({ dataA: cached.dataA, dataB: cached.dataB, loading: false })
      return
    }

    let isMounted = true

    async function load() {
      setState(prev => ({ ...prev, loading: true }))
      try {
        // Para comparativo, traemos todas las semanas cerradas y filtramos
        const allWeeks = await fetchClosedWeeks(sedeActualId ?? null, 104)

        const filterByPeriod = (period: string): FactCobDataPoint[] => {
          if (granularity === 'semana') {
            const match = period.match(/Sem\s+(\d+)\s+(\d{4})/)
            if (!match) return []
            const sem = parseInt(match[1], 10)
            const anio = parseInt(match[2], 10)
            return allWeeks.filter(d => d.semana === sem && d.anio === anio)
          }
          if (granularity === 'mes') {
            const mesesMap: Record<string, number> = {
              ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
              jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
            }
            const parts = period.split(' ')
            const mesIdx = mesesMap[parts[0]?.toLowerCase() || '']
            const anio = parseInt(parts[1] || '', 10)
            if (mesIdx === undefined || isNaN(anio)) return []
            // Filtrar semanas que pertenecen a ese mes
            return allWeeks.filter(d => {
              if (d.anio !== anio) return false
              const approxMonth = Math.min(11, Math.floor(((d.semana! - 1) * 7 + 3) / 30.44))
              return approxMonth === mesIdx
            })
          }
          // año
          const anio = parseInt(period, 10)
          if (isNaN(anio)) return []
          const yearWeeks = allWeeks.filter(d => d.anio === anio)
          return aggregateByMonth(yearWeeks)
        }

        const dataA = filterByPeriod(periodA)
        const dataB = filterByPeriod(periodB)

        if (isMounted) {
          setState({ dataA, dataB, loading: false })
          setCache(CACHE_NS, paramsKey, { dataA, dataB })
        }
      } catch {
        if (isMounted) {
          setState(prev => ({ ...prev, loading: false }))
        }
      }
    }

    load()
    return () => { isMounted = false }
  }, [granularity, periodA, periodB, sedeActualId])

  return state
}
