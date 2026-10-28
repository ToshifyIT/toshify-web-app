// src/services/cresiumService.ts
// Cliente del router /api/cresium (server-cresium.js). Las claves de Cresium y
// Alegra viven solo en el servidor; acá solo viaja el token de sesión de Supabase.
import { supabase } from '../lib/supabase'

export type EmpresaCresium = '44dreams' | 'grupocg'

export type EstadoAlegra = 'pendiente' | 'cargado' | 'error' | 'ignorado'

export interface DestinoAlegra {
  tipo: 'categoria' | 'factura'
  id: string
  nombre: string
}

export interface PropuestaAlegra {
  contacto: { id: string; nombre: string } | null
  /** No existe el CUIT en Alegra: se crea el contacto al cargar */
  crear_contacto: boolean
  destino: DestinoAlegra | null
  /** Diferencia de centavos con la factura (se carga como pago aparte) */
  ajuste: number
  /** Facturas abiertas del proveedor; coincide = el saldo es el importe del pago */
  opciones_factura: Array<{ id: string; nombre: string; saldo: number; coincide?: boolean }>
}

export interface MovimientoCresium {
  cresium_id: number
  fecha: string
  procesado_en: string | null
  tipo: string | null
  estado: string | null
  direccion: 'entrada' | 'salida'
  contraparte: string | null
  cuit: string | null
  cuenta_contraparte: string | null
  banco_contraparte: string | null
  importe: number
  impuesto: number
  tag: string | null
  nota: string | null
  alegra_estado: EstadoAlegra
  alegra_pago_id: string | null
  alegra_impuesto_pago_id: string | null
  alegra_ajuste_pago_id: string | null
  alegra_detalle: string | null
  alegra_error: string | null
  alegra_cargado_en: string | null
  /** Conciliación de Alegra (borrador) en la que quedó */
  alegra_conciliacion_id: string | null
  /** Guardado en la base la primera vez que se vio conciliado en Alegra */
  alegra_conciliado: boolean
  propuesta: PropuestaAlegra | null
  /** Ya hay un pago en la cuenta Cresium de Alegra con misma fecha e importe */
  posible_duplicado: { id: string; fecha: string; monto: number } | null
  /** Conciliado en Alegra (null = no se sabe / no cargado) */
  conciliado?: boolean | null
}

export interface CategoriaAlegra {
  id: string
  nombre: string
  tipo: string
}

export interface MovimientosCresiumResponse {
  empresa: EmpresaCresium
  empresa_label: string
  mes: string
  /** Desde la base; propuesta y posible_duplicado llegan aparte (obtenerPropuestasAlegra) */
  filas: MovimientoCresium[]
  puede_cargar: boolean
  cresium_configurado: boolean
  alegra_configurado: boolean
  /** Último movimiento guardado de la empresa (de cualquier mes) */
  ultimo_movimiento: string | null
  /** Última consulta a Cresium desde que arrancó el servidor */
  ultima_sync: string | null
}

export interface ItemCarga {
  cresium_id: number
  categoria_id?: string
  factura_id?: string
}

export interface CargarResponse {
  cargados: number
  errores: number
  resultados: Array<{ cresium_id: number; ok: boolean; detalle?: string; pago_id?: string; error?: string }>
}

/** Tamaño de lote que acepta el servidor por llamada a /cargar */
export const LOTE_CARGA_ALEGRA = 10

async function pedir<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sin sesión activa')

  const res = await fetch(`/api/cresium${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  const texto = await res.text()
  let data: unknown = null
  try { data = texto ? JSON.parse(texto) : null } catch { data = null }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new Error(msg || `Error ${res.status} del servidor${texto ? '' : ' (¿está corriendo el server?)'}`)
  }
  return data as T
}

/** Movimientos del mes guardados en la base (rápido: no consulta Cresium ni Alegra) */
export function obtenerMovimientosCresium(
  empresa: EmpresaCresium,
  mes: string,
): Promise<MovimientosCresiumResponse> {
  return pedir<MovimientosCresiumResponse>(`/${empresa}/movimientos?${new URLSearchParams({ mes })}`)
}

export interface PropuestasAlegraResponse {
  /** cresium_id -> propuesta para los pendientes del mes */
  propuestas: Record<string, { propuesta: PropuestaAlegra; posible_duplicado: MovimientoCresium['posible_duplicado'] }>
  /** cresium_id -> si lo cargado está conciliado en Alegra */
  conciliacion: Record<string, { conciliado: boolean }>
  /** Movimientos que ya estaban cargados a mano en Alegra y se vincularon solos */
  vinculados_auto: number
  /** Cargados cuyo pago se eliminó/anuló en Alegra: volvieron a pendiente */
  revertidos?: number
  /** true: el mes está todo cargado y conciliado según la base; no se consultó Alegra */
  sin_consulta?: boolean
  categorias: CategoriaAlegra[]
  /** Si Alegra no respondió: la tabla se ve igual, sin propuesta */
  error_alegra: string | null
}

/** Cómo se cargaría cada pendiente en Alegra (consulta Alegra con caché; refrescar = leer de nuevo) */
export function obtenerPropuestasAlegra(
  empresa: EmpresaCresium,
  mes: string,
  refrescar = false,
): Promise<PropuestasAlegraResponse> {
  const qs = new URLSearchParams({ mes, ...(refrescar ? { refrescar: '1' } : {}) })
  return pedir<PropuestasAlegraResponse>(`/${empresa}/propuestas?${qs}`)
}

export interface ActualizarResponse {
  traidos: number
  /** Movimientos que no estaban guardados */
  nuevos: number
  desde?: string
}

/**
 * Trae de Cresium solo lo nuevo (desde el último movimiento guardado).
 * Con mes ('AAAA-MM') vuelve a traer ese mes completo. No toca lo ya cargado en Alegra.
 */
export function actualizarDesdeCresium(empresa: EmpresaCresium, mes?: string): Promise<ActualizarResponse> {
  return pedir<ActualizarResponse>(`/${empresa}/actualizar`, {
    method: 'POST',
    body: JSON.stringify(mes ? { mes } : {}),
  })
}

export function cargarEnAlegra(empresa: EmpresaCresium, items: ItemCarga[]): Promise<CargarResponse> {
  return pedir<CargarResponse>(`/${empresa}/cargar`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function marcarMovimiento(
  empresa: EmpresaCresium,
  cresiumId: number,
  accion: 'ignorar' | 'pendiente' | 'vincular',
  alegraPagoId?: string,
): Promise<{ ok: boolean }> {
  return pedir<{ ok: boolean }>(`/${empresa}/marcar`, {
    method: 'POST',
    body: JSON.stringify({ cresium_id: cresiumId, accion, alegra_pago_id: alegraPagoId }),
  })
}

export interface ConciliacionResponse {
  ok: boolean
  desde: string
  hasta: string
  /** Saldo del extracto a la fecha de corte: saldo actual en Cresium menos lo posterior */
  saldo_bancario: number
  saldo_cresium_hoy: number
  movimientos: number
  transacciones: number
  ingresos: number
  egresos: number
  impuestos: number
  conciliacion_id?: string
  /** Fecha del documento en Alegra (hoy si ya había una conciliación posterior al corte) */
  fecha_conciliacion?: string
}

/**
 * Conciliación de la cuenta Cresium en Alegra, del día 1 del mes hasta `hasta`.
 * confirmar=false: solo el resumen. confirmar=true: la crea en BORRADOR en Alegra.
 */
export function conciliarEnAlegra(
  empresa: EmpresaCresium,
  hasta: string,
  confirmar: boolean,
): Promise<ConciliacionResponse> {
  return pedir<ConciliacionResponse>(`/${empresa}/conciliar`, {
    method: 'POST',
    body: JSON.stringify({ hasta, confirmar }),
  })
}

export type CondicionIva = 'IVA_RESPONSABLE' | 'UNIQUE_TRIBUTE_RESPONSABLE'

/** Crea en Alegra el proveedor/cliente del CUIT del movimiento (si ya existe, devuelve ese) */
export function crearContactoAlegra(
  empresa: EmpresaCresium,
  datos: { cresium_id: number; nombre: string; iva_condicion: CondicionIva; tipo: 'provider' | 'client' },
): Promise<{ contacto: { id: string; nombre: string }; existente: boolean }> {
  return pedir(`/${empresa}/contacto`, { method: 'POST', body: JSON.stringify(datos) })
}

/** Link al pago en Alegra */
export function urlPagoAlegra(pagoId: string): string {
  return `https://app.alegra.com/payment/view/id/${pagoId}`
}
