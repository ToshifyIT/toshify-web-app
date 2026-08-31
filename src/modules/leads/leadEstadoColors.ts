// Paleta de color por estado de lead.
//
// Fuente única de verdad en TS. Espeja los valores de `.lead-estado-dot-*` en
// LeadsModule.css; se duplica aquí porque Google Maps necesita el color como
// valor (fillColor) y no acepta clases CSS.
//
// El lookup es por clave normalizada (sin tildes, minúsculas), de modo que
// "Convocatoria Inducción" y "Convocatoria Induccion" resuelven al mismo color.

export const COLOR_LEAD_FALLBACK = '#8B5CF6' // violeta: estado desconocido / sin estado

const COLORES_POR_ESTADO_NORMALIZADO: Record<string, string> = {
  'inicio conversacion': '#3B82F6',
  'acepta oferta': '#CA8A04',
  'pendiente - hireflix': '#F59E0B',
  'apto - hireflix': '#22C55E',
  'no apto - hireflix': '#DC2626',
  'ayuda - hireflix': '#F97316',
  'documentos enviados': '#2563EB',
  'documentos pendientes': '#D97706',
  'auto del pueblo': '#8B5CF6',
  'no le interesa': '#6B7280',
  'no cumple edad': '#EA580C',
  'convocatoria induccion': '#0891B2',
  'apto induccion': '#059669',
  descartado: '#991B1B',
  conductor: '#7c3aed',
}

function normalizarEstado(estado: string): string {
  return estado
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/** Color del estado de lead. Devuelve el fallback si el estado es nulo o desconocido. */
export function getLeadEstadoColor(estado?: string | null): string {
  if (!estado) return COLOR_LEAD_FALLBACK
  return COLORES_POR_ESTADO_NORMALIZADO[normalizarEstado(estado)] || COLOR_LEAD_FALLBACK
}
