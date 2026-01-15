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

// Tipo unificado para cobros/descuentos (usado en incidencias tipo=cobro y penalidades)
export interface TipoCobroDescuento {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  categoria?: string // P004, P006, P007
  es_a_favor: boolean // true = conductor recibe, false = conductor paga
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
  tipo?: TipoIncidencia
  siniestro_id?: string
  tipo_cobro_descuento_id?: string // Nueva FK a tipos_cobro_descuento
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
  // Campos del tipo de cobro/descuento
  tipo_cobro_codigo?: string
  tipo_cobro_nombre?: string
  tipo_cobro_categoria?: string
  tipo_cobro_es_a_favor?: boolean
}

export interface Penalidad {
  id: string
  incidencia_id?: string
  vehiculo_id?: string
  conductor_id?: string
  tipo_penalidad_id?: string // Legacy, preferir tipo_cobro_descuento_id
  tipo_cobro_descuento_id?: string // Nueva FK unificada
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
  // Campos de fraccionamiento
  fraccionado?: boolean
  cantidad_cuotas?: number
  semana_aplicacion?: number  // Semana en que se aplica (si no es fraccionado)
  anio_aplicacion?: number    // Año en que se aplica
}

// Cuota de penalidad fraccionada
export interface PenalidadCuota {
  id: string
  penalidad_id: string
  numero_cuota: number
  monto_cuota: number
  semana: number
  anio: number
  aplicado: boolean
  fecha_aplicacion?: string
  created_at: string
}

export interface PenalidadCompleta extends Penalidad {
  tipo_codigo?: string
  tipo_nombre?: string
  tipo_categoria?: string
  tipo_es_a_favor?: boolean
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
  monto?: number  // Monto para incidencias de cobro
  tipo?: TipoIncidencia  // Tipo de incidencia (logistica o cobro)
  tipo_incidencia?: string  // Legacy: Tipo específico (ej: "Exceso de kilometraje", "Falta de lavado")
  tipo_cobro_descuento_id?: string // Nueva FK unificada
}

export interface PenalidadFormData {
  incidencia_id?: string
  vehiculo_id?: string
  conductor_id?: string
  tipo_penalidad_id?: string // Legacy
  tipo_cobro_descuento_id?: string // Nueva FK unificada
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

// ============================================
// TIPOS PARA COBROS E INCIDENCIAS DE COBRO
// ============================================

export type TipoIncidencia = 'logistica' | 'cobro'

export interface CobroIncidencia {
  id: string
  incidencia_id: string
  conductor_id: string
  monto_total: number
  descripcion?: string
  estado: 'por_aplicar' | 'fraccionado' | 'aplicado_completo'
  fraccionado: boolean
  cantidad_cuotas?: number
  creado_por: string
  creado_at: string
  updated_at: string
}

export interface CobroIncidenciaConRelaciones extends CobroIncidencia {
  incidencia?: Incidencia
  conductor?: ConductorSimple
  cuotas?: CobroCuotaFraccionada[]
}

export interface CobroCuotaFraccionada {
  id: string
  cobro_id: string
  numero_cuota: number
  monto_cuota: number
  periodo_id: string
  semana: number
  anio: number
  aplicado: boolean
  fecha_aplicacion?: string
  created_at: string
}

export interface CobroCuotaFraccionadaConPeriodo extends CobroCuotaFraccionada {
  periodo?: {
    id: string
    semana: number
    anio: number
    fecha_inicio: string
    fecha_fin: string
    estado: string
  }
}

// Para formularios
export interface CrearCobroFormData {
  incidencia_id: string
  fraccionado: boolean
  cantidad_cuotas?: number
}

// Estadísticas
export interface ControlCobrosStats {
  total_cobros: number
  total_monto: number
  cobros_fraccionados: number
  cobros_aplicados_completo: number
  proximas_cuotas: number
  monto_proximo: number
}
