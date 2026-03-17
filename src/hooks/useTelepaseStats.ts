import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPeriodRange, type Granularity } from '../utils/periodUtils'

const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'

/** Determina qué tablas consultar según la sede */
function getTableNames(sedeId?: string | null): string[] {
  if (sedeId === SEDE_BARILOCHE_ID) return ['cabify_historico_bariloche']
  if (!sedeId) return ['cabify_historico', 'cabify_historico_bariloche']
  return ['cabify_historico']
}

/** Suma peajes de cabify_historico para un rango, deduplicando por dni+fecha */
async function sumPeajesRange(
  startISO: string,
  endISO: string,
  sedeId?: string | null
): Promise<number> {
  const tables = getTableNames(sedeId)

  const queries = tables.map(table =>
    supabase
      .from(table)
      .select('dni, peajes, fecha_inicio, fecha_guardado')
      .gte('fecha_inicio', startISO)
      .lte('fecha_inicio', endISO)
      .limit(10000)
  )

  const results = await Promise.all(queries)

  // Unificar registros de todas las tablas
  const allRows: { dni: string; peajes: number; fecha: string; guardado: string }[] = []
  for (const res of results) {
    if (res.error || !res.data) continue
    for (const r of res.data) {
      allRows.push({
        dni: String(r.dni || '').replace(/[.\-]/g, '').replace(/^0+/, ''),
        peajes: Number(r.peajes) || 0,
        fecha: (r.fecha_inicio || '').substring(0, 10),
        guardado: r.fecha_guardado || ''
      })
    }
  }

  // Deduplicar: por cada dni+fecha, quedarse con el registro que tenga peajes > 0;
  // si ambos tienen peajes, tomar el de fecha_guardado más reciente.
  const map = new Map<string, { peajes: number; guardado: string }>()
  for (const row of allRows) {
    const key = `${row.dni}|${row.fecha}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { peajes: row.peajes, guardado: row.guardado })
      continue
    }
    // Priorizar registro con peajes > 0
    if (existing.peajes === 0 && row.peajes > 0) {
      map.set(key, { peajes: row.peajes, guardado: row.guardado })
    } else if (existing.peajes > 0 && row.peajes > 0 && row.guardado > existing.guardado) {
      map.set(key, { peajes: row.peajes, guardado: row.guardado })
    }
  }

  let total = 0
  for (const v of map.values()) {
    total += v.peajes
  }
  return total
}

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

  useEffect(() => {
    lastParams.current = { granularity, periodA, periodB, sedeId }

    let isMounted = true

    async function fetchStats() {
      setStats(prev => ({ ...prev, loading: true }))

      try {
        const rangeA = getPeriodRange(granularity, periodA)
        const rangeB = getPeriodRange(granularity, periodB)

        const [totalA, totalB] = await Promise.all([
          sumPeajesRange(rangeA.start.toISOString(), rangeA.end.toISOString(), sedeId || null),
          sumPeajesRange(rangeB.start.toISOString(), rangeB.end.toISOString(), sedeId || null)
        ])

        if (isMounted) {
          setStats({ totalA, totalB, loading: false })
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
