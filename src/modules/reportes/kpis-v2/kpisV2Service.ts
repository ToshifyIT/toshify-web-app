// src/modules/reportes/kpis-v2/kpisV2Service.ts
// Lectura y escritura del Dashboard KPI v2 (sql/dashboard_kpis_v2.sql).
import type { CampoForecast, ForecastFila, ForecastRaw, KpisV2Raw } from './kpisV2Types'
import { supabase } from '../../../lib/supabase'

export class FuncionKpisV2NoInstaladaError extends Error {
  constructor() {
    super('La función get_dashboard_kpis_v2 no existe en la base. Ejecutar sql/dashboard_kpis_v2.sql.')
    this.name = 'FuncionKpisV2NoInstaladaError'
  }
}

export class FuncionKpisV2DesactualizadaError extends Error {
  constructor() {
    super('La función get_dashboard_kpis_v2 de la base es una versión anterior. Volver a ejecutar sql/dashboard_kpis_v2.sql.')
    this.name = 'FuncionKpisV2DesactualizadaError'
  }
}

export async function fetchKpisV2(
  sedeId: string | null,
  desde: string,
  hasta: string,
): Promise<KpisV2Raw> {
  const { data, error } = await supabase.rpc('get_dashboard_kpis_v2', {
    p_sede_id: sedeId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) {
    // PGRST202: PostgREST no encuentra la función (no se ejecutó el SQL)
    if (error.code === 'PGRST202') throw new FuncionKpisV2NoInstaladaError()
    throw error
  }
  const raw = data as KpisV2Raw
  // La pantalla es más nueva que la función de la base: sin estos datos mostraría ceros
  const primerDia = (raw.dias ?? [])[0] as unknown as Record<string, unknown> | undefined
  if (primerDia && (!('cd' in primerDia) || !('cc' in primerDia) || !('fa' in primerDia))) {
    throw new FuncionKpisV2DesactualizadaError()
  }
  return {
    ...raw,
    dias: (raw.dias ?? []).map(d => ({
      ...d,
      fn: d.fn === null ? null : Number(d.fn),
      ac: d.ac === null ? null : Number(d.ac),
      co: d.co === null ? null : Number(d.co),
      cc: d.cc === null || d.cc === undefined ? null : Number(d.cc),
      fa: d.fa === null || d.fa === undefined ? null : Number(d.fa),
      fg: d.fg === null || d.fg === undefined ? null : Number(d.fg),
      ft: d.ft === null || d.ft === undefined ? null : Number(d.ft),
      fd: d.fd === null || d.fd === undefined ? null : Number(d.fd),
      cd: d.cd === null || d.cd === undefined ? null : Number(d.cd),
      al: Number(d.al ?? 0),
      ba: Number(d.ba ?? 0),
    })),
    bajas: raw.bajas ?? [],
    forecast: (raw.forecast ?? []).map(f => ({
      ...f,
      flota: f.flota === null ? null : Number(f.flota),
      ocupacion: f.ocupacion === null ? null : Number(f.ocupacion),
      operatividad: f.operatividad === null ? null : Number(f.operatividad),
      facturacion: f.facturacion === null ? null : Number(f.facturacion),
      cobranza: f.cobranza === null ? null : Number(f.cobranza),
    })),
  }
}

/** Forecast cargado desde una semana en adelante (para prellenar la plantilla). */
export async function fetchForecastDesde(sedeId: string | null, desde: string): Promise<ForecastRaw[]> {
  let query = supabase
    .from('kpi_forecast')
    .select('semana_inicio, flota, ocupacion, operatividad, facturacion, cobranza, actualizado_por, updated_at')
    .gte('semana_inicio', desde)
    .order('semana_inicio')
  query = sedeId ? query.eq('sede_id', sedeId) : query.is('sede_id', null)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as ForecastRaw[]).map(f => ({
    ...f,
    flota: f.flota === null ? null : Number(f.flota),
    ocupacion: f.ocupacion === null ? null : Number(f.ocupacion),
    operatividad: f.operatividad === null ? null : Number(f.operatividad),
    facturacion: f.facturacion === null ? null : Number(f.facturacion),
    cobranza: f.cobranza === null ? null : Number(f.cobranza),
  }))
}

/**
 * Guarda el forecast (todo o nada). Solo se pisan las columnas que trae el
 * archivo; el resto de cada semana queda como estaba.
 */
export async function guardarForecast(
  sedeId: string | null,
  filas: ForecastFila[],
  columnas: CampoForecast[],
  usuario: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('kpi_guardar_forecast', {
    p_sede_id: sedeId,
    p_filas: filas,
    p_columnas: columnas,
    p_usuario: usuario,
  })
  if (error) throw error
  return Number(data ?? 0)
}
