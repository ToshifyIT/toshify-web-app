// src/modules/conductores/panel/calificacionConductor.ts
// Calificación de 1 a 5 estrellas por conductor (Seguimiento de Conductores), con
// los mismos datos que muestra el panel. Seis factores, cada uno de 0 a 1:
//
//   · Viajes completados (20%): viajes finalizados en Cabify en la semana, comparados
//     con los demás conductores del mismo turno.
//   · Aprovechamiento del auto (20%): % de los km del GPS hechos con viaje asignado.
//   · Deuda (20%): sin deuda = 1; si la garantía la cubre = 0,7; si no, baja según lo
//     que queda sin cubrir.
//   · Ingresos Cabify (15%): ganancia de la semana comparada con los del mismo turno.
//   · Límite de km (15%): excesos de km registrados en Facturación en las últimas
//     4 semanas (los oficiales, los que se le cobran).
//   · Multas (10%): sin multas = 1; las pagadas restan poco; las pendientes o en
//     cuotas restan bastante.
//
// Si falta un dato (ej. sin cruce con Cabify o sin GPS), ese factor no cuenta y los
// demás se reparten su peso. Con menos de 2 factores no se califica.
// Estrellas = 1 + puntaje × 4, redondeado a media estrella.
import type { ConductorPanelRow } from './conductoresPanelService'

export interface FactorCalificacion {
  clave: 'viajes' | 'aprovechamiento' | 'ingresos' | 'km' | 'deuda' | 'multas'
  nombre: string
  peso: number            // peso original (0-1)
  puntaje: number | null  // 0-1; null = sin dato
  valor: string           // dato en palabras ("42% de los km con viaje")
  explicacion: string     // por qué ese puntaje
}

export interface Calificacion {
  estrellas: number | null   // 1 a 5 en pasos de 0,5; null = sin datos suficientes
  puntaje: number | null     // 0-1
  factores: FactorCalificacion[]
  parcial: boolean           // falta algún factor
}

const PESOS = { viajes: 0.2, aprovechamiento: 0.2, deuda: 0.2, ingresos: 0.15, km: 0.15, multas: 0.1 }

/** Excesos de km registrados en Facturación (últimas 4 semanas) por conductor. */
export interface ExcesosRecientes {
  veces: number      // semanas en que se pasó del límite
  km: number         // km excedidos en total
  monto: number      // lo que se le cobró por esos excesos
}

/** Ganancia y viajes de referencia por turno (y "todos"), para comparar. */
export interface Referencias {
  ingresos: Map<string, number[]>
  viajes: Map<string, number[]>
}

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** Interpolación lineal por tramos: puntos [x, y] ordenados por x. */
function tramos(x: number, puntos: [number, number][]): number {
  if (x <= puntos[0][0]) return puntos[0][1]
  for (let i = 1; i < puntos.length; i++) {
    const [x1, y1] = puntos[i]
    const [x0, y0] = puntos[i - 1]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return puntos[puntos.length - 1][1]
}

function aprovechamiento(r: ConductorPanelRow): number | null {
  const geo = r.kmGeo
  const asig = r.cabify?.kmAsignado
  if (geo === null || geo === undefined || geo <= 0) return null
  if (asig === null || asig === undefined) return null
  return (asig / geo) * 100
}

function factorAprovechamiento(r: ConductorPanelRow): FactorCalificacion {
  const pct = aprovechamiento(r)
  const base = { clave: 'aprovechamiento' as const, nombre: 'Aprovechamiento del auto', peso: PESOS.aprovechamiento }
  // GPS en 0 km: no es confiable (los viajes del auto pueden haber quedado a nombre
  // del otro conductor del turno), así que no cuenta.
  if (r.kmGeo === 0) {
    return {
      ...base,
      puntaje: null,
      valor: 'Sin dato confiable',
      explicacion: 'El GPS no le atribuye km esta semana: los viajes del auto pueden figurar a nombre del otro conductor.',
    }
  }
  if (pct === null) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'Falta el GPS de la semana o el cruce con Cabify.' }
  }
  // 45% o más es excelente (el mejor de la flota ronda 47%); 35% es el umbral de alerta.
  const puntaje = tramos(pct, [[10, 0], [25, 0.4], [35, 0.7], [45, 1]])
  const explicacion = pct >= 45
    ? 'Excelente: casi la mitad de los km los hace con un viaje.'
    : pct >= 35
      ? 'Bien: por encima del umbral de alerta (35%).'
      : pct >= 25
        ? 'Bajo: está por debajo del umbral de alerta (35%), anda mucho sin viaje.'
        : 'Muy bajo: la mayor parte de los km los hace sin viaje asignado.'
  return { ...base, puntaje, valor: `${pct.toFixed(0)}% de los km con viaje`, explicacion }
}

/** Posición relativa (0 = el peor, 1 = el mejor) de un valor dentro de su grupo. */
function posicionEn(v: number, grupo: number[]): number {
  const menores = grupo.filter(x => x < v).length
  const iguales = grupo.filter(x => x === v).length
  return Math.max(0, Math.min(1, (menores + (iguales - 1) / 2) / (grupo.length - 1)))
}

function factorViajes(r: ConductorPanelRow, referencia: Map<string, number[]>): FactorCalificacion {
  const base = { clave: 'viajes' as const, nombre: 'Viajes completados (Cabify)', peso: PESOS.viajes }
  const v = r.cabify?.viajesFinalizados
  if (r.cabify && r.tieneAsignacion && (!v || v <= 0)) {
    return { ...base, puntaje: 0, valor: '0 viajes en la semana', explicacion: 'Tiene auto asignado pero no completó viajes en Cabify esta semana.' }
  }
  if (!r.cabify || !v || v <= 0) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'No cruzó con Cabify esta semana.' }
  }
  const grupo = referencia.get(r.turno || 'todos') ?? referencia.get('todos') ?? []
  if (grupo.length < 3) {
    return { ...base, puntaje: null, valor: `${v} viajes`, explicacion: 'No hay suficientes conductores para comparar.' }
  }
  const puntaje = posicionEn(v, grupo)
  const pos = Math.round(puntaje * 100)
  const deQuien = r.turno && referencia.has(r.turno) ? 'los de su turno' : 'la flota'
  const explicacion = pos >= 75
    ? `Está entre los que más viajes completan de ${deQuien}.`
    : pos >= 40
      ? `Completa una cantidad de viajes en la media de ${deQuien}.`
      : `Completa menos viajes que la mayoría de ${deQuien}.`
  return { ...base, puntaje, valor: `${v} viajes · supera al ${pos}% de ${deQuien}`, explicacion }
}

function factorKm(r: ConductorPanelRow, excesos: Map<string, ExcesosRecientes> | null): FactorCalificacion {
  const base = { clave: 'km' as const, nombre: 'Límite de km', peso: PESOS.km }
  if (!excesos) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'No se pudieron leer los excesos de km.' }
  }
  if (!r.tieneAsignacion && !excesos.has(r.id)) {
    return { ...base, puntaje: null, valor: 'Sin auto', explicacion: 'No tiene auto asignado.' }
  }
  const e = excesos.get(r.id)
  if (!e || e.veces === 0) {
    return { ...base, puntaje: 1, valor: 'Sin excesos', explicacion: 'No se pasó del límite de km en las últimas 4 semanas.' }
  }
  const puntaje = e.veces === 1 ? 0.55 : e.veces === 2 ? 0.3 : 0.1
  return {
    ...base,
    puntaje,
    valor: `${e.veces} ${e.veces === 1 ? 'semana' : 'semanas'} excedido · ${Math.round(e.km).toLocaleString('es-AR')} km de más`,
    explicacion: `Se pasó del límite de km semanal en las últimas 4 semanas (se le cobraron ${pesos(e.monto)}).`,
  }
}

function factorIngresos(r: ConductorPanelRow, referencia: Map<string, number[]>): FactorCalificacion {
  const base = { clave: 'ingresos' as const, nombre: 'Ingresos Cabify de la semana', peso: PESOS.ingresos }
  const g = r.cabify?.gananciaTotal
  // Con auto asignado y cruzado con Cabify, no facturar nada en la semana es un dato
  // (cuenta como 0), no una falta de dato.
  if (r.cabify && r.tieneAsignacion && (g === null || g === undefined || g <= 0)) {
    return {
      ...base,
      puntaje: 0,
      valor: '$ 0 en la semana',
      explicacion: 'Tiene auto asignado pero no registra viajes ni ingresos en Cabify esta semana.',
    }
  }
  if (!r.cabify || g === null || g === undefined || g <= 0) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'No tiene ingresos de Cabify en la semana (o no cruzó con Cabify).' }
  }
  const grupo = referencia.get(r.turno || 'todos') ?? referencia.get('todos') ?? []
  if (grupo.length < 3) {
    return { ...base, puntaje: null, valor: pesos(g), explicacion: 'No hay suficientes conductores para comparar.' }
  }
  const puntaje = posicionEn(g, grupo)
  const posicion = Math.round(puntaje * 100)
  const deQuien = r.turno && referencia.has(r.turno) ? 'los de su turno' : 'la flota'
  const explicacion = posicion >= 75
    ? `Está entre los que más facturan de ${deQuien}.`
    : posicion >= 40
      ? `Factura en la media de ${deQuien}.`
      : `Factura por debajo de la mayoría de ${deQuien}.`
  return { ...base, puntaje, valor: `${pesos(g)} · supera al ${posicion}% de ${deQuien}`, explicacion }
}

function factorDeuda(r: ConductorPanelRow): FactorCalificacion {
  const base = { clave: 'deuda' as const, nombre: 'Deuda', peso: PESOS.deuda }
  if (r.saldoPendiente <= 0) {
    return { ...base, puntaje: 1, valor: r.saldoAFavor > 0 ? `${pesos(r.saldoAFavor)} a favor` : 'Al día', explicacion: 'No tiene deuda.' }
  }
  if (r.saldoMenosGarantia <= 0) {
    return {
      ...base,
      puntaje: 0.7,
      valor: `Debe ${pesos(r.saldoPendiente)}`,
      explicacion: `Tiene deuda, pero la garantía pagada (${pesos(r.garantiaPagada)}) la cubre.`,
    }
  }
  const sinCubrir = r.saldoMenosGarantia
  const puntaje = tramos(sinCubrir, [[0, 0.6], [100000, 0.45], [300000, 0.25], [600000, 0.1], [1000000, 0]])
  return {
    ...base,
    puntaje,
    valor: `Debe ${pesos(r.saldoPendiente)}`,
    explicacion: r.tieneGarantia
      ? `La garantía no alcanza: quedan ${pesos(sinCubrir)} sin cubrir.`
      : `No tiene garantía que la cubra: ${pesos(sinCubrir)} sin cubrir.`,
  }
}

function factorMultas(r: ConductorPanelRow): FactorCalificacion {
  const base = { clave: 'multas' as const, nombre: 'Multas', peso: PESOS.multas }
  const abiertas = r.pendientes + r.enProceso
  if (r.cantidadMultas === 0) {
    return { ...base, puntaje: 1, valor: 'Sin multas', explicacion: 'No tiene multas atribuidas.' }
  }
  if (abiertas === 0) {
    const puntaje = Math.max(0.6, 0.9 - 0.05 * (r.pagadas - 1))
    return {
      ...base,
      puntaje,
      valor: `${r.pagadas} pagada${r.pagadas === 1 ? '' : 's'}`,
      explicacion: 'Tuvo multas pero están todas pagadas.',
    }
  }
  const puntaje = Math.max(0, 0.5 - 0.12 * (abiertas - 1))
  const partes = [
    r.pendientes ? `${r.pendientes} pendiente${r.pendientes === 1 ? '' : 's'}` : '',
    r.enProceso ? `${r.enProceso} en cuotas` : '',
    r.pagadas ? `${r.pagadas} pagada${r.pagadas === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return {
    ...base,
    puntaje,
    valor: partes.join(' · '),
    explicacion: `Tiene multas sin saldar por ${pesos(r.montoPendiente + r.montoEnProceso)}.`,
  }
}

function agrupar(rows: ConductorPanelRow[], valor: (r: ConductorPanelRow) => number | undefined): Map<string, number[]> {
  const ref = new Map<string, number[]>()
  for (const r of rows) {
    const v = valor(r)
    if (!r.tieneAsignacion || !v || v <= 0) continue
    const turno = r.turno || 'sin_turno'
    ref.set(turno, [...(ref.get(turno) ?? []), v])
    ref.set('todos', [...(ref.get('todos') ?? []), v])
  }
  // Turnos con muy pocos conductores se comparan contra toda la flota
  for (const [k, v] of ref) if (k !== 'todos' && v.length < 5) ref.delete(k)
  return ref
}

/** Referencias de ingresos y viajes por turno (y "todos"), para comparar. */
export function referenciaIngresos(rows: ConductorPanelRow[]): Referencias {
  return {
    ingresos: agrupar(rows, r => r.cabify?.gananciaTotal),
    viajes: agrupar(rows, r => r.cabify?.viajesFinalizados),
  }
}

export function calificarConductor(
  r: ConductorPanelRow,
  referencia: Referencias,
  excesos: Map<string, ExcesosRecientes> | null = null,
): Calificacion {
  const factores = [
    factorViajes(r, referencia.viajes),
    factorAprovechamiento(r),
    factorDeuda(r),
    factorIngresos(r, referencia.ingresos),
    factorKm(r, excesos),
    factorMultas(r),
  ]
  const conDato = factores.filter(f => f.puntaje !== null)
  if (conDato.length < 2) return { estrellas: null, puntaje: null, factores, parcial: true }
  const pesoTotal = conDato.reduce((t, f) => t + f.peso, 0)
  const puntaje = conDato.reduce((t, f) => t + (f.puntaje as number) * f.peso, 0) / pesoTotal
  const estrellas = Math.round((1 + puntaje * 4) * 2) / 2
  return { estrellas, puntaje, factores, parcial: conDato.length < factores.length }
}
