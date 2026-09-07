// src/modules/onboarding/distribucion-mapa-v2/components/colores.ts
//
// Paleta del mapa. Vive fuera de los componentes para no romper el fast refresh
// (un archivo con componentes sólo debe exportar componentes).
//
// Dos dimensiones independientes:
//   - forma / pictograma -> tipo de entidad (conductor o lead)
//   - color              -> turno del conductor, o estado del lead

import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import type { EntidadMapa } from '../types'

export const COLOR_TURNO_DIURNO = '#F59E0B'
export const COLOR_TURNO_NOCTURNO = '#3B82F6'
export const COLOR_TURNO_SINPREF = '#10B981'

/** Color del marcador: turno para conductores, estado para leads. */
export function colorEntidad(e: EntidadMapa): string {
  if (e.tipo === 'lead') return getLeadEstadoColor(e.estadoLead)
  switch (e.turnoEfectivo) {
    case 'DIURNO':
      return COLOR_TURNO_DIURNO
    case 'NOCTURNO':
      return COLOR_TURNO_NOCTURNO
    default:
      return COLOR_TURNO_SINPREF
  }
}
