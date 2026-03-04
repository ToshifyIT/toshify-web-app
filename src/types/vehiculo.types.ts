/**
 * Tipos compartidos para vehículos.
 * Superset de todas las variantes usadas en el codebase.
 */

export interface VehiculoEstado {
  codigo: string;
  descripcion: string;
}

export interface AsignacionActiva {
  id: string;
  horario: 'TURNO' | 'CARGO';
  turnoDiurnoOcupado: boolean;
  turnoNocturnoOcupado: boolean;
}

export type VehiculoDisponibilidad =
  | 'disponible'
  | 'turno_diurno_libre'
  | 'turno_nocturno_libre'
  | 'ocupado'
  | 'programado';

/**
 * Interfaz completa de Vehículo.
 * Los campos opcionales cubren todos los contextos (wizard, mapa, modal, etc.)
 */
export interface Vehicle {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color?: string;
  estado_id: string;
  vehiculos_estados?: VehiculoEstado;
  asignacionActiva?: AsignacionActiva;
  disponibilidad: VehiculoDisponibilidad;
}

/** Versión mínima para componentes de solo visualización */
export type VehicleBasic = Pick<Vehicle, 'patente' | 'marca' | 'modelo'>;

/** Labels de estados de vehículo para display */
export const VEHICULO_ESTADO_LABELS: Record<string, string> = {
  'DISPONIBLE': 'Disponible',
  'EN_USO': 'En Uso',
  'CORPORATIVO': 'Corporativo',
  'PKG_ON_BASE': 'PKG ON',
  'PKG_OFF_BASE': 'PKG OFF',
  'PKG_OFF_FRANCIA': 'PKG Francia',
  'TALLER_AXIS': 'Taller Axis',
  'TALLER_CHAPA_PINTURA': 'Chapa&Pintura',
  'TALLER_ALLIANCE': 'Taller Alliance',
  'TALLER_KALZALO': 'Taller Kalzalo',
  'TALLER_BASE_VALIENTE': 'Base Valiente',
  'INSTALACION_GNC': 'Inst. GNC',
  'RETENIDO_COMISARIA': 'Retenido',
  'ROBO': 'Robo',
  'DESTRUCCION_TOTAL': 'Destruccion',
  'JUBILADO': 'Jubilado',
  'PROGRAMADO': 'Programado',
  'DEVUELTO_PROVEEDOR': 'Dev. Proveedor',
};
