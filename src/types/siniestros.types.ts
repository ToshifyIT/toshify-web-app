// Tipos para el módulo de Siniestros

export interface SiniestroCategoria {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  es_robo: boolean
  orden: number
  is_active: boolean
  created_at: string
}

export interface SiniestroEstado {
  id: string
  codigo: string
  nombre: string
  color: string
  orden: number
  is_active: boolean
  created_at: string
}

export interface Seguro {
  id: string
  nombre: string
  telefono?: string
  email?: string
  contacto_nombre?: string
  notas?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Siniestro {
  id: string
  pais_id?: string
  vehiculo_id?: string
  conductor_id?: string
  categoria_id: string
  estado_id: string
  seguro_id?: string
  fecha_siniestro: string
  hora_siniestro?: string
  ubicacion?: string
  responsable: 'tercero' | 'conductor' | 'compartida' | 'sin_info'
  hay_lesionados: boolean
  descripcion_danos?: string
  relato?: string
  conductor_nombre?: string
  tercero_nombre?: string
  tercero_dni?: string
  tercero_telefono?: string
  tercero_vehiculo?: string
  tercero_seguro?: string
  tercero_poliza?: string
  carpeta_drive_url?: string
  enviado_abogada: boolean
  enviado_alliance: boolean
  fecha_enviado_abogada?: string
  fecha_enviado_alliance?: string
  nro_siniestro_seguro?: string
  presupuesto_real?: number
  presupuesto_enviado_seguro?: number
  presupuesto_aprobado_seguro?: number
  fecha_pago_estimada?: string
  total_pagado?: number
  porcentaje_abogada?: number
  observaciones?: string
  // Nuevos campos
  habilitado_circular?: boolean
  costos_reparacion?: number
  total_reparacion_pagada?: number
  fecha_cierre?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface SiniestroCompleto extends Siniestro {
  categoria_codigo: string
  categoria_nombre: string
  categoria_es_robo: boolean
  estado_codigo: string
  estado_nombre: string
  estado_color: string
  seguro_nombre?: string
  vehiculo_patente?: string
  vehiculo_marca?: string
  vehiculo_modelo?: string
  conductor_nombre_sistema?: string
  conductor_apellido_sistema?: string
  conductor_display: string
  // Campos calculados
  dias_siniestrado?: number
  // Datos de reparación
  reparacion_id?: string
  reparacion_taller?: string
  reparacion_fecha_inicio?: string
  reparacion_fecha_finalizacion?: string
  reparacion_estado?: 'INICIADO' | 'FINALIZADO'
  reparacion_observaciones?: string
  reparacion_dias?: number
}

export interface SiniestroSeguimiento {
  id: string
  siniestro_id: string
  tipo_evento: 'estado_cambio' | 'nota' | 'documento' | 'pago' | 'cobro_conductor'
  descripcion?: string
  estado_anterior_id?: string
  estado_nuevo_id?: string
  monto?: number
  cobrar_conductor?: boolean
  incidencia_id?: string
  penalidad_id?: string
  created_by?: string
  created_by_name?: string
  created_at: string
}

export interface SiniestroSeguimientoConEstados extends SiniestroSeguimiento {
  estado_anterior_nombre?: string
  estado_nuevo_nombre?: string
  incidencia_numero?: number
}

// Tipo para ticket de reparación
export interface SiniestroReparacion {
  id: string
  siniestro_id: string
  taller?: string
  fecha_inicio?: string
  fecha_finalizacion?: string
  estado: 'INICIADO' | 'FINALIZADO'
  observaciones?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// Tipos para formularios
export interface SiniestroFormData {
  vehiculo_id?: string
  conductor_id?: string
  categoria_id: string
  estado_id: string
  seguro_id?: string
  fecha_siniestro: string
  hora_siniestro?: string
  ubicacion?: string
  responsable: 'tercero' | 'conductor' | 'compartida' | 'sin_info'
  hay_lesionados: boolean
  descripcion_danos?: string
  relato?: string
  conductor_nombre?: string
  tercero_nombre?: string
  tercero_dni?: string
  tercero_telefono?: string
  tercero_vehiculo?: string
  tercero_seguro?: string
  tercero_poliza?: string
  carpeta_drive_url?: string
  enviado_abogada: boolean
  enviado_alliance: boolean
  nro_siniestro_seguro?: string
  presupuesto_real?: number
  presupuesto_enviado_seguro?: number
  presupuesto_aprobado_seguro?: number
  fecha_pago_estimada?: string
  total_pagado?: number
  porcentaje_abogada?: number
  observaciones?: string
  // Nuevos campos
  habilitado_circular?: boolean
  costos_reparacion?: number
  total_reparacion_pagada?: number
  fecha_cierre?: string
}

// Tipos para filtros
export interface SiniestroFiltros {
  estado_id?: string
  categoria_id?: string
  responsable?: string
  fecha_desde?: string
  fecha_hasta?: string
  busqueda?: string
}

// Tipos para estadísticas
export interface SiniestroStats {
  total: number
  por_estado: { estado: string; color: string; cantidad: number }[]
  por_categoria: { categoria: string; cantidad: number }[]
  por_responsable: { responsable: string; cantidad: number }[]
  presupuesto_total: number
  total_cobrado: number
  con_lesionados: number
  total_recuperados: number
  procesando_pago_total: number
}

// Tipo para vehículo simplificado (para selects)
export interface VehiculoSimple {
  id: string
  patente: string
  marca: string
  modelo: string
}

// Tipo para conductor simplificado (para selects)
export interface ConductorSimple {
  id: string
  nombres: string
  apellidos: string
  nombre_completo: string
}
