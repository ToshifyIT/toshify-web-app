// src/services/appsPagoService.ts
// Apps con las que pagó cada conductor (etiquetas "Cabify" / "DiDi"). Misma regla en
// Facturación (bajo el nombre del conductor) y en el Panel de conductores (columna App).
// En la semana N cuentan:
//   - Las cargas de los botones Pagos Cabify / Pagos DiDi al cerrar la semana N-1
//     ("Pago Cabify S44/2026" se ve en la S45), con monto > 0.
//   - Los pagos manuales registrados dentro de la semana N cuya referencia nombra la
//     app ("Pago en efectivo | Ingreso por DiDi").

import { supabase } from '../lib/supabase'
import { semanaISO, sumarSemanasISO } from '../utils/semanaISO'

export interface AppsPago {
  cabify: boolean
  didi: boolean
}

const LOTE_IDS = 200
const PAGINA = 1000

/**
 * @param inicioSemana lunes de la semana N ("YYYY-MM-DD").
 * @param conductorIds si se pasa, solo esos conductores; si no, todos.
 */
export async function cargarAppsPagoSemana(inicioSemana: string, conductorIds?: string[]): Promise<Map<string, AppsPago>> {
  const lunes = inicioSemana.slice(0, 10)
  const inicio = new Date(`${lunes}T00:00:00-03:00`)
  const fin = new Date(inicio.getTime() + 7 * 86_400_000 - 1)
  const { semana, anio } = semanaISO(lunes)
  const previa = sumarSemanasISO(semana, anio, -1)
  const refsCierrePrevio = [`Pago Cabify S${previa.semana}/${previa.anio}`, `Pago DiDi S${previa.semana}/${previa.anio}`]

  const resultado = new Map<string, AppsPago>()
  const marcar = (conductorId: string | null | undefined, referencia: string | null) => {
    if (!conductorId) return
    const ref = (referencia || '').toLowerCase()
    const cabify = ref.includes('cabify')
    const didi = ref.includes('didi')
    if (!cabify && !didi) return
    const previo = resultado.get(conductorId) || { cabify: false, didi: false }
    resultado.set(conductorId, { cabify: previo.cabify || cabify, didi: previo.didi || didi })
  }

  // Sin lista de conductores: un solo grupo sin filtro de ids (paginado)
  const grupos: Array<string[] | null> = []
  if (conductorIds) {
    const ids = [...new Set(conductorIds)]
    for (let k = 0; k < ids.length; k += LOTE_IDS) grupos.push(ids.slice(k, k + LOTE_IDS))
  } else {
    grupos.push(null)
  }

  for (const ids of grupos) {
    for (let desde = 0; ; desde += PAGINA) {
      let q = (supabase.from('pagos_conductores') as any)
        .select('conductor_id, referencia')
        .eq('tipo_cobro', 'facturacion_semanal')
        .in('referencia', refsCierrePrevio)
        .gt('monto', 0)
        .order('id')
        .range(desde, desde + PAGINA - 1)
      if (ids) q = q.in('conductor_id', ids)
      const { data, error } = await q
      if (error) throw error
      for (const p of data || []) marcar(p.conductor_id, p.referencia)
      if (!data || data.length < PAGINA) break
    }
    for (let desde = 0; ; desde += PAGINA) {
      let q = (supabase.from('control_saldos') as any)
        .select('conductor_id, referencia')
        .in('tipo_movimiento', ['pago_manual', 'pago_efectivo'])
        .gt('monto_movimiento', 0)
        .gte('created_at', inicio.toISOString())
        .lte('created_at', fin.toISOString())
        .or('referencia.ilike.*cabify*,referencia.ilike.*didi*')
        .order('id')
        .range(desde, desde + PAGINA - 1)
      if (ids) q = q.in('conductor_id', ids)
      const { data, error } = await q
      if (error) throw error
      for (const m of data || []) marcar(m.conductor_id, m.referencia)
      if (!data || data.length < PAGINA) break
    }
  }
  return resultado
}

/** Etiquetas para mostrar: ['Cabify'], ['DiDi'], ['Cabify', 'DiDi'] o []. */
export function etiquetasApps(apps: AppsPago | undefined): string[] {
  if (!apps) return []
  return [...(apps.cabify ? ['Cabify'] : []), ...(apps.didi ? ['DiDi'] : [])]
}
