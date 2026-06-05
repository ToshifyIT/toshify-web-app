import { supabase } from '../lib/supabase'

interface CobroMultasStatsParams {
  start?: string
  end?: string
  semana?: number
  anio?: number
  sedeId?: string | null
}

interface CobroMultasStatsResult {
  total: number
  count: number
}

const PAGE_SIZE = 1000

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function getRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

function getYearFromDate(value: string | null | undefined) {
  if (!value) return null
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function getPeriodoAplicacion(row: {
  semana: number | null
  semana_aplicacion: number | null
  anio_aplicacion: number | null
  fecha: string | null
}) {
  return {
    semana: row.semana_aplicacion ?? row.semana,
    anio: row.anio_aplicacion ?? getYearFromDate(row.fecha),
  }
}

function isP007MultaTransito(row: {
  tipos_cobro_descuento?: {
    categoria: string | null
    nombre: string | null
  } | Array<{
    categoria: string | null
    nombre: string | null
  }> | null
}) {
  const tipo = getRelation(row.tipos_cobro_descuento)
  if (tipo?.categoria !== 'P007') return false

  const tipoNombre = normalize(tipo?.nombre)
  return tipoNombre.includes('multa') && tipoNombre.includes('transito')
}

export async function fetchCobroMultasStats({
  start,
  end,
  semana,
  anio,
  sedeId,
}: CobroMultasStatsParams): Promise<CobroMultasStatsResult> {
  let total = 0
  let count = 0
  let from = 0
  let totalRows: number | null = null

  while (true) {
    let query = (supabase.from('penalidades' as any) as any)
      .select(`
        monto,
        semana,
        semana_aplicacion,
        anio_aplicacion,
        fecha,
        tipos_cobro_descuento!inner (
          categoria,
          nombre
        )
      `, { count: 'exact' })
      .eq('tipos_cobro_descuento.categoria', 'P007')
      .gt('monto', 0)
      .neq('rechazado', true)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (semana == null && start) {
      query = query.gte('fecha', start)
    }

    if (semana == null && end) {
      query = query.lte('fecha', end)
    }

    if (sedeId) {
      query = query.eq('sede_id', sedeId)
    }

    const { data, error, count: exactCount } = await query

    if (error) throw error

    const rows = (data || []) as Array<{
      monto: number | string | null
      semana: number | null
      semana_aplicacion: number | null
      anio_aplicacion: number | null
      fecha: string | null
      tipos_cobro_descuento?: {
        categoria: string | null
        nombre: string | null
      } | Array<{
        categoria: string | null
        nombre: string | null
      }> | null
    }>

    const matchingRows = rows.filter(row => {
      if (!isP007MultaTransito(row)) return false

      if (semana != null) {
        const periodo = getPeriodoAplicacion(row)
        if (periodo.semana !== semana) return false
        if (anio != null && periodo.anio !== anio) return false
        return true
      }

      if (anio != null) {
        const rowAnio = getYearFromDate(row.fecha)
        if (rowAnio !== anio) return false
      }

      return true
    })

    total += matchingRows.reduce((sum, row) => sum + (Number(row.monto) || 0), 0)

    if (exactCount != null) {
      totalRows = exactCount
    }
    count += matchingRows.length

    if (rows.length < PAGE_SIZE) break

    from += PAGE_SIZE
    if (totalRows != null && from >= totalRows) break
  }

  return { total, count }
}
