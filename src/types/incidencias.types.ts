// Tipos para el módulo de Incidencias

export interface IncidenciaEstado {
  id: string
  codigo: string
  nombre: string
  color: string
  orden: number
  is_active: boolean
  created_at: string
}

export interface TipoPenalidad {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  orden: number
  is_active: boolean
  created_at: string
}

export interface Incidencia {
  id: string
  vehiculo_id?: string
  conductor_id?: string
  estado_id: string
  semana?: number
  fecha: string
  turno?: string
  area?: string
  estado_vehiculo?: string
  descripcion?: string
  accion_ejecutada?: string
  registrado_por?: string
  conductor_nombre?: string
  vehiculo_patente?: string
  auto_a_cargo?: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface IncidenciaCompleta extends Incidencia {
  estado_codigo: string
  estado_nombre: string
  estado_color: string
  vehiculo_patente_sistema?: string
  vehiculo_marca?: string
  vehiculo_modelo?: string
  conductor_nombres?: string
  conductor_apellidos?: string
  conductor_display: string
  patente_display: string
  total_penalidades: number
  monto_penalidades: number
}

export interface Penalidad {
  id: string
  incidencia_id?: string
  vehiculo_id?: string
  conductor_id?: string
  tipo_penalidad_id?: string
  semana?: number
  fecha: string
  turno?: string
  area_responsable?: string
  detalle?: string
  monto?: number
  observaciones?: string
  aplicado: boolean
  fecha_aplicacion?: string
  nota_administrativa?: string
  conductor_nombre?: string
  vehiculo_patente?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface PenalidadCompleta extends Penalidad {
  tipo_codigo?: string
  tipo_nombre?: string
  vehiculo_patente_sistema?: string
  vehiculo_marca?: string
  vehiculo_modelo?: string
  conductor_nombres?: string
  conductor_apellidos?: string
  conductor_display: string
  patente_display: string
  incidencia_descripcion?: string
  incidencia_estado?: string
}

// Tipos para formularios
export interface IncidenciaFormData {
  vehiculo_id?: string
  conductor_id?: string
  estado_id: string
  semana?: number
  fecha: string
  turno?: string
  area?: string
  estado_vehiculo?: string
  descripcion?: string
  accion_ejecutada?: string
  registrado_por?: string
  conductor_nombre?: string
  vehiculo_patente?: string
  auto_a_cargo?: boolean
}

export interface PenalidadFormData {
  incidencia_id?: string
  vehiculo_id?: string
  conductor_id?: string
  tipo_penalidad_id?: string
  semana?: number
  fecha: string
  turno?: string
  area_responsable?: string
  detalle?: string
  monto?: number
  observaciones?: string
  aplicado: boolean
  nota_administrativa?: string
  conductor_nombre?: string
  vehiculo_patente?: string
}

// Tipos para filtros
export interface IncidenciaFiltros {
  estado_id?: string
  area?: string
  turno?: string
  semana?: number
  busqueda?: string
}

export interface PenalidadFiltros {
  tipo_penalidad_id?: string
  area_responsable?: string
  aplicado?: boolean
  busqueda?: string
}

// Tipos para estadísticas
export interface IncidenciaStats {
  total: number
  por_estado: { estado: string; color: string; cantidad: number }[]
  por_area: { area: string; cantidad: number }[]
  por_turno: { turno: string; cantidad: number }[]
  pendientes: number
  resueltas: number
}

export interface PenalidadStats {
  total: number
  total_monto: number
  aplicadas: number
  pendientes: number
  por_tipo: { tipo: string; cantidad: number; monto: number }[]
}

// Tipo para vehículo simplificado
export interface VehiculoSimple {
  id: string
  patente: string
  marca: string
  modelo: string
}

// Tipo para conductor simplificado
export interface ConductorSimple {
  id: string
  nombres: string
  apellidos: string
  nombre_completo: string
}
