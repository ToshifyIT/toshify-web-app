// Riesgo de no poder pagar la deuda (2026-11-18).
//
// Se calcula con la facturación semanal (facturacion_conductores) de las últimas
// semanas CERRADAS. Por cada conductor:
//   - cargo semanal promedio = subtotal_neto de las últimas 4 semanas
//   - deuda = saldo_anterior con el que arrancó la última semana cerrada
//   - semanas cortas = semanas en las que pagó menos del 90% de lo que tenía que
//     pagar (lo pagado sale de cuánto pasó de saldo a la semana siguiente)
//   - tendencia = cuánto cambió la deuda en esas semanas
//
// Niveles (validados contra semanas 1-42 de 2026: a 4 semanas terminaron debiendo
// 1+ semana de alquiler el 66% de los Alto, 30% de los Medio y 4% de los Bajo):
//   Alto  = debe 1 semana o más y la deuda sube, o 3 semanas cortas seguidas
//   Medio = debe más de 1/4 de semana, o tuvo alguna semana corta
//   Bajo  = el resto
// Hace falta haber facturado las 4 semanas; si no, queda sin nivel.

import { supabase } from '../../../lib/supabase'

export type NivelRiesgoDeuda = 'alto' | 'medio' | 'bajo'

export interface RiesgoDeuda {
  nivel: NivelRiesgoDeuda
  /** Deuda actual medida en semanas de alquiler (1 = debe una semana) */
  semanasDeuda: number
  /** Deuda actual en pesos */
  deuda: number
  /** Semanas (de las 3 anteriores) en las que pagó menos del 90% */
  semanasCortas: number
  /** Cambio de la deuda en las últimas 3 semanas, en semanas de alquiler */
  tendencia: number
  /** Semana cerrada usada como referencia, ej. "S45/2026" */
  semanaRef: string
}

const SEMANAS = 4
const PAGO_COMPLETO = 0.9

interface FilaFact {
  periodo_id: string
  conductor_id: string
  subtotal_neto: number | null
  saldo_anterior: number | null
  total_a_pagar: number | null
}

export const NIVEL_RIESGO_LABEL: Record<NivelRiesgoDeuda, string> = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
}

export function textoRiesgo(r: RiesgoDeuda): string {
  const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  const partes = [
    `Riesgo ${NIVEL_RIESGO_LABEL[r.nivel].toLowerCase()} (${r.semanaRef})`,
    r.deuda > 0 ? `Debe ${fmt(r.semanasDeuda)} semana(s) de alquiler` : 'Sin deuda',
    `Semanas pagando menos del 90%: ${r.semanasCortas} de 3`,
  ]
  if (r.deuda > 0 && r.tendencia !== 0) {
    partes.push(`La deuda ${r.tendencia > 0 ? 'subió' : 'bajó'} ${fmt(Math.abs(r.tendencia))} semana(s) en 3 semanas`)
  }
  return partes.join('\n')
}

/**
 * Riesgo por conductor con las últimas semanas cerradas de la sede (o de todas
 * las sedes si sedeId es null; cada conductor se mide con las de su sede).
 */
export async function cargarRiesgoDeuda(sedeId: string | null): Promise<Map<string, RiesgoDeuda>> {
  let q = supabase
    .from('periodos_facturacion')
    .select('id, semana, anio, sede_id')
    .eq('estado', 'cerrado')
    .order('anio', { ascending: false })
    .order('semana', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data: periodos, error } = await q
  if (error) throw error

  // Últimas 4 semanas cerradas de cada sede, de la más vieja a la más nueva
  const porSede = new Map<string, { id: string; semana: number; anio: number }[]>()
  for (const p of periodos || []) {
    const lista = porSede.get(p.sede_id) || []
    if (lista.length < SEMANAS) lista.push(p)
    porSede.set(p.sede_id, lista)
  }
  const ids: string[] = []
  for (const lista of porSede.values()) {
    lista.reverse()
    ids.push(...lista.map(p => p.id))
  }
  if (!ids.length) return new Map()

  const filas: FilaFact[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase
      .from('facturacion_conductores')
      .select('periodo_id, conductor_id, subtotal_neto, saldo_anterior, total_a_pagar')
      .in('periodo_id', ids)
      .range(desde, desde + 999)
    if (e) throw e
    filas.push(...(data as FilaFact[]))
    if (!data || data.length < 1000) break
  }

  const resultado = new Map<string, RiesgoDeuda>()
  for (const lista of porSede.values()) {
    if (lista.length < SEMANAS) continue
    const ultima = lista[lista.length - 1]
    const semanaRef = `S${ultima.semana}/${ultima.anio}`
    const idsSede = new Set(lista.map(p => p.id))
    // conductor -> fila de cada semana (en el orden de lista)
    const porConductor = new Map<string, (FilaFact | undefined)[]>()
    for (const f of filas) {
      if (!idsSede.has(f.periodo_id)) continue
      // Array.from (no new Array): .some() saltea los huecos y dejaba pasar semanas faltantes
      const sem = porConductor.get(f.conductor_id) || Array.from<FilaFact | undefined>({ length: SEMANAS })
      sem[lista.findIndex(p => p.id === f.periodo_id)] = f
      porConductor.set(f.conductor_id, sem)
    }
    for (const [conductorId, sem] of porConductor) {
      if (sem.some(f => !f)) continue
      const s = sem as FilaFact[]
      const cargo = s.reduce((a, f) => a + Math.max(Number(f.subtotal_neto) || 0, 0), 0) / SEMANAS
      if (cargo <= 0) continue
      const deudaDe = (f: FilaFact) => Math.max(Number(f.saldo_anterior) || 0, 0)
      let semanasCortas = 0
      for (let i = 0; i < SEMANAS - 1; i++) {
        const aPagar = Number(s[i].total_a_pagar) || 0
        if (aPagar <= 0) continue
        const pagado = aPagar - (Number(s[i + 1].saldo_anterior) || 0)
        if (pagado / aPagar < PAGO_COMPLETO) semanasCortas++
      }
      const deuda = deudaDe(s[SEMANAS - 1])
      const semanasDeuda = deuda / cargo
      const tendencia = (deuda - deudaDe(s[0])) / cargo
      const nivel: NivelRiesgoDeuda =
        (semanasDeuda >= 1 && tendencia > 0) || semanasCortas >= 3 ? 'alto'
          : semanasDeuda >= 0.25 || semanasCortas >= 1 ? 'medio'
            : 'bajo'
      resultado.set(conductorId, { nivel, semanasDeuda, deuda, semanasCortas, tendencia, semanaRef })
    }
  }
  return resultado
}
