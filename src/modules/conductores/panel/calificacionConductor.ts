// src/modules/conductores/panel/calificacionConductor.ts
// Calificación de 1 a 5 estrellas por conductor (Seguimiento de Conductores), con
// los mismos datos que muestra el panel. Seis factores, cada uno de 0 a 1
// (fórmula acordada el 2026-11-02, rige desde la semana del 02/11):
//
//   · Pagos (30%): sin deuda = 1; si la garantía la cubre = 0,7; si no, baja según lo
//     que queda sin cubrir.
//   · Ingresos (25%): lo que facturó en Cabify contra lo que tenía que cubrir esa
//     semana (alquiler + garantía o Toshipass). Cubrirlo 1,5 veces o más = 1.
//     (Antes había dos factores, viajes e ingresos, que medían casi lo mismo.)
//   · Cuidado del auto (20%): siniestros con culpa del conductor (últimas 12 semanas)
//     y excesos de km cobrados (últimas 4). Cuenta el peor de los dos.
//   · Multas (10%): sin multas = 1; las pagadas restan poco; las pendientes o en
//     cuotas restan bastante.
//   · Aprovechamiento del auto (10%): % de los km del GPS hechos con viaje asignado.
//     Pesa poco porque el GPS a veces atribuye los km al compañero de turno.
//   · Antigüedad (5%): semanas desde su primera asignación.
//
// Si falta un dato (ej. sin cruce con Cabify o sin GPS), ese factor no cuenta y los
// demás se reparten su peso. Con menos de 2 factores no se califica.
// Estrellas = 1 + puntaje × 4, redondeado a media estrella.
// Las semanas guardadas antes del cambio conservan sus factores y pesos anteriores.
import type { ConductorPanelRow } from './conductoresPanelService'

export interface FactorCalificacion {
  clave: 'deuda' | 'ingresos' | 'cuidado' | 'multas' | 'aprovechamiento' | 'antiguedad' | 'viajes' | 'km'
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

export const PESOS: Partial<Record<FactorCalificacion['clave'], number>> = {
  deuda: 0.3, ingresos: 0.25, cuidado: 0.2, multas: 0.1, aprovechamiento: 0.1, antiguedad: 0.05,
}

/** Pesos anteriores al 2026-11-02, para leer y comparar semanas viejas del historial. */
export const PESOS_ANTERIORES: Partial<Record<FactorCalificacion['clave'], number>> = {
  viajes: 0.2, aprovechamiento: 0.2, deuda: 0.2, ingresos: 0.15, km: 0.15, multas: 0.1,
}

/** Peso de un factor según la fórmula con la que se guardó esa semana. */
function pesoDe(clave: FactorCalificacion['clave'], claves: string[]): number {
  const esNueva = claves.includes('cuidado') || claves.includes('antiguedad')
  return (esNueva ? PESOS[clave] : PESOS_ANTERIORES[clave]) ?? PESOS[clave] ?? PESOS_ANTERIORES[clave] ?? 0
}

/** Datos extra que el panel no trae (ver cargarExtrasCalificacion). */
export interface ExtrasCalificacion {
  /** Lo que tenía que cubrir en la semana: alquiler + garantía o Toshipass. */
  cargoSemanal: Map<string, number> | null
  /** Siniestros con culpa del conductor en las últimas 12 semanas. */
  siniestrosCulpa: Map<string, number> | null
  /** Semanas desde su primera asignación. */
  antiguedadSemanas: Map<string, number> | null
}

export const NOMBRES_FACTOR: Record<FactorCalificacion['clave'], string> = {
  deuda: 'Pagos',
  ingresos: 'Ingresos vs lo que tenía que cubrir',
  cuidado: 'Cuidado del auto',
  multas: 'Multas',
  aprovechamiento: 'Aprovechamiento del auto',
  antiguedad: 'Antigüedad',
  viajes: 'Viajes completados (Cabify)',
  km: 'Límite de km',
}

/** Factor tal como se guarda en conductor_calificaciones.factores */
export interface FactorGuardado {
  clave: FactorCalificacion['clave']
  puntaje: number | null
  valor: string
  explicacion: string
}

/** Arma una Calificacion a partir de una semana guardada en el historial. */
export function calificacionDesdeGuardada(g: { estrellas: number; puntaje: number; parcial: boolean; factores?: FactorGuardado[] | null }): Calificacion {
  return {
    estrellas: Number(g.estrellas),
    puntaje: Number(g.puntaje),
    parcial: !!g.parcial,
    factores: (g.factores || []).map(f => ({
      clave: f.clave,
      nombre: NOMBRES_FACTOR[f.clave] ?? f.clave,
      peso: pesoDe(f.clave, (g.factores || []).map(x => x.clave)),
      puntaje: f.puntaje === null || f.puntaje === undefined ? null : Number(f.puntaje),
      valor: f.valor,
      explicacion: f.explicacion,
    })),
  }
}

export interface CambioFactor {
  clave: FactorCalificacion['clave']
  nombre: string
  antes: FactorGuardado | null
  ahora: FactorGuardado | null
  /** Efecto aproximado en estrellas (+ subió, − bajó). */
  efecto: number
}

/**
 * Qué factores movieron la calificación entre dos semanas. El efecto de cada factor
 * es (diferencia de su puntaje × su peso) llevado a estrellas (1 punto = 4 estrellas).
 */
export function cambiosEntreSemanas(ahora: FactorGuardado[] | null | undefined, antes: FactorGuardado[] | null | undefined): CambioFactor[] {
  const a = new Map((ahora || []).map(f => [f.clave, f]))
  const b = new Map((antes || []).map(f => [f.clave, f]))
  const ka = [...a.keys()]
  const kb = [...b.keys()]
  // Unión de factores de las dos semanas (si cambió la fórmula, aparecen los de ambas)
  const claves = [...new Set([...ka, ...kb])] as FactorCalificacion['clave'][]
  const pesoTotal = (m: Map<string, FactorGuardado>, ks: string[]) =>
    ks.reduce((t, k) => t + (m.get(k)?.puntaje != null ? pesoDe(k as FactorCalificacion['clave'], ks) : 0), 0) || 1
  const pa = pesoTotal(a, ka)
  const pb = pesoTotal(b, kb)
  return claves.map(k => {
    const fa = a.get(k) ?? null
    const fb = b.get(k) ?? null
    const ca = fa?.puntaje != null ? (Number(fa.puntaje) * pesoDe(k, ka)) / pa : 0
    const cb = fb?.puntaje != null ? (Number(fb.puntaje) * pesoDe(k, kb)) / pb : 0
    return { clave: k, nombre: NOMBRES_FACTOR[k] ?? k, antes: fb, ahora: fa, efecto: (ca - cb) * 4 }
  })
}

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
  const base = { clave: 'aprovechamiento' as const, nombre: NOMBRES_FACTOR.aprovechamiento, peso: PESOS.aprovechamiento ?? 0 }
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


function factorCuidado(r: ConductorPanelRow, excesos: Map<string, ExcesosRecientes> | null, siniestros: Map<string, number> | null): FactorCalificacion {
  const base = { clave: 'cuidado' as const, nombre: NOMBRES_FACTOR.cuidado, peso: PESOS.cuidado ?? 0 }
  if (!excesos && !siniestros) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'No se pudieron leer siniestros ni excesos de km.' }
  }
  const e = excesos?.get(r.id)
  const veces = e?.veces ?? 0
  const sin = siniestros?.get(r.id) ?? 0
  if (!r.tieneAsignacion && veces === 0 && sin === 0) {
    return { ...base, puntaje: null, valor: 'Sin auto', explicacion: 'No tiene auto asignado.' }
  }
  const pKm = veces === 0 ? 1 : veces === 1 ? 0.55 : veces === 2 ? 0.3 : 0.1
  const pSin = sin === 0 ? 1 : sin === 1 ? 0.3 : 0
  const puntaje = Math.min(pKm, pSin)
  const partes = [
    sin === 0 ? 'Sin siniestros con culpa' : `${sin} siniestro${sin === 1 ? '' : 's'} con culpa`,
    veces === 0 ? 'sin excesos de km' : `${veces} ${veces === 1 ? 'semana' : 'semanas'} excedido (${Math.round(e?.km ?? 0).toLocaleString('es-AR')} km)`,
  ]
  const explicacion = puntaje === 1
    ? 'No tuvo siniestros con culpa en 12 semanas ni se pasó del límite de km en 4.'
    : pSin <= pKm
      ? 'Tuvo siniestros con culpa en las últimas 12 semanas.'
      : `Se pasó del límite de km en las últimas 4 semanas (se le cobraron ${pesos(e?.monto ?? 0)}).`
  return { ...base, puntaje, valor: partes.join(' · '), explicacion }
}

function factorAntiguedad(r: ConductorPanelRow, antiguedad: Map<string, number> | null): FactorCalificacion {
  const base = { clave: 'antiguedad' as const, nombre: NOMBRES_FACTOR.antiguedad, peso: PESOS.antiguedad ?? 0 }
  const sem = antiguedad?.get(r.id)
  if (sem === undefined || sem === null) {
    return { ...base, puntaje: null, valor: 'Sin dato', explicacion: 'No tiene asignaciones registradas.' }
  }
  const puntaje = tramos(sem, [[0, 0.2], [4, 0.4], [12, 0.7], [26, 1]])
  const meses = Math.floor(sem / 4.345)
  const valor = sem < 9 ? `${Math.max(1, Math.round(sem))} semana${Math.round(sem) === 1 ? '' : 's'} con Toshify` : `${meses} ${meses === 1 ? 'mes' : 'meses'} con Toshify`
  return { ...base, puntaje, valor, explicacion: sem >= 26 ? 'Lleva más de 6 meses con nosotros.' : 'Suma a medida que se queda (6 meses = puntaje completo).' }
}

function factorIngresos(r: ConductorPanelRow, referencia: Map<string, number[]>, cargo: number | undefined): FactorCalificacion {
  const base = { clave: 'ingresos' as const, nombre: NOMBRES_FACTOR.ingresos, peso: PESOS.ingresos ?? 0 }
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
  // Contra lo que tenía que cubrir esa semana (alquiler + garantía o Toshipass)
  if (cargo && cargo > 0) {
    const veces = g / cargo
    const puntaje = tramos(veces, [[0, 0], [0.5, 0.3], [1, 0.8], [1.5, 1]])
    const pct = Math.round(veces * 100)
    const explicacion = veces >= 1.5
      ? 'Factura holgadamente más de lo que tiene que pagar.'
      : veces >= 1
        ? 'Cubre lo que tiene que pagar en la semana.'
        : 'No le alcanza lo que factura para cubrir lo de la semana.'
    return { ...base, puntaje, valor: `${pesos(g)} · ${pct}% de los ${pesos(cargo)} a cubrir`, explicacion }
  }
  // Sin facturación de la semana: se compara con los de su turno (como antes)
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
  const base = { clave: 'deuda' as const, nombre: NOMBRES_FACTOR.deuda, peso: PESOS.deuda ?? 0 }
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
  const base = { clave: 'multas' as const, nombre: NOMBRES_FACTOR.multas, peso: PESOS.multas ?? 0 }
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
  extras: ExtrasCalificacion | null = null,
): Calificacion {
  const factores = [
    factorDeuda(r),
    factorIngresos(r, referencia.ingresos, extras?.cargoSemanal?.get(r.id)),
    factorCuidado(r, excesos, extras?.siniestrosCulpa ?? null),
    factorMultas(r),
    factorAprovechamiento(r),
    factorAntiguedad(r, extras?.antiguedadSemanas ?? null),
  ]
  const conDato = factores.filter(f => f.puntaje !== null)
  if (conDato.length < 2) return { estrellas: null, puntaje: null, factores, parcial: true }
  const pesoTotal = conDato.reduce((t, f) => t + f.peso, 0)
  const puntaje = conDato.reduce((t, f) => t + (f.puntaje as number) * f.peso, 0) / pesoTotal
  const estrellas = Math.round((1 + puntaje * 4) * 2) / 2
  return { estrellas, puntaje, factores, parcial: conDato.length < factores.length }
}
