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
import { API_DISTANCE_MATRIX } from './apisGoogle'
import { guardarMediciones, leerMediciones } from './medicionesCacheService'
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

/** Velocidad urbana promedio usada para el prefiltro (radio de búsqueda en km). */
export const VELOCIDAD_ESTIMADA_KMH = 28

/**
 * Minutos en auto estimados a partir de la distancia en línea recta, cuando el tramo
 * todavía no se midió por calle. Calibrado el 05/11/2026 con 4.947 tramos ya medidos
 * por Google (tabla mediciones_rutas): minutos ≈ 5,37 · km^0,715. Antes se usaba
 * km / 28 km/h, que quedaba corto (≈6 min menos en promedio, la mitad en tramos
 * cortos). Error típico: 4 min (mediana), antes 7.
 *   km lineal:   1   2   3   5   8  12  20
 *   minutos:     5   9  12  17  24  32  46
 */
export function minutosEstimadosLineal(kmLineal: number): number {
  if (!(kmLineal > 0)) return 0
  return Math.round(5.365 * Math.pow(kmLineal, 0.715))
}

/** Máximo de destinos por request de Distance Matrix (límite de la API). */
const MAX_DESTINOS_POR_REQUEST = 25

/** Tope de bases evaluadas por corrida, para acotar el gasto de API. */
export const MAX_BASES_SUGERENCIA = 12

/**
 * Medición por tandas. En vez de medir de una los 25 candidatos más cercanos
 * de una base y después descartar los que pasan el umbral, se mide de a
 * `TAMANO_TANDA` y se corta apenas hay `PARES_SUFICIENTES_POR_BASE` dentro del
 * umbral.
 *
 * Funciona porque los candidatos vienen ordenados por cercanía en línea recta:
 * los buenos están casi siempre en la primera tanda. Cada candidato que no se
 * llega a medir es un elemento de Distance Matrix que no se paga.
 */
const TAMANO_TANDA = 8
const PARES_SUFICIENTES_POR_BASE = 3

/** Tope de tandas que mide un clic en "Ver más compañeros". */
const MAX_TANDAS_VER_MAS = 3

/**
 * Tope de leads evaluados en el emparejamiento lead↔lead. Más alto que el de
 * sugerencias porque ahí cada lead es base Y candidato a la vez, y el corte
 * por zona reduce mucho los candidatos por lead (3–6 en vez de 15–25).
 */
export const MAX_LEADS_EMPAREJAMIENTO = 60

/** Tope de pares devueltos. */
const MAX_PARES_RESULTADO = 60

/**
 * Cuántas líneas dibuja como máximo el modo "Ver todos en mapa". Más que esto
 * el mapa se vuelve ilegible y el consumo de API deja de justificarse.
 */
export const MAX_CONEXIONES_RADAR = 12

/** Estados de lead que se consideran listos (inducción o listos para emparejar). */
const ESTADOS_LEAD_INDUCCION = new Set([
  'apto inducción',
  'apto induccion',
  'convocatoria inducción',
  'convocatoria induccion',
  'listo emparejar',
])

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

/**
 * Caché de mediciones, compartido por TODOS los caminos que miden
 * (sugerencias, radar, emparejamiento de leads y medición manual): la consulta
 * está dentro de `medirDesdeOrigen`, que es el único punto por donde salen las
 * llamadas a Distance Matrix. Así un tramo ya medido no se vuelve a pagar,
 * venga de donde venga.
 *
 * El tiempo es determinístico (se pide sin hora de salida), así que una
 * medición hecha vale para toda la sesión. Vive a nivel de módulo para
 * sobrevivir a re-renders y a corridas sucesivas.
 *
 * La clave son las COORDENADAS, no las personas: la ruta depende del punto en
 * el mapa, no de quién viva ahí. Dos leads en la misma dirección comparten la
 * medición, y si una persona cambia de domicilio su clave cambia sola.
 *
 * Sólo se guardan mediciones reales (`fuente: 'matrix'`). Las estimaciones por
 * Haversine NO se cachean: son un reemplazo de emergencia cuando la API falla y
 * cachearlas dejaría congelado un número inventado.
 */
const cacheMediciones = new Map<string, MedicionRuta>()

/**
 * Clave de caché de un tramo. Se ordena para que A→B y B→A compartan entrada:
 * el módulo ya trata la distancia como simétrica (ver `clavePar`).
 */
export function claveTramo(a: { lat: number; lng: number }, b: { lat: number; lng: number }): string {
  const pa = `${a.lat.toFixed(3)},${a.lng.toFixed(3)}`
  const pb = `${b.lat.toFixed(3)},${b.lng.toFixed(3)}`
  return pa <= pb ? `${pa}|${pb}` : `${pb}|${pa}`
}

/**
 * Trae del caché persistente (Supabase) los tramos que todavía no están en
 * memoria y los vuelca al Map. Se llama UNA vez por corrida, antes de medir:
 * si se consultara por lote, una corrida de leads haría decenas de viajes a la
 * base en vez de uno.
 *
 * Es best-effort: si el caché no está disponible no pasa nada, se mide como
 * siempre.
 */
async function precargarDesdeBD(
  tramos: Array<{ a: { lat: number; lng: number }; b: { lat: number; lng: number } }>
): Promise<void> {
  const faltantes = [
    ...new Set(
      tramos
        .map((t) => claveTramo(t.a, t.b))
        .filter((clave) => !cacheMediciones.has(clave))
    ),
  ]
  if (faltantes.length === 0) return

  const traidas = await leerMediciones(faltantes)
  for (const [clave, medicion] of traidas) {
    cacheMediciones.set(clave, { ...medicion, fuente: 'matrix' })
  }
}

/** Cuántos de esos tramos habría que medir (no están en ningún nivel de caché). */
function contarTramosNuevos(
  tramos: Array<{ a: { lat: number; lng: number }; b: { lat: number; lng: number } }>
): number {
  const claves = new Set<string>()
  for (const t of tramos) {
    const clave = claveTramo(t.a, t.b)
    if (!cacheMediciones.has(clave)) claves.add(clave)
  }
  return claves.size
}

/**
 * Para el proceso de parejas de leads nuevos: trae del caché persistente los
 * tramos y devuelve cuántos faltan medir (lo que se pagaría a Google).
 */
export async function tramosSinMedir(
  origen: { lat: number; lng: number },
  destinos: Array<{ lat: number; lng: number }>
): Promise<number> {
  const tramos = destinos.map((b) => ({ a: origen, b }))
  await precargarDesdeBD(tramos)
  return contarTramosNuevos(tramos)
}

/**
 * Recorrido real en auto desde un origen a varios destinos, aunque Distance
 * Matrix esté apagado para el mapa. Lo ya medido sale del caché; lo nuevo se
 * guarda en mediciones_rutas. Posición en null = Google no lo resolvió.
 * Sólo para leads/rutasLeadsService.ts, que reserva antes el tope diario.
 */
export function medirRutasReales(
  origen: { lat: number; lng: number },
  destinos: Array<{ lat: number; lng: number }>
): Promise<Array<{ distanciaKm: number; tiempoMinutos: number; fuente: 'matrix' | 'estimado' } | null>> {
  return medirDesdeOrigen(origen, destinos, true)
}

function estimarPorHaversine(km: number): MedicionRuta {
  return {
    distanciaKm: Math.round(km * 10) / 10,
    tiempoMinutos: minutosEstimadosLineal(km),
    fuente: 'estimado',
  }
}

function mapsDisponible(forzar = false): boolean {
  // Interruptor global: con Distance Matrix apagado el módulo nunca llama a la
  // API y todo cae en la estimación por Haversine (badge "Tiempo estimado").
  // `forzar` lo usa sólo el proceso de parejas de leads nuevos
  // (leads/rutasLeadsService.ts), que tiene su propio tope diario en la base.
  if (!API_DISTANCE_MATRIX && !forzar) return false
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
  forzarApi = false
): Promise<Array<MedicionRuta | null>> {
  if (destinos.length === 0) return []

  const resultados: Array<MedicionRuta | null> = new Array(destinos.length).fill(null)
  const nuevas: Array<{ clave: string; distanciaKm: number; tiempoMinutos: number }> = []

  // 1. Lo ya medido antes sale del caché: no se le pide a Google ni se paga.
  //    `pendientes` guarda la posición original para reinsertar cada respuesta
  //    en su lugar del array de salida.
  const pendientes: Array<{ indice: number; destino: { lat: number; lng: number } }> = []
  for (let i = 0; i < destinos.length; i++) {
    const cacheado = cacheMediciones.get(claveTramo(origen, destinos[i]))
    if (cacheado) resultados[i] = cacheado
    else pendientes.push({ indice: i, destino: destinos[i] })
  }

  if (pendientes.length === 0) return resultados
  if (!mapsDisponible(forzarApi)) return resultados

  const google = (window as any).google

  // 2. Sólo lo que falta va a la API, en lotes del máximo que admite.
  for (let inicio = 0; inicio < pendientes.length; inicio += MAX_DESTINOS_POR_REQUEST) {
    const lote = pendientes.slice(inicio, inicio + MAX_DESTINOS_POR_REQUEST)

    const request: any = {
      origins: [new google.maps.LatLng(origen.lat, origen.lng)],
      destinations: lote.map((d) => new google.maps.LatLng(d.destino.lat, d.destino.lng)),
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
      const medicion: MedicionRuta = {
        distanciaKm: Math.round((el.distance.value / 1000) * 10) / 10,
        tiempoMinutos: Math.round(segundos / 60),
        fuente: 'matrix',
      }
      resultados[lote[i].indice] = medicion
      // 3. Se cachea sólo la medición real; el tramo que la API no resolvió
      //    queda sin entrada para poder reintentarlo más adelante.
      const clave = claveTramo(origen, lote[i].destino)
      cacheMediciones.set(clave, medicion)
      nuevas.push({
        clave,
        distanciaKm: medicion.distanciaKm,
        tiempoMinutos: medicion.tiempoMinutos,
      })
    }
  }

  // 4. Lo recién medido se persiste para que no se vuelva a pagar nunca más,
  //    ni después de un refresh ni para otro operador. No se espera la
  //    escritura: el resultado ya está en memoria.
  guardarMediciones(nuevas)

  return resultados
}

/**
 * Mide una preselección ORDENADA POR CERCANÍA, de a tandas, cortando apenas
 * hay suficientes candidatos dentro del umbral.
 *
 * Devuelve un array alineado con `preseleccion`. Una posición en `null`
 * significa "no se midió" (se cortó antes de llegar), no "falló": el caller la
 * saltea. Si la API falla sobre un candidato que SÍ se midió, ese cae en la
 * estimación por Haversine, como siempre.
 */
async function medirEnTandas(
  base: { lat: number; lng: number },
  preseleccion: Array<{ candidato: EntidadMapa; km: number }>,
  umbralMinutos: number,
  /** No corta antes de medir estos primeros (los prioritarios de un lead). */
  minimoAMedir = 0
): Promise<Array<MedicionRuta | null>> {
  const resultados: Array<MedicionRuta | null> = new Array(preseleccion.length).fill(null)
  let dentroDelUmbral = 0

  for (let inicio = 0; inicio < preseleccion.length; inicio += TAMANO_TANDA) {
    const tanda = preseleccion.slice(inicio, inicio + TAMANO_TANDA)

    const mediciones = await medirDesdeOrigen(
      base,
      tanda.map((x) => ({ lat: x.candidato.lat, lng: x.candidato.lng }))
    )

    for (let i = 0; i < tanda.length; i++) {
      const medicion = mediciones[i] || estimarPorHaversine(tanda[i].km)
      resultados[inicio + i] = medicion
      if (medicion.tiempoMinutos <= umbralMinutos) dentroDelUmbral++
    }

    if (dentroDelUmbral >= PARES_SUFICIENTES_POR_BASE && inicio + TAMANO_TANDA >= minimoAMedir) break
  }

  return resultados
}

/** Medición puntual entre dos entidades. */
async function medirEntre(a: EntidadMapa, b: EntidadMapa): Promise<MedicionRuta> {
  // Lo ya medido por calle (tabla mediciones_rutas) manda sobre la estimación,
  // así la línea del mapa dice lo mismo que la tarjeta de la sugerencia.
  await precargarDesdeBD([{ a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng } }])
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

    // "Antecedentes penales = sí" significa que PRESENTÓ el certificado: es un
    // requisito cumplido, no una alerta. No resta score; se muestra en verde.
    if (persona.datos.antecedentesPenales === true) {
      motivos.push({ tipo: 'ok', texto: `${etiqueta}: antecedentes presentados` })
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
interface PlanBase {
  base: EntidadMapa
  preseleccion: Array<{ candidato: EntidadMapa; km: number }>
}

/**
 * Con un lead de base, lo primero que importa es lo mismo que muestra Leads en
 * "Parejas posibles": conductores activos sin compañero cuyo turno libre le
 * sirve al lead (hay un auto esperándolo). Esos van primero, antes que otros
 * leads o conductores con el auto completo.
 */
function esPrioritarioDeLead(base: EntidadMapa, c: EntidadMapa): boolean {
  return (
    base.tipo === 'lead' &&
    c.tipo === 'conductor' &&
    c.estadoCompanero === 'sin_companero' &&
    !c.esBaja &&
    turnosComplementarios(turnoDeEntidad(base), turnoDeEntidad(c))
  )
}

/**
 * Candidatos de una base dentro del radio: los prioritarios de un lead primero
 * y, dentro de cada grupo, del más cercano al más lejano en línea recta. Lo usan
 * la primera corrida y "Ver más", así siguen el mismo orden.
 */
function ordenarCandidatos(
  base: EntidadMapa,
  candidatos: EntidadMapa[],
  radio: number
): Array<{ candidato: EntidadMapa; km: number }> {
  return candidatos
    // Excluye a la propia base Y a cualquier otra fila de la MISMA persona.
    .filter((c) => !mismaPersona(c, base))
    .map((c) => ({ candidato: c, km: haversineKm(base.lat, base.lng, c.lat, c.lng) }))
    .filter((x) => x.km <= radio)
    .sort((x, y) => {
      const px = esPrioritarioDeLead(base, x.candidato) ? 0 : 1
      const py = esPrioritarioDeLead(base, y.candidato) ? 0 : 1
      return px - py || x.km - y.km
    })
}

/** Orden del panel: con base lead, sus conductores prioritarios primero y por tiempo (como Leads). */
function ordenarPares(pares: ParSugerido[]): void {
  pares.sort((x, y) => {
    const px = esPrioritarioDeLead(x.a, x.b) ? 0 : 1
    const py = esPrioritarioDeLead(y.a, y.b) ? 0 : 1
    if (px !== py) return px - py
    if (px === 0) return x.tiempoMinutos - y.tiempoMinutos || x.distanciaKm - y.distanciaKm
    return y.score - x.score || x.tiempoMinutos - y.tiempoMinutos
  })
}

/**
 * Prefiltro local (gratis) de qué se va a medir. Se separó de `sugerirPares`
 * para que la estimación previa que ve el usuario y la corrida real usen
 * EXACTAMENTE el mismo criterio: si divergieran, el número del cartel mentiría.
 */
function planificarConductores(
  bases: EntidadMapa[],
  candidatos: EntidadMapa[],
  umbralMinutos: number
): { planes: PlanBase[]; truncado: boolean } {
  const radio = radioPrefiltroKm(umbralMinutos)

  // Una misma persona puede venir en varias filas (lead ya convertido en
  // conductor, o lead cargado dos veces). Se deja un solo representante antes
  // de emparejar: si no, el sistema las trata como personas distintas y llega a
  // proponer a alguien consigo mismo.
  const candidatosUnicos = dedupPorPersona(candidatos)
  const basesDedup = dedupPorPersona(bases)
  const basesLimitadas = basesDedup.slice(0, MAX_BASES_SUGERENCIA)

  const planificados = new Set<string>()
  const planes: PlanBase[] = []

  for (const base of basesLimitadas) {
    const ordenados = ordenarCandidatos(
      base,
      candidatosUnicos.filter((c) => !planificados.has(clavePar(base, c))),
      radio
    )
    // Con un lead de base entran TODOS sus conductores prioritarios (como en
    // Leads), aunque sean más de MAX_DESTINOS_POR_REQUEST.
    const prioritarios = ordenados.filter((x) => esPrioritarioDeLead(base, x.candidato)).length
    const preseleccion = ordenados.slice(0, Math.max(MAX_DESTINOS_POR_REQUEST, prioritarios))

    if (preseleccion.length === 0) continue
    for (const x of preseleccion) planificados.add(clavePar(base, x.candidato))
    planes.push({ base, preseleccion })
  }

  return { planes, truncado: basesDedup.length > basesLimitadas.length }
}

/** Tramos (origen→destino) que implica un plan, para consultar el caché. */
function tramosDePlanes(planes: PlanBase[]) {
  return planes.flatMap((p) =>
    p.preseleccion.map((x) => ({
      a: { lat: p.base.lat, lng: p.base.lng },
      b: { lat: x.candidato.lat, lng: x.candidato.lng },
    }))
  )
}

export interface PlanEstimado {
  /** Pares que el prefiltro considera candidatos. */
  paresCandidatos: number
  /** De esos, cuántos habría que MEDIR (el resto sale de caché). Es el costo. */
  tramosNuevos: number
}

/**
 * Cuánto costaría una corrida de sugerencias ANTES de lanzarla. Consulta el
 * caché persistente, así que el número ya descuenta todo lo medido alguna vez.
 *
 * `tramosNuevos` es un techo: con la medición por tandas lo real suele ser
 * bastante menos.
 */
export async function estimarPlanConductores(
  bases: EntidadMapa[],
  candidatos: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<PlanEstimado> {
  const { planes } = planificarConductores(bases, candidatos, umbralMinutos)
  const tramos = tramosDePlanes(planes)
  await precargarDesdeBD(tramos)
  return { paresCandidatos: tramos.length, tramosNuevos: contarTramosNuevos(tramos) }
}

export async function sugerirPares(
  bases: EntidadMapa[],
  candidatos: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<ResultadoSugerencias> {
  const { planes, truncado } = planificarConductores(bases, candidatos, umbralMinutos)
  await precargarDesdeBD(tramosDePlanes(planes))

  const vistos = new Set<string>()
  const pares: ParSugerido[] = []
  // Con una sola base: cuántos de sus candidatos se midieron, para "Ver más".
  let medidosBaseUnica = 0

  for (const { base, preseleccion } of planes) {
    // Medición por tandas: corta apenas hay suficientes dentro del umbral.
    const mediciones = await medirEnTandas(
      { lat: base.lat, lng: base.lng },
      preseleccion,
      umbralMinutos,
      preseleccion.filter((x) => esPrioritarioDeLead(base, x.candidato)).length
    )
    medidosBaseUnica = mediciones.filter((m) => m !== null).length

    for (let i = 0; i < preseleccion.length; i++) {
      const { candidato } = preseleccion[i]
      const medicion = mediciones[i]
      // null = no se llegó a medir (se cortó la tanda): no se propone.
      if (!medicion) continue
      if (medicion.tiempoMinutos > umbralMinutos) continue

      const clave = clavePar(base, candidato)
      if (vistos.has(clave)) continue
      vistos.add(clave)
      pares.push(armarPar(base, candidato, medicion))
    }
  }

  ordenarPares(pares)

  // Sin avisos informativos en el panel: el tope de bases es un control de
  // gasto interno y el tiempo estimado ya se marca en cada tarjeta
  // ("Tiempo estimado"). `truncado` se sigue devolviendo en el resultado.
  const avisos: string[] = []

  // Con una persona seleccionada se puede seguir midiendo más lejos ("Ver más").
  let continuacion: ResultadoSugerencias['continuacion']
  if (bases.length === 1 && planes.length === 1) {
    const total = preseleccionCompleta(planes[0].base, candidatos, umbralMinutos).length
    continuacion = { medidos: medidosBaseUnica, total }
  }

  return {
    pares: pares.slice(0, MAX_PARES_RESULTADO),
    basesEvaluadas: planes.length,
    truncado,
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
    continuacion,
  }
}

/**
 * "Ver más compañeros" para una persona: mide los candidatos que siguen en
 * cercanía, a partir de los `medidos` que ya se midieron, de a tandas de
 * `TAMANO_TANDA`. Corta apenas aparecen `PARES_SUFICIENTES_POR_BASE` nuevos
 * dentro del umbral o después de `MAX_TANDAS_VER_MAS` tandas, para que un clic
 * no mida de golpe a todo el radio. Lo ya medido alguna vez sale del caché.
 */
export async function sugerirMasPares(
  base: EntidadMapa,
  candidatos: EntidadMapa[],
  umbralMinutos: number,
  medidos: number
): Promise<{ pares: ParSugerido[]; medidos: number; total: number }> {
  const preseleccion = preseleccionCompleta(base, candidatos, umbralMinutos)
  const total = preseleccion.length
  const pares: ParSugerido[] = []
  let desde = medidos

  for (let tanda = 0; tanda < MAX_TANDAS_VER_MAS && desde < total; tanda++) {
    const lote = preseleccion.slice(desde, desde + TAMANO_TANDA)
    const tramos = lote.map((x) => ({
      a: { lat: base.lat, lng: base.lng },
      b: { lat: x.candidato.lat, lng: x.candidato.lng },
    }))
    await precargarDesdeBD(tramos)
    const mediciones = await medirDesdeOrigen(
      { lat: base.lat, lng: base.lng },
      lote.map((x) => ({ lat: x.candidato.lat, lng: x.candidato.lng }))
    )
    lote.forEach((x, i) => {
      const medicion = mediciones[i] || estimarPorHaversine(x.km)
      if (medicion.tiempoMinutos <= umbralMinutos) pares.push(armarPar(base, x.candidato, medicion))
    })
    desde += lote.length
    if (pares.length >= PARES_SUFICIENTES_POR_BASE) break
  }

  ordenarPares(pares)
  return { pares, medidos: desde, total }
}

/**
 * Todos los candidatos de una persona dentro del radio del prefiltro, del más
 * cercano al más lejano en línea recta. Los primeros `MAX_DESTINOS_POR_REQUEST`
 * son exactamente los que usa `planificarConductores` con una sola base, así
 * "Ver más" sigue justo donde quedó la primera corrida.
 */
function preseleccionCompleta(
  base: EntidadMapa,
  candidatos: EntidadMapa[],
  umbralMinutos: number
): Array<{ candidato: EntidadMapa; km: number }> {
  return ordenarCandidatos(base, dedupPorPersona(candidatos), radioPrefiltroKm(umbralMinutos))
}

/** Arma la tarjeta de un par medido, con su score y motivos. */
function armarPar(base: EntidadMapa, candidato: EntidadMapa, medicion: MedicionRuta): ParSugerido {
  const complementarios = turnosComplementarios(turnoDeEntidad(base), turnoDeEntidad(candidato))
  const { score, motivos } = evaluarPar(base, candidato, medicion.tiempoMinutos, complementarios)
  return {
    id: clavePar(base, candidato),
    a: base,
    b: candidato,
    distanciaKm: medicion.distanciaKm,
    tiempoMinutos: medicion.tiempoMinutos,
    fuenteTiempo: medicion.fuente,
    turnosComplementarios: complementarios,
    score,
    motivos,
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

  await precargarDesdeBD(
    preseleccion.map((x) => ({ a: { lat: base.lat, lng: base.lng }, b: { lat: x.candidato.lat, lng: x.candidato.lng } }))
  )
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

// =====================================================
// Emparejamiento lead ↔ lead (asignación única)
// =====================================================

/**
 * Arma las mejores parejas ENTRE LEADS. A diferencia de `sugerirPares` (que
 * lista candidatos y una persona puede aparecer en varios pares), acá cada
 * lead termina en UN solo par, el mejor que le tocó, o en `sinPareja`.
 *
 * Reglas duras (no puntúan, excluyen):
 *  - misma zona (un lead sin zona no se puede cruzar con nadie);
 *  - turnos compatibles (Diurno↔Nocturno; "Indiferente" va con cualquiera);
 *  - tiempo de viaje ≤ umbral.
 * El resto (licencia, antecedentes, estado del lead) entra en el score, que es
 * el mismo `evaluarPar` de las sugerencias.
 *
 * Costo: se mide una sola vez cada par candidato (i<j), por lotes de hasta 25
 * destinos por origen, y con caché de sesión. Con zona dura y umbral de 25
 * min, ~60 leads son del orden de 300–700 mediciones.
 */
/**
 * Prefiltro local del emparejamiento de leads. Mismo criterio que usa la
 * estimación previa, por el mismo motivo que en conductores.
 */
function planificarLeads(
  leads: EntidadMapa[],
  umbralMinutos: number
): {
  planes: PlanBase[]
  sinZona: EntidadMapa[]
  evaluados: EntidadMapa[]
  totalUnicos: number
  truncado: boolean
} {
  const radio = radioPrefiltroKm(umbralMinutos)

  const unicos = dedupPorPersona(leads.filter((e) => e.tipo === 'lead'))
  const evaluados = unicos.slice(0, MAX_LEADS_EMPAREJAMIENTO)

  // Agrupar por zona: sólo se cruzan dentro del mismo grupo.
  const porZona = new Map<string, EntidadMapa[]>()
  const sinZona: EntidadMapa[] = []
  for (const l of evaluados) {
    if (!l.zona) {
      sinZona.push(l)
      continue
    }
    const grupo = porZona.get(l.zona) || []
    grupo.push(l)
    porZona.set(l.zona, grupo)
  }

  // Para cada lead i, los j>i de su zona con turno compatible y dentro del
  // radio plausible. Cada par se planifica UNA vez (i como origen).
  const planes: PlanBase[] = []
  for (const grupo of porZona.values()) {
    for (let i = 0; i < grupo.length; i++) {
      const base = grupo[i]
      const preseleccion = grupo
        .slice(i + 1)
        .filter((c) => turnosComplementarios(turnoDeEntidad(base), turnoDeEntidad(c)))
        .map((c) => ({ candidato: c, km: haversineKm(base.lat, base.lng, c.lat, c.lng) }))
        .filter((x) => x.km <= radio)
        .sort((x, y) => x.km - y.km)

      if (preseleccion.length === 0) continue
      planes.push({ base, preseleccion })
    }
  }

  return { planes, sinZona, evaluados, totalUnicos: unicos.length, truncado: unicos.length > evaluados.length }
}

/** Cuánto costaría emparejar leads ANTES de lanzarlo. Ver `estimarPlanConductores`. */
export async function estimarPlanLeads(
  leads: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<PlanEstimado> {
  const { planes } = planificarLeads(leads, umbralMinutos)
  const tramos = tramosDePlanes(planes)
  await precargarDesdeBD(tramos)
  return { paresCandidatos: tramos.length, tramosNuevos: contarTramosNuevos(tramos) }
}

export async function emparejarLeads(
  leads: EntidadMapa[],
  umbralMinutos: number = UMBRAL_MINUTOS_DEFAULT
): Promise<ResultadoSugerencias> {
  const { planes, sinZona, evaluados, totalUnicos, truncado } = planificarLeads(
    leads,
    umbralMinutos
  )
  await precargarDesdeBD(tramosDePlanes(planes))

  const candidatos: ParSugerido[] = []

  for (const { base, preseleccion: destinos } of planes) {
      // Por tandas: como cada lead termina en UN solo par, con unos pocos
      // candidatos dentro del umbral ya alcanza para que el greedy elija bien.
      const mediciones = await medirEnTandas(
        { lat: base.lat, lng: base.lng },
        destinos,
        umbralMinutos
      )

      for (let j = 0; j < destinos.length; j++) {
        const { candidato } = destinos[j]
        const medicion = mediciones[j]
        if (!medicion) continue
        if (medicion.tiempoMinutos > umbralMinutos) continue
        // Turno ya validado arriba: siempre complementarios acá.
        const { score, motivos } = evaluarPar(base, candidato, medicion.tiempoMinutos, true)
        candidatos.push({
          id: clavePar(base, candidato),
          a: base,
          b: candidato,
          distanciaKm: medicion.distanciaKm,
          tiempoMinutos: medicion.tiempoMinutos,
          fuenteTiempo: medicion.fuente,
          turnosComplementarios: true,
          score,
          motivos,
        })
      }
    }

  // Asignación única, greedy por score: el mejor par disponible primero.
  candidatos.sort((x, y) => y.score - x.score || x.tiempoMinutos - y.tiempoMinutos)
  const usados = new Set<string>()
  const pares: ParSugerido[] = []
  for (const par of candidatos) {
    const ka = clavePersona(par.a)
    const kb = clavePersona(par.b)
    if (usados.has(ka) || usados.has(kb)) continue
    usados.add(ka)
    usados.add(kb)
    pares.push(par)
  }

  const sinPareja = evaluados.filter((l) => !usados.has(clavePersona(l)))

  const avisos: string[] = []
  if (truncado) {
    avisos.push(
      `Se evaluaron los primeros ${MAX_LEADS_EMPAREJAMIENTO} leads de ${totalUnicos} para acotar el consumo de la API. Acotá con filtros para cubrir el resto.`
    )
  }
  if (sinZona.length > 0) {
    avisos.push(`${sinZona.length} sin zona cargada: no se pueden cruzar por zona.`)
  }
  // El tiempo estimado ya se marca en cada tarjeta ("Tiempo estimado").

  return {
    pares,
    basesEvaluadas: evaluados.length,
    truncado,
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
    sinPareja,
  }
}
