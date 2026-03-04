/**
 * Utilidades compartidas para conductores.
 * Funciones puras sin dependencias externas.
 */

interface EstadoParam {
  codigo?: string;
  descripcion?: string | null;
}

/** Obtiene el texto de display para un estado de conductor */
export const getEstadoConductorDisplay = (estado: EstadoParam | null | undefined): string => {
  if (!estado) return 'N/A';
  const codigo = estado.codigo?.toLowerCase();
  const displayMap: Record<string, string> = {
    'activo': 'Activo',
    'baja': 'Baja',
    'suspendido': 'Suspendido',
    'vacaciones': 'Vacaciones',
    'licencia': 'Licencia',
    'inactivo': 'Inactivo',
  };
  return displayMap[codigo || ''] || estado.codigo || estado.descripcion || 'N/A';
};

interface BadgeStyle {
  bg: string;
  color: string;
}

/** Obtiene el estilo de badge para un estado de conductor */
export const getEstadoConductorBadgeStyle = (estado: { codigo?: string } | null | undefined): BadgeStyle => {
  if (!estado?.codigo) return { bg: '#3B82F6', color: 'white' };
  const codigo = estado.codigo.toLowerCase();
  const styles: Record<string, BadgeStyle> = {
    'activo': { bg: '#22C55E', color: 'white' },
    'baja': { bg: '#6B7280', color: 'white' },
    'suspendido': { bg: '#F59E0B', color: 'white' },
    'vacaciones': { bg: '#8B5CF6', color: 'white' },
    'licencia': { bg: '#3B82F6', color: 'white' },
    'inactivo': { bg: '#6B7280', color: 'white' },
  };
  return styles[codigo] || { bg: '#3B82F6', color: 'white' };
};

/** Formatea la preferencia de turno de un conductor para display */
export const formatPreferencia = (preferencia?: string): string => {
  switch (preferencia) {
    case 'DIURNO': return 'Diurno';
    case 'NOCTURNO': return 'Nocturno';
    case 'A_CARGO': return 'A Cargo';
    case 'SIN_PREFERENCIA': return 'Ambos';
    default: return 'Ambos';
  }
};

/** Obtiene los colores de badge para una preferencia de turno */
export const getPreferenciaBadge = (preferencia?: string): BadgeStyle => {
  switch (preferencia) {
    case 'DIURNO': return { bg: '#FEF3C7', color: '#92400E' };
    case 'NOCTURNO': return { bg: '#DBEAFE', color: '#1E40AF' };
    case 'A_CARGO': return { bg: '#D1FAE5', color: '#065F46' };
    default: return { bg: '#F3F4F6', color: '#6B7280' };
  }
};

/** Labels de estados de programacion/kanban */
export const PROGRAMACION_ESTADO_LABELS: Record<string, string> = {
  por_agendar: 'Por Agendar',
  agendado: 'Agendado',
  en_curso: 'En Curso',
  completado: 'Completado',
};
