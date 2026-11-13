// src/modules/facturacion/utils/pagosB1.ts
// Pagos diarios de la promoción de licencia B1 (PRM02), regla 2026-11-13.
//
// El conductor con B1 paga $15.000 por día, todos los días, desde su primer día de turno
// hasta que obtiene la D1. Los pagos salen de:
//   · Cresium (44 Dreams y Grupo CG), SOLOS: depósitos cuyo CUIT/CUIL de origen es el del
//     conductor, o tiene su DNI adentro (dígitos 3 a 10 del CUIL);
//   · registros de promocion_b1_pagos cargados desde Facturación > Licencia B1:
//       'cresium'  → depósito elegido a mano (lo envió un tercero),
//       'manual'   → pago cargado a mano,
//       'excluido' → depósito tomado solo que no es de la promoción.
//
// Días cubiertos: se suma todo lo pagado y se reparte de a $15.000 por día en orden desde
// el primer día (dos depósitos de $10.000 y $5.000 = 1 día; uno de $30.000 = 2 días).
// Saldo a favor de la semana = lo pagado con fecha en esa semana.
//
// Estos pagos restan en la facturación de la semana como línea de la promoción. En Saldos
// se muestran como informativos (licenciaB1Service): no se guardan en el kardex ni cambian
// el saldo, para no contarlos dos veces.

import { supabase } from '../../../lib/supabase'
import { hoyART } from '../../../utils/fechaArgentina'

export const PROMO_B1_PAGO_DIARIO = 15000

export const ETIQUETA_EMPRESA_CRESIUM: Record<string, string> = {
  '44dreams': '44 Dreams',
  grupocg: 'Grupo CG',
}

export type OrigenPagoB1 = 'auto' | 'cresium' | 'manual'

export interface PagoB1 {
  /** Clave única: movimiento de Cresium (auto) o registro de promocion_b1_pagos. */
  key: string
  origen: OrigenPagoB1
  fecha: string
  monto: number
  /** Quién envió / pagó. */
  pagador: string | null
  cuit: string | null
  /** '44dreams' | 'grupocg' cuando viene de Cresium. */
  empresa: string | null
  nota: string | null
  movimientoId: string | null
  registroId: string | null
  cargadoPor: string | null
  cargadoEn: string | null
  editadoPor: string | null
  editadoEn: string | null
  /** Fecha real del depósito en Cresium (puede diferir del día al que se imputó). */
  fechaDeposito: string | null
}

/** Datos del conductor para cruzar con Cresium y período en que paga por día. */
export interface ConductorPagoB1 {
  id: string
  dni: string | null
  cuit: string | null
  /** Primer y último día que se toman depósitos solos (inclusive). */
  desde: string
  hasta: string
}

export interface MovimientoCresium {
  id: string
  empresa: string
  fecha: string
  contraparte: string | null
  cuit: string | null
  importe: number
}

export type EstadoDiaB1 = 'pagado' | 'atrasado' | 'parcial' | 'no_pago' | 'adelantado' | 'proximo' | 'en_curso'

export interface DiaB1 {
  fecha: string
  /** Pagos con fecha de ese día. */
  pagos: PagoB1[]
  /** Parte de los $15.000 del día que quedó cubierta con lo pagado. */
  cubierto: number
  /** Fecha del pago que terminó de cubrir el día. */
  cubiertoEl: string | null
  estado: EstadoDiaB1
}

export interface ResumenB1 {
  dias: DiaB1[]
  /** Días cerrados (hasta ayer): los que ya tenía que pagar. Hoy no cuenta hasta que termina. */
  diasVencidos: number
  diasPagados: number
  totalPagado: number
  /** Lo que debía por los días cerrados menos lo pagado (0 si está al día). */
  deuda: number
  /** Pagado de más sobre lo vencido (días adelantados). */
  adelantado: number
}

const LOTE = 1000

function soloDigitos(valor: string | null | undefined): string {
  return String(valor || '').replace(/\D/g, '')
}

/** DNI que está dentro de un CUIT/CUIL de 11 dígitos. */
function dniDeCuit(cuit: string): string | null {
  const d = soloDigitos(cuit)
  return d.length === 11 ? String(Number(d.slice(2, 10))) : null
}

function errorTabla(error: { code?: string; message: string }): Error {
  const faltaSql = error.code === '42P01' || error.code === '42703'
  return new Error(faltaSql
    ? 'Falta crear la tabla de pagos B1: correr sql/promocion_licencia_b1.sql en Supabase.'
    : error.message)
}

/** Depósitos acreditados de Cresium entre dos fechas (inclusive). */
async function depositosCresium(desde: string, hasta: string): Promise<MovimientoCresium[]> {
  const filas: MovimientoCresium[] = []
  for (let desdeFila = 0; ; desdeFila += LOTE) {
    const { data, error } = await (supabase.from('cresium_movimientos') as any)
      .select('id, empresa, fecha, contraparte, cuit, importe')
      .eq('tipo', 'DEPOSIT').eq('estado', 'SUCCESS').eq('direccion', 'entrada')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('id')
      .range(desdeFila, desdeFila + LOTE - 1)
    if (error) throw new Error(`No se pudieron leer los depósitos de Cresium: ${error.message}`)
    filas.push(...((data || []) as any[]).map(m => ({ ...m, importe: Number(m.importe) || 0 })))
    if (!data || data.length < LOTE) break
  }
  return filas
}

function pagoDeMovimiento(m: MovimientoCresium, origen: OrigenPagoB1, registro?: any): PagoB1 {
  return {
    key: registro ? `reg-${registro.id}` : `mov-${m.id}`,
    origen,
    fecha: registro?.fecha || m.fecha,
    monto: m.importe,
    pagador: m.contraparte,
    cuit: m.cuit,
    empresa: m.empresa,
    nota: registro?.nota || null,
    movimientoId: m.id,
    registroId: registro?.id || null,
    cargadoPor: registro?.created_by_name || null,
    cargadoEn: registro?.created_at || null,
    editadoPor: registro?.editado_by_name || null,
    editadoEn: registro?.editado_at || null,
    fechaDeposito: m.fecha,
  }
}

/**
 * Pagos de cada conductor con fecha entre `rango.desde` y `rango.hasta`: depósitos de Cresium
 * que coinciden por CUIT/DNI dentro de su período, más los registros cargados a mano.
 */
export async function cargarPagosB1(
  conductores: ConductorPagoB1[],
  rango: { desde: string; hasta: string },
): Promise<Map<string, PagoB1[]>> {
  const resultado = new Map<string, PagoB1[]>()
  if (conductores.length === 0 || rango.desde > rango.hasta) return resultado
  const ids = conductores.map(c => c.id)

  // Registros a mano (no anulados)
  const registros: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase.from('promocion_b1_pagos') as any)
      .select('*')
      .in('conductor_id', ids.slice(i, i + 200))
      .is('anulado_at', null)
    if (error) throw errorTabla(error)
    registros.push(...(data || []))
  }
  // Depósitos asignados a mano a CUALQUIER conductor: no se toman solos para otro
  const asignados = new Set<string>()
  {
    const { data, error } = await (supabase.from('promocion_b1_pagos') as any)
      .select('cresium_movimiento_id')
      .eq('origen', 'cresium')
      .is('anulado_at', null)
    if (error) throw errorTabla(error)
    for (const r of (data || []) as any[]) asignados.add(r.cresium_movimiento_id)
  }

  // Depósitos de Cresium del rango (los asignados a mano se buscan por id: pueden ser de otra fecha)
  const desdeAuto = conductores.reduce((min, c) => (c.desde < min ? c.desde : min), rango.hasta)
  const depositos = await depositosCresium(desdeAuto < rango.desde ? rango.desde : desdeAuto, rango.hasta)
  const movPorId = new Map(depositos.map(m => [m.id, m]))
  const faltan = registros.filter(r => r.origen === 'cresium' && !movPorId.has(r.cresium_movimiento_id)).map(r => r.cresium_movimiento_id)
  for (let i = 0; i < faltan.length; i += 200) {
    const { data, error } = await (supabase.from('cresium_movimientos') as any)
      .select('id, empresa, fecha, contraparte, cuit, importe')
      .in('id', faltan.slice(i, i + 200))
    if (error) throw new Error(`No se pudieron leer los depósitos de Cresium: ${error.message}`)
    for (const m of (data || []) as any[]) movPorId.set(m.id, { ...m, importe: Number(m.importe) || 0 })
  }

  // Índices para el cruce automático
  const porCuit = new Map<string, ConductorPagoB1>()
  const porDni = new Map<string, ConductorPagoB1>()
  for (const c of conductores) {
    const cuit = soloDigitos(c.cuit)
    if (cuit.length === 11) porCuit.set(cuit, c)
    const dni = soloDigitos(c.dni)
    if (dni) porDni.set(String(Number(dni)), c)
  }
  const excluidos = new Set(registros.filter(r => r.origen === 'excluido').map(r => `${r.conductor_id}|${r.cresium_movimiento_id}`))

  const agregar = (conductorId: string, pago: PagoB1) => {
    if (pago.fecha < rango.desde || pago.fecha > rango.hasta) return
    const lista = resultado.get(conductorId) || []
    lista.push(pago)
    resultado.set(conductorId, lista)
  }

  for (const m of depositos) {
    if (asignados.has(m.id) || !m.cuit) continue
    const cuit = soloDigitos(m.cuit)
    const dni = dniDeCuit(cuit)
    const c = porCuit.get(cuit) || (dni ? porDni.get(dni) : undefined)
    if (!c || m.fecha < c.desde || m.fecha > c.hasta) continue
    if (excluidos.has(`${c.id}|${m.id}`)) continue
    agregar(c.id, pagoDeMovimiento(m, 'auto'))
  }

  for (const r of registros) {
    if (r.origen === 'cresium') {
      const m = movPorId.get(r.cresium_movimiento_id)
      if (m) agregar(r.conductor_id, pagoDeMovimiento(m, 'cresium', r))
    } else if (r.origen === 'manual') {
      agregar(r.conductor_id, {
        key: `reg-${r.id}`, origen: 'manual', fecha: r.fecha, monto: Number(r.monto) || 0,
        pagador: r.pagador, cuit: r.cuit, empresa: null, nota: r.nota,
        movimientoId: null, registroId: r.id, cargadoPor: r.created_by_name, cargadoEn: r.created_at,
        editadoPor: r.editado_by_name || null, editadoEn: r.editado_at || null, fechaDeposito: null,
      })
    }
  }

  for (const lista of resultado.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.key.localeCompare(b.key))
  return resultado
}

/**
 * Reparte lo pagado de a $15.000 por día en orden desde el primer día. `dias` son los días
 * que le toca pagar (ordenados). Solo los días cerrados (hasta ayer) pueden quedar como deuda:
 * hoy sale "en curso" mientras no lo cubra, y los días que vienen "próximo" / "adelantado".
 */
export function repartirPagosB1(dias: string[], pagos: PagoB1[], hoy = hoyART()): ResumenB1 {
  const ordenados = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.key.localeCompare(b.key))
  const totalPagado = Math.round(ordenados.reduce((s, p) => s + p.monto, 0) * 100) / 100
  const pagosPorDia = new Map<string, PagoB1[]>()
  for (const p of ordenados) pagosPorDia.set(p.fecha, [...(pagosPorDia.get(p.fecha) || []), p])

  // Fecha en que el acumulado pagado alcanzó cada monto
  let idxPago = 0
  let acumulado = 0
  const fechaQueAlcanza = (objetivo: number): string | null => {
    while (acumulado < objetivo - 0.005 && idxPago < ordenados.length) acumulado += ordenados[idxPago++].monto
    return acumulado >= objetivo - 0.005 ? ordenados[idxPago - 1]?.fecha ?? null : null
  }

  const resultadoDias: DiaB1[] = dias.map((fecha, i) => {
    const necesario = (i + 1) * PROMO_B1_PAGO_DIARIO
    const cubierto = Math.max(0, Math.min(PROMO_B1_PAGO_DIARIO, totalPagado - i * PROMO_B1_PAGO_DIARIO))
    const cubiertoEl = cubierto >= PROMO_B1_PAGO_DIARIO - 0.005 ? fechaQueAlcanza(necesario) : null
    let estado: EstadoDiaB1
    if (fecha > hoy) estado = cubiertoEl ? 'adelantado' : 'proximo'
    else if (fecha === hoy) estado = cubiertoEl ? 'pagado' : 'en_curso'
    else if (cubiertoEl) estado = cubiertoEl > fecha ? 'atrasado' : 'pagado'
    else estado = cubierto > 0 ? 'parcial' : 'no_pago'
    return { fecha, pagos: pagosPorDia.get(fecha) || [], cubierto, cubiertoEl, estado }
  })

  // Hoy todavía no terminó: no cuenta como día adeudado
  const diasVencidos = dias.filter(d => d < hoy).length
  const debido = diasVencidos * PROMO_B1_PAGO_DIARIO
  return {
    dias: resultadoDias,
    diasVencidos,
    diasPagados: resultadoDias.filter(d => d.fecha < hoy && d.cubiertoEl).length,
    totalPagado,
    deuda: Math.max(0, Math.round((debido - totalPagado) * 100) / 100),
    adelantado: Math.max(0, Math.round((totalPagado - debido) * 100) / 100),
  }
}

/** Depósito de Cresium encontrado por CUIT/CUIL, con a quién está asignado (si lo está). */
export interface DepositoBuscado extends MovimientoCresium {
  asignadoA: string | null
}

/**
 * Busca depósitos de Cresium cuyo CUIT/CUIL contiene los dígitos escritos, con fecha (día
 * en Argentina) entre `rango.desde` y `rango.hasta` inclusive.
 */
export async function buscarDepositosCresium(
  texto: string,
  rango: { desde: string; hasta: string },
): Promise<DepositoBuscado[]> {
  const digitos = soloDigitos(texto)
  if (digitos.length < 5) return []
  const { data, error } = await (supabase.from('cresium_movimientos') as any)
    .select('id, empresa, fecha, contraparte, cuit, importe')
    .eq('tipo', 'DEPOSIT').eq('estado', 'SUCCESS').eq('direccion', 'entrada')
    .ilike('cuit', `%${digitos}%`)
    .gte('fecha', rango.desde).lte('fecha', rango.hasta)
    .order('fecha', { ascending: false })
    .limit(100)
  if (error) throw new Error(`No se pudo buscar en Cresium: ${error.message}`)
  const movs = ((data || []) as any[]).map(m => ({ ...m, importe: Number(m.importe) || 0 })) as MovimientoCresium[]
  if (movs.length === 0) return []
  const { data: regs, error: errRegs } = await (supabase.from('promocion_b1_pagos') as any)
    .select('cresium_movimiento_id, conductores(nombres, apellidos)')
    .eq('origen', 'cresium').is('anulado_at', null)
    .in('cresium_movimiento_id', movs.map(m => m.id))
  if (errRegs) throw errorTabla(errRegs)
  const asignado = new Map<string, string>()
  for (const r of (regs || []) as any[]) {
    asignado.set(r.cresium_movimiento_id, `${r.conductores?.nombres || ''} ${r.conductores?.apellidos || ''}`.trim() || 'otro conductor')
  }
  return movs.map(m => ({ ...m, asignadoA: asignado.get(m.id) || null }))
}

interface Usuario { id: string | null; nombre: string | null }

export async function agregarPagoManualB1(
  conductorId: string,
  datos: { fecha: string; monto: number; pagador: string; cuit: string; nota: string },
  usuario: Usuario,
): Promise<void> {
  const { error } = await (supabase.from('promocion_b1_pagos') as any).insert({
    conductor_id: conductorId, origen: 'manual', fecha: datos.fecha, monto: datos.monto,
    pagador: datos.pagador.trim() || null, cuit: soloDigitos(datos.cuit) || null, nota: datos.nota.trim() || null,
    created_by: usuario.id, created_by_name: usuario.nombre,
  })
  if (error) throw errorTabla(error)
}

export async function asignarDepositoCresiumB1(
  conductorId: string,
  movimiento: MovimientoCresium,
  datos: { fecha: string; nota: string },
  usuario: Usuario,
): Promise<void> {
  const { error } = await (supabase.from('promocion_b1_pagos') as any).insert({
    conductor_id: conductorId, origen: 'cresium', fecha: datos.fecha, monto: movimiento.importe,
    cresium_movimiento_id: movimiento.id, pagador: movimiento.contraparte, cuit: movimiento.cuit,
    nota: datos.nota.trim() || null, created_by: usuario.id, created_by_name: usuario.nombre,
  })
  if (error) {
    if (error.code === '23505') throw new Error('Ese depósito ya está asignado a otro conductor.')
    throw errorTabla(error)
  }
}

/**
 * Edita un pago. Manual: día, monto, quién pagó, CUIT y nota. De Cresium: el día al que se
 * imputa y la nota (el monto y quién envió son los del depósito). Un depósito tomado solo
 * no tiene registro: editarlo lo deja asignado a mano a este conductor con esos datos.
 */
export async function editarPagoB1(
  conductorId: string,
  pago: PagoB1,
  datos: { fecha: string; monto: number; pagador: string; cuit: string; nota: string },
  usuario: Usuario,
): Promise<void> {
  const edicion = { editado_at: new Date().toISOString(), editado_by: usuario.id, editado_by_name: usuario.nombre }
  if (pago.origen === 'auto') {
    if (!pago.movimientoId) return
    const { error } = await (supabase.from('promocion_b1_pagos') as any).insert({
      conductor_id: conductorId, origen: 'cresium', fecha: datos.fecha, monto: pago.monto,
      cresium_movimiento_id: pago.movimientoId, pagador: pago.pagador, cuit: pago.cuit,
      nota: datos.nota.trim() || null, created_by: usuario.id, created_by_name: usuario.nombre, ...edicion,
    })
    if (error) {
      if (error.code === '23505') throw new Error('Ese depósito ya está asignado a otro conductor.')
      throw errorTabla(error)
    }
    return
  }
  if (!pago.registroId) return
  const cambios = pago.origen === 'manual'
    ? {
      fecha: datos.fecha, monto: datos.monto, pagador: datos.pagador.trim() || null,
      cuit: soloDigitos(datos.cuit) || null, nota: datos.nota.trim() || null, ...edicion,
    }
    : { fecha: datos.fecha, nota: datos.nota.trim() || null, ...edicion }
  const { error } = await (supabase.from('promocion_b1_pagos') as any).update(cambios).eq('id', pago.registroId)
  if (error) throw errorTabla(error)
}

/**
 * Quita un pago: anula el registro cargado a mano, o excluye el depósito que se había
 * tomado solo de Cresium.
 */
export async function quitarPagoB1(conductorId: string, pago: PagoB1, usuario: Usuario): Promise<void> {
  if (pago.registroId) {
    const { error } = await (supabase.from('promocion_b1_pagos') as any)
      .update({ anulado_at: new Date().toISOString(), anulado_by: usuario.id, anulado_by_name: usuario.nombre })
      .eq('id', pago.registroId)
    if (error) throw errorTabla(error)
    return
  }
  if (!pago.movimientoId) return
  const { error } = await (supabase.from('promocion_b1_pagos') as any).insert({
    conductor_id: conductorId, origen: 'excluido', fecha: pago.fecha, monto: pago.monto,
    cresium_movimiento_id: pago.movimientoId, pagador: pago.pagador, cuit: pago.cuit,
    created_by: usuario.id, created_by_name: usuario.nombre,
  })
  if (error && error.code !== '23505') throw errorTabla(error)
}
