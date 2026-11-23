// src/modules/administracion/consumo-herramientas/types.ts
// Administración › Consumo herramientas: suscripciones pagas de IT (sql/consumo_herramientas.sql).

export type Moneda = 'USD' | 'ARS' | 'EUR' | 'PEN'
/** Gratis: plan free de una herramienta. N/A: cuenta o acceso que no es una suscripción (panel de Didi, Cabify, etc.) */
export type Periodicidad = 'Mensual' | 'Anual' | 'Por uso' | 'Gratis' | 'N/A'
export type EnvioFacturas = 'Automático configurado' | 'Descarga manual' | 'Pendiente revisar'
export type EstadoHerramienta = 'Activa' | 'Inactiva'
export type EstadoPago = 'Pendiente' | 'Pagado' | 'Vencido' | 'N/A'

export interface Herramienta {
  id: string
  nombre: string
  uso: string | null
  plan: string | null
  monto: number | null
  moneda: Moneda | null
  periodicidad: Periodicidad | null
  dia_cobro: number | null
  fecha_vencimiento: string | null
  cuenta_acceso: string | null
  url_facturacion: string | null
  /** A dónde se entra a la herramienta (Accesos). Facturación va en url_facturacion (Consumo) */
  url_acceso?: string | null
  responsable: string | null
  razon_social_facturada: string | null
  cuit_facturado: string | null
  tarjeta_ultimos4: string | null
  envio_facturas: EnvioFacturas
  estado: EstadoHerramienta
  fecha_baja: string | null
  notas: string | null
  /** Enlace a la entrada del gestor de contraseñas (la contraseña nunca se guarda acá) */
  enlace_gestor: string | null
  /** Usuarios / licencias / agentes que se pagan hoy (sql/consumo_herramientas_licencias.sql) */
  licencias?: number | null
  /** Cuántas incluye el plan (para ver si se pagan extras) */
  licencias_incluidas?: number | null
  /** Precio de una licencia por período: monto = licencias × precio (sql/consumo_herramientas_precio_licencia.sql) */
  precio_licencia?: number | null
  /** De dónde trae el script diario la cantidad de licencias (null = a mano) */
  fuente_licencias?: 'slack' | 'google_workspace' | null
  licencias_actualizadas_en?: string | null
  /** De dónde se trae solo el consumo real (sql/consumo_herramientas_consumo.sql) */
  fuente_consumo?: FuenteConsumo | null
  /** Saldo prepago que mostraba la herramienta al cierre de saldo_prepago_fecha (se carga a mano) */
  saldo_prepago?: number | null
  saldo_prepago_fecha?: string | null
  /** Concepto al que se le descuenta el saldo ('Gemini', 'Google Maps'...). null = todo el consumo */
  saldo_prepago_concepto?: string | null
  created_at: string
  updated_at: string
}

export type FuenteConsumo = '2chat' | 'google_cloud'

/** Consumo real de un día y un concepto (Llamadas, Google Maps, Gemini...) */
export interface ConsumoDia {
  herramienta_id: string
  fecha: string
  concepto: string
  monto: number
  moneda: Moneda
  cantidad: number | null
  unidad: string | null
  fuente: string
  actualizado_en: string
}

export interface PagoHerramienta {
  id: string
  herramienta_id: string
  periodo: string
  fecha_vencimiento: string | null
  monto: number | null
  moneda: Moneda | null
  estado: EstadoPago
  fecha_pago: string | null
  factura_path: string | null
  factura_nombre: string | null
  observaciones: string | null
  pagado_en: string | null
  created_at: string
}

/** Razón social y CUIT a los que tiene que facturar cada herramienta */
export const RAZON_SOCIAL_OBJETIVO = 'GRUPO CG SAS'
export const CUIT_OBJETIVO = '30-71834000-0'

export const MONEDAS: Moneda[] = ['USD', 'ARS', 'EUR', 'PEN']
export const PERIODICIDADES: Periodicidad[] = ['Mensual', 'Anual', 'Por uso', 'Gratis', 'N/A']

/** Sin costo: no lleva monto ni genera pagos */
export const sinCosto = (p: Periodicidad | null | undefined) => p === 'Gratis' || p === 'N/A'
export const ENVIOS_FACTURAS: EnvioFacturas[] = ['Automático configurado', 'Descarga manual', 'Pendiente revisar']
export const ESTADOS_PAGO: EstadoPago[] = ['Pendiente', 'Pagado', 'Vencido', 'N/A']

/** Bucket privado de storage con las facturas de cada pago */
export const BUCKET_FACTURAS = 'herramientas-facturas'

/** Entidad de EE. UU.: va con la tarjeta 7825 y la dirección de Miami (sin CUIT) */
export const RAZON_SOCIAL_INC = 'Grupo CG, INC.'

/** ¿Factura al grupo? GRUPO CG SAS con el CUIT correcto, o Grupo CG, INC. (EE. UU.) */
export function facturaAGrupoCg(h: Pick<Herramienta, 'razon_social_facturada' | 'cuit_facturado'>): boolean {
  const cuit = (h.cuit_facturado || '').replace(/\D/g, '')
  const razon = (h.razon_social_facturada || '').toUpperCase().replace(/[.,\s]+/g, ' ').trim()
  if (!razon.includes('GRUPO CG')) return false
  return cuit === CUIT_OBJETIVO.replace(/\D/g, '') || /\bINC\b/.test(razon)
}

/** Cuántas unidades de cada moneda equivalen a 1 USD (sql/consumo_herramientas_monedas.sql) */
export interface Cotizacion {
  moneda: Moneda
  unidades_por_usd: number
  fuente: string | null
  actualizada_en: string
}

/** Monto pasado de una moneda a otra con las cotizaciones (null si falta alguna) */
export function convertir(monto: number, de: Moneda, a: Moneda, cotizaciones: Map<string, number>): number | null {
  if (de === a) return monto
  const usd = aUsd(monto, de, cotizaciones)
  if (usd === null) return null
  if (a === 'USD') return usd
  const tasa = cotizaciones.get(a)
  return tasa ? usd * tasa : null
}

/** Monto en su moneda pasado a USD (null si falta la cotización) */
export function aUsd(monto: number | null, moneda: Moneda | null, cotizaciones: Map<string, number>): number | null {
  if (monto === null || monto === undefined || !moneda) return null
  if (moneda === 'USD') return monto
  const tasa = cotizaciones.get(moneda)
  return tasa ? monto / tasa : null
}
