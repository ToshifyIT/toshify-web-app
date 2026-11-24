// BCRA de los conductores para Seguimiento de conductores (sql/conductores_bcra.sql).
// Lo consulta server-bcra.js a los conductores activos una vez por mes; el color sale de
// Parámetros > Riesgo BCRA, igual que en Leads.
import { supabase } from '../../lib/supabase'

export interface BcraConductor {
  bcra_consultado_at: string | null
  bcra_error: string | null
  bcra_nivel: 'verde' | 'amarillo' | 'rojo' | null
  bcra_nivel_motivo: string | null
  bcra_situacion: number | null
  bcra_resumen: string | null
}

export const OPCIONES_BCRA_CONDUCTOR = ['Verde', 'Amarillo', 'Rojo', 'Sin validar', 'Pendiente']

export const COLOR_BCRA_CONDUCTOR: Record<string, string> = {
  Verde: 'var(--color-success)',
  Amarillo: 'var(--color-warning)',
  Rojo: 'var(--color-danger)',
  'Sin validar': 'var(--color-warning)',
}

/** Verde / Amarillo / Rojo / Sin validar (el nombre no coincide, CUIT inválido) / Pendiente. */
export function grupoBcraConductor(b: BcraConductor | undefined): string {
  if (b?.bcra_consultado_at) {
    if (b.bcra_error) return 'Sin validar'
    if (b.bcra_nivel === 'verde') return 'Verde'
    if (b.bcra_nivel === 'amarillo') return 'Amarillo'
    if (b.bcra_nivel === 'rojo') return 'Rojo'
  }
  return 'Pendiente'
}

/** Situación 0 a 6 si hay consulta válida; si no, null. */
export function situacionBcraConductor(b: BcraConductor | undefined): number | null {
  if (!b?.bcra_consultado_at || b.bcra_error) return null
  return b.bcra_situacion ?? 0
}

const COLUMNAS = 'id,bcra_consultado_at,bcra_error,bcra_nivel,bcra_nivel_motivo,bcra_situacion,bcra_resumen'
const LOTE = 200

/**
 * BCRA de los conductores pedidos, por id. Si todavía no se corrió sql/conductores_bcra.sql
 * devuelve un mapa vacío (las columnas quedan en "Pendiente") sin romper la página.
 */
export async function cargarBcraConductores(ids: string[]): Promise<Map<string, BcraConductor>> {
  const mapa = new Map<string, BcraConductor>()
  const unicos = [...new Set(ids.filter(Boolean))]
  try {
    for (let i = 0; i < unicos.length; i += LOTE) {
      const { data, error } = await supabase
        .from('conductores')
        .select(COLUMNAS)
        .in('id', unicos.slice(i, i + LOTE))
      if (error) throw error
      for (const fila of (data ?? []) as unknown as (BcraConductor & { id: string })[]) {
        mapa.set(fila.id, fila)
      }
    }
  } catch (error) {
    console.error('Error cargando el BCRA de los conductores:', error)
  }
  return mapa
}
