import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { type Granularity } from '../utils/periodUtils'
import { getCache, setCache } from './useSessionCache'

const CACHE_NS = 'useIncobrabilidadStats'

interface IncobrabilidadResult {
  importeGenerado: number
  cobradoCabify: number
  montoIncobrable: number
  porcentaje: number      // % incobrabilidad (100 - % cubierto)
  periodoExiste: boolean  // si encontró periodo cerrado
}

interface IncobrabilidadStats {
  dataA: IncobrabilidadResult
  dataB: IncobrabilidadResult
  loading: boolean
}

const EMPTY_RESULT: IncobrabilidadResult = {
  importeGenerado: 0,
  cobradoCabify: 0,
  montoIncobrable: 0,
  porcentaje: 0,
  periodoExiste: false,
}

/**
 * Extrae semana y anio de un label tipo "Sem 21 2026" o "Sem 21".
 * Retorna null si el formato no coincide.
 */
function parseSemanaLabel(label: string): { semana: number; anio: number } | null {
  const match = label.match(/Sem\s+(\d+)(?:\s+(\d{4}))?/)
  if (!match) return null
  const semana = parseInt(match[1], 10)
  const anio = match[2] ? parseInt(match[2], 10) : new Date().getFullYear()
  return { semana, anio }
}

/**
 * Calcula incobrabilidad para una semana cerrada.
 * Replica la lógica exacta del modal "Importe Generado" en ReporteFacturacionTab.
 */
async function fetchForPeriod(
  semana: number,
  anio: number,
  sedeId?: string
): Promise<IncobrabilidadResult> {
  // 1. Buscar periodo cerrado
  let qPeriodo = (supabase.from('periodos_facturacion') as any)
    .select('id, estado, semana, anio')
    .eq('semana', semana)
    .eq('anio', anio)
  if (sedeId) qPeriodo = qPeriodo.eq('sede_id', sedeId)
  const { data: periodo } = await qPeriodo.single()

  if (!periodo || periodo.estado !== 'cerrado') {
    return EMPTY_RESULT
  }

  // 2. Facturaciones de ese periodo
  const { data: factData } = await (supabase.from('facturacion_conductores') as any)
    .select('conductor_id, subtotal_alquiler, subtotal_garantia, subtotal_cargos, saldo_anterior')
    .eq('periodo_id', periodo.id)

  const facturaciones = (factData || []) as Array<{
    conductor_id: string
    subtotal_alquiler: number
    subtotal_garantia: number
    subtotal_cargos: number
    saldo_anterior: number
  }>

  // Importe generado = alquiler + garantía + cargos extra + saldo previo
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

  const importeGenerado = totalAlquiler + totalGarantia + totalCargosExtra + totalSaldoPrevio

  // 3. Pagos Cabify -- solo para conductores que están en las facturaciones del periodo
  // (replica la lógica exacta de ReporteFacturacionTab: pagosCabifyMap.get(f.conductor_id))
  const conductorIds = new Set(facturaciones.map(f => f.conductor_id))

  const { data: pagosData } = await (supabase.from('pagos_conductores') as any)
    .select('conductor_id, monto')
    .eq('anio', anio)
    .eq('semana', semana)
    .eq('tipo_cobro', 'facturacion_semanal')
    .ilike('referencia', 'Pago Cabify%')

  let cobradoCabify = 0
  for (const p of (pagosData || []) as Array<{ conductor_id: string; monto: number }>) {
    if (conductorIds.has(p.conductor_id)) {
      cobradoCabify += Number(p.monto || 0)
    }
  }

  const montoIncobrable = Math.max(0, importeGenerado - cobradoCabify)
  const porcentaje = importeGenerado > 0
    ? Math.round(((importeGenerado - cobradoCabify) / importeGenerado) * 100)
    : 0

  return {
    importeGenerado,
    cobradoCabify,
    montoIncobrable,
    porcentaje,
    periodoExiste: true,
  }
}

export function useIncobrabilidadStats(
  granularity: Granularity,
  periodA: string,
  periodB: string,
  sedeId?: string
) {
  const [stats, setStats] = useState<IncobrabilidadStats>({
    dataA: EMPTY_RESULT,
    dataB: EMPTY_RESULT,
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
      const paramsKey = JSON.stringify({ granularity, periodA, periodB, sedeId })
      const cached = getCache<{ dataA: IncobrabilidadResult; dataB: IncobrabilidadResult }>(CACHE_NS, paramsKey)
      if (cached) {
        setStats({ ...cached, loading: false })
        return
      }

      setStats(prev => ({ ...prev, loading: true }))

      // Solo aplica para granularidad "semana"
      if (granularity !== 'semana') {
        if (isMounted) {
          setStats({ dataA: EMPTY_RESULT, dataB: EMPTY_RESULT, loading: false })
        }
        return
      }

      try {
        const parsedA = parseSemanaLabel(periodA)
        const parsedB = parseSemanaLabel(periodB)

        const [dataA, dataB] = await Promise.all([
          parsedA ? fetchForPeriod(parsedA.semana, parsedA.anio, sedeId) : Promise.resolve(EMPTY_RESULT),
          parsedB ? fetchForPeriod(parsedB.semana, parsedB.anio, sedeId) : Promise.resolve(EMPTY_RESULT),
        ])

        if (isMounted) {
          const result = { dataA, dataB }
          setCache(CACHE_NS, paramsKey, result)
          setStats({ ...result, loading: false })
        }
      } catch {
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
