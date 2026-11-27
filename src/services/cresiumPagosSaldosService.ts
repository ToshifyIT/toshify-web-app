// src/services/cresiumPagosSaldosService.ts
// Pagos de Cresium por revisar en Saldos (tabla cresium_pagos_saldos, sql/cresium_pagos_saldos.sql).
// Los movimientos de Cresium que se cruzan con un conductor llegan solos como pendientes;
// «Permitir» los registra como un movimiento más del saldo (igual que «Registrar abono/cargo»:
// abonos_conductores + saldo + kardex) y «Rechazar» los descarta. Pendientes, no cambian el saldo.
import { supabase } from '../lib/supabase'
import { aplicarMovimientoSaldo, insertControlSaldo } from './controlSaldosService'

export type EstadoPagoCresium = 'pendiente' | 'permitido' | 'rechazado'
export type TipoMovimientoSaldo = 'abono' | 'cargo'

export interface PagoCresiumSaldo {
  id: string
  movimiento_id: string
  empresa: string
  cresium_id: number
  fecha: string | null
  direccion: 'entrada' | 'salida'
  importe: number
  contraparte: string | null
  cuit: string | null
  cuenta_contraparte: string | null
  nota: string | null
  conductor_id: string
  criterio: 'cuit' | 'dni' | 'cbu' | 'asignado'
  tipo: TipoMovimientoSaldo
  semana: number
  anio: number
  estado: EstadoPagoCresium
  motivo_rechazo: string | null
  abono_id: string | null
  revisado_por_nombre: string | null
  revisado_en: string | null
  conductor: { nombres: string | null; apellidos: string | null; numero_dni: string | null } | null
}

export interface UsuarioRevision {
  id: string | null
  nombre: string
}

export const ETIQUETA_EMPRESA: Record<string, string> = {
  '44dreams': '44 Dreams',
  grupocg: 'Grupo CG',
}

export const ETIQUETA_CRITERIO: Record<PagoCresiumSaldo['criterio'], string> = {
  cuit: 'CUIT/CUIL',
  dni: 'DNI',
  cbu: 'CBU',
  asignado: 'Asignado',
}

/**
 * Cómo se ven en Control de Saldos (pendientes y, ya permitidos, en el kardex): Tipo
 * «Transferencia», Referencia «Pago Efectivo», Detalle «Pago por Cresium», Usuario «Proceso
 * Automático». En control_saldos se guardan como 'pago_manual' (abono) o 'cargo', para que
 * Portal, reportes y calificaciones los cuenten igual que cualquier pago.
 */
export const REFERENCIA_CRESIUM = 'Pago Efectivo'
export const DETALLE_CRESIUM = 'Pago por Cresium'
export const USUARIO_CRESIUM = 'Proceso Automático'
export const TIPO_CRESIUM = 'Transferencia'

/** La fila del kardex es un pago de Cresium permitido */
export function esKardexCresium(referencia: string | null | undefined): boolean {
  return (referencia || '').endsWith(` | ${DETALLE_CRESIUM}`)
}

const COLUMNAS = '*, conductor:conductores(nombres, apellidos, numero_dni)'

type FiltroSede = <T>(query: T, campo?: string) => T

/** true si la tabla todavía no existe (falta correr el SQL) */
function faltaTabla(error: unknown): boolean {
  const codigo = (error as { code?: string } | null)?.code
  return codigo === '42P01' || codigo === 'PGRST205'
}

/** Pagos de un estado (los de la sede elegida). null si la tabla todavía no existe. */
export async function listarPagosCresium(
  estado: EstadoPagoCresium,
  aplicarFiltroSede: FiltroSede,
): Promise<PagoCresiumSaldo[] | null> {
   
  let query = aplicarFiltroSede((supabase.from('cresium_pagos_saldos') as any).select(COLUMNAS).eq('estado', estado))
  query = estado === 'pendiente'
    ? query.order('fecha', { ascending: true }).order('cresium_id', { ascending: true })
    : query.order('revisado_en', { ascending: false }).limit(300)
  const { data, error } = await query
  if (error) {
    if (faltaTabla(error)) return null
    throw error
  }
  return ((data || []) as PagoCresiumSaldo[]).map(p => ({ ...p, importe: Number(p.importe) || 0 }))
}

/** Pendientes de un conductor (para el modal Control de Saldos). [] si la tabla todavía no existe. */
export async function listarPendientesConductor(conductorId: string): Promise<PagoCresiumSaldo[]> {
  const { data, error } = await (supabase.from('cresium_pagos_saldos') as any)
    .select(COLUMNAS)
    .eq('conductor_id', conductorId)
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: true })
  if (error) {
    if (faltaTabla(error)) return []
    throw error
  }
  return ((data || []) as PagoCresiumSaldo[]).map(p => ({ ...p, importe: Number(p.importe) || 0 }))
}

/** Cantidad de pendientes de la sede (0 si la tabla todavía no existe). */
export async function contarPagosCresiumPendientes(aplicarFiltroSede: FiltroSede): Promise<number> {
  const { count, error } = await aplicarFiltroSede(
     
    (supabase.from('cresium_pagos_saldos') as any).select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
  )
  if (error) {
    if (faltaTabla(error)) return 0
    throw error
  }
  return count || 0
}

/** Cambia la semana, el tipo o el importe de un pendiente antes de permitirlo. */
export async function editarPagoCresium(
  id: string,
  cambios: Partial<Pick<PagoCresiumSaldo, 'semana' | 'anio' | 'tipo' | 'importe'>>,
): Promise<void> {
   
  const { error } = await (supabase.from('cresium_pagos_saldos') as any)
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
  if (error) throw error
}

/**
 * Abonos/cargos ya cargados en el saldo del conductor con el mismo importe cerca de la
 * fecha del pago (±3 días): puede ser que se haya cargado a mano. Clave = id del pago.
 */
export async function buscarPosiblesDuplicados(pagos: PagoCresiumSaldo[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>()
  const conFecha = pagos.filter(p => p.fecha)
  if (conFecha.length === 0) return resultado
  const ids = [...new Set(conFecha.map(p => p.conductor_id))]
  const desde = conFecha.reduce((min, p) => (p.fecha! < min ? p.fecha! : min), conFecha[0].fecha!)
  const desdeConMargen = new Date(`${desde}T00:00:00-03:00`)
  desdeConMargen.setDate(desdeConMargen.getDate() - 3)
  const abonos: { id: string; conductor_id: string; tipo: string; monto: number; concepto: string; fecha_abono: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
     
    const { data, error } = await (supabase.from('abonos_conductores') as any)
      .select('id, conductor_id, tipo, monto, concepto, fecha_abono')
      .in('conductor_id', ids.slice(i, i + 200))
      .gte('fecha_abono', desdeConMargen.toISOString())
    if (error) throw error
    abonos.push(...(data || []))
  }
  const DIA = 24 * 60 * 60 * 1000
  for (const p of conFecha) {
    const fechaPago = new Date(`${p.fecha}T12:00:00-03:00`).getTime()
    const igual = abonos.find(a =>
      a.conductor_id === p.conductor_id && a.tipo === p.tipo &&
      Math.abs(Number(a.monto) - p.importe) < 0.01 &&
      Math.abs(new Date(a.fecha_abono).getTime() - fechaPago) <= 3 * DIA)
    if (igual) {
      const dia = new Date(igual.fecha_abono).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
      resultado.set(p.id, `Ya hay un ${igual.tipo} igual del ${dia}: «${igual.concepto}»`)
    }
  }
  return resultado
}

/** Fila de saldos_conductores del conductor; si no tiene, la crea en 0. */
async function saldoDelConductor(conductorId: string): Promise<string> {
   
  const { data: existente, error } = await (supabase.from('saldos_conductores') as any)
    .select('id')
    .eq('conductor_id', conductorId)
    .maybeSingle()
  if (error) throw error
  if (existente) return existente.id

   
  const { data: conductor, error: errorConductor } = await (supabase.from('conductores') as any)
    .select('nombres, apellidos, numero_dni, numero_cuit, sede_id')
    .eq('id', conductorId)
    .single()
  if (errorConductor) throw errorConductor
  const ahora = new Date().toISOString()
   
  const { data: nuevo, error: errorInsert } = await (supabase.from('saldos_conductores') as any)
    .insert({
      conductor_id: conductorId,
      conductor_nombre: `${conductor.nombres || ''} ${conductor.apellidos || ''}`.trim(),
      conductor_dni: conductor.numero_dni,
      conductor_cuit: conductor.numero_cuit,
      saldo_actual: 0,
      dias_mora: 0,
      monto_mora_acumulada: 0,
      fecha_referencia: ahora,
      ultima_actualizacion: ahora,
      ...(conductor.sede_id ? { sede_id: conductor.sede_id } : {}),
    })
    .select('id')
    .single()
  if (errorInsert) throw errorInsert
  return nuevo.id
}

/**
 * Permite un pago: lo registra en el saldo como abono (suma) o cargo (resta) en la semana
 * elegida. Primero lo marca como permitido (si otro usuario ya lo revisó, no hace nada);
 * si no se puede registrar en el saldo, vuelve a pendiente. Devuelve el saldo resultante.
 */
export async function permitirPagoCresium(pago: PagoCresiumSaldo, usuario: UsuarioRevision): Promise<number> {
  const ahora = new Date().toISOString()
   
  const tabla = () => supabase.from('cresium_pagos_saldos') as any
  const { data: tomado, error: errorTomar } = await tabla()
    .update({ estado: 'permitido', revisado_por: usuario.id, revisado_por_nombre: usuario.nombre, revisado_en: ahora, updated_at: ahora })
    .eq('id', pago.id)
    .eq('estado', 'pendiente')
    .select('id')
  if (errorTomar) throw errorTomar
  if (!tomado || tomado.length === 0) throw new Error('Este pago ya fue revisado por otro usuario.')

  const volverAPendiente = () => tabla()
    .update({ estado: 'pendiente', revisado_por: null, revisado_por_nombre: null, revisado_en: null, updated_at: new Date().toISOString() })
    .eq('id', pago.id)

  const empresa = ETIQUETA_EMPRESA[pago.empresa] || pago.empresa
  const referencia = [DETALLE_CRESIUM, `${empresa} #${pago.cresium_id}`, pago.fecha, pago.contraparte, `permitido por ${usuario.nombre}`]
    .filter(Boolean).join(' · ').slice(0, 255)

  let abonoId: string | null = null
  let saldoAplicado = false
  try {
    const saldoId = await saldoDelConductor(pago.conductor_id)
     
    const { data: abono, error: errorAbono } = await (supabase.from('abonos_conductores') as any)
      .insert({
        conductor_id: pago.conductor_id,
        tipo: pago.tipo,
        monto: pago.importe,
        concepto: REFERENCIA_CRESIUM,
        referencia,
        semana: pago.semana,
        anio: pago.anio,
        fecha_abono: pago.fecha ? new Date(`${pago.fecha}T12:00:00-03:00`).toISOString() : ahora,
        created_by_name: `${USUARIO_CRESIUM} (permitido por ${usuario.nombre})`.slice(0, 255),
      })
      .select('id')
      .single()
    if (errorAbono) throw errorAbono
    abonoId = abono.id

    const delta = pago.tipo === 'abono' ? pago.importe : -pago.importe
    const nuevoSaldo = await aplicarMovimientoSaldo({
      saldoId,
      delta,
      camposExtra: (saldo) => (saldo >= 0 ? { dias_mora: 0 } : {}),
    })
    saldoAplicado = true

    const { error: errorVinculo } = await tabla().update({ abono_id: abonoId }).eq('id', pago.id)
    if (errorVinculo) console.error('No se pudo vincular el abono al pago de Cresium:', errorVinculo)

    await insertControlSaldo({
      conductorId: pago.conductor_id,
      semana: pago.semana,
      anio: pago.anio,
      tipoMovimiento: pago.tipo === 'abono' ? 'pago_manual' : 'cargo',
      montoMovimiento: pago.importe,
      saldoPendiente: nuevoSaldo,
      referencia: `${REFERENCIA_CRESIUM} | ${DETALLE_CRESIUM}`,
      userName: USUARIO_CRESIUM,
    })
    return nuevoSaldo
  } catch (error) {
    // Si el saldo no llegó a cambiar, se deshace todo y queda pendiente para reintentar
    if (!saldoAplicado) {
      if (abonoId) {
         
        await (supabase.from('abonos_conductores') as any).delete().eq('id', abonoId)
      }
      await volverAPendiente()
    }
    throw error
  }
}

/** Rechaza un pago pendiente: no se registra en el saldo. */
export async function rechazarPagoCresium(id: string, motivo: string | null, usuario: UsuarioRevision): Promise<void> {
  const ahora = new Date().toISOString()
   
  const { data, error } = await (supabase.from('cresium_pagos_saldos') as any)
    .update({
      estado: 'rechazado', motivo_rechazo: motivo, revisado_por: usuario.id,
      revisado_por_nombre: usuario.nombre, revisado_en: ahora, updated_at: ahora,
    })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Este pago ya fue revisado por otro usuario.')
}
