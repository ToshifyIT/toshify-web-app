// src/modules/onboarding/distribucion-mapa/distribucionMapaService.ts
//
// Servicio de datos del submódulo "Distribución en mapa" (solo visualización).
// - Trae conductores y leads (Apto Inducción + Convocatoria Inducción).
// - Geocodifica y persiste las direcciones sin coordenadas, reusando el mismo
//   patrón que ya usan LeadsModule y ProgramacionAssignmentWizard.
//
// IMPORTANTE: no modifica ninguna lógica existente; solo lee y, cuando falta,
// completa lat/lng en las columnas ya existentes (conductores.direccion_lat/lng,
// leads.latitud/longitud).

import { supabase } from '../../../lib/supabase'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../lib/googleMaps'

// Estado de conductor que NUNCA se muestra en este mapa.
export const ESTADO_CONDUCTOR_EXCLUIDO = 'baja'

// Estados de lead que SÍ se muestran: listos/convocados para inducción.
// "Descartado" y cualquier otro estado quedan fuera por definición.
export const ESTADOS_LEAD_INCLUIDOS = ['Apto Inducción', 'Convocatoria Inducción'] as const

export type TipoEntidadMapa = 'conductor' | 'lead'

// Rango geográfico válido (Argentina continental + margen). Sirve para descartar
// coordenadas basura (geocodificaciones fallidas tipo lat=85/lng=-180 que salen
// de plus-codes o direcciones inválidas) que romperían el fitBounds del mapa.
const AR_LAT_MIN = -56
const AR_LAT_MAX = -21
const AR_LNG_MIN = -74
const AR_LNG_MAX = -53

/** true si (lat,lng) es un número finito dentro del rango de Argentina. */
export function coordsValidas(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= AR_LAT_MIN &&
    lat <= AR_LAT_MAX &&
    lng >= AR_LNG_MIN &&
    lng <= AR_LNG_MAX
  )
}

// Turno efectivo normalizado para pintar/filtrar en el mapa.
// 'todo_dia' se trata como sin preferencia a efectos de color.
export type TurnoEfectivo = 'DIURNO' | 'NOCTURNO' | 'SIN_PREFERENCIA'

// De dónde salió el turno efectivo (para mostrarlo en el InfoWindow).
// 'lead' = fallback adicional: preferencia que tenía como lead (por DNI).
export type OrigenTurno = 'asignacion' | 'preferencia' | 'lead' | 'ninguno'

// Shape normalizado para el mapa: conductores y leads comparten estas claves,
// aunque en BD las columnas de coordenadas se llamen distinto.
export interface EntidadMapa {
  id: string
  tipo: TipoEntidadMapa
  nombre: string
  documento: string | null // DNI
  lat: number
  lng: number
  zona: string | null
  direccion: string | null
  // Conductor
  preferenciaTurno: string | null // DIURNO / NOCTURNO / A_CARGO / SIN_PREFERENCIA
  estadoCodigo: string | null // codigo normalizado en minúsculas (activo / baja)
  estadoDescripcion: string | null
  esBaja: boolean
  // true si el conductor tiene una asignación ACTIVA vigente (filtro con/sin asignación).
  tieneAsignacionActiva: boolean
  // Turno efectivo del conductor (última asignación → preferencia → turno del lead).
  turnoEfectivo: TurnoEfectivo | null
  turnoOrigen: OrigenTurno
  // Valor crudo del horario de la última asignación (diurno/nocturno/todo_dia), si hay.
  horarioUltimaAsignacion: string | null
  // Lead
  estadoLead: string | null
  turnoLead: string | null
}

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
  estado_id: string
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
}

// Función que aplica el filtro de sede (viene del SedeContext del caller).
type AplicarFiltroSede = <T>(query: T, campo?: string) => T

// =====================================================
// Carga de Google Maps (para geocodificar). Reusa la URL/constantes canónicas.
// =====================================================

let mapsLoadPromise: Promise<void> | null = null

function loadGoogleMapsAPI(): Promise<void> {
  if ((window as any).google?.maps?.Geocoder) return Promise.resolve()
  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    // Si ya hay un <script> del SDK inyectado por otro módulo, esperar a que cargue.
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
      geocoder.geocode(
        { address: direccion, region: 'ar' },
        (results: any, status: string) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location
            resolve({ lat: location.lat(), lng: location.lng() })
          } else {
            resolve(null)
          }
        }
      )
    } catch {
      resolve(null)
    }
  })
}

// Normaliza el `horario` de una asignación (diurno/nocturno/todo_dia) a turno efectivo.
function horarioATurno(horario: string | null | undefined): TurnoEfectivo | null {
  const h = (horario || '').toLowerCase()
  if (h === 'diurno') return 'DIURNO'
  if (h === 'nocturno') return 'NOCTURNO'
  if (h === 'todo_dia') return 'SIN_PREFERENCIA'
  return null
}

// Normaliza la preferencia_turno del conductor a turno efectivo.
function preferenciaATurno(pref: string | null | undefined): TurnoEfectivo | null {
  const p = (pref || '').toUpperCase()
  if (p === 'DIURNO') return 'DIURNO'
  if (p === 'NOCTURNO') return 'NOCTURNO'
  if (p === 'A_CARGO' || p === 'SIN_PREFERENCIA') return 'SIN_PREFERENCIA'
  return null
}

// ---------- Añadidos (no alteran la lógica existente de arriba) ----------

// Normaliza el turno que tenía el lead (leads.turno) a turno efectivo. Tolerante
// a formato ("Diurno", "diurno", "Nocturno", etc.).
function turnoLeadATurno(turno: string | null | undefined): TurnoEfectivo | null {
  const t = (turno || '').toLowerCase()
  if (t.includes('diurn')) return 'DIURNO'
  if (t.includes('noctur')) return 'NOCTURNO'
  if (t.includes('cargo') || t.includes('sin pref') || t.includes('todo')) return 'SIN_PREFERENCIA'
  return null
}

// DNI a solo dígitos, para cruzar conductor (numero_dni) con lead (dni).
function soloDigitos(dni: string | null | undefined): string {
  return (dni || '').replace(/\D/g, '')
}

// "Con asignación" (asignación activa vigente) usa EXACTAMENTE el mismo criterio
// que la columna Asignación del módulo de Conductores: la ASIGNACIÓN está activa
// Y la fila del conductor está asignado/activo Y tiene vehículo Y (misma sede).
const ESTADOS_ASIG_ACTIVA = new Set(['activo', 'activa'])   // asignaciones.estado
const ESTADOS_AC_ACTIVA = new Set(['asignado', 'activo'])   // asignaciones_conductores.estado

// =====================================================
// Fetch conductores (activos + baja). La UI decide si muestra los de baja.
// El turno efectivo sale de la última asignación; si no hay, de la preferencia.
// =====================================================

export async function fetchConductoresMapa(
  aplicarFiltroSede: AplicarFiltroSede,
  sedeActualId?: string | null
): Promise<EntidadMapa[]> {
  let query = supabase
    .from('conductores')
    .select(
      'id, nombres, apellidos, numero_dni, preferencia_turno, zona, direccion, direccion_lat, direccion_lng, estado_id, conductores_estados(codigo, descripcion)'
    )
    .order('apellidos', { ascending: true }) as any

  query = aplicarFiltroSede(query, 'sede_id')

  const { data, error } = await query
  if (error) throw error

  const rows = (data || []) as ConductorRow[]

  // Última asignación por conductor (horario). Se toma la de fecha_asignacion más
  // reciente. Campo horario y fecha_asignacion están completos en la tabla.
  const ultimoHorario = await fetchUltimoHorarioPorConductor(rows.map((r) => r.id))

  // AÑADIDO (independiente): set de conductores con asignación ACTIVA vigente,
  // para el filtro con/sin asignación. No altera el cálculo de turno de arriba.
  const asignacionActivaSet = await fetchAsignacionActivaSet(sedeActualId)

  // AÑADIDO (independiente): fallback de turno al que tenían como lead. Solo para
  // conductores que hoy quedarían "sin dato" (sin asignación y sin preferencia).
  const dnisFallback: string[] = []
  for (const r of rows) {
    const tAsig = horarioATurno(ultimoHorario.get(r.id) || null)
    const tPref = preferenciaATurno(r.preferencia_turno)
    if (!tAsig && !tPref && r.numero_dni) dnisFallback.push(r.numero_dni)
  }
  const turnoLeadPorDni = await fetchTurnoLeadPorDni(dnisFallback)

  return rows.map((r) => {
    const codigo = r.conductores_estados?.codigo?.toLowerCase() || null
    const nombre = `${r.apellidos || ''}, ${r.nombres || ''}`.trim().replace(/^,|,$/g, '').trim()

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
      // AÑADIDO: último recurso, turno que tenía como lead (por DNI).
      const turnoLead = turnoLeadATurno(turnoLeadPorDni.get(soloDigitos(r.numero_dni)))
      if (turnoLead) {
        turnoEfectivo = turnoLead
        turnoOrigen = 'lead'
      } else {
        turnoEfectivo = null
        turnoOrigen = 'ninguno'
      }
    }

    return {
      id: r.id,
      tipo: 'conductor' as const,
      nombre: nombre || 'Sin nombre',
      documento: r.numero_dni || null,
      lat: r.direccion_lat as number,
      lng: r.direccion_lng as number,
      zona: r.zona || null,
      direccion: r.direccion || null,
      preferenciaTurno: r.preferencia_turno || null,
      estadoCodigo: codigo,
      estadoDescripcion: r.conductores_estados?.descripcion || null,
      esBaja: codigo === ESTADO_CONDUCTOR_EXCLUIDO,
      tieneAsignacionActiva: asignacionActivaSet.has(r.id),
      turnoEfectivo,
      turnoOrigen,
      horarioUltimaAsignacion: horario,
      estadoLead: null,
      turnoLead: null,
    }
  })
}

// Devuelve un Map<conductor_id, horario> con el horario de la ÚLTIMA asignación
// (mayor fecha_asignacion) de cada conductor. Best-effort: si falla, Map vacío.
async function fetchUltimoHorarioPorConductor(
  conductorIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (conductorIds.length === 0) return map

  const { data, error } = await supabase
    .from('asignaciones_conductores')
    .select('conductor_id, horario, fecha_asignacion')
    .in('conductor_id', conductorIds)
    .order('fecha_asignacion', { ascending: false })

  if (error || !data) return map

  // La query viene ordenada desc por fecha; el primer registro de cada conductor
  // es su última asignación.
  for (const row of data as { conductor_id: string; horario: string | null }[]) {
    if (!map.has(row.conductor_id)) {
      map.set(row.conductor_id, row.horario || null)
    }
  }
  return map
}

// AÑADIDO: devuelve el Set de conductor_id con una asignación ACTIVA vigente,
// usando EXACTAMENTE el mismo criterio que la columna Asignación del módulo de
// Conductores (asignado/activo + asignación activa + con vehículo + misma sede).
// Trae las filas con el estado/sede/vehículo de la asignación embebidos y pagina,
// SIN el filtro .in(conductor_id, [...]) que —con el embed— hacía fallar la request
// (net::ERR_FAILED). Best-effort: si falla, Set vacío.
async function fetchAsignacionActivaSet(sedeActualId?: string | null): Promise<Set<string>> {
  const set = new Set<string>()
  const pageSize = 1000

  for (let page = 0; page < 20; page++) {
    const desde = page * pageSize
    const { data, error } = await supabase
      .from('asignaciones_conductores')
      .select('conductor_id, estado, asignaciones(estado, sede_id, vehiculos(id))')
      .not('conductor_id', 'is', null)
      .range(desde, desde + pageSize - 1)

    if (error) {
      console.error('[DistribucionMapa] fetchAsignacionActivaSet error:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of (data as any[])) {
      const ac = (row.estado || '').toLowerCase()
      // La relación embebida puede venir como objeto (to-one) o como array según los tipos.
      const asigRaw = row.asignaciones
      const asig = Array.isArray(asigRaw) ? asigRaw[0] : asigRaw
      const asigEstado = (asig?.estado || '').toLowerCase()

      if (!ESTADOS_ASIG_ACTIVA.has(asigEstado)) continue
      if (!ESTADOS_AC_ACTIVA.has(ac)) continue
      if (sedeActualId && asig?.sede_id && asig.sede_id !== sedeActualId) continue
      // Debe tener vehículo asignado (igual que el módulo de Conductores).
      const veh = asig?.vehiculos
      const tieneVehiculo = Array.isArray(veh) ? veh.length > 0 : !!veh
      if (!tieneVehiculo) continue

      if (row.conductor_id) set.add(row.conductor_id as string)
    }

    if (data.length < pageSize) break
  }

  return set
}

// AÑADIDO: Map<dni(solo dígitos), turno> con el turno que tenía cada lead. Se usa
// como último fallback de turno para conductores sin asignación. Best-effort.
async function fetchTurnoLeadPorDni(dnis: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const limpios = [...new Set(dnis.filter(Boolean))]
  if (limpios.length === 0) return map

  const { data, error } = await supabase
    .from('leads')
    .select('dni, turno')
    .in('dni', limpios)

  if (error || !data) return map

  for (const row of data as Array<{ dni: string | null; turno: string | null }>) {
    const key = soloDigitos(row.dni)
    if (key && row.turno && !map.has(key)) {
      map.set(key, row.turno)
    }
  }
  return map
}

// =====================================================
// Fetch leads (Apto Inducción + Convocatoria Inducción)
// =====================================================

export async function fetchLeadsMapa(
  aplicarFiltroSede: AplicarFiltroSede
): Promise<EntidadMapa[]> {
  let query = supabase
    .from('leads')
    .select(
      'id, nombre_completo, primer_nombre, apellido, dni, estado_de_lead, turno, zona, direccion, latitud, longitud'
    )
    .in('estado_de_lead', ESTADOS_LEAD_INCLUIDOS as unknown as string[]) // nunca trae "Descartado"
    .order('nombre_completo', { ascending: true }) as any

  query = aplicarFiltroSede(query, 'sede_id')

  const { data, error } = await query
  if (error) throw error

  const rows = (data || []) as LeadRow[]

  return rows.map((r) => {
    const nombre =
      (r.nombre_completo && r.nombre_completo.trim()) ||
      `${r.primer_nombre || ''} ${r.apellido || ''}`.trim() ||
      'Sin nombre'
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
      estadoLead: r.estado_de_lead || null,
      turnoLead: r.turno || null,
    }
  })
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
 * Para las filas con dirección pero sin coordenadas: geocodifica y persiste.
 * - conductores → direccion_lat / direccion_lng
 * - leads       → latitud / longitud
 * Tolerante a fallos (por fila). Devuelve true si actualizó al menos una fila,
 * para que el caller recargue.
 */
export async function geocodificarFaltantes(filas: FilaSinCoords[]): Promise<boolean> {
  const sinCoords = filas.filter(
    (f) => f.direccion && f.direccion.trim() && (f.lat == null || f.lng == null)
  )
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
      // silently ignored — geocodificación es best-effort
    }
  }

  return actualizado
}
