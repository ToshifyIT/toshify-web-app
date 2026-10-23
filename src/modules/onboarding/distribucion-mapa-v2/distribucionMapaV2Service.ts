// src/modules/onboarding/distribucion-mapa-v2/distribucionMapaV2Service.ts
//
// Servicio de datos del submódulo "Distribución en mapa v2".
//
// Diferencias respecto del v1 (distribucionMapaService.ts, que NO se toca):
//  1. Los leads se traen SIN filtrar por estado: los 14 estados del pipeline
//     quedan disponibles en los filtros. La preselección de "Apto Inducción" +
//     "Convocatoria Inducción" la decide la UI, no la consulta.
//  2. Se calcula el estado de compañero de cada conductor (turno complementario
//     libre en su asignación activa).
//  3. Se traen los datos de ficha extra (edad, licencia, experiencia,
//     antecedentes, teléfono, antigüedad) y se marca si el domicilio cae dentro
//     de una zona peligrosa activa.
//
// Sigue siendo un módulo de sólo lectura salvo por la geocodificación
// best-effort de direcciones sin coordenadas, igual que el v1.

import { supabase } from '../../../lib/supabase'
import { traerTodasLasPaginas } from '../../../utils/paginacionSupabase'
import { cargarConceptosTarifa, getPeriodoTarifa } from '../tarifaConceptos'
import type { TipoTarifa } from '../../../types/onboarding.types'
import { ESTADO_LISTO_EMPAREJAR, ESTADOS_LEAD_FILTRO } from '../../leads/leadEstados'
import { derivarUbicacion } from './ubicacion'
import { esConductorInterno } from '../../../utils/conductorUtils'
import { API_GEOCODING } from './apisGoogle'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../lib/googleMaps'
import type {
  DatosPersona,
  EntidadMapa,
  EstadoCompanero,
  TipoEntidadMapa,
  TurnoEfectivo,
  OrigenTurno,
} from './types'
import {
  calcularEdad,
  diasHasta,
  estadoLicencia,
  normalizarTieneLicencia,
  horarioATurno,
  preferenciaATurno,
  puntoEnPoligono,
  soloDigitos,
  turnoLeadATurno,
} from './utils'

/** Estado de conductor que se muestra atenuado (nunca se oculta del dataset). */
export const ESTADO_CONDUCTOR_BAJA = 'baja'

/**
 * Estados de lead ofrecidos en el filtro: los mismos que la tabla de Leads
 * (catálogo único en leads/leadEstados.ts). Los estados históricos que ya no se
 * usan (Hireflix, etc.) no se ofrecen; esos leads siguen en el mapa cuando no
 * hay ningún estado tildado.
 */
export const ESTADOS_LEAD_TODOS = ESTADOS_LEAD_FILTRO

/** Estados preseleccionados al abrir el módulo: inducción y listos para emparejar. */
export const ESTADOS_LEAD_DEFAULT = ['Apto Inducción', 'Convocatoria Inducción', ESTADO_LISTO_EMPAREJAR] as const

/**
 * Estados que NO entran al mapa bajo ningún filtro: ya salieron del pipeline,
 * no se los ubica, no se los empareja, no se los cuenta, y tampoco se ofrecen
 * en el filtro "Estado de lead". Se comparan literal contra estado_de_lead.
 *  - Descartado: misma definición que el contador "Descartados" de Leads.
 *  - Auto del pueblo / No le interesa: no se convocan (pedido de operación).
 */
export const ESTADOS_LEAD_EXCLUIDOS: ReadonlySet<string> = new Set([
  'Descartado',
  'Auto del pueblo',
  'No le interesa',
])

/** Etiqueta usada cuando un lead no tiene estado cargado. */
export const SIN_ESTADO_LEAD = 'Sin estado'

/**
 * Tope de geocodificaciones por carga. Al abrir el mapa a los 14 estados de
 * lead el universo de direcciones sin coordenadas crece mucho; sin este tope
 * una primera carga podría disparar cientos de llamadas al Geocoder.
 */
export const MAX_GEOCODIFICAR_POR_CARGA = 25

// Criterio de asignación activa: idéntico al de la columna Asignación del
// módulo de Conductores (asignación activa + fila asignado/activo + vehículo).
const ESTADOS_ASIG_ACTIVA = new Set(['activo', 'activa'])
const ESTADOS_AC_ACTIVA = new Set(['asignado', 'activo'])

// ---------- Filas crudas de BD ----------

interface ConductorRow {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  preferencia_turno: string | null
  zona: string | null
  direccion: string | null
  direccion_lat: number | null
  direccion_lng: number | null
  direccion_pais: string | null
  direccion_ciudad: string | null
  estado_id: string
  fecha_nacimiento: string | null
  numero_licencia: string | null
  licencia_vencimiento: string | null
  experiencia_previa: string | null
  antecedentes_penales: boolean | null
  telefono_contacto: string | null
  fecha_contratacion: string | null
  created_at?: string | null
  conductores_estados?: { codigo?: string | null; descripcion?: string | null } | null
}

interface LeadRow {
  id: string
  nombre_completo: string | null
  primer_nombre: string | null
  apellido: string | null
  dni: string | null
  estado_de_lead: string | null
  turno: string | null
  zona: string | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
  edad: number | null
  licencia: string | null
  vencimiento_licencia: string | null
  experiencia_previa: string | null
  experiencia_manejo: string | null
  antecedentes_penales: boolean | null
  phone: string | null
  tiempo_de_antiguedad: string | null
  created_at: string | null
  entrevistador_asignado: string | null
}

/** Zona peligrosa activa, con su polígono. */
export interface ZonaPeligrosa {
  id: string
  nombre: string
  poligono: { lat: number; lng: number }[]
}

/** Datos de la asignación activa de un conductor y su turno complementario. */
interface AsignacionActiva {
  asignacionId: string
  /** 'turno' | 'todo_dia' */
  horarioAsignacion: string | null
  /** Horario del propio conductor dentro de la asignación. */
  horarioConductor: string | null
  patente: string | null
  turnoDiurnoOcupado: boolean
  turnoNocturnoOcupado: boolean
  /** Conductores del turno complementario de la misma asignación (sin el propio). */
  companeroIds: string[]
  /** Tarifa de la asignación: la del conductor manda sobre la de la asignación. */
  tarifa: TipoTarifa
}

// Función que aplica el filtro de sede (viene del SedeContext del caller).
type AplicarFiltroSede = <T>(query: T, campo?: string) => T

// =====================================================
// Carga de Google Maps (para geocodificar)
// =====================================================

let mapsLoadPromise: Promise<void> | null = null

function loadGoogleMapsAPI(): Promise<void> {
  if ((window as any).google?.maps?.Geocoder) return Promise.resolve()
  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    )
    const waitForGeocoder = () => {
      if ((window as any).google?.maps?.Geocoder) resolve()
      else reject(new Error('Google Maps cargó sin Geocoder'))
    }

    if (existing) {
      if ((window as any).google?.maps) waitForGeocoder()
      else {
        existing.addEventListener('load', waitForGeocoder)
        existing.addEventListener('error', () => reject(new Error('Error cargando Google Maps')))
      }
      return
    }

    const url =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${GOOGLE_MAPS_API_KEY}` +
      `&libraries=${GOOGLE_MAPS_LIBRARIES.join(',')}` +
      `&language=${GOOGLE_MAPS_LANGUAGE}` +
      `&region=${GOOGLE_MAPS_REGION}` +
      '&loading=async'

    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = waitForGeocoder
    script.onerror = () => reject(new Error('Error cargando Google Maps'))
    document.head.appendChild(script)
  })

  return mapsLoadPromise
}

function geocodificarDireccion(direccion: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    try {
      const geocoder = new (window as any).google.maps.Geocoder()
      geocoder.geocode({ address: direccion, region: 'ar' }, (results: any, status: string) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location
          resolve({ lat: location.lat(), lng: location.lng() })
        } else {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

// =====================================================
// Zonas peligrosas
// =====================================================

/** Zonas peligrosas activas con polígono válido. Best-effort: si falla, []. */
export async function fetchZonasPeligrosas(): Promise<ZonaPeligrosa[]> {
  const { data, error } = await supabase
    .from('zonas_peligrosas')
    .select('id, nombre, poligono')
    .eq('activo', true)

  if (error || !data) return []

  return (data as any[])
    .map((z) => ({
      id: z.id as string,
      nombre: (z.nombre as string) || 'Zona restringida',
      poligono: Array.isArray(z.poligono) ? (z.poligono as { lat: number; lng: number }[]) : [],
    }))
    .filter((z) => z.poligono.length >= 3)
}

/** Nombre de la primera zona peligrosa que contiene el punto, o null. */
function zonaPeligrosaDe(
  lat: number | null,
  lng: number | null,
  zonas: ZonaPeligrosa[]
): string | null {
  if (lat == null || lng == null || zonas.length === 0) return null
  const punto = { lat, lng }
  for (const zona of zonas) {
    if (puntoEnPoligono(punto, zona.poligono)) return zona.nombre
  }
  return null
}

// =====================================================
// Asignaciones activas y compañero
// =====================================================

/**
 * Mapa conductor_id -> datos de su asignación activa, incluyendo qué turnos de
 * esa asignación están ocupados. Con eso se deriva el estado de compañero.
 *
 * Se pagina sobre toda la tabla (sin `.in(conductor_id, [...])`) por el mismo
 * motivo documentado en el v1: combinado con el embed, ese filtro hacía fallar
 * la request. Best-effort: si falla, mapa vacío.
 */
async function fetchAsignacionesActivas(
  sedeActualId?: string | null
): Promise<Map<string, AsignacionActiva>> {
  const porConductor = new Map<string, AsignacionActiva>()
  // asignacion_id -> conductores activos en cada turno. Se guarda QUIÉN ocupa
  // cada turno (no sólo si está ocupado) para poder mostrar el compañero.
  const ocupacion = new Map<string, { diurno: string[]; nocturno: string[] }>()
  // Filas válidas, para resolver la ocupación en una segunda pasada.
  const filas: Array<{
    conductorId: string
    asignacionId: string
    horarioAsignacion: string | null
    horarioConductor: string | null
    patente: string | null
    tarifa: TipoTarifa
  }> = []

  const pageSize = 1000

  for (let page = 0; page < 20; page++) {
    const desde = page * pageSize
    const { data, error } = await supabase
      .from('asignaciones_conductores')
      .select(
        'conductor_id, estado, horario, tipo_tarifa, asignacion_id, asignaciones(id, estado, sede_id, horario, tipo_tarifa, vehiculos(id, patente))'
      )
      .not('conductor_id', 'is', null)
      // Orden estable: sin orden, PostgreSQL puede devolver las páginas en
      // distinto orden y saltear o repetir filas entre una y otra.
      .order('id', { ascending: true })
      .range(desde, desde + pageSize - 1)

    if (error) {
      console.error('[DistribucionMapaV2] fetchAsignacionesActivas error:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data as any[]) {
      const estadoFila = (row.estado || '').toLowerCase()
      if (!ESTADOS_AC_ACTIVA.has(estadoFila)) continue

      // La relación embebida puede venir como objeto (to-one) o como array.
      const asigRaw = row.asignaciones
      const asig = Array.isArray(asigRaw) ? asigRaw[0] : asigRaw
      if (!asig) continue

      const estadoAsig = (asig.estado || '').toLowerCase()
      if (!ESTADOS_ASIG_ACTIVA.has(estadoAsig)) continue
      if (sedeActualId && asig.sede_id && asig.sede_id !== sedeActualId) continue

      const veh = Array.isArray(asig.vehiculos) ? asig.vehiculos[0] : asig.vehiculos
      if (!veh) continue // debe tener vehículo, igual que el módulo de Conductores

      const asignacionId = (asig.id || row.asignacion_id) as string
      if (!asignacionId) continue

      const horarioConductor = (row.horario || '').toLowerCase() || null

      const conductorId = row.conductor_id as string
      const slot = ocupacion.get(asignacionId) || { diurno: [], nocturno: [] }
      if (horarioConductor === 'diurno' && !slot.diurno.includes(conductorId)) slot.diurno.push(conductorId)
      if (horarioConductor === 'nocturno' && !slot.nocturno.includes(conductorId)) slot.nocturno.push(conductorId)
      ocupacion.set(asignacionId, slot)

      filas.push({
        conductorId: row.conductor_id as string,
        asignacionId,
        horarioAsignacion: (asig.horario || '').toLowerCase() || null,
        horarioConductor,
        patente: (veh.patente as string) || null,
        // Sin dato es 'antigua', mismo criterio que el asistente de Programación.
        tarifa: ((row.tipo_tarifa || asig.tipo_tarifa) || 'antigua') as TipoTarifa,
      })
    }

    if (data.length < pageSize) break
  }

  for (const fila of filas) {
    if (porConductor.has(fila.conductorId)) continue
    const slot = ocupacion.get(fila.asignacionId) || { diurno: [], nocturno: [] }
    const complementario =
      fila.horarioConductor === 'diurno'
        ? slot.nocturno
        : fila.horarioConductor === 'nocturno'
          ? slot.diurno
          : []
    porConductor.set(fila.conductorId, {
      asignacionId: fila.asignacionId,
      horarioAsignacion: fila.horarioAsignacion,
      horarioConductor: fila.horarioConductor,
      patente: fila.patente,
      turnoDiurnoOcupado: slot.diurno.length > 0,
      turnoNocturnoOcupado: slot.nocturno.length > 0,
      companeroIds: complementario.filter((id) => id !== fila.conductorId),
      tarifa: fila.tarifa,
    })
  }

  return porConductor
}

/**
 * Deriva el estado de compañero a partir de la asignación activa.
 *
 * Regla acordada: "sin compañero" = tiene asignación activa POR TURNO sobre un
 * vehículo y el turno complementario de esa misma asignación está vacío.
 * Las asignaciones 'todo_dia' (modalidad a cargo) devuelven 'no_aplica' porque
 * por diseño las cubre un solo conductor.
 */
function derivarCompanero(asig: AsignacionActiva | undefined): {
  estado: EstadoCompanero
  turnoLibre: 'diurno' | 'nocturno' | null
} {
  if (!asig) return { estado: 'no_aplica', turnoLibre: null }
  if (asig.horarioAsignacion === 'todo_dia') return { estado: 'no_aplica', turnoLibre: null }
  if (asig.horarioConductor !== 'diurno' && asig.horarioConductor !== 'nocturno') {
    return { estado: 'no_aplica', turnoLibre: null }
  }

  const complementarioOcupado =
    asig.horarioConductor === 'diurno' ? asig.turnoNocturnoOcupado : asig.turnoDiurnoOcupado

  if (complementarioOcupado) return { estado: 'con_companero', turnoLibre: null }

  return {
    estado: 'sin_companero',
    turnoLibre: asig.horarioConductor === 'diurno' ? 'nocturno' : 'diurno',
  }
}

// =====================================================
// Conductores
// =====================================================

/** "APELLIDO, Nombre" con el mismo formato que la lista y la ficha. */
function nombreConductor(r: Pick<ConductorRow, 'apellidos' | 'nombres'>): string {
  const nombre = `${r.apellidos || ''}, ${r.nombres || ''}`.trim().replace(/^,|,$/g, '').trim()
  return nombre || 'Sin nombre'
}

export async function fetchConductoresMapa(
  aplicarFiltroSede: AplicarFiltroSede,
  sedeActualId?: string | null,
  zonasPeligrosas: ZonaPeligrosa[] = []
): Promise<EntidadMapa[]> {
  const COLUMNAS =
    'id, nombres, apellidos, numero_dni, preferencia_turno, zona, direccion, direccion_lat, direccion_lng, direccion_pais, direccion_ciudad, estado_id, fecha_nacimiento, numero_licencia, licencia_vencimiento, experiencia_previa, antecedentes_penales, telefono_contacto, fecha_contratacion, conductores_estados(codigo, descripcion)'

  // Más recientes primero, igual que los leads. Si la tabla no tuviera
  // created_at, se cae al orden anterior (apellido) en vez de no cargar nada.
  // Por páginas (ver utils/paginacionSupabase); `id` desempata para paginar estable.
  const consultar = (conFecha: boolean) =>
    traerTodasLasPaginas<ConductorRow>((desde, hasta, contar) => {
      const columnas = conFecha ? `${COLUMNAS}, created_at` : COLUMNAS
      const q = (supabase.from('conductores') as any).select(columnas, contar ? { count: 'exact' } : undefined)
      const ordenada = conFecha
        ? q.order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
        : q.order('apellidos', { ascending: true }).order('id', { ascending: true })
      return aplicarFiltroSede(ordenada, 'sede_id').range(desde, hasta)
    })

  let { data, error } = await consultar(true)
  if (error) ({ data, error } = await consultar(false))
  if (error) throw error

  // Los conductores comodín del equipo interno no van al mapa, la lista ni las métricas.
  const rows = ((data || []) as ConductorRow[]).filter((r) => !esConductorInterno(r))

  const ultimoHorario = await fetchUltimoHorarioPorConductor(rows.map((r) => r.id))
  const [asignacionesActivas, conceptosTarifa] = await Promise.all([
    fetchAsignacionesActivas(sedeActualId),
    cargarConceptosTarifa(),
  ])

  // Fallback de turno al que tenían como lead, sólo para los que quedarían sin dato.
  const dnisFallback: string[] = []
  for (const r of rows) {
    const tAsig = horarioATurno(ultimoHorario.get(r.id) || null)
    const tPref = preferenciaATurno(r.preferencia_turno)
    if (!tAsig && !tPref && r.numero_dni) dnisFallback.push(r.numero_dni)
  }
  const turnoLeadPorDni = await fetchTurnoLeadPorDni(dnisFallback)

  // Nombre por id, para resolver el compañero sin otra consulta a la base.
  const nombrePorId = new Map<string, string>()
  for (const r of rows) nombrePorId.set(r.id, nombreConductor(r))

  return rows.map((r) => {
    const codigo = r.conductores_estados?.codigo?.toLowerCase() || null
    const nombre = nombreConductor(r)

    const horario = ultimoHorario.get(r.id) || null
    const turnoAsig = horarioATurno(horario)
    const turnoPref = preferenciaATurno(r.preferencia_turno)

    let turnoEfectivo: TurnoEfectivo | null
    let turnoOrigen: OrigenTurno
    if (turnoAsig) {
      turnoEfectivo = turnoAsig
      turnoOrigen = 'asignacion'
    } else if (turnoPref) {
      turnoEfectivo = turnoPref
      turnoOrigen = 'preferencia'
    } else {
      const turnoLead = turnoLeadATurno(turnoLeadPorDni.get(soloDigitos(r.numero_dni)))
      if (turnoLead) {
        turnoEfectivo = turnoLead
        turnoOrigen = 'lead'
      } else {
        turnoEfectivo = null
        turnoOrigen = 'ninguno'
      }
    }

    const asig = asignacionesActivas.get(r.id)
    const companero = derivarCompanero(asig)
    // Sólo los compañeros que están entre los conductores cargados (misma sede).
    const companerosConocidos =
      companero.estado === 'con_companero'
        ? (asig?.companeroIds || []).filter((id) => nombrePorId.has(id))
        : []

    const datos: DatosPersona = {
      edad: calcularEdad(r.fecha_nacimiento),
      licenciaNumero: r.numero_licencia || null,
      licenciaVencimiento: r.licencia_vencimiento || null,
      licenciaEstado: estadoLicencia(r.licencia_vencimiento),
      licenciaDiasRestantes: diasHasta(r.licencia_vencimiento),
      // El conductor ya pasó el alta: no existe el Sí/No que sí tiene el lead.
      tieneLicencia: null,
      experiencia: r.experiencia_previa || null,
      antecedentesPenales: r.antecedentes_penales ?? null,
      telefono: r.telefono_contacto || null,
      zonaPeligrosa: zonaPeligrosaDe(r.direccion_lat, r.direccion_lng, zonasPeligrosas),
      antiguedad: r.fecha_contratacion || null,
    }

    return {
      id: r.id,
      tipo: 'conductor' as const,
      nombre,
      documento: r.numero_dni || null,
      lat: r.direccion_lat as number,
      lng: r.direccion_lng as number,
      zona: r.zona || null,
      direccion: r.direccion || null,
      preferenciaTurno: r.preferencia_turno || null,
      estadoCodigo: codigo,
      estadoDescripcion: r.conductores_estados?.descripcion || null,
      esBaja: codigo === ESTADO_CONDUCTOR_BAJA,
      tieneAsignacionActiva: !!asig,
      turnoEfectivo,
      turnoOrigen,
      horarioUltimaAsignacion: horario,
      estadoCompanero: companero.estado,
      patenteAsignacion: asig?.patente || null,
      tarifaAsignacion: asig ? getPeriodoTarifa(conceptosTarifa, asig.tarifa) : null,
      turnoLibreAsignacion: companero.turnoLibre,
      companeroId: companerosConocidos[0] ?? null,
      companeroNombre:
        companerosConocidos.length > 0
          ? companerosConocidos.map((id) => nombrePorId.get(id)).join(' / ')
          : null,
      estadoLead: null,
      turnoLead: null,
      creadoEn: r.created_at || null,
      ...ubicacionDeConductor(r),
      datos,
    }
  })
}

/** Map<conductor_id, horario> con el horario de la ÚLTIMA asignación. */
/**
 * Tamaño de lote para los filtros `.in(...)`. PostgREST manda el filtro en la
 * URL del GET: con cientos de UUIDs se pasa del largo máximo y el servidor
 * corta la conexión antes de responder (el browser lo muestra como error CORS
 * / net::ERR_FAILED). 100 UUIDs ≈ 4 KB, holgado para cualquier proxy.
 */
const LOTE_IN = 100

function enLotes<T>(items: T[], tamano = LOTE_IN): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano))
  return out
}

async function fetchUltimoHorarioPorConductor(
  conductorIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (conductorIds.length === 0) return map

  // Cada lote viene ordenado por fecha desc; como los lotes no comparten
  // conductores, quedarse con la primera fila por conductor sigue siendo válido.
  const respuestas = await Promise.all(
    enLotes(conductorIds).map((lote) =>
      supabase
        .from('asignaciones_conductores')
        .select('conductor_id, horario, fecha_asignacion')
        .in('conductor_id', lote)
        .order('fecha_asignacion', { ascending: false })
    )
  )

  for (const { data, error } of respuestas) {
    if (error || !data) continue
    for (const row of data as { conductor_id: string; horario: string | null }[]) {
      if (!map.has(row.conductor_id)) map.set(row.conductor_id, row.horario || null)
    }
  }
  return map
}

/** Map<dni(sólo dígitos), turno> del turno que tenía cada lead. Best-effort. */
async function fetchTurnoLeadPorDni(dnis: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const limpios = [...new Set(dnis.filter(Boolean))]
  if (limpios.length === 0) return map

  const respuestas = await Promise.all(
    enLotes(limpios).map((lote) => supabase.from('leads').select('dni, turno').in('dni', lote))
  )

  for (const { data, error } of respuestas) {
    if (error || !data) continue
    for (const row of data as Array<{ dni: string | null; turno: string | null }>) {
      const key = soloDigitos(row.dni)
      if (key && row.turno && !map.has(key)) map.set(key, row.turno)
    }
  }
  return map
}

// =====================================================
// Leads (los 14 estados)
// =====================================================

/**
 * Pais y ciudad de un lead: manda lo que guardo el geocoding y el parseo del
 * texto queda como respaldo. Los dos campos se resuelven por separado a
 * proposito: un lead puede tener la ciudad guardada y el pais no.
 */
/**
 * País y ciudad de un conductor: manda lo guardado en la fila (salió de Google
 * al cargar la dirección, ver sql/conductores_pais_ciudad.sql). El parseo del
 * texto queda de respaldo para quien todavía no lo tiene.
 */
function ubicacionDeConductor(r: ConductorRow): { pais: string | null; ciudad: string | null; ubicacionGuardada: boolean } {
  const derivada = derivarUbicacion(r.direccion)
  return {
    pais: r.direccion_pais || derivada.pais,
    ciudad: r.direccion_ciudad || derivada.ciudad,
    // Solo la ciudad guardada cuenta: un país sin ciudad no alcanza para ignorar la celda.
    ubicacionGuardada: !!r.direccion_ciudad,
  }
}

function ubicacionDeLead(r: any): { pais: string | null; ciudad: string | null } {
  const derivada = derivarUbicacion(r.direccion)
  return {
    pais: r.direccion_pais || derivada.pais,
    ciudad: r.direccion_ciudad || derivada.ciudad,
  }
}


export async function fetchLeadsMapa(
  aplicarFiltroSede: AplicarFiltroSede,
  zonasPeligrosas: ZonaPeligrosa[] = []
): Promise<EntidadMapa[]> {
  // Sin `.in('estado_de_lead', ...)`: el v2 trae todo el pipeline y la UI decide
  // qué estados mostrar (preseleccionados: los dos de inducción).
  // Los estados excluidos por regla de negocio (Descartado) se filtran ya en la
  // base para no bajarlos: igual se vuelven a filtrar abajo. Los leads sin
  // estado se conservan (en SQL, NULL NOT IN (...) los dejaría afuera).
  const excluidos = [...ESTADOS_LEAD_EXCLUIDOS].map((e) => `"${e}"`).join(',')
  const COLUMNAS_LEAD =
    'id, nombre_completo, primer_nombre, apellido, dni, estado_de_lead, turno, zona, direccion, direccion_pais, direccion_ciudad, latitud, longitud, edad, licencia, vencimiento_licencia, experiencia_previa, experiencia_manejo, antecedentes_penales, phone, tiempo_de_antiguedad, created_at, entrevistador_asignado'

  // Por páginas: hay más leads que el tope de filas por respuesta de Supabase
  // (ver utils/paginacionSupabase).
  const { data, error } = await traerTodasLasPaginas<LeadRow>((desde, hasta, contar) => {
    let q = (supabase.from('leads') as any).select(COLUMNAS_LEAD, contar ? { count: 'exact' } : undefined)
    if (excluidos) q = q.or(`estado_de_lead.is.null,estado_de_lead.not.in.(${excluidos})`)
    // Más recientes primero, igual que la tabla de Leads (columna "Creación").
    // Los que no tienen fecha van al final; `id` desempata para paginar estable.
    q = q.order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
    return aplicarFiltroSede(q, 'sede_id').range(desde, hasta)
  })
  if (error) throw error

  const rows = (data || []) as LeadRow[]

  return rows.map((r) => {
    const nombre =
      (r.nombre_completo && r.nombre_completo.trim()) ||
      `${r.primer_nombre || ''} ${r.apellido || ''}`.trim() ||
      'Sin nombre'

    const datos: DatosPersona = {
      edad: r.edad ?? null,
      licenciaNumero: r.licencia || null,
      licenciaVencimiento: r.vencimiento_licencia || null,
      licenciaEstado: estadoLicencia(r.vencimiento_licencia),
      licenciaDiasRestantes: diasHasta(r.vencimiento_licencia),
      tieneLicencia: normalizarTieneLicencia(r.licencia),
      experiencia: r.experiencia_previa || r.experiencia_manejo || null,
      antecedentesPenales: r.antecedentes_penales ?? null,
      telefono: r.phone || null,
      zonaPeligrosa: zonaPeligrosaDe(r.latitud, r.longitud, zonasPeligrosas),
      antiguedad: r.tiempo_de_antiguedad || null,
    }

    return {
      id: r.id,
      tipo: 'lead' as const,
      nombre,
      documento: r.dni || null,
      lat: r.latitud as number,
      lng: r.longitud as number,
      zona: r.zona || null,
      direccion: r.direccion || null,
      preferenciaTurno: null,
      estadoCodigo: null,
      estadoDescripcion: null,
      esBaja: false,
      tieneAsignacionActiva: false,
      turnoEfectivo: null,
      turnoOrigen: 'ninguno' as const,
      horarioUltimaAsignacion: null,
      estadoCompanero: 'no_aplica' as const,
      patenteAsignacion: null,
      turnoLibreAsignacion: null,
      companeroId: null,
      companeroNombre: null,
      estadoLead: r.estado_de_lead || null,
      turnoLead: r.turno || null,
      creadoEn: r.created_at || null,
      guia: (r.entrevistador_asignado || '').trim() || null,
      // Pais y ciudad: primero los que guardo el geocoding (Google ya los trae
      // separados en address_components), y recien si faltan se cae al parseo
      // del texto de la direccion. En leads la direccion se tipea a mano y
      // casi nunca trae el pais, por eso el parseo quedo como respaldo y no
      // como fuente principal (ver sql/leads_pais_ciudad_columns.sql).
      ...ubicacionDeLead(r),
      datos,
    }
  })
    // REGLAS DE NEGOCIO (no son filtros opcionales, no se pueden destildar):
    //  - Un lead cuyo domicilio cae en una zona restringida no se muestra, ni
    //    se empareja, ni cuenta: a ese lead directamente no se lo convoca.
    //  - Un lead descartado ya salió del pipeline: tampoco entra.
    // Para conductores no aplica lo de zona (ya son parte de la flota).
    .filter((lead) => !lead.datos.zonaPeligrosa)
    .filter((lead) => !ESTADOS_LEAD_EXCLUIDOS.has(lead.estadoLead || ''))
}

// =====================================================
// Geocodificar y persistir faltantes
// =====================================================

interface FilaSinCoords {
  id: string
  tipo: TipoEntidadMapa
  direccion: string | null
  lat: number | null
  lng: number | null
}

/**
 * Geocodifica y persiste las filas con dirección pero sin coordenadas.
 * - conductores -> direccion_lat / direccion_lng
 * - leads       -> latitud / longitud
 *
 * A diferencia del v1, se procesan como máximo MAX_GEOCODIFICAR_POR_CARGA filas
 * por corrida: al abrir los 14 estados de lead el universo pendiente puede ser
 * muy grande y no queremos disparar cientos de llamadas al Geocoder de una vez.
 * Las que quedan afuera se resuelven en cargas sucesivas.
 *
 * Devuelve true si actualizó al menos una fila, para que el caller recargue.
 */
export async function geocodificarFaltantes(filas: FilaSinCoords[]): Promise<boolean> {
  // Interruptor del módulo: apagado, no se toca Google. Se corta acá y no en
  // el caller para que ningún camino futuro se saltee el control.
  if (!API_GEOCODING) return false

  const sinCoords = filas
    .filter((f) => f.direccion && f.direccion.trim() && (f.lat == null || f.lng == null))
    .slice(0, MAX_GEOCODIFICAR_POR_CARGA)

  if (sinCoords.length === 0) return false

  try {
    await loadGoogleMapsAPI()
  } catch {
    return false
  }

  let actualizado = false
  for (const fila of sinCoords) {
    try {
      const coords = await geocodificarDireccion(fila.direccion || '')
      if (!coords) continue

      if (fila.tipo === 'conductor') {
        await supabase
          .from('conductores')
          .update({ direccion_lat: coords.lat, direccion_lng: coords.lng } as any)
          .eq('id', fila.id)
      } else {
        await supabase
          .from('leads')
          .update({ latitud: coords.lat, longitud: coords.lng })
          .eq('id', fila.id)
      }
      actualizado = true
    } catch {
      // best-effort: una geocodificación fallida no interrumpe el resto
    }
  }

  return actualizado
}
