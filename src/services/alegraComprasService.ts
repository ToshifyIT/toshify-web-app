// src/services/alegraComprasService.ts
// Cliente del router /api/alegra (server-alegra.js): comprobantes recibidos de ARCA
// -> facturas de proveedor / notas débito en Alegra. El token de Alegra vive solo en el servidor.
import { supabase } from '../lib/supabase'

export type EmpresaAlegra = '44dreams' | 'grupocg'

export type EstadoComprobante = 'pendiente' | 'cargado' | 'error' | 'ignorado'

export interface ImportacionArca {
  id: string
  archivo: string | null
  comprobantes: number
  columna_cuenta: string | null
  desde: string | null
  hasta: string | null
  created_at: string
}

export interface ImportacionesResponse {
  empresa: EmpresaAlegra
  empresa_label: string
  importaciones: ImportacionArca[]
  puede_editar: boolean
  alegra_configurado: boolean
}

export interface ComprobanteArca {
  id: string
  importacion_id: string | null
  fila: number | null
  fecha: string | null
  /** Código ARCA: 1 Factura A, 11 Factura C, 3 NC A, 13 NC C */
  tipo_cod: string
  tipo: string | null
  punto_venta: number
  numero: number
  cae: string | null
  cuit: string
  proveedor: string | null
  moneda: string | null
  neto_gravado: number | null
  iva: number | null
  no_gravado: number | null
  exentas: number | null
  otros_tributos: number | null
  total: number
  /** Neto por alícuota de IVA (21, 10.5, ...) */
  netos: Record<string, number>
  /** Como vino en la columna agregada del Excel */
  cuenta_excel: string | null
  /** Cuenta de Alegra que se usa (resuelta por nombre o elegida a mano) */
  alegra_categoria_id: string | null
  alegra_categoria_nombre: string | null
  estado: EstadoComprobante
  /** Pendiente con algo para revisar (null = listo para cargar) */
  revisar: string | null
  alegra_tipo: 'bill' | 'debit-note' | null
  alegra_id: string | null
  alegra_numero: string | null
  alegra_total: number | null
  alegra_proveedor_id: string | null
  proveedor_creado: boolean
  alegra_factura_asociada: string | null
  /** Cómo quedó en Alegra */
  alegra_detalle: string | null
  alegra_error: string | null
  cargado_en: string | null
}

export interface CuentaAlegra {
  id: string
  nombre: string
  tipo: string
}

export interface RevisionResponse {
  revisados: number
  /** Ya estaban en Alegra (cargados antes o a mano): quedaron vinculados */
  ya_estaban: number
  /** Estaban cargados y se borraron en Alegra: volvieron a pendiente */
  revertidos: number
  listos: number
  a_revisar: number
}

export interface ImportarResponse {
  importacion_id: string
  comprobantes: number
  nuevos: number
  ya_cargados_antes: number
  cuenta_cambiada: number
  filas_omitidas: number
  columna_cuenta: string | null
  revision: RevisionResponse | null
  error_alegra: string | null
}

export interface CargarComprobantesResponse {
  cargados: number
  errores: number
  resultados: Array<{ id: string; ok: boolean; detalle?: string; error?: string; alegra_id?: string }>
}

/** Comprobantes por llamada a /cargar */
export const LOTE_CARGA_COMPROBANTES = 10

async function pedir<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sin sesión activa')

  const res = await fetch(`/api/alegra${path}`, {
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

export function obtenerImportaciones(empresa: EmpresaAlegra): Promise<ImportacionesResponse> {
  return pedir<ImportacionesResponse>(`/${empresa}/importaciones`)
}

export function obtenerComprobantes(empresa: EmpresaAlegra, importacionId: string): Promise<{ filas: ComprobanteArca[] }> {
  return pedir(`/${empresa}/comprobantes?${new URLSearchParams({ importacion: importacionId })}`)
}

export function obtenerCuentasAlegra(empresa: EmpresaAlegra): Promise<{ categorias: CuentaAlegra[] }> {
  return pedir(`/${empresa}/cuentas`)
}

/** Sube las filas del Excel de ARCA (encabezados + valores tal cual) */
export function importarExcelArca(
  empresa: EmpresaAlegra,
  datos: { archivo: string; encabezados: string[]; filas: Array<{ fila: number; valores: unknown[] }> },
): Promise<ImportarResponse> {
  return pedir<ImportarResponse>(`/${empresa}/importar`, { method: 'POST', body: JSON.stringify(datos) })
}

export function revisarEnAlegra(empresa: EmpresaAlegra, importacionId: string): Promise<RevisionResponse> {
  return pedir<RevisionResponse>(`/${empresa}/revisar`, {
    method: 'POST',
    body: JSON.stringify({ importacion_id: importacionId }),
  })
}

export function elegirCuenta(
  empresa: EmpresaAlegra,
  id: string,
  categoriaId: string,
): Promise<{ ok: boolean; revisar: string | null; cuenta: { id: string; nombre: string } }> {
  return pedir(`/${empresa}/cuenta`, { method: 'POST', body: JSON.stringify({ id, categoria_id: categoriaId }) })
}

export function marcarComprobante(empresa: EmpresaAlegra, id: string, accion: 'ignorar' | 'pendiente'): Promise<{ ok: boolean }> {
  return pedir(`/${empresa}/marcar`, { method: 'POST', body: JSON.stringify({ id, accion }) })
}

export function cargarComprobantes(empresa: EmpresaAlegra, ids: string[]): Promise<CargarComprobantesResponse> {
  return pedir<CargarComprobantesResponse>(`/${empresa}/cargar`, { method: 'POST', body: JSON.stringify({ ids }) })
}

/** Link al comprobante en Alegra */
export function urlComprobanteAlegra(tipo: 'bill' | 'debit-note', id: string): string {
  return tipo === 'bill'
    ? `https://app.alegra.com/bill/view/id/${id}`
    : `https://app.alegra.com/debit-note/view/id/${id}`
}

/**
 * Lee el Excel de ARCA en el navegador: busca la fila de encabezados (la que tiene
 * "Denominación Emisor") y devuelve encabezados + filas con los valores crudos.
 */
export async function leerExcelArca(archivo: File): Promise<{ encabezados: string[]; filas: Array<{ fila: number; valores: unknown[] }> }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) throw new Error('El Excel está vacío')
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null, blankrows: true })
  const idx = aoa.slice(0, 15).findIndex((r) => r.some((c) => /denominaci[oó]n emisor/i.test(String(c ?? ''))))
  if (idx === -1) throw new Error('No encontré los encabezados de ARCA (falta la columna «Denominación Emisor»)')
  const encabezados = aoa[idx].map((h) => String(h ?? '').trim())
  // Número de fila real del Excel (para ubicarla después)
  const rango = XLSX.utils.decode_range(hoja['!ref'] ?? 'A1')
  const filas = aoa.slice(idx + 1)
    .map((valores, i) => ({ fila: rango.s.r + idx + 2 + i, valores }))
    .filter((f) => f.valores.some((v) => v !== null && v !== ''))
  return { encabezados, filas }
}
