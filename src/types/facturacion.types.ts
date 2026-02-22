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
  // Campos dinámicos para Vista Previa
  monto_peajes?: number
  monto_excesos?: number
  km_exceso?: number
  monto_penalidades?: number
  monto_tickets_favor?: number
  penalidades_detalle?: Array<{ monto: number; detalle: string }>
  tickets_detalle?: Array<{ monto: number; detalle: string }>
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
  fecha_referencia: string | null  // Fecha desde la cual se considera el saldo (para cálculo de mora)
  ultima_actualizacion: string | null
  created_at: string
  updated_at: string
  // Estado del conductor (desde join)
  conductor_estado?: string | null
}

export interface AbonoConductor {
  id: string
  conductor_id: string
  tipo: 'abono' | 'cargo'
  monto: number
  concepto: string
  referencia: string | null
  semana: number | null
  anio: number | null
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
  | 'DEVOLUCION_GARANTIA'

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
  { codigo: 'REPARACION_CONDUCTOR', nombre: 'Reparación por Conductor', color: '#EF4444' },
  { codigo: 'DEVOLUCION_GARANTIA', nombre: 'Devolución de Garantía', color: '#06B6D4' }
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
  { value: 'cargo', label: 'Cargo', color: '#ff0033' },
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
// CONSTANTES DE FACTURACIÓN
// NOTA: En producción, los precios deben venir de conceptos_nomina
// y los parámetros de parametros_sistema. Estos son valores por defecto.
// Valores actualizados según reporte Bruno Timoteo Mancuello 2025
// =====================================================
export const FACTURACION_CONFIG = {
  // Alquiler semanal (valores reales según Bruno)
  ALQUILER_CARGO: 360000,  // A cargo: $360,000/semana
  ALQUILER_TURNO: 300000,  // Turno: $300,000/semana (Bruno muestra este valor)

  // Garantía (valores reales según Bruno)
  GARANTIA_CUOTA_SEMANAL: 80000,  // $80,000/semana según Bruno
  GARANTIA_TOTAL_CARGO: 1600000,  // 20 cuotas x $80,000
  GARANTIA_TOTAL_TURNO: 1120000,  // 14 cuotas x $80,000 (Bruno muestra 14 cuotas)
  GARANTIA_CUOTAS_CARGO: 20,
  GARANTIA_CUOTAS_TURNO: 14,  // 14 cuotas según Bruno

  // Mora: 1% diario sobre saldo pendiente, máximo 7 días
  MORA_PORCENTAJE_DIARIO: 1,  // 1% diario sobre saldo pendiente
  MORA_DIAS_MAXIMOS: 7,  // Máximo 7 días de mora

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

/**
 * Calcula la mora: 1% diario sobre saldo pendiente
 * - Máximo 7 días de mora
 * - Solo aplica si hay saldo positivo (deuda)
 */
export function calcularMora(
  saldoPendiente: number,
  diasMora: number = 0
): number {
  if (saldoPendiente <= 0 || diasMora <= 0) {
    return 0
  }

  const dias = Math.min(diasMora, FACTURACION_CONFIG.MORA_DIAS_MAXIMOS)
  return Math.round(saldoPendiente * (FACTURACION_CONFIG.MORA_PORCENTAJE_DIARIO / 100) * dias)
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
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
  return `$ ${formatted}`
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

// =====================================================
// PARÁMETROS DEL SISTEMA
// =====================================================
export type ParametroTipo = 'number' | 'string' | 'boolean' | 'json' | 'date'

export interface ParametroSistema {
  id: string
  modulo: string
  clave: string
  tipo: ParametroTipo
  valor: string
  descripcion: string | null
  unidad: string | null
  valor_minimo: number | null
  valor_maximo: number | null
  activo: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ParametroSistemaFormData {
  modulo: string
  clave: string
  tipo: ParametroTipo
  valor: string
  descripcion?: string
  unidad?: string
  valor_minimo?: number
  valor_maximo?: number
  activo?: boolean
}

// =====================================================
// LIQUIDACIÓN DE CONDUCTORES
// =====================================================
export interface LiquidacionConductor {
  id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  conductor_cuit: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string | null
  fecha_liquidacion: string
  fecha_inicio_semana: string | null
  fecha_corte: string
  dias_trabajados: number
  turnos_base: number
  alquiler_proporcional: number
  garantia_proporcional: number
  peajes_pendientes: number
  excesos_km: number
  penalidades: number
  tickets_favor: number
  saldo_anterior: number
  mora_acumulada: number
  garantia_total_pagada: number
  garantia_cuotas_pagadas: number
  garantia_a_devolver: number
  subtotal_cargos: number
  subtotal_descuentos: number
  total_liquidacion: number
  estado: 'borrador' | 'calculado' | 'aprobado' | 'pagado' | 'cancelado'
  notas: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
  aprobado_por: string | null
  aprobado_por_name: string | null
  fecha_aprobacion: string | null
}

// Claves de parámetros de facturación (para autocompletado)
export const PARAMETROS_FACTURACION = {
  // Bloqueos
  BLOQUEO_MONTO_LIMITE: 'bloqueo_monto_limite',
  BLOQUEO_DIAS_MORA: 'bloqueo_dias_mora',

  // Mora
  MORA_PORCENTAJE: 'mora_porcentaje',
  MORA_DIAS_MAXIMOS: 'mora_dias_maximos',
  MORA_TIPO_CALCULO: 'mora_tipo_calculo',

  // Kilometraje
  KM_BASE_SEMANAL: 'km_base_semanal',
  KM_EXCESO_IVA: 'km_exceso_iva',
  KM_RANGOS_EXCESO: 'km_rangos_exceso',

  // Garantías
  GARANTIA_CUOTAS_CARGO: 'garantia_cuotas_cargo',
  GARANTIA_CUOTAS_TURNO: 'garantia_cuotas_turno',
  GARANTIA_COBRO_SIMULTANEO: 'garantia_cobro_simultaneo',

  // Turnos
  TURNOS_SEMANA: 'turnos_semana',

  // Períodos
  PERIODO_DIA_CIERRE: 'periodo_dia_cierre',
  PERIODO_CIERRE_AUTOMATICO: 'periodo_cierre_automatico',

  // IVA
  IVA_CONCEPTOS_21: 'iva_conceptos_21',
  IVA_CONCEPTOS_EXENTO: 'iva_conceptos_exento',

  // Factura
  FACTURA_TIPO_CUIT: 'factura_tipo_cuit',
  FACTURA_TIPO_DNI: 'factura_tipo_dni',

  // Comprobante
  COMPROBANTE_NOTA_CREDITO: 'comprobante_nota_credito',
  COMPROBANTE_NOTA_DEBITO: 'comprobante_nota_debito',

  // Referidos
  REFERIDO_BONO_SEMANA_1: 'referido_bono_semana_1',
  REFERIDO_BONO_SEMANA_5: 'referido_bono_semana_5'
} as const

// Helper para parsear valor según tipo
export function parseParametroValor<T>(param: ParametroSistema): T {
  switch (param.tipo) {
    case 'number':
      return parseFloat(param.valor) as T
    case 'boolean':
      return (param.valor === 'true') as T
    case 'json':
      return JSON.parse(param.valor) as T
    case 'date':
      return new Date(param.valor) as T
    default:
      return param.valor as T
  }
}
