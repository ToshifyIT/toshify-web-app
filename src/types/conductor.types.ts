/**
 * Tipos compartidos para conductores.
 * Superset de todas las variantes usadas en el codebase.
 */

export interface ConductorEstado {
  codigo: string;
  descripcion: string;
}

/**
 * Interfaz completa de Conductor.
 * Los campos opcionales cubren todos los contextos (wizard, mapa, modal, etc.)
 */
export interface Conductor {
  id: string;
  numero_licencia: string;
  numero_dni: string;
  nombres: string;
  apellidos: string;
  licencia_vencimiento: string;
  estado_id: string;
  preferencia_turno?: string;
  // Campos de geolocalización (usados en mapas y emparejamiento)
  zona?: string | null;
  direccion?: string | null;
  direccion_lat?: number | null;
  direccion_lng?: number | null;
  conductores_estados?: ConductorEstado;
  // Campos de estado de asignación (calculados en runtime)
  tieneAsignacionActiva?: boolean;
  tieneAsignacionProgramada?: boolean;
  tieneAsignacionDiurna?: boolean;
  tieneAsignacionNocturna?: boolean;
  // Distancia calculada para emparejamiento (en minutos)
  distanciaCalculada?: number | null;
}

/** Version minima para componentes simples */
export type ConductorBasic = Pick<Conductor, 'id' | 'nombres' | 'apellidos' | 'numero_dni'>;
