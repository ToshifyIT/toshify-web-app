// src/modules/onboarding/distribucion-mapa-v2/components/colores.ts
//
// Paleta del mapa. Vive fuera de los componentes para no romper el fast refresh
// (un archivo con componentes sólo debe exportar componentes).
//
// Dos dimensiones independientes:
//   - pictograma -> tipo de entidad (conductor = auto, lead = persona)
//   - color      -> turno del conductor, o estado del lead
//
// Cada color se usa en dos tonos, igual que los badges del resto del sistema:
// el "acento" (pictograma y borde) y un fondo pastel derivado de él. Así los
// marcadores no son chillones y el pictograma se sigue leyendo.

import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import { turnoConductor } from '../utils'
import type { EntidadMapa } from '../types'

/** Acentos de turno. Los fondos pastel son los de los badges D / N del sistema. */
export const COLOR_TURNO_DIURNO = '#B45309'
export const COLOR_TURNO_NOCTURNO = '#1D4ED8'
/** A cargo. */
export const COLOR_TURNO_SINPREF = '#6D28D9'
/** Sin preferencia de turno o sin dato. */
export const COLOR_TURNO_SIN_DATO = '#6B7280'

const FONDO_PASTEL: Record<string, string> = {
  [COLOR_TURNO_DIURNO.toLowerCase()]: '#FEF3C7',
  [COLOR_TURNO_NOCTURNO.toLowerCase()]: '#DBEAFE',
  [COLOR_TURNO_SINPREF.toLowerCase()]: '#EDE9FE',
}

/** Mezcla un color #rrggbb con blanco. `peso` = proporción de blanco (0..1). */
function aclarar(hex: string, peso: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#F3F4F6'
  const n = parseInt(m[1], 16)
  const canal = (c: number) => Math.round(c + (255 - c) * peso).toString(16).padStart(2, '0')
  return `#${canal((n >> 16) & 255)}${canal((n >> 8) & 255)}${canal(n & 255)}`
}

/** Fondo pastel para un color de acento (turno conocido o estado de lead). */
export function fondoPastel(color: string): string {
  return FONDO_PASTEL[color.toLowerCase()] || aclarar(color, 0.8)
}

/** Color de acento: turno para conductores, estado para leads. */
export function colorEntidad(e: EntidadMapa): string {
  if (e.tipo === 'lead') return getLeadEstadoColor(e.estadoLead)
  switch (turnoConductor(e)) {
    case 'DIURNO':
      return COLOR_TURNO_DIURNO
    case 'NOCTURNO':
      return COLOR_TURNO_NOCTURNO
    case 'A_CARGO':
      return COLOR_TURNO_SINPREF
    default:
      return COLOR_TURNO_SIN_DATO
  }
}
