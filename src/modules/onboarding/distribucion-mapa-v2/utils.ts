// src/modules/onboarding/distribucion-mapa-v2/utils.ts
//
// Utilidades puras del submódulo v2. Sin dependencias de React ni de Supabase,
// para poder testearlas de forma aislada.

import type { EntidadMapa, EstadoLicencia, TurnoEfectivo } from './types'

// =====================================================
// Coordenadas
// =====================================================

// Rango geográfico válido (Argentina continental + margen). Descarta
// geocodificaciones basura que romperían el fitBounds del mapa.
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

/** Distancia en línea recta en km (Haversine). Rápido y sin llamadas a la API. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Point-in-polygon por ray casting. Mismo criterio que se usa para las zonas
 * peligrosas en LeadsModule / ProgramacionAssignmentWizard.
 */
export function puntoEnPoligono(
  punto: { lat: number; lng: number },
  poligono: { lat: number; lng: number }[]
): boolean {
  if (!poligono || poligono.length < 3) return false
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const xi = poligono[i].lng
    const yi = poligono[i].lat
    const xj = poligono[j].lng
    const yj = poligono[j].lat
    const intersecta =
      yi > punto.lat !== yj > punto.lat &&
      punto.lng < ((xj - xi) * (punto.lat - yi)) / (yj - yi) + xi
    if (intersecta) dentro = !dentro
  }
  return dentro
}

// =====================================================
// Texto y búsqueda
// =====================================================

/** Minúsculas sin tildes ni diacríticos. */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/** Sólo dígitos (para comparar DNI escritos con puntos o espacios). */
export function soloDigitos(valor: string | null | undefined): string {
  return (valor || '').replace(/\D/g, '')
}

/**
 * Búsqueda por tokens, independiente del orden.
 *
 * Corrige el bug del v1: allí el término se comparaba como substring literal
 * contra "APELLIDO, NOMBRES", por lo que "matias albarado" no encontraba a
 * "ALBARADO, MATIAS ANGEL". Acá cada palabra del término debe aparecer en
 * alguno de los campos indexados, en cualquier orden y sin tildes.
 */
export function coincideBusqueda(entidad: EntidadMapa, termino: string): boolean {
  const tokens = normalizarTexto(termino).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  const heno = normalizarTexto(
    [entidad.nombre, entidad.documento, entidad.zona, entidad.direccion]
      .filter(Boolean)
      .join(' ')
  )
  const dni = soloDigitos(entidad.documento)

  return tokens.every((token) => {
    if (heno.includes(token)) return true
    // Un token puramente numérico también matchea contra el DNI normalizado.
    const digitos = soloDigitos(token)
    return digitos.length > 0 && dni.includes(digitos)
  })
}

// =====================================================
// Identidad de una persona
// =====================================================

/**
 * Clave que identifica a la PERSONA, no a la fila.
 *
 * La misma persona puede existir en más de un registro: un lead que ya se
 * convirtió en conductor sigue en la tabla `leads`, y también hay leads
 * cargados dos veces. Como el v2 trae los 14 estados de lead, esos duplicados
 * entran al mapa y, comparando sólo por (tipo, id), el emparejador los toma
 * como dos personas distintas y llega a proponer a alguien consigo mismo.
 *
 * Por eso la identidad es el DNI normalizado cuando existe, y sólo cae a
 * (tipo, id) cuando no hay documento cargado.
 */
export function clavePersona(e: EntidadMapa): string {
  const dni = soloDigitos(e.documento)
  return dni ? `dni:${dni}` : `${e.tipo}:${e.id}`
}

/** true si las dos entidades son la misma persona (aunque sean filas distintas). */
export function mismaPersona(a: EntidadMapa, b: EntidadMapa): boolean {
  return clavePersona(a) === clavePersona(b)
}

/**
 * Colapsa las entidades que son la misma persona, dejando un solo representante.
 *
 * Prioridad: conductor sobre lead (el registro de conductor es el dato vigente);
 * a igualdad de tipo, gana el primero, que llega ordenado por nombre desde el
 * servicio. Se preserva el orden original de la lista.
 */
export function dedupPorPersona(entidades: EntidadMapa[]): EntidadMapa[] {
  const elegido = new Map<string, EntidadMapa>()
  for (const e of entidades) {
    const clave = clavePersona(e)
    const actual = elegido.get(clave)
    if (!actual) {
      elegido.set(clave, e)
      continue
    }
    // Sólo se reemplaza si el nuevo es conductor y el guardado es lead.
    if (actual.tipo === 'lead' && e.tipo === 'conductor') elegido.set(clave, e)
  }
  const vistos = new Set<EntidadMapa>(elegido.values())
  return entidades.filter((e) => vistos.has(e))
}

// =====================================================
// Datos de ficha
// =====================================================

/** Edad en años a partir de una fecha de nacimiento ISO. null si no hay dato. */
export function calcularEdad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null
  const nacimiento = new Date(fechaNacimiento)
  if (Number.isNaN(nacimiento.getTime())) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad >= 0 && edad < 120 ? edad : null
}

/** Días que faltan para una fecha (negativo si ya pasó). */
export function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null
  const objetivo = new Date(fecha)
  if (Number.isNaN(objetivo.getTime())) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  objetivo.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86400000)
}

/** Umbral de "por vencer" en días. */
export const DIAS_LICENCIA_POR_VENCER = 30

/** Vigencia de la licencia según su fecha de vencimiento. */
export function estadoLicencia(vencimiento: string | null | undefined): EstadoLicencia {
  const dias = diasHasta(vencimiento)
  if (dias === null) return 'sin_dato'
  if (dias < 0) return 'vencida'
  if (dias <= DIAS_LICENCIA_POR_VENCER) return 'por_vencer'
  return 'vigente'
}

export const LABEL_LICENCIA: Record<EstadoLicencia, string> = {
  vigente: 'Licencia vigente',
  por_vencer: 'Licencia por vencer',
  vencida: 'Licencia vencida',
  sin_dato: 'Licencia sin dato',
}

// =====================================================
// Turnos
// =====================================================

/** Normaliza el `horario` de una asignación (diurno/nocturno/todo_dia). */
export function horarioATurno(horario: string | null | undefined): TurnoEfectivo | null {
  const h = normalizarTexto(horario)
  if (h === 'diurno') return 'DIURNO'
  if (h === 'nocturno') return 'NOCTURNO'
  if (h === 'todo_dia') return 'SIN_PREFERENCIA'
  return null
}

/** Normaliza la preferencia_turno del conductor. */
export function preferenciaATurno(pref: string | null | undefined): TurnoEfectivo | null {
  const p = (pref || '').toUpperCase()
  if (p === 'DIURNO') return 'DIURNO'
  if (p === 'NOCTURNO') return 'NOCTURNO'
  if (p === 'A_CARGO' || p === 'SIN_PREFERENCIA') return 'SIN_PREFERENCIA'
  return null
}

/** Normaliza el turno declarado por el lead (tolerante al formato). */
export function turnoLeadATurno(turno: string | null | undefined): TurnoEfectivo | null {
  const t = normalizarTexto(turno)
  if (!t) return null
  if (t.includes('diurn')) return 'DIURNO'
  if (t.includes('noctur')) return 'NOCTURNO'
  if (t.includes('cargo') || t.includes('sin pref') || t.includes('todo')) return 'SIN_PREFERENCIA'
  return null
}

/** Turno con el que la entidad entra al emparejamiento. */
export function turnoDeEntidad(e: EntidadMapa): TurnoEfectivo | null {
  return e.tipo === 'conductor' ? e.turnoEfectivo : turnoLeadATurno(e.turnoLead)
}

/**
 * Dos turnos son complementarios si uno cubre el día y el otro la noche.
 * SIN_PREFERENCIA (o sin dato) es compatible con cualquiera.
 */
export function turnosComplementarios(
  a: TurnoEfectivo | null,
  b: TurnoEfectivo | null
): boolean {
  if (!a || !b || a === 'SIN_PREFERENCIA' || b === 'SIN_PREFERENCIA') return true
  return a !== b
}

// =====================================================
// Formato
// =====================================================

export function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`
}

export function formatMin(minutos: number): string {
  return `${Math.round(minutos)} min`
}

export const LABEL_TURNO: Record<TurnoEfectivo, string> = {
  DIURNO: 'Diurno',
  NOCTURNO: 'Nocturno',
  SIN_PREFERENCIA: 'Sin preferencia',
}
