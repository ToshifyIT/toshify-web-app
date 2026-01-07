// =====================================================
// TIPOS PARA EL MÓDULO DE FACTURACIÓN
// =====================================================

// =====================================================
// PERÍODO DE FACTURACIÓN
// =====================================================
export interface PeriodoFacturacion {
  id: string
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  estado: 'abierto' | 'cerrado' | 'procesando'
  fecha_cierre: string | null
  total_conductores: number
  total_cargos: number
  total_descuentos: number
  total_neto: number
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
  cerrado_por: string | null
  cerrado_por_name: string | null
}

export interface PeriodoFacturacionFormData {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
}

// =====================================================
// FACTURACIÓN POR CONDUCTOR
// =====================================================
export interface FacturacionConductor {
  id: string
  periodo_id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  conductor_cuit: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  tipo_alquiler: 'CARGO' | 'TURNO'
  turnos_base: number
  turnos_cobrados: number
  factor_proporcional: number
  subtotal_alquiler: number
  subtotal_garantia: number
  subtotal_cargos: number
  subtotal_descuentos: number
  subtotal_neto: number
  saldo_anterior: number
  dias_mora: number
  monto_mora: number
  total_a_pagar: number
  estado: 'borrador' | 'calculado' | 'cerrado' | 'pagado'
  created_at: string
  updated_at: string
}

export interface FacturacionResumen {
  id: string
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_patente: string | null
  tipo_alquiler: 'CARGO' | 'TURNO'
  turnos_cobrados: number
  total_cargos: number
  total_descuentos: number
  total_a_pagar: number
  tiene_mora: boolean
  tiene_garantia_pendiente: boolean
}

// =====================================================
// DETALLE DE FACTURACIÓN
// =====================================================
export interface FacturacionDetalle {
  id: string
  facturacion_id: string
  concepto_id: string | null
  concepto_codigo: string
  concepto_descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  iva_porcentaje: number
  iva_monto: number
  total: number
  es_descuento: boolean
  descripcion: string | null
  referencia_id: string | null
  referencia_tipo: string | null
  created_at: string
}

export interface FacturacionDetalleFormData {
  concepto_id: string
  concepto_codigo: string
  concepto_descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
  es_descuento: boolean
  descripcion?: string
  referencia_id?: string
  referencia_tipo?: string
}

// =====================================================
// GARANTÍAS
// =====================================================
export interface GarantiaConductor {
  id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  conductor_cuit: string | null
  tipo_alquiler: 'CARGO' | 'TURNO'
  monto_total: number
  monto_cuota_semanal: number
  cuotas_totales: number
  cuotas_pagadas: number
  monto_pagado: number
  estado: 'pendiente' | 'en_curso' | 'completada' | 'cancelada' | 'suspendida'
  fecha_inicio: string | null
  fecha_completada: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
}

export interface GarantiaPago {
  id: string
  garantia_id: string
  conductor_id: string | null
  numero_cuota: number
  monto: number
  fecha_pago: string
  referencia: string | null
  created_at: string
}

export interface GarantiaFormData {
  conductor_id: string
  tipo_alquiler: 'CARGO' | 'TURNO'
  fecha_inicio: string
}

// =====================================================
// SALDOS Y ABONOS
// =====================================================
export interface SaldoConductor {
  id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  conductor_cuit: string | null
  saldo_actual: number
  dias_mora: number | null
  monto_mora_acumulada: number | null
  ultima_actualizacion: string | null
  created_at: string
  updated_at: string
}

export interface AbonoConductor {
  id: string
  conductor_id: string
  tipo: 'abono' | 'cargo'
  monto: number
  concepto: string
  referencia: string | null
  fecha_abono: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export interface AbonoFormData {
  conductor_id: string
  tipo: 'abono' | 'cargo'
  monto: number
  concepto: string
  referencia?: string
}

// =====================================================
// TICKETS A FAVOR (P004)
// =====================================================
export type TipoTicketFavor =
  | 'BONO_5_VENTAS'
  | 'BONO_EVENTO'
  | 'TICKET_PEAJE'
  | 'COMISION_REFERIDO'
  | 'REPARACION_CONDUCTOR'

export type EstadoTicketFavor = 'pendiente' | 'aprobado' | 'rechazado' | 'aplicado'

export interface TicketFavor {
  id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  tipo: TipoTicketFavor
  descripcion: string | null
  monto: number
  comprobante_url: string | null
  estado: EstadoTicketFavor
  fecha_solicitud: string
  fecha_aprobacion: string | null
  fecha_aplicacion: string | null
  motivo_rechazo: string | null
  periodo_aplicado_id: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface TicketFavorFormData {
  conductor_id: string
  periodo_id?: string
  tipo: TipoTicketFavor
  descripcion: string
  monto: number
}

export const TIPOS_TICKET_FAVOR = [
  { codigo: 'BONO_5_VENTAS', nombre: 'Bono 5% Ventas', color: '#10B981' },
  { codigo: 'BONO_EVENTO', nombre: 'Bono por Evento Toshify', color: '#8B5CF6' },
  { codigo: 'TICKET_PEAJE', nombre: 'Ticket de Peaje', color: '#3B82F6' },
  { codigo: 'COMISION_REFERIDO', nombre: 'Comisión Referidos', color: '#F59E0B' },
  { codigo: 'REPARACION_CONDUCTOR', nombre: 'Reparación por Conductor', color: '#EF4444' }
] as const

// =====================================================
// EXCESO DE KILOMETRAJE (P006)
// =====================================================
export interface ExcesoKilometraje {
  id: string
  conductor_id: string
  vehiculo_id: string | null
  periodo_id: string
  km_recorridos: number
  km_base: number
  km_exceso: number
  rango: string
  porcentaje: number
  valor_alquiler: number
  monto_base: number
  iva_porcentaje: number
  iva_monto: number
  monto_total: number
  aplicado: boolean
  fecha_aplicacion: string | null
  created_at: string
  // Relaciones
  conductor?: {
    nombres: string
    apellidos: string
  }
  vehiculo?: {
    patente: string
  }
}

// Rangos de exceso de kilometraje según la reunión
export const RANGOS_EXCESO_KM = [
  { min: 1, max: 50, porcentaje: 15, label: '1-50 km' },
  { min: 50, max: 100, porcentaje: 20, label: '50-100 km' },
  { min: 100, max: 150, porcentaje: 25, label: '100-150 km' },
  { min: 150, max: 200, porcentaje: 35, label: '150-200 km' }
] as const

export const KM_BASE_SEMANAL = 1800
export const IVA_EXCESO_KM = 21

// =====================================================
// CONCEPTOS DE FACTURACIÓN
// =====================================================
export interface ConceptoFacturacion {
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

export interface ConceptoFacturacionFormData {
  codigo: string
  descripcion: string
  precio_base: number
  iva_porcentaje: number
  tipo: string
  es_variable: boolean
  aplica_turno: boolean
  aplica_cargo: boolean
  activo: boolean
  orden: number
}

export const TIPOS_CONCEPTO = [
  { value: 'alquiler', label: 'Alquiler', color: '#3B82F6' },
  { value: 'cargo', label: 'Cargo', color: '#DC2626' },
  { value: 'descuento', label: 'Descuento', color: '#059669' },
  { value: 'penalidad', label: 'Penalidad', color: '#D97706' },
  { value: 'ingreso', label: 'Ingreso', color: '#8B5CF6' }
] as const

// =====================================================
// ESTADÍSTICAS
// =====================================================
export interface FacturacionStats {
  total_conductores: number
  conductores_cargo: number
  conductores_turno: number
  total_cargos: number
  total_descuentos: number
  total_neto: number
  total_mora: number
  conductores_con_mora: number
  conductores_con_saldo: number
}

export interface GarantiasStats {
  total_activas: number
  total_completadas: number
  por_tipo: {
    cargo: number
    turno: number
  }
  monto_total_esperado: number
  monto_total_cobrado: number
  monto_pendiente: number
}

export interface ConceptosStats {
  total: number
  activos: number
  inactivos: number
  por_tipo: {
    alquiler: number
    cargo: number
    descuento: number
    penalidad: number
    ingreso: number
  }
}

// =====================================================
// CONSTANTES DE FACTURACIÓN (según reunión)
// =====================================================
export const FACTURACION_CONFIG = {
  // Alquiler semanal
  ALQUILER_CARGO: 360000,
  ALQUILER_TURNO: 245000,

  // Garantía
  GARANTIA_CUOTA_SEMANAL: 50000,
  GARANTIA_TOTAL_CARGO: 1000000,
  GARANTIA_TOTAL_TURNO: 800000,
  GARANTIA_CUOTAS_CARGO: 20,
  GARANTIA_CUOTAS_TURNO: 16,

  // Mora
  MORA_PORCENTAJE_DIARIO: 1, // 1% diario
  MORA_DIAS_MAXIMOS: 7,

  // Kilometraje
  KM_BASE_SEMANAL: 1800,
  IVA_EXCESO_KM: 21,

  // Turnos
  TURNOS_SEMANA: 7
} as const

// =====================================================
// HELPERS
// =====================================================
export function getTipoConceptoColor(tipo: string): string {
  const found = TIPOS_CONCEPTO.find(t => t.value === tipo)
  return found?.color || '#6B7280'
}

export function getTipoConceptoLabel(tipo: string): string {
  const found = TIPOS_CONCEPTO.find(t => t.value === tipo)
  return found?.label || tipo
}

export function getTipoTicketColor(tipo: TipoTicketFavor): string {
  const found = TIPOS_TICKET_FAVOR.find(t => t.codigo === tipo)
  return found?.color || '#6B7280'
}

export function getTipoTicketLabel(tipo: TipoTicketFavor): string {
  const found = TIPOS_TICKET_FAVOR.find(t => t.codigo === tipo)
  return found?.nombre || tipo
}

export function calcularRangoExcesoKm(kmExceso: number): { rango: string; porcentaje: number } {
  for (const rango of RANGOS_EXCESO_KM) {
    if (kmExceso >= rango.min && kmExceso < rango.max) {
      return { rango: rango.label, porcentaje: rango.porcentaje }
    }
  }
  // Si excede 200km, usar el último porcentaje
  return { rango: '>200 km', porcentaje: 35 }
}

export function calcularExcesoKm(
  kmRecorridos: number,
  valorAlquiler: number
): { kmExceso: number; montoBase: number; iva: number; total: number; rango: string; porcentaje: number } | null {
  if (kmRecorridos <= KM_BASE_SEMANAL) {
    return null
  }

  const kmExceso = kmRecorridos - KM_BASE_SEMANAL
  const { rango, porcentaje } = calcularRangoExcesoKm(kmExceso)
  const montoBase = valorAlquiler * (porcentaje / 100)
  const iva = montoBase * (IVA_EXCESO_KM / 100)
  const total = montoBase + iva

  return { kmExceso, montoBase, iva, total, rango, porcentaje }
}

export function calcularMora(saldoPendiente: number, diasMora: number): number {
  const diasEfectivos = Math.min(diasMora, FACTURACION_CONFIG.MORA_DIAS_MAXIMOS)
  return saldoPendiente * (FACTURACION_CONFIG.MORA_PORCENTAJE_DIARIO / 100) * diasEfectivos
}

export function calcularAlquilerProporcional(
  tipoAlquiler: 'CARGO' | 'TURNO',
  turnosCobrados: number
): number {
  const montoSemanal = tipoAlquiler === 'CARGO'
    ? FACTURACION_CONFIG.ALQUILER_CARGO
    : FACTURACION_CONFIG.ALQUILER_TURNO

  return (turnosCobrados / FACTURACION_CONFIG.TURNOS_SEMANA) * montoSemanal
}

export function calcularGarantiaProporcional(turnosCobrados: number): number {
  return (turnosCobrados / FACTURACION_CONFIG.TURNOS_SEMANA) * FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function getWeekDates(semana: number, anio: number): { inicio: Date; fin: Date } {
  // Calcular el primer día del año
  const firstDayOfYear = new Date(anio, 0, 1)
  // Calcular el día de la semana del primer día (0 = domingo)
  const dayOfWeek = firstDayOfYear.getDay()
  // Ajustar para que la semana comience en lunes
  const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek)
  // Fecha del primer lunes del año
  const firstMonday = new Date(anio, 0, 1 + daysToMonday)
  // Fecha de inicio de la semana solicitada
  const inicio = new Date(firstMonday)
  inicio.setDate(inicio.getDate() + (semana - 1) * 7)
  // Fecha de fin (domingo)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 6)

  return { inicio, fin }
}

export function getCurrentWeekNumber(): { semana: number; anio: number } {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  const semana = Math.ceil((diff + start.getDay() * 24 * 60 * 60 * 1000) / oneWeek)

  return { semana, anio: now.getFullYear() }
}
