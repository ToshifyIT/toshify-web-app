// Tipos para el módulo de Nóminas

// =====================================================
// TIPOS PARA REPORTE DE NÓMINAS
// =====================================================

// Período de la nómina
export interface PeriodoNomina {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
}

// Detalle diario de asignación
export interface DetalleDiario {
  fecha: string
  dia_semana: string
  tipo_horario: 'TURNO' | 'CARGO' | null
  precio_dia: number
  asignacion_id: string | null
  vehiculo_patente: string | null
}

// Detalle de penalidad en la nómina
export interface PenalidadNomina {
  id: string
  fecha: string
  tipo: string
  tipo_nombre: string
  monto: number
  detalle: string | null
  aplicado: boolean
}

// Detalle de siniestro en la nómina
export interface SiniestroNomina {
  id: string
  fecha: string
  categoria: string
  presupuesto: number
  responsable: string
  vehiculo_patente: string | null
}

// Datos de Cabify para la nómina
export interface CabifyNomina {
  peajes_total: number
  efectivo_total: number
  ganancia_total: number
  viajes_finalizados: number
  registros: number
}

// Resumen de la nómina del conductor
export interface NominaConductor {
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_email: string | null

  // Período
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string

  // Asignación actual
  asignacion_codigo: string | null
  vehiculo_patente: string | null
  tipo_horario_predominante: 'TURNO' | 'CARGO' | 'MIXTO'

  // Cargos
  alquiler_total: number
  alquiler_detalle: DetalleDiario[]
  penalidades_total: number
  penalidades: PenalidadNomina[]
  siniestros_total: number
  siniestros: SiniestroNomina[]
  otros_cargos: number

  // Créditos (A favor del conductor)
  efectivo_cabify: number
  peajes_cabify: number
  bonos_total: number
  otros_creditos: number

  // Totales
  total_cargos: number
  total_creditos: number
  saldo: number // Positivo = debe pagar, Negativo = a favor

  // Metadatos
  dias_trabajados: number
  dias_turno: number
  dias_cargo: number
}

// Lista resumida para la tabla principal
export interface NominaResumen {
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  vehiculo_patente: string | null
  tipo_horario: string
  total_cargos: number
  total_creditos: number
  saldo: number
  dias_trabajados: number
  tiene_penalidades: boolean
  tiene_siniestros: boolean
}

// Estadísticas del reporte
export interface ReporteNominasStats {
  total_conductores: number
  total_cargos: number
  total_creditos: number
  saldo_total: number
  conductores_a_favor: number
  conductores_deben: number
}

// Configuración del reporte
export interface ConfiguracionNominas {
  limite_km_semanal: number // Default: 60
  precio_exceso_km: number
}

// =====================================================
// TIPOS PARA CRUD DE CONCEPTOS
// =====================================================

// Concepto de nómina (tabla conceptos_nomina)
export interface ConceptoNomina {
  id: string
  codigo: string
  descripcion: string
  precio_base: number
  iva_porcentaje: number
  precio_final: number
  tipo: 'alquiler' | 'cargo' | 'descuento' | 'penalidad' | 'ingreso'
  es_variable: boolean
  aplica_turno: boolean
  aplica_cargo: boolean
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

// Form data para crear/editar concepto
export interface ConceptoNominaFormData {
  codigo: string
  descripcion: string
  precio_base: number
  iva_porcentaje: number
  precio_final: number
  tipo: string
  es_variable: boolean
  aplica_turno: boolean
  aplica_cargo: boolean
  activo: boolean
  orden: number
}

// Stats del módulo
export interface ConceptosNominaStats {
  total: number
  activos: number
  inactivos: number
  porTipo: {
    alquiler: number
    cargo: number
    descuento: number
    penalidad: number
    ingreso: number
  }
}

// Tipos de concepto para el select
export const TIPOS_CONCEPTO = [
  { value: 'alquiler', label: 'Alquiler', color: '#3B82F6' },
  { value: 'cargo', label: 'Cargo', color: '#DC2626' },
  { value: 'descuento', label: 'Descuento', color: '#059669' },
  { value: 'penalidad', label: 'Penalidad', color: '#D97706' },
  { value: 'ingreso', label: 'Ingreso', color: '#8B5CF6' }
] as const

// Helper para obtener color del tipo
export function getTipoColor(tipo: string): string {
  const found = TIPOS_CONCEPTO.find(t => t.value === tipo)
  return found?.color || '#6B7280'
}

// Helper para obtener label del tipo
export function getTipoLabel(tipo: string): string {
  const found = TIPOS_CONCEPTO.find(t => t.value === tipo)
  return found?.label || tipo
}
