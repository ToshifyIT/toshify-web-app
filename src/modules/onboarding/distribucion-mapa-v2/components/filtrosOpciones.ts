// src/modules/onboarding/distribucion-mapa-v2/components/filtrosOpciones.ts
//
// Catálogo de opciones y forma del estado de filtros del v2.
// Separado del componente para no romper el fast refresh.

import { LABEL_TURNO } from '../utils'
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
