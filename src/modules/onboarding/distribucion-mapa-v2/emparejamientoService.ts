// src/modules/onboarding/distribucion-mapa-v2/emparejamientoService.ts
//
// Cálculo de distancia/tiempo en vehículo y sugerencia de compañeros.
//
// Estrategia de costo (importante): el cruce base x candidato es cuadrático y
// Distance Matrix cobra por elemento. Por eso SIEMPRE se pre-filtra con
// Haversine (gratis, local) y recién sobre los candidatos que quedan dentro del
// radio plausible se llama a la API, en lotes y con un tope de bases por
// corrida. Es el mismo patrón que ya usa ProgramacionAssignmentWizard.
//
// Sobre los parámetros de ruta:
//  - Tráfico: se pide con drivingOptions + trafficModel y se lee
//    duration_in_traffic. Los semáforos ya están incorporados en el modelo de
//    Google; no son un parámetro aparte.
//  - Hora de salida: la API sólo acepta departureTime presente o futuro. Si el
//    usuario elige una hora ya pasada, se desplaza al siguiente día con esa
//    misma hora y se avisa en la UI.
//  - Peajes: se soporta evitar/permitir (avoidTolls). Distance Matrix NO
//    devuelve el costo del peaje; para eso haría falta migrar a Routes API.

import type {
  CombinacionesPar,
  EntidadMapa,
  MotivoPar,
  OpcionesRuta,
  ParSugerido,
  ResultadoSugerencias,
} from './types'
import {
  haversineKm,
  turnoDeEntidad,
  turnosComplementarios,
  LABEL_LICENCIA,
} from './utils'

/** Umbral de tiempo de viaje por defecto, en minutos. */
export const UMBRAL_MINUTOS_DEFAULT = 25
export const UMBRAL_MINUTOS_MIN = 5
export const UMBRAL_MINUTOS_MAX = 40

/** Velocidad urbana promedio usada para el prefiltro y el fallback. */
const VELOCIDAD_ESTIMADA_KMH = 28

/** Máximo de destinos por request de Distance Matrix (límite de la API). */
const MAX_DESTINOS_POR_REQUEST = 25

/** Tope de bases evaluadas por corrida, para acotar el gasto de API. */
export const MAX_BASES_SUGERENCIA = 12

/** Tope de pares devueltos. */
const MAX_PARES_RESULTADO = 60

/** Estados de lead que se consideran listos para inducción. */
const ESTADOS_LEAD_INDUCCION = new Set(['apto inducción', 'apto induccion', 'convocatoria inducción', 'convocatoria induccion'])

/**
 * Radio de prefiltro en km para un umbral dado. Se toma con holgura (x1.6)
 * porque la distancia en línea recta siempre subestima la de calle.
 */
function radioPrefiltroKm(umbralMinutos: number): number {
  return (umbralMinutos / 60) * VELOCIDAD_ESTIMADA_KMH * 1.6
}

// =====================================================
// Hora de salida
// =====================================================

/**
 * Convierte fecha + hora del formulario en un Date válido para la API.
 * Si el instante ya pasó, lo desplaza al día siguiente con la misma hora
 * (la API rechaza departureTime en el pasado).
 */
export function resolverSalida(opciones: OpcionesRuta): {
  salida: Date
  desplazada: boolean
} {
  const [anio, mes, dia] = (opciones.fecha || '').split('-').map(Number)
  const [hora, minuto] = (opciones.hora || '').split(':').map(Number)

  const base =
    Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia)
      ? new Date(anio, (mes || 1) - 1, dia || 1, hora || 0, minuto || 0, 0, 0)
      : new Date()

  const ahora = new Date()
  if (base.getTime() > ahora.getTime() + 60_000) return { salida: base, desplazada: false }

  const desplazada = new Date(base)
  while (desplazada.getTime() <= ahora.getTime() + 60_000) {
    desplazada.setDate(desplazada.getDate() + 1)
  }
  return { salida: desplazada, desplazada: true }
}

// =====================================================
// Distance Matrix
// =====================================================

interface MedicionRuta {
  distanciaKm: number
  tiempoMinutos: number
  fuente: 'matrix' | 'estimado'
}

function estimarPorHaversine(km: number): MedicionRuta {
  return {
    distanciaKm: Math.round(km * 10) / 10,
    tiempoMinutos: Math.round((km / VELOCIDAD_ESTIMADA_KMH) * 60),
    fuente: 'estimado',
  }
}

function mapsDisponible(): boolean {
  return !!(window as any).google?.maps?.DistanceMatrixService
}

/**
 * Distancia y tiempo en auto desde un origen a varios destinos.
 * Devuelve un array alineado con `destinos`; cada posición puede ser null si la
 * API no pudo resolver ese tramo (el caller decide si estima o descarta).
 */
async function medirDesdeOrigen(
  origen: { lat: number; lng: number },
  destinos: Array<{ lat: number; lng: number }>,
  opciones: OpcionesRuta,
  salida: Date
): Promise<Array<MedicionRuta | null>> {
  if (destinos.length === 0) return []
  if (!mapsDisponible()) return destinos.map(() => null)

  const google = (window as any).google
  const resultados: Array<MedicionRuta | null> = new Array(destinos.length).fill(null)

  for (let inicio = 0; inicio < destinos.length; inicio += MAX_DESTINOS_POR_REQUEST) {
    const lote = destinos.slice(inicio, inicio + MAX_DESTINOS_POR_REQUEST)

    const request: any = {
      origins: [new google.maps.LatLng(origen.lat, origen.lng)],
      destinations: lote.map((d) => new google.maps.LatLng(d.lat, d.lng)),
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC,
      avoidTolls: opciones.evitarPeajes,
    }

    // drivingOptions sólo es válido con departureTime presente/futuro.
    if (opciones.conTrafico) {
      request.drivingOptions = {
        departureTime: salida,
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      }
    }

    const respuesta = await new Promise<any>((resolve) => {
      try {
        const service = new google.maps.DistanceMatrixService()
        service.getDistanceMatrix(request, (res: any, status: string) => {
          resolve(status === 'OK' ? res : null)
        })
      } catch {
        resolve(null)
      }
    })

    const fila = respuesta?.rows?.[0]?.elements
    if (!fila) continue

    for (let i = 0; i < lote.length; i++) {
      const el = fila[i]
      if (!el || el.status !== 'OK') continue
      const segundos = el.duration_in_traffic?.value ?? el.duration?.value
      if (!Number.isFinite(el.distance?.value) || !Number.isFinite(segundos)) continue
      resultados[inicio + i] = {
        distanciaKm: Math.round((el.distance.value / 1000) * 10) / 10,
        tiempoMinutos: Math.round(segundos / 60),
        fuente: 'matrix',
      }
    }
  }

  return resultados
}

/** Medición puntual entre dos entidades (usada al seleccionar un par a mano). */
export async function medirEntre(
  a: EntidadMapa,
  b: EntidadMapa,
  opciones: OpcionesRuta
): Promise<MedicionRuta> {
  const { salida } = resolverSalida(opciones)
  const [medicion] = await medirDesdeOrigen({ lat: a.lat, lng: a.lng }, [{ lat: b.lat, lng: b.lng }], opciones, salida)
  return medicion || estimarPorHaversine(haversineKm(a.lat, a.lng, b.lat, b.lng))
}

// =====================================================
// Scoring
// =====================================================

function esLeadDeInduccion(e: EntidadMapa): boolean {
  if (e.tipo !== 'lead') return true
  const estado = (e.estadoLead || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
  return ESTADOS_LEAD_INDUCCION.has(estado)
}

/**
 * Score 0-100 de un par. Arranca en 100 y descuenta penalidades explícitas,
 * para que la razón de cada número sea auditable desde la UI (los `motivos`).
 */
function evaluarPar(
  a: EntidadMapa,
  b: EntidadMapa,
  tiempoMinutos: number,
  complementarios: boolean
): { score: number; motivos: MotivoPar[] } {
  const motivos: MotivoPar[] = []
  let score = 100

  // Tiempo de viaje: 2 puntos por minuto.
  score -= tiempoMinutos * 2

  if (complementarios) {
    motivos.push({ tipo: 'ok', texto: 'Turnos complementarios' })
  } else {
    score -= 25
    motivos.push({ tipo: 'warn', texto: 'Mismo turno' })
  }

  if (a.zona && b.zona && a.zona === b.zona) {
    score += 8
    motivos.push({ tipo: 'ok', texto: `Misma zona · ${a.zona}` })
  } else if (a.zona && b.zona) {
    motivos.push({ tipo: 'warn', texto: `Zonas distintas · ${a.zona} / ${b.zona}` })
  }

  for (const persona of [a, b]) {
    const etiqueta = persona.nombre.split(',')[0]

    if (persona.datos.licenciaEstado === 'vencida') {
      score -= 30
      motivos.push({ tipo: 'bad', texto: `${etiqueta}: licencia vencida` })
    } else if (persona.datos.licenciaEstado === 'por_vencer') {
      score -= 10
      const dias = persona.datos.licenciaDiasRestantes
      motivos.push({
        tipo: 'warn',
        texto: `${etiqueta}: ${LABEL_LICENCIA.por_vencer.toLowerCase()}${dias != null ? ` (${dias} d)` : ''}`,
      })
    }

    if (persona.datos.antecedentesPenales === true) {
      score -= 15
      motivos.push({ tipo: 'bad', texto: `${etiqueta}: con antecedentes penales` })
    }

    if (persona.datos.zonaPeligrosa) {
      score -= 12
      motivos.push({ tipo: 'bad', texto: `${etiqueta}: ${persona.datos.zonaPeligrosa}` })
    }

    if (!esLeadDeInduccion(persona)) {
      score -= 10
      motivos.push({ tipo: 'warn', texto: `${etiqueta}: lead en ${persona.estadoLead || 'sin estado'}` })
    }
  }

  if (motivos.every((m) => m.tipo === 'ok')) {
    motivos.push({ tipo: 'ok', texto: 'Sin alertas' })
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), motivos }
}

// =====================================================
// Sugerencia de pares
// =====================================================

function combinacionHabilitada(
  a: EntidadMapa,
  b: EntidadMapa,
  combinaciones: CombinacionesPar
): boolean {
  if (a.tipo === 'conductor' && b.tipo === 'conductor') return combinaciones.conductorConductor
  if (a.tipo === 'lead' && b.tipo === 'lead') return combinaciones.leadLead
  return combinaciones.conductorLead
}

function clavePar(a: EntidadMapa, b: EntidadMapa): string {
  const x = `${a.tipo}:${a.id}`
  const y = `${b.tipo}:${b.id}`
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

/**
 * Genera los pares candidatos entre `bases` y `candidatos`.
 *
 * @param bases       entidades que se usan como origen (p. ej. los conductores
 *                    sin compañero, o una única entidad seleccionada).
 * @param candidatos  universo de posibles compañeros (ya filtrado por la UI).
 * @param umbralMinutos  tiempo máximo de viaje aceptado.
 */
export async function sugerirPares(
  bases: EntidadMapa[],
  candidatos: EntidadMapa[],
  opciones: OpcionesRuta,
  combinaciones: CombinacionesPar,
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<ResultadoSugerencias> {
  const { salida, desplazada } = resolverSalida(opciones)
  const radio = radioPrefiltroKm(umbralMinutos)

  const basesLimitadas = bases.slice(0, MAX_BASES_SUGERENCIA)
  const truncado = bases.length > basesLimitadas.length

  const vistos = new Set<string>()
  const pares: ParSugerido[] = []

  for (const base of basesLimitadas) {
    // 1. Prefiltro local: mismo par no repetido, combinación habilitada y
    //    dentro del radio plausible. Gratis, evita llamadas innecesarias.
    const preseleccion = candidatos
      .filter((c) => !(c.tipo === base.tipo && c.id === base.id))
      .filter((c) => combinacionHabilitada(base, c, combinaciones))
      .filter((c) => !vistos.has(clavePar(base, c)))
      .map((c) => ({ candidato: c, km: haversineKm(base.lat, base.lng, c.lat, c.lng) }))
      .filter((x) => x.km <= radio)
      .sort((x, y) => x.km - y.km)
      .slice(0, MAX_DESTINOS_POR_REQUEST)

    if (preseleccion.length === 0) continue

    // 2. Medición real sólo sobre la preselección.
    const mediciones = await medirDesdeOrigen(
      { lat: base.lat, lng: base.lng },
      preseleccion.map((x) => ({ lat: x.candidato.lat, lng: x.candidato.lng })),
      opciones,
      salida
    )

    for (let i = 0; i < preseleccion.length; i++) {
      const { candidato, km } = preseleccion[i]
      const medicion = mediciones[i] || estimarPorHaversine(km)
      if (medicion.tiempoMinutos > umbralMinutos) continue

      const clave = clavePar(base, candidato)
      if (vistos.has(clave)) continue
      vistos.add(clave)

      const complementarios = turnosComplementarios(
        turnoDeEntidad(base),
        turnoDeEntidad(candidato)
      )
      const { score, motivos } = evaluarPar(base, candidato, medicion.tiempoMinutos, complementarios)

      pares.push({
        id: clave,
        a: base,
        b: candidato,
        distanciaKm: medicion.distanciaKm,
        tiempoMinutos: medicion.tiempoMinutos,
        fuenteTiempo: medicion.fuente,
        turnosComplementarios: complementarios,
        score,
        motivos,
      })
    }
  }

  pares.sort((x, y) => y.score - x.score || x.tiempoMinutos - y.tiempoMinutos)

  const avisos: string[] = []
  if (desplazada) {
    avisos.push(
      `La hora de salida elegida ya pasó: se calculó con la próxima ocurrencia (${salida.toLocaleDateString('es-AR')} ${salida.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}).`
    )
  }
  if (truncado) {
    avisos.push(`Se evaluaron las primeras ${MAX_BASES_SUGERENCIA} bases para acotar el consumo de la API.`)
  }
  if (!mapsDisponible()) {
    avisos.push('Google Maps no está disponible: los tiempos son estimados en línea recta.')
  }

  return {
    pares: pares.slice(0, MAX_PARES_RESULTADO),
    basesEvaluadas: basesLimitadas.length,
    truncado,
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  }
}
