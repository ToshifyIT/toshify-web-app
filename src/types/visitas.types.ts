// ============================================================
// Tipos del módulo de Visitas / Agendamiento
// ============================================================

// --- Catálogos ---

export type TipoVisita = 'exclusivo' | 'grupal';

export interface VisitaCategoria {
  id: string;
  nombre: string;
  color: string;
  duracion_default: number;
  requiere_patente: boolean;
  tipo_visita: TipoVisita;
  duracion_modificable: boolean;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface VisitaMotivo {
  id: string;
  categoria_id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
}

export interface VisitaAtendedor {
  id: string;
  nombre: string;
  user_id: string | null;
  sede_id: string;
  activo: boolean;
  created_at: string;
}

export interface VisitaMotivoConCategoria extends VisitaMotivo {
  categoria_nombre: string;
}

export interface VisitaHorario {
  id: string;
  atendedor_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

// --- Entidad principal ---

export type VisitaEstado = 'pendiente' | 'en_curso' | 'completada' | 'no_asistio' | 'cancelada';

export const VISITA_ESTADOS: Record<VisitaEstado, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#3b82f6' },
  en_curso: { label: 'En curso', color: '#f59e0b' },
  completada: { label: 'Completada', color: '#10b981' },
  no_asistio: { label: 'No asistió', color: '#ef4444' },
  cancelada: { label: 'Cancelada', color: '#6b7280' },
};

export interface Visita {
  id: string;
  categoria_id: string;
  motivo_id: string | null;
  atendedor_id: string;
  sede_id: string;
  nombre_visitante: string;
  dni_visitante: string | null;
  patente: string | null;
  fecha_hora: string;
  duracion_minutos: number;
  nota: string | null;
  estado: VisitaEstado;
  citador_id: string;
  citador_nombre: string;
  created_at: string;
  updated_at: string;
}

// Visita con relaciones resueltas (para display)
export interface VisitaCompleta extends Visita {
  categoria_nombre: string;
  categoria_color: string;
  motivo_nombre: string | null;
  atendedor_nombre: string;
}

// --- Formulario ---

export interface VisitaFormData {
  categoria_id: string;
  motivo_id: string;
  atendedor_id: string;
  nombre_visitante: string;
  dni_visitante: string;
  patente: string;
  fecha: string;
  hora: string;
  duracion_minutos: number;
  nota: string;
}

export const VISITA_FORM_INITIAL: VisitaFormData = {
  categoria_id: '',
  motivo_id: '',
  atendedor_id: '',
  nombre_visitante: '',
  dni_visitante: '',
  patente: '',
  fecha: '',
  hora: '',
  duracion_minutos: 30,
  nota: '',
};

// --- Calendario ---

export interface VisitaCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  visita: VisitaCompleta;
}

export interface CalendarResource {
  id: string;
  title: string;
}
