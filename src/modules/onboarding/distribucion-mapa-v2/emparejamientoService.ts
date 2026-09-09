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
// Sobre el tiempo que se muestra (TIEMPO HABITUAL, no de un instante):
//  - Se pide `duration` SIN drivingOptions. Ese valor es la duración en
//    condiciones normales que Google deriva de su histórico de velocidades para
//    ese recorrido: es lo que el viaje "normalmente tarda", no el tráfico de un
//    momento puntual. Los semáforos ya están incorporados.
//  - NO se usa duration_in_traffic: eso exige un departureTime concreto y
//    devuelve la predicción de ESE instante, que cambia según cuándo se abra la
//    pantalla. Para decidir un emparejamiento (que es una decisión estable sobre
//    quién vive cerca de quién) un número reproducible vale más que uno preciso
//    para un solo horario.
//  - Distance Matrix no expone un promedio histórico consultable: no acepta
//    departureTime pasado. La única forma de un promedio literal sería muestrear
//    N instantes futuros y promediarlos, lo que multiplica por N el costo de una
//    matriz que ya es cuadrática. Por eso se usa la duración típica.
//  - Sin hora de salida el resultado es determinístico para un par dado, lo que
//    abre la puerta a cachear cada medición y dejar de pagar por repetirla.

import type {
  ConexionRadar,
  EntidadMapa,
  MotivoPar,
  ParSugerido,
  Radar,
  ResultadoSugerencias,
} from './types'
import {
  clavePersona,
  dedupPorPersona,
  haversineKm,
  mismaPersona,
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

/**
 * Cuántas líneas dibuja como máximo el modo "Ver todos en mapa". Más que esto
 * el mapa se vuelve ilegible y el consumo de API deja de justificarse.
 */
export const MAX_CONEXIONES_RADAR = 12

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
  destinos: Array<{ lat: number; lng: number }>
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
    }

    // Sin drivingOptions a propósito: así la respuesta trae `duration`
    // (duración habitual) en lugar de `duration_in_traffic` (predicción para un
    // instante puntual). Ver el encabezado del archivo.

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
      const segundos = el.duration?.value
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

/** Medición puntual entre dos entidades. */
async function medirEntre(a: EntidadMapa, b: EntidadMapa): Promise<MedicionRuta> {
  const [medicion] = await medirDesdeOrigen({ lat: a.lat, lng: a.lng }, [{ lat: b.lat, lng: b.lng }])
  return medicion || estimarPorHaversine(haversineKm(a.lat, a.lng, b.lat, b.lng))
}

/**
 * Par armado a mano: mide A↔B y lo evalúa con el MISMO scoring que las
 * sugerencias, así la tarjeta, "Copiar" y "Programar entrega" son idénticos y
 * no hay un segundo camino de código para el emparejamiento manual.
 *
 * Cuesta 1 elemento de Distance Matrix (1 origen × 1 destino). Como el tiempo
 * es determinístico, el caller puede cachear el resultado por `id`.
 */
export async function medirPar(a: EntidadMapa, b: EntidadMapa): Promise<ParSugerido> {
  const medicion = await medirEntre(a, b)
  const complementarios = turnosComplementarios(turnoDeEntidad(a), turnoDeEntidad(b))
  const { score, motivos } = evaluarPar(a, b, medicion.tiempoMinutos, complementarios)
  return {
    id: clavePar(a, b),
    a,
    b,
    distanciaKm: medicion.distanciaKm,
    tiempoMinutos: medicion.tiempoMinutos,
    fuenteTiempo: medicion.fuente,
    turnosComplementarios: complementarios,
    score,
    motivos,
  }
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

/**
 * Clave del par por PERSONA, no por fila: así el mismo par no se propone dos
 * veces cuando alguno de los dos extremos existe duplicado en la base.
 */
/** Clave estable e independiente del orden para identificar un par. */
export function clavePar(a: EntidadMapa, b: EntidadMapa): string {
  const x = clavePersona(a)
  const y = clavePersona(b)
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

/**
 * Genera los pares candidatos entre `bases` y `candidatos`.
 *
 * @param bases       entidades que se usan como origen (p. ej. los conductores
 *                    sin compañero, o una única entidad seleccionada).
 * @param candidatos  universo de posibles compañeros (ya filtrado por la UI).
 *
 * Qué se puede emparejar con qué NO es un parámetro: sale del segmento activo,
 * porque `candidatos` es exactamente lo que está visible en el mapa. Con el
 * segmento en Conductores sólo hay conductores para cruzar, con Leads sólo
 * leads, y con Ambos se cruzan las dos poblaciones. Un filtro de combinaciones
 * aparte sólo podía contradecir lo que el operador ve en pantalla.
 * @param umbralMinutos  tiempo máximo de viaje aceptado.
 */
export async function sugerirPares(
  bases: EntidadMapa[],
  candidatos: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<ResultadoSugerencias> {
  const radio = radioPrefiltroKm(umbralMinutos)

  // Una misma persona puede venir en varias filas (lead ya convertido en
  // conductor, o lead cargado dos veces). Se deja un solo representante antes
  // de emparejar: si no, el sistema las trata como personas distintas y llega a
  // proponer a alguien consigo mismo.
  const candidatosUnicos = dedupPorPersona(candidatos)

  const basesLimitadas = dedupPorPersona(bases).slice(0, MAX_BASES_SUGERENCIA)
  const truncado = dedupPorPersona(bases).length > basesLimitadas.length

  const vistos = new Set<string>()
  const pares: ParSugerido[] = []

  for (const base of basesLimitadas) {
    // 1. Prefiltro local: mismo par no repetido y dentro del radio plausible.
    //    Gratis, evita llamadas innecesarias.
    const preseleccion = candidatosUnicos
      // Excluye a la propia base Y a cualquier otra fila de la MISMA persona.
      .filter((c) => !mismaPersona(c, base))
      .filter((c) => !vistos.has(clavePar(base, c)))
      .map((c) => ({ candidato: c, km: haversineKm(base.lat, base.lng, c.lat, c.lng) }))
      .filter((x) => x.km <= radio)
      .sort((x, y) => x.km - y.km)
      .slice(0, MAX_DESTINOS_POR_REQUEST)

    if (preseleccion.length === 0) continue

    // 2. Medición real sólo sobre la preselección.
    const mediciones = await medirDesdeOrigen(
      { lat: base.lat, lng: base.lng },
      preseleccion.map((x) => ({ lat: x.candidato.lat, lng: x.candidato.lng }))
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

// =====================================================
// Modo "Ver todos en mapa"
// =====================================================

/**
 * Mide la distancia real desde una persona hacia las demás y devuelve las más
 * cercanas, para dibujarlas como líneas en el mapa.
 *
 * A diferencia de `sugerirPares`, acá NO se descarta nada por umbral ni por
 * complementariedad de turnos: el objetivo es que el operador VEA quién tiene
 * cerca. El umbral sólo se usa para colorear la línea (dentro / fuera).
 */
export async function conexionesDesde(
  base: EntidadMapa,
  candidatos: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT,
  maxConexiones: number = MAX_CONEXIONES_RADAR
): Promise<Radar> {
  // Prefiltro por cercanía en línea recta: sólo medimos las más prometedoras.
  // Se colapsan los duplicados de persona por el mismo motivo que en
  // `sugerirPares`: sin eso, la misma persona aparecería como su propio vecino.
  const preseleccion = dedupPorPersona(candidatos)
    .filter((c) => !mismaPersona(c, base))
    .map((c) => ({ candidato: c, km: haversineKm(base.lat, base.lng, c.lat, c.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, Math.min(maxConexiones, MAX_DESTINOS_POR_REQUEST))

  if (preseleccion.length === 0) {
    return { base, conexiones: [], aviso: 'No hay otras personas visibles con los filtros actuales.' }
  }

  const mediciones = await medirDesdeOrigen(
    { lat: base.lat, lng: base.lng },
    preseleccion.map((x) => ({ lat: x.candidato.lat, lng: x.candidato.lng }))
  )

  const conexiones: ConexionRadar[] = preseleccion.map((x, i) => {
    const medicion = mediciones[i] || estimarPorHaversine(x.km)
    return {
      entidad: x.candidato,
      distanciaKm: medicion.distanciaKm,
      tiempoMinutos: medicion.tiempoMinutos,
      fuenteTiempo: medicion.fuente,
      dentroDelUmbral: medicion.tiempoMinutos <= umbralMinutos,
    }
  })

  conexiones.sort((a, b) => a.tiempoMinutos - b.tiempoMinutos)

  const avisos: string[] = []
  if (!mapsDisponible()) {
    avisos.push('Google Maps no está disponible: los tiempos son estimados en línea recta.')
  }

  return { base, conexiones, aviso: avisos.length > 0 ? avisos.join(' ') : null }
}
