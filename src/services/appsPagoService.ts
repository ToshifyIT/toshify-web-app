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
  /**
   * Solo con `ultimaConocida`: la semana pasada no hubo pagos por app y esto es lo
   * último que se vio («S45/2026»). Se muestra en gris para no dejar el dato vacío.
   */
  ultimaSemana?: string
}

const LOTE_IDS = 200
const PAGINA = 1000
// Hasta cuántas semanas hacia atrás se busca la última app conocida
const SEMANAS_ULTIMA_APP = 8

/** Semana ISO («S45/2026») de un instante, en hora de Argentina */
function etiquetaSemanaART(iso: string): { clave: number; texto: string } {
  const dia = new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
  const { semana, anio } = semanaISO(dia)
  return { clave: anio * 100 + semana, texto: `S${semana}/${anio}` }
}

const appsDeReferencia = (referencia: string | null) => {
  const ref = (referencia || '').toLowerCase()
  return { cabify: ref.includes('cabify'), didi: ref.includes('didi') }
}

/**
 * Para los conductores sin app en la semana: la última app con la que pagaron en las
 * SEMANAS_ULTIMA_APP anteriores (cargas de cierre «Pago Cabify/DiDi SNN» con monto > 0
 * y pagos manuales que nombran la app). Si en esa semana usó las dos, van las dos.
 */
async function completarUltimaApp(resultado: Map<string, AppsPago>, lunes: string, conductorIds?: string[]) {
  const { semana, anio } = semanaISO(lunes)
  // La semana N mira el cierre de N-1: el fallback arranca en N-2
  const semanas = Array.from({ length: SEMANAS_ULTIMA_APP }, (_, i) => sumarSemanasISO(semana, anio, -2 - i))
  const refs = semanas.flatMap((w) => [`Pago Cabify S${w.semana}/${w.anio}`, `Pago DiDi S${w.semana}/${w.anio}`])
  const desdeFecha = new Date(new Date(`${lunes}T00:00:00-03:00`).getTime() - SEMANAS_ULTIMA_APP * 7 * 86_400_000)

  const mejor = new Map<string, { clave: number; texto: string; cabify: boolean; didi: boolean }>()
  const anotar = (id: string | null | undefined, clave: number, texto: string, referencia: string | null) => {
    if (!id || resultado.has(id)) return
    const apps = appsDeReferencia(referencia)
    if (!apps.cabify && !apps.didi) return
    const actual = mejor.get(id)
    if (!actual || clave > actual.clave) mejor.set(id, { clave, texto, ...apps })
    else if (clave === actual.clave) mejor.set(id, { ...actual, cabify: actual.cabify || apps.cabify, didi: actual.didi || apps.didi })
  }

  const grupos: Array<string[] | null> = conductorIds
    ? Array.from({ length: Math.ceil(conductorIds.length / LOTE_IDS) }, (_, k) => conductorIds.slice(k * LOTE_IDS, (k + 1) * LOTE_IDS))
    : [null]
  for (const ids of grupos) {
    for (let desde = 0; ; desde += PAGINA) {
      let q = (supabase.from('pagos_conductores') as any)
        .select('conductor_id, referencia')
        .eq('tipo_cobro', 'facturacion_semanal')
        .in('referencia', refs)
        .gt('monto', 0)
        .order('id')
        .range(desde, desde + PAGINA - 1)
      if (ids) q = q.in('conductor_id', ids)
      const { data, error } = await q
      if (error) throw error
      for (const p of data || []) {
        const m = /S(\d+)\/(\d{4})/.exec(p.referencia || '')
        if (m) anotar(p.conductor_id, Number(m[2]) * 100 + Number(m[1]), `S${m[1]}/${m[2]}`, p.referencia)
      }
      if (!data || data.length < PAGINA) break
    }
    for (let desde = 0; ; desde += PAGINA) {
      let q = (supabase.from('control_saldos') as any)
        .select('conductor_id, referencia, created_at')
        .in('tipo_movimiento', ['pago_manual', 'pago_efectivo'])
        .gt('monto_movimiento', 0)
        .gte('created_at', desdeFecha.toISOString())
        .lt('created_at', new Date(`${lunes}T00:00:00-03:00`).toISOString())
        .or('referencia.ilike.*cabify*,referencia.ilike.*didi*')
        .order('id')
        .range(desde, desde + PAGINA - 1)
      if (ids) q = q.in('conductor_id', ids)
      const { data, error } = await q
      if (error) throw error
      for (const m of data || []) {
        const w = etiquetaSemanaART(m.created_at)
        anotar(m.conductor_id, w.clave, w.texto, m.referencia)
      }
      if (!data || data.length < PAGINA) break
    }
  }
  for (const [id, u] of mejor) resultado.set(id, { cabify: u.cabify, didi: u.didi, ultimaSemana: u.texto })
}

/**
 * @param inicioSemana lunes de la semana N ("YYYY-MM-DD").
 * @param conductorIds si se pasa, solo esos conductores; si no, todos.
 * @param opciones.ultimaConocida si no pagó por ninguna app en la semana, devuelve la
 *   última app vista (con `ultimaSemana`). Para listados de conductores; Facturación no lo usa.
 */
export async function cargarAppsPagoSemana(
  inicioSemana: string,
  conductorIds?: string[],
  opciones?: { ultimaConocida?: boolean },
): Promise<Map<string, AppsPago>> {
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
  if (opciones?.ultimaConocida) {
    try {
      await completarUltimaApp(resultado, lunes, conductorIds ? [...new Set(conductorIds)] : undefined)
    } catch (err) {
      // Es un dato de ayuda: si falla, queda la regla de la semana sola
      console.error('Error buscando la última app de los conductores:', err)
    }
  }
  return resultado
}

/** Etiquetas para mostrar: ['Cabify'], ['DiDi'], ['Cabify', 'DiDi'] o []. */
export function etiquetasApps(apps: AppsPago | undefined): string[] {
  if (!apps) return []
  return [...(apps.cabify ? ['Cabify'] : []), ...(apps.didi ? ['DiDi'] : [])]
}
