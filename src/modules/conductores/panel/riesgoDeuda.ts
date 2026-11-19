// Riesgo de no poder pagar la deuda (2026-11-18).
//
// Se calcula con la facturación semanal (facturacion_conductores) de las últimas
// semanas CERRADAS. Por cada conductor:
//   - cargo semanal promedio = subtotal_neto de las últimas 4 semanas
//   - deuda = saldo_anterior con el que arranca la semana siguiente a la última
//     cerrada (o sea, ya descontado lo que pagó de la última cerrada)
//   - semanas cortas = de las 3 últimas cerradas, en cuántas pagó menos del 90% de lo
//     que tenía que pagar (lo pagado sale de cuánto pasó de saldo a la semana siguiente)
//   - tendencia = cuánto cambió la deuda en esas semanas
// (2026-11-18: antes se medía hasta el inicio de la última cerrada y no veía su pago:
// quien saldaba todo esa semana seguía como «Alto». Si el conductor no tiene la semana
// siguiente facturada, se usa la cuenta anterior.)
//
// Niveles (validados contra semanas 1-42 de 2026: a 4 semanas terminaron debiendo
// 1+ semana de alquiler el 66% de los Alto, 30% de los Medio y 4% de los Bajo):
//   Alto  = debe 1 semana o más y la deuda sube, o 3 semanas cortas seguidas
//   Medio = debe más de 1/4 de semana, o tuvo alguna semana corta
//   Bajo  = el resto
// Conductores nuevos (menos de 4 semanas seguidas facturadas, 2026-11-19): se evalúan con
// las que tienen, según cómo pagaron la semana anterior. Con 2 o más pagos conocidos, «Alto»
// por semanas cortas pide que TODAS sean cortas; con 1 solo, una corta da «Medio». Sin
// ningún pago conocido todavía (arrancó la última semana) queda sin nivel.

import { supabase } from '../../../lib/supabase'

export type NivelRiesgoDeuda = 'alto' | 'medio' | 'bajo'

export interface RiesgoDeuda {
  nivel: NivelRiesgoDeuda
  /** Deuda actual medida en semanas de alquiler (1 = debe una semana) */
  semanasDeuda: number
  /** Deuda actual en pesos */
  deuda: number
  /** Semanas (de las 3 anteriores, o de las que tenga) en las que pagó menos del 90% */
  semanasCortas: number
  /** Pagos semanales evaluados (3, o menos si es nuevo) */
  semanasEvaluadas: number
  /** Cambio de la deuda en las últimas 3 semanas, en semanas de alquiler */
  tendencia: number
  /** Semana cerrada usada como referencia, ej. "S45/2026" */
  semanaRef: string
  /** Cargo semanal promedio (para medir la deuda en semanas) */
  cargo: number
  /** Deuda al arrancar la ventana (para la tendencia) */
  deudaInicio: number
}

export interface ResultadoRiesgoDeuda {
  riesgos: Map<string, RiesgoDeuda>
  /**
   * Conductores que en las 2 últimas semanas cerradas con pago conocido pagaron menos que
   * la facturación de esa semana (subtotal_neto, sin la deuda anterior). Va aparte del
   * riesgo: alcanza con 2 semanas facturadas, así entran también los conductores nuevos.
   */
  sinCubrir2Semanas: Set<string>
}

function nivelDe(semanasDeuda: number, tendencia: number, semanasCortas: number, evaluadas = 3): NivelRiesgoDeuda {
  // «Alto» por semanas cortas: todas las evaluadas (3; un nuevo con 2 pagos, las 2)
  const cortasAlto = evaluadas >= 2 ? Math.min(3, evaluadas) : Infinity
  return (semanasDeuda >= 1 && tendencia > 0) || semanasCortas >= cortasAlto ? 'alto'
    : semanasDeuda >= 0.25 || semanasCortas >= 1 ? 'medio'
      : 'bajo'
}

/**
 * Ajusta la deuda con el saldo actual del conductor (Saldo pendiente del panel). La
 * facturación guarda el saldo con que arrancó cada semana y no se entera de los pagos
 * posteriores: quien ya pagó esta semana seguía como deudor.
 */
export function ajustarConSaldoActual(
  riesgos: Map<string, RiesgoDeuda>,
  saldoActual: Map<string, number>,
): Map<string, RiesgoDeuda> {
  const out = new Map<string, RiesgoDeuda>()
  for (const [id, r] of riesgos) {
    const saldo = saldoActual.get(id)
    if (saldo === undefined || saldo >= r.deuda) { out.set(id, r); continue }
    const deuda = Math.max(saldo, 0)
    const semanasDeuda = deuda / r.cargo
    const tendencia = (deuda - r.deudaInicio) / r.cargo
    out.set(id, { ...r, deuda, semanasDeuda, tendencia, nivel: nivelDe(semanasDeuda, tendencia, r.semanasCortas, r.semanasEvaluadas) })
  }
  return out
}

const SEMANAS = 4
const PAGO_COMPLETO = 0.9
const TOLERANCIA_PESOS = 1

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
    `Semanas pagando menos del 90%: ${r.semanasCortas} de ${r.semanasEvaluadas}`,
  ]
  if (r.deuda > 0 && r.tendencia !== 0) {
    partes.push(`La deuda ${r.tendencia > 0 ? 'subió' : 'bajó'} ${fmt(Math.abs(r.tendencia))} semana(s) en ${r.semanasEvaluadas} semana(s)`)
  }
  if (r.semanasEvaluadas < 3) partes.push(`Conductor nuevo: evaluado con ${r.semanasEvaluadas} semana(s) de pago`)
  return partes.join('\n')
}

/**
 * Riesgo por conductor con las últimas semanas cerradas de la sede (o de todas
 * las sedes si sedeId es null; cada conductor se mide con las de su sede).
 */
export async function cargarRiesgoDeuda(sedeId: string | null): Promise<ResultadoRiesgoDeuda> {
  let q = supabase
    .from('periodos_facturacion')
    .select('id, semana, anio, sede_id, estado')
    .order('anio', { ascending: false })
    .order('semana', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data: periodos, error } = await q
  if (error) throw error

  // Últimas 4 semanas cerradas de cada sede, de la más vieja a la más nueva, y la
  // semana que sigue a la última cerrada (su saldo_anterior ya incluye ese pago)
  const porSede = new Map<string, { id: string; semana: number; anio: number }[]>()
  const siguiente = new Map<string, string>()
  const ordenados = [...(periodos || [])] // vienen de la más nueva a la más vieja
  for (const p of ordenados) {
    if (p.estado !== 'cerrado') continue
    const lista = porSede.get(p.sede_id) || []
    if (lista.length < SEMANAS) lista.push(p)
    porSede.set(p.sede_id, lista)
  }
  const ids: string[] = []
  for (const [sede, lista] of porSede) {
    const ultima = lista[0]
    const posteriores = ordenados.filter(p => p.sede_id === sede
      && (p.anio > ultima.anio || (p.anio === ultima.anio && p.semana > ultima.semana)))
    const prox = posteriores[posteriores.length - 1]
    if (prox) { siguiente.set(sede, prox.id); ids.push(prox.id) }
    lista.reverse()
    ids.push(...lista.map(p => p.id))
  }
  if (!ids.length) return { riesgos: new Map(), sinCubrir2Semanas: new Set() }

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
  const sinCubrir2Semanas = new Set<string>()
  // Saldo con el que arranca la semana siguiente, por conductor y sede
  const saldoSiguiente = new Map<string, number>()
  for (const f of filas) {
    for (const [sede, prox] of siguiente) {
      if (f.periodo_id === prox) saldoSiguiente.set(`${sede}|${f.conductor_id}`, Number(f.saldo_anterior) || 0)
    }
  }

  for (const [sede, lista] of porSede) {
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
      // ¿No cubrió lo facturado en las 2 últimas semanas con pago conocido? (el pago de una
      // semana = lo que tenía que pagar menos el saldo con que arrancó la siguiente)
      {
        const prox = saldoSiguiente.get(`${sede}|${conductorId}`)
        const saldoDespues = (i: number): number | undefined =>
          i === SEMANAS - 1 ? prox : sem[i + 1] ? Number(sem[i + 1]!.saldo_anterior) || 0 : undefined
        const ultimas: boolean[] = []
        for (let i = SEMANAS - 1; i >= 0 && ultimas.length < 2; i--) {
          const f = sem[i]
          const despues = saldoDespues(i)
          if (!f || despues === undefined) {
            if (ultimas.length) break // tienen que ser seguidas
            continue
          }
          const facturado = Math.max(Number(f.subtotal_neto) || 0, 0)
          const pagado = (Number(f.total_a_pagar) || 0) - despues
          ultimas.push(facturado > 0 && pagado < facturado - TOLERANCIA_PESOS)
        }
        if (ultimas.length === 2 && ultimas.every(Boolean)) sinCubrir2Semanas.add(conductorId)
      }
      // Semanas seguidas hasta la última cerrada (un conductor nuevo tiene menos de 4)
      let desdeIdx = SEMANAS
      while (desdeIdx > 0 && sem[desdeIdx - 1]) desdeIdx--
      const s = sem.slice(desdeIdx) as FilaFact[]
      if (!s.length) continue
      const cargo = s.reduce((a, f) => a + Math.max(Number(f.subtotal_neto) || 0, 0), 0) / s.length
      if (cargo <= 0) continue
      // Saldos al arrancar cada semana; con la semana siguiente, uno más (ya con el último pago)
      const saldos = s.map(f => Number(f.saldo_anterior) || 0)
      const prox = saldoSiguiente.get(`${sede}|${conductorId}`)
      if (prox !== undefined) saldos.push(prox)
      // Las 3 últimas semanas con pago conocido (o las que tenga)
      const desdeSemana = Math.max(0, saldos.length - 1 - (SEMANAS - 1))
      const semanasEvaluadas = saldos.length - 1 - desdeSemana
      if (semanasEvaluadas < 1) continue // todavía ningún pago conocido
      let semanasCortas = 0
      for (let i = desdeSemana; i < saldos.length - 1; i++) {
        const aPagar = Number(s[i].total_a_pagar) || 0
        if (aPagar <= 0) continue
        const pagado = aPagar - saldos[i + 1]
        if (pagado / aPagar < PAGO_COMPLETO) semanasCortas++
      }
      const deuda = Math.max(saldos[saldos.length - 1], 0)
      const semanasDeuda = deuda / cargo
      const tendencia = (deuda - Math.max(saldos[desdeSemana], 0)) / cargo
      const nivel = nivelDe(semanasDeuda, tendencia, semanasCortas, semanasEvaluadas)
      const deudaInicio = Math.max(saldos[desdeSemana], 0)
      resultado.set(conductorId, { nivel, semanasDeuda, deuda, semanasCortas, tendencia, semanaRef, cargo, deudaInicio, semanasEvaluadas })
    }
  }
  return { riesgos: resultado, sinCubrir2Semanas }
}
