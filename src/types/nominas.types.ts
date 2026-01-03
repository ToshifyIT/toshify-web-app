// Tipos para el módulo de Nóminas

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
