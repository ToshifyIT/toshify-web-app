// src/modules/reportes/directivo/directivoService.ts
// Lectura del Dashboard Directivo.
// - Números: función SQL get_dashboard_directivo (sql/dashboard_directivo.sql).
// - Análisis con IA: servidor de Toshibase, ruta /api/insights-directivo (server-insights-directivo.js).
import type { DirectivoRaw, Lectura } from './directivoTypes'
import { supabase } from '../../../lib/supabase'

export class FuncionDirectivoNoInstaladaError extends Error {
  constructor() {
    super('La función get_dashboard_directivo no existe en la base. Ejecutar sql/dashboard_directivo.sql.')
    this.name = 'FuncionDirectivoNoInstaladaError'
  }
}

export async function fetchDashboardDirectivo(
  sedeId: string | null,
  desde: string,
  hasta: string,
): Promise<DirectivoRaw> {
  const { data, error } = await supabase.rpc('get_dashboard_directivo', {
    p_sede_id: sedeId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) {
    // PGRST202: PostgREST no encuentra la función (no se ejecutó el SQL)
    if (error.code === 'PGRST202') throw new FuncionDirectivoNoInstaladaError()
    throw error
  }
  return data as DirectivoRaw
}

export interface InsightsIA {
  insights: Lectura[]
  generado_en: string
}

/**
 * Pide el análisis con IA al servidor de Toshibase (/api/insights-directivo,
 * server-insights-directivo.js). La clave de Gemini vive solo en el servidor.
 * El servidor lo genera como máximo una vez por semana por sede y período (queda
 * guardado); el resto de las veces lo lee.
 * Devuelve null si no está disponible: el frontend usa las lecturas por reglas.
 */
export async function fetchInsightsIA(
  sedeId: string | null,
  desde: string,
  hasta: string,
): Promise<InsightsIA | null> {
  const { data: sesion } = await supabase.auth.getSession()
  const token = sesion.session?.access_token
  if (!token) return null

  const res = await fetch('/api/insights-directivo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sede_id: sedeId, desde, hasta }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data?.insights || !Array.isArray(data.insights) || data.insights.length === 0) return null
  return { insights: data.insights as Lectura[], generado_en: String(data.generado_en ?? '') }
}
