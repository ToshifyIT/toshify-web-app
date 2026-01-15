// Tipos para el módulo de Onboarding (Kanban de Programaciones)

// Estados del Kanban
export type EstadoKanban = 'por_agendar' | 'agendado' | 'en_curso' | 'completado' | 'cancelado'

// Tipos de asignación
export type TipoAsignacion =
  | 'entrega_auto'
  | 'asignacion_companero'
  | 'cambio_auto'
  | 'asignacion_auto_cargo'
  | 'entrega_auto_cargo'
  | 'cambio_turno'
  | 'devolucion_vehiculo'

// Tipos de candidato
export type TipoCandidato = 'nuevo' | 'antiguo' | 'reingreso'

// Turnos
export type TurnoOnboarding = 'diurno' | 'nocturno'

// Modalidad
export type ModalidadOnboarding = 'TURNO' | 'CARGO'

// Zonas
export type ZonaOnboarding = 'norte' | 'sur' | 'caba' | 'oeste'

// Confirmación asistencia
export type ConfirmacionAsistencia = 'confirmo' | 'no_confirmo' | 'reprogramar' | 'sin_confirmar'

// Estado Cabify
export type EstadoCabify = 'pendiente' | 'listo_cabify' | 'asignar_auto' | 'crear_cuenta'

// Tipo documento
export type TipoDocumento = 'contrato' | 'anexo' | 'na'

// Interfaz principal de Programación Onboarding
export interface ProgramacionOnboarding {
  id: string
  estado: EstadoKanban
  
  // Conductor (legacy - single conductor)
  conductor_id?: string
  conductor_nombre?: string
  conductor_dni?: string
  tipo_candidato?: TipoCandidato
  turno?: TurnoOnboarding
  
  // Conductor Diurno (nuevo - dual conductor)
  conductor_diurno_id?: string
  conductor_diurno_nombre?: string
  conductor_diurno_dni?: string
  tipo_candidato_diurno?: TipoCandidato
  tipo_asignacion_diurno?: TipoAsignacion
  documento_diurno?: TipoDocumento
  zona_diurno?: string
  distancia_diurno?: number

  // Conductor Nocturno (nuevo - dual conductor)
  conductor_nocturno_id?: string
  conductor_nocturno_nombre?: string
  conductor_nocturno_dni?: string
  tipo_candidato_nocturno?: TipoCandidato
  tipo_asignacion_nocturno?: TipoAsignacion
  documento_nocturno?: TipoDocumento
  zona_nocturno?: string
  distancia_nocturno?: number
  
  // Vehículo a entregar
  vehiculo_entregar_id?: string
  vehiculo_entregar_patente?: string
  vehiculo_entregar_modelo?: string
  vehiculo_entregar_color?: string
  
  // Vehículo a cambio
  vehiculo_cambio_id?: string
  vehiculo_cambio_patente?: string
  vehiculo_cambio_modelo?: string
  
  // Tipo de asignación
  tipo_asignacion?: TipoAsignacion
  modalidad?: ModalidadOnboarding
  
  // Cita
  fecha_cita?: string
  hora_cita?: string
  zona?: ZonaOnboarding
  distancia_minutos?: number
  direccion?: string
  
  // Documentación
  tipo_documento?: TipoDocumento
  documento_listo: boolean
  
  // Checklist
  grupo_whatsapp: boolean
  citado_ypf: boolean
  confirmacion_asistencia?: ConfirmacionAsistencia
  estado_cabify?: EstadoCabify
  
  // Especialista
  especialista_id?: string
  especialista_nombre?: string
  
  // Observaciones
  observaciones?: string
  
  // Relación con asignación
  asignacion_id?: string
  fecha_asignacion_creada?: string
  
  // Auditoría
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at: string
  pais_id?: string
}

// Vista completa con joins
export interface ProgramacionOnboardingCompleta extends ProgramacionOnboarding {
  // Datos del conductor desde BD
  conductor_nombres?: string
  conductor_apellidos?: string
  conductor_dni_sistema?: string
  conductor_display: string
  
  // Datos del vehículo a entregar desde BD
  vehiculo_entregar_patente_sistema?: string
  vehiculo_entregar_marca?: string
  vehiculo_entregar_modelo_sistema?: string
  
  // Datos del vehículo a cambio desde BD
  vehiculo_cambio_patente_sistema?: string
  vehiculo_cambio_marca?: string
  vehiculo_cambio_modelo_sistema?: string
  
  // Especialista desde BD
  especialista_nombre_sistema?: string
  
  // Asignación
  asignacion_codigo?: string
  asignacion_estado?: string
}

// Formulario para crear/editar programación
export interface ProgramacionOnboardingFormData {
  // Conductor (legacy - single conductor)
  conductor_id?: string
  conductor_nombre?: string
  conductor_dni?: string
  tipo_candidato?: TipoCandidato
  turno?: TurnoOnboarding
  
  // Conductor Diurno (nuevo - dual conductor)
  conductor_diurno_id?: string
  conductor_diurno_nombre?: string
  conductor_diurno_dni?: string
  tipo_candidato_diurno?: TipoCandidato
  tipo_asignacion_diurno?: TipoAsignacion
  documento_diurno?: TipoDocumento
  zona_diurno?: string
  distancia_diurno?: number

  // Conductor Nocturno (nuevo - dual conductor)
  conductor_nocturno_id?: string
  conductor_nocturno_nombre?: string
  conductor_nocturno_dni?: string
  tipo_candidato_nocturno?: TipoCandidato
  tipo_asignacion_nocturno?: TipoAsignacion
  documento_nocturno?: TipoDocumento
  zona_nocturno?: string
  distancia_nocturno?: number
  
  // Vehículo a entregar
  vehiculo_entregar_id?: string
  vehiculo_entregar_patente?: string
  vehiculo_entregar_modelo?: string
  vehiculo_entregar_color?: string
  
  // Vehículo a cambio
  vehiculo_cambio_id?: string
  vehiculo_cambio_patente?: string
  vehiculo_cambio_modelo?: string
  
  // Tipo de asignación
  tipo_asignacion?: TipoAsignacion
  modalidad?: ModalidadOnboarding
  
  // Cita
  fecha_cita?: string
  hora_cita?: string
  zona?: ZonaOnboarding
  distancia_minutos?: number
  direccion?: string
  
  // Documentación
  tipo_documento?: TipoDocumento
  documento_listo: boolean
  
  // Checklist
  grupo_whatsapp: boolean
  citado_ypf: boolean
  confirmacion_asistencia?: ConfirmacionAsistencia
  estado_cabify?: EstadoCabify
  
  // Especialista
  especialista_id?: string
  especialista_nombre?: string
  
  // Observaciones
  observaciones?: string
}

// Configuración de columnas del Kanban
export interface KanbanColumn {
  id: EstadoKanban
  titulo: string
  color: string
  icono?: string
}

// Columnas del Kanban
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'por_agendar', titulo: 'Por Agendar', color: '#6B7280' },
  { id: 'agendado', titulo: 'Agendado', color: '#3B82F6' },
  { id: 'en_curso', titulo: 'En Curso', color: '#F59E0B' },
  { id: 'completado', titulo: 'Completado', color: '#10B981' }
]

// Labels para mostrar en UI
export const TIPO_ASIGNACION_LABELS: Record<TipoAsignacion, string> = {
  entrega_auto: 'Entrega de auto',
  asignacion_companero: 'Asignación de compañero',
  cambio_auto: 'Cambio de auto',
  asignacion_auto_cargo: 'Asignación auto a cargo',
  entrega_auto_cargo: 'Entrega auto a cargo',
  cambio_turno: 'Cambio de turno',
  devolucion_vehiculo: 'Devolución de Vehículo'
}

export const TIPO_CANDIDATO_LABELS: Record<TipoCandidato, string> = {
  nuevo: 'Nuevo',
  antiguo: 'Antiguo',
  reingreso: 'Reingreso'
}

export const ZONA_LABELS: Record<ZonaOnboarding, string> = {
  norte: 'Norte',
  sur: 'Sur',
  caba: 'CABA',
  oeste: 'Oeste'
}

export const CONFIRMACION_LABELS: Record<ConfirmacionAsistencia, string> = {
  confirmo: 'Confirmó',
  no_confirmo: 'No confirmó',
  reprogramar: 'Reprogramar',
  sin_confirmar: 'Sin confirmar'
}

export const ESTADO_CABIFY_LABELS: Record<EstadoCabify, string> = {
  pendiente: 'Pendiente',
  listo_cabify: 'Listo Cabify',
  asignar_auto: 'Asignar auto',
  crear_cuenta: 'Crear cuenta'
}

export const DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  contrato: 'Contrato',
  anexo: 'Anexo',
  na: 'N/A'
}
