// src/modules/siniestros/components/cobrosConductor.ts
// Siniestros v2: estado de los cobros a conductor y confirmación manual del pago.
//
// Cada "Cobro a conductor" del seguimiento crea una incidencia y su penalidad. El estado
// se calcula igual que en Multas (penalidad + cuotas + semanas cerradas de facturación)
// y es solo de referencia: lo que cuenta como cobrado es lo que se confirma a mano
// (pago_confirmado_monto, sql/siniestros_cobro_confirmado.sql).
import { supabase } from '../../../lib/supabase'

export type EstadoCobro = 'pendiente' | 'aplicado' | 'en_proceso' | 'pagado' | 'rechazado' | 'sin_incidencia'

export const ESTADO_COBRO_LABELS: Record<EstadoCobro, string> = {
  pendiente: 'Pendiente',
  aplicado: 'Aplicado',
  en_proceso: 'En proceso',
  pagado: 'Pagado s/ facturación',
  rechazado: 'Rechazado',
  sin_incidencia: 'Sin incidencia',
}

export interface InfoCobro {
  seguimientoId: string
  siniestroId: string
  incidenciaId: string | null
  monto: number
  fecha: string
  estado: EstadoCobro
  cuotasPagadas: number
  cuotasTotal: number
  conductorDeBaja: boolean
  confirmadoMonto: number | null
  confirmadoAt: string | null
  confirmadoPor: string | null
}

export interface CobrosCargados {
  porSiniestro: Map<string, InfoCobro[]>
  /** false si falta correr sql/siniestros_cobro_confirmado.sql (no se puede confirmar) */
  hayConfirmacion: boolean
}

const LOTE = 100
 
const tabla = (nombre: string) => supabase.from(nombre as any) as any

function enLotes<T>(lista: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += LOTE) lotes.push(lista.slice(i, i + LOTE))
  return lotes
}

async function seleccionarEnLotes(
  nombre: string,
  columnas: string,
  campo: string,
  ids: string[],
  igual?: [string, string],
   
): Promise<any[]> {
  const unicos = [...new Set(ids.filter(Boolean))]
   
  const filas: any[] = []
  for (const lote of enLotes(unicos)) {
    let q = tabla(nombre).select(columnas).in(campo, lote)
    if (igual) q = q.eq(igual[0], igual[1])
    const { data, error } = await q
    if (error) throw error
    filas.push(...(data || []))
  }
  return filas
}

const COLS_BASE = 'id, siniestro_id, incidencia_id, monto, created_at'
const COBRO: [string, string] = ['tipo_evento', 'cobro_conductor']
const COLS_CONFIRMACION = ', pago_confirmado_monto, pago_confirmado_at, pago_confirmado_por'

/** Cobros a conductor de los siniestros dados, con su estado y si el conductor está de baja. */
export async function cargarCobrosConductor(siniestroIds: string[]): Promise<CobrosCargados> {
  const porSiniestro = new Map<string, InfoCobro[]>()
  if (siniestroIds.length === 0) return { porSiniestro, hayConfirmacion: true }

  // 1) Seguimientos de cobro (con las columnas de confirmación si existen)
  let hayConfirmacion = true
   
  let seguimientos: any[] = []
  try {
    seguimientos = await seleccionarEnLotes('siniestros_seguimientos', COLS_BASE + COLS_CONFIRMACION, 'siniestro_id', siniestroIds, COBRO)
  } catch {
    hayConfirmacion = false
    seguimientos = await seleccionarEnLotes('siniestros_seguimientos', COLS_BASE, 'siniestro_id', siniestroIds, COBRO)
  }
  if (seguimientos.length === 0) return { porSiniestro, hayConfirmacion }

  // 2) Incidencias (conductor), penalidades, cuotas y semanas cerradas
  const incidenciaIds = seguimientos.map(s => s.incidencia_id).filter(Boolean) as string[]
  const [incidencias, penalidades, periodosRes] = await Promise.all([
    seleccionarEnLotes('incidencias', 'id, conductor_id', 'id', incidenciaIds),
    seleccionarEnLotes('penalidades', 'id, incidencia_id, fraccionado, cantidad_cuotas, aplicado, rechazado, semana_aplicacion, anio_aplicacion', 'incidencia_id', incidenciaIds),
    tabla('periodos_facturacion').select('semana, anio').eq('estado', 'cerrado'),
  ])
  const cerradas = new Set<string>(((periodosRes.data || []) as Array<{ semana: number; anio: number }>).map(p => `${p.semana}-${p.anio}`))
  const fraccionadas = penalidades.filter(p => p.fraccionado === true).map(p => p.id as string)
  const cuotas = fraccionadas.length
    ? await seleccionarEnLotes('penalidades_cuotas', 'penalidad_id, aplicado', 'penalidad_id', fraccionadas)
    : []

  // 3) Conductores de baja
  const conductorPorIncidencia = new Map<string, string>(incidencias.map(i => [i.id, i.conductor_id]))
  const conductores = await seleccionarEnLotes('conductores', 'id, estado_id', 'id', [...conductorPorIncidencia.values()])
  const { data: estadosData } = await tabla('conductores_estados').select('id, codigo')
  const estadoBaja = new Set(((estadosData || []) as Array<{ id: string; codigo: string }>)
    .filter(e => (e.codigo || '').toUpperCase() === 'BAJA').map(e => e.id))
  const conductorDeBaja = new Set(conductores.filter(c => estadoBaja.has(c.estado_id)).map(c => c.id as string))

   
  const penalidadPorIncidencia = new Map<string, any>()
  for (const p of penalidades) {
    // Si hay más de una, gana la rechazada o la aplicada (como en Multas)
    const prev = penalidadPorIncidencia.get(p.incidencia_id)
    if (!prev || p.rechazado || (p.aplicado && !prev.aplicado)) penalidadPorIncidencia.set(p.incidencia_id, p)
  }
  const cuotasPorPenalidad = new Map<string, boolean[]>()
  for (const c of cuotas) {
    const arr = cuotasPorPenalidad.get(c.penalidad_id) || []
    arr.push(c.aplicado === true)
    cuotasPorPenalidad.set(c.penalidad_id, arr)
  }

  for (const s of seguimientos) {
    let estado: EstadoCobro = 'sin_incidencia'
    let cuotasPagadas = 0
    let cuotasTotal = 0
    const p = s.incidencia_id ? penalidadPorIncidencia.get(s.incidencia_id) : null
    if (s.incidencia_id) estado = 'pendiente'
    if (p) {
      if (p.rechazado) {
        estado = 'rechazado'
      } else if (p.fraccionado) {
        const arr = cuotasPorPenalidad.get(p.id) || []
        cuotasTotal = Number(p.cantidad_cuotas) || arr.length
        cuotasPagadas = arr.filter(Boolean).length
        estado = cuotasTotal > 0 && cuotasPagadas >= cuotasTotal ? 'pagado' : 'en_proceso'
      } else if (p.aplicado) {
        estado = cerradas.has(`${p.semana_aplicacion}-${p.anio_aplicacion}`) ? 'pagado' : 'aplicado'
      }
    }
    const conductorId = s.incidencia_id ? conductorPorIncidencia.get(s.incidencia_id) : undefined
    const info: InfoCobro = {
      seguimientoId: s.id,
      siniestroId: s.siniestro_id,
      incidenciaId: s.incidencia_id || null,
      monto: Number(s.monto) || 0,
      fecha: s.created_at,
      estado,
      cuotasPagadas,
      cuotasTotal,
      conductorDeBaja: !!conductorId && conductorDeBaja.has(conductorId),
      confirmadoMonto: s.pago_confirmado_monto != null ? Number(s.pago_confirmado_monto) : null,
      confirmadoAt: s.pago_confirmado_at || null,
      confirmadoPor: s.pago_confirmado_por || null,
    }
    const arr = porSiniestro.get(s.siniestro_id) || []
    arr.push(info)
    porSiniestro.set(s.siniestro_id, arr)
  }
  return { porSiniestro, hayConfirmacion }
}

/** Texto corto del estado, con las cuotas si está en proceso ("En proceso · 2 de 4 cuotas"). */
export function textoEstadoCobro(c: InfoCobro): string {
  const base = ESTADO_COBRO_LABELS[c.estado]
  return c.estado === 'en_proceso' && c.cuotasTotal ? `${base} · ${c.cuotasPagadas} de ${c.cuotasTotal} cuotas` : base
}

/**
 * Confirma (monto) o deshace (null) el pago de un cobro y recalcula el "Cobrado al
 * conductor" del siniestro como la suma de lo confirmado. Devuelve el nuevo total.
 */
export async function confirmarPagoCobro(
  seguimientoId: string,
  siniestroId: string,
  monto: number | null,
  usuario: { id?: string; nombre?: string },
): Promise<number> {
  const { error } = await tabla('siniestros_seguimientos')
    .update(monto == null
      ? { pago_confirmado_monto: null, pago_confirmado_at: null, pago_confirmado_por: null, pago_confirmado_por_id: null }
      : {
          pago_confirmado_monto: monto,
          pago_confirmado_at: new Date().toISOString(),
          pago_confirmado_por: usuario.nombre || null,
          pago_confirmado_por_id: usuario.id || null,
        })
    .eq('id', seguimientoId)
  if (error) throw error

  const { data, error: sumError } = await tabla('siniestros_seguimientos')
    .select('pago_confirmado_monto')
    .eq('siniestro_id', siniestroId)
    .eq('tipo_evento', 'cobro_conductor')
  if (sumError) throw sumError
  const total = ((data || []) as Array<{ pago_confirmado_monto: number | null }>)
    .reduce((acc, r) => acc + (Number(r.pago_confirmado_monto) || 0), 0)

  const { error: updError } = await tabla('siniestros').update({ cobrado_conductor: total }).eq('id', siniestroId)
  if (updError) throw updError
  return total
}
