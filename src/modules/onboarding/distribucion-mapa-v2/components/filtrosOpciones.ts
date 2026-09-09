// src/modules/onboarding/distribucion-mapa-v2/components/filtrosOpciones.ts
//
// Catálogo de opciones y forma del estado de filtros del v2.
// Separado del componente para no romper el fast refresh.

import { LABEL_TURNO } from '../utils'
import { ESTADOS_LEAD_DEFAULT } from '../distribucionMapaV2Service'
import type { TurnoEfectivo } from '../types'

export type SegmentoV2 = 'conductores' | 'leads' | 'ambos'

/** Requisitos duros que puede exigir el operador. Aplican a ambos segmentos. */
export const REQUISITOS = [
  { value: 'licencia_vigente', label: 'Licencia vigente' },
  { value: 'sin_antecedentes', label: 'Sin antecedentes penales' },
  { value: 'fuera_zona_peligrosa', label: 'Fuera de zona peligrosa' },
] as const

export const TURNOS: Array<{ value: TurnoEfectivo; label: string }> = [
  { value: 'DIURNO', label: LABEL_TURNO.DIURNO },
  { value: 'NOCTURNO', label: LABEL_TURNO.NOCTURNO },
  { value: 'SIN_PREFERENCIA', label: LABEL_TURNO.SIN_PREFERENCIA },
]

export const ASIGNACION_OPCIONES = [
  { value: 'con', label: 'Con asignación' },
  { value: 'sin', label: 'Sin asignación' },
]

export const COMPANERO_OPCIONES = [
  { value: 'sin', label: 'Sin compañero' },
  { value: 'con', label: 'Con compañero' },
]

export const ZONAS = ['CABA', 'Norte', 'Sur', 'Oeste', 'GBA']

/**
 * Estado completo de filtros del v2.
 *
 * Los filtros están segmentados a propósito: `turnosConductor` / `asignacion` /
 * `companero` sólo aplican a conductores y `estadosLead` / `turnosLead` sólo a
 * leads. `zonas` es el único filtro global.
 */
export interface FiltrosV2 {
  segmento: SegmentoV2
  busqueda: string
  // Conductores
  verBaja: boolean
  turnosConductor: Set<string>
  asignacion: Set<string>
  companero: Set<string>
  requisitosConductor: Set<string>
  // Leads
  estadosLead: Set<string>
  turnosLead: Set<string>
  requisitosLead: Set<string>
  // Global
  zonas: Set<string>
}

/** Estado inicial de los filtros: es también a lo que vuelve "Limpiar filtros". */
export function filtrosIniciales(): FiltrosV2 {
  return {
    segmento: 'conductores',
    busqueda: '',
    verBaja: false,
    turnosConductor: new Set(),
    asignacion: new Set(),
    companero: new Set(),
    requisitosConductor: new Set(),
    // Los 14 estados están disponibles; arrancan marcados los dos de inducción.
    estadosLead: new Set<string>(ESTADOS_LEAD_DEFAULT as unknown as string[]),
    turnosLead: new Set(),
    requisitosLead: new Set(),
    // A diferencia del v1 (que arrancaba fijado en CABA), acá zona arranca vacío
    // = todas, porque el default de leads ya acota el volumen.
    zonas: new Set(),
  }
}

function mismoSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/**
 * Cuántos filtros están apartados de su valor inicial. Sirve para mostrar el
 * botón "Limpiar filtros" sólo cuando hay algo que limpiar, y con el número.
 *
 * El segmento (Conductores / Leads / Ambos) NO cuenta: es la vista elegida, no
 * un recorte sobre ella, y limpiar filtros no tiene por qué sacarte de la
 * pestaña en la que estás.
 */
export function contarFiltrosActivos(f: FiltrosV2): number {
  const base = filtrosIniciales()
  let n = 0
  if (f.busqueda.trim() !== '') n++
  if (f.verBaja !== base.verBaja) n++
  if (f.turnosConductor.size > 0) n++
  if (f.asignacion.size > 0) n++
  if (f.companero.size > 0) n++
  if (f.requisitosConductor.size > 0) n++
  if (!mismoSet(f.estadosLead, base.estadosLead)) n++
  if (f.turnosLead.size > 0) n++
  if (f.requisitosLead.size > 0) n++
  if (f.zonas.size > 0) n++
  return n
}
