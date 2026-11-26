// src/modules/facturacion/utils/licenciaB1Service.ts
// Conductores de la promoción de licencia B1 (PRM02) con sus pagos diarios (adelantos de su
// facturación semanal: lo que no adelanta se cobra igual al facturar). Lo usan
// Facturación > Licencia B1 (gestión de los pagos) y Facturación > Saldos (los muestra como
// informativos: ya restan en la facturación de la semana, no cambian el saldo).

import { supabase } from '../../../lib/supabase'
import { hoyART, sumarDiasISO } from '../../../utils/fechaArgentina'
import { PROMO_CYBER_LICENCIA_B1 } from '../../promociones/catalogoPromociones'
import { cargarIngresosConductores, periodoPagoB1 } from './promocionesFacturacion'
import { cargarPagosB1, lunesSemanaB1, repartirPagosB1 } from './pagosB1'
import type { PagoB1, ResumenB1 } from './pagosB1'

export interface PromoB1 {
  codigo: string
  nombre: string
  activa: boolean
  fecha_inicio: string
  fecha_fin: string
}

export interface FilaB1 {
  id: string
  nombre: string
  dni: string | null
  cuit: string | null
  categoria: string | null
  categoriaOtra: string | null
  /** Estado del conductor (ACTIVO, BAJA...). */
  estado: string | null
  /** Dado de baja: paga por día solo hasta la fecha de baja. */
  esBaja: boolean
  fechaBaja: string | null
  motivoBaja: string | null
  ingreso: string
  esReingreso: boolean
  /** Último día que paga por día (día antes de la D1, fecha de baja o fin de la promoción). */
  pagaHasta: string
  /** Por qué termina ahí. */
  motivoHasta: 'd1' | 'baja' | 'fin'
  fechaD1: string | null
  pagos: PagoB1[]
  resumen: ResumenB1
}

/** Lunes (yyyy-MM-dd) de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  return lunesSemanaB1(fecha)
}

/**
 * Dado de baja: paga por día solo hasta la fecha de baja (corta `periodo.hasta`).
 * `c` es la fila de conductores con conductores_estados(codigo) y fecha_terminacion.
 */
function cortarEnBaja(c: any, periodo: { desde: string; hasta: string }) {
  const esBaja = c?.conductores_estados?.codigo === 'BAJA'
  const fechaBaja: string | null = c?.fecha_terminacion ? String(c.fecha_terminacion).slice(0, 10) : null
  const cortadoPorBaja = !!(esBaja && fechaBaja && fechaBaja < periodo.hasta)
  if (cortadoPorBaja) periodo.hasta = fechaBaja! < periodo.desde ? periodo.desde : fechaBaja!
  return { esBaja, fechaBaja, cortadoPorBaja }
}

/**
 * ¿Hoy el conductor está dentro de sus fechas de la promoción B1 (desde su ingreso hasta la
 * D1, la baja o el fin de la promoción)? Lo usa Saldos > Registrar Pago para mostrar el
 * tilde "Es pago diario de Licencia B1".
 */
export async function enPromocionB1Hoy(conductorId: string): Promise<boolean> {
  const { data: p, error: errPromo } = await (supabase.from('promociones') as any)
    .select('fecha_inicio, fecha_fin')
    .eq('clave', PROMO_CYBER_LICENCIA_B1)
    .maybeSingle()
  if (errPromo) throw new Error(`No se pudo leer la habilitación B1: ${errPromo.message}`)
  if (!p?.fecha_inicio || !p?.fecha_fin) return false
  const { data: c, error: errC } = await (supabase.from('conductores') as any)
    .select('id, categoria_licencia, fecha_licencia_b1, fecha_licencia_d1, fecha_terminacion, conductores_estados(codigo)')
    .eq('id', conductorId)
    .maybeSingle()
  if (errC) throw new Error(`No se pudo leer el conductor: ${errC.message}`)
  if (!c || !(c.categoria_licencia === 'B1' || (c.fecha_licencia_b1 && c.fecha_licencia_d1))) return false
  const hoy = hoyART()
  const datos = (await cargarIngresosConductores([conductorId], hoy)).get(conductorId)
  const periodo = datos ? periodoPagoB1(p, datos) : null
  if (!periodo) return false
  cortarEnBaja(c, periodo)
  return hoy >= periodo.desde && hoy <= periodo.hasta
}

/**
 * Promoción PRM02 y los conductores que entran, con sus pagos y el reparto por día.
 * `aplicarFiltroSede` es el de useSede (filtra los conductores por la sede elegida).
 * Lanza error si la promoción no tiene período cargado.
 */
export async function cargarConductoresLicenciaB1(
  aplicarFiltroSede: <T>(query: T, campo?: string) => T,
): Promise<{ promo: PromoB1; filas: FilaB1[] }> {
  const { data: p, error: errPromo } = await (supabase.from('promociones') as any)
    .select('codigo, nombre, activa, fecha_inicio, fecha_fin')
    .eq('clave', PROMO_CYBER_LICENCIA_B1)
    .maybeSingle()
  if (errPromo) throw new Error(`No se pudo leer la habilitación B1: ${errPromo.message}`)
  if (!p?.fecha_inicio || !p?.fecha_fin) {
    throw new Error('La habilitación licencia B1 no tiene período cargado (Parámetros > Promociones).')
  }

  const hoy = hoyART()
  // Hasta el domingo de esta semana (los días que vienen se ven como "próximo")
  const finSemana = sumarDiasISO(lunesDe(hoy), 6)
  const hasta = finSemana < p.fecha_fin ? finSemana : p.fecha_fin

  // Candidatos: B1 hoy, o tenían B1 y ya obtuvieron la D1
  const { data: conductores, error: errCond } = await aplicarFiltroSede(
    (supabase.from('conductores') as any)
      .select('id, nombres, apellidos, numero_dni, numero_cuit, cbu, categoria_licencia, categoria_licencia_otra, fecha_licencia_d1, fecha_terminacion, motivo_baja, conductores_estados(codigo)')
      .or('categoria_licencia.eq.B1,and(fecha_licencia_b1.not.is.null,fecha_licencia_d1.not.is.null)'),
  )
  if (errCond) throw new Error(`No se pudieron leer los conductores: ${errCond.message}`)
  const porId = new Map(((conductores || []) as any[]).map(c => [c.id, c]))
  const datos = await cargarIngresosConductores([...porId.keys()], hasta)

  const elegibles: Array<{
    c: any
    ingreso: { fecha: string; esReingreso: boolean }
    periodo: { desde: string; hasta: string }
    /** Hasta dónde se toman solos los depósitos (sin cortar en la baja, como en la facturación). */
    hastaAuto: string
    motivoHasta: FilaB1['motivoHasta']
    esBaja: boolean
    fechaBaja: string | null
    dias: string[]
  }> = []
  for (const [id, d] of datos) {
    const periodo = periodoPagoB1(p, d)
    if (!periodo) continue
    const c = porId.get(id)
    const hastaAuto = periodo.hasta
    const { esBaja, fechaBaja, cortadoPorBaja } = cortarEnBaja(c, periodo)
    const motivoHasta: FilaB1['motivoHasta'] = cortadoPorBaja ? 'baja' : periodo.hasta < p.fecha_fin ? 'd1' : 'fin'
    // Todos los días con turno desde el primero, mientras maneja con B1
    const dias = d.dias.filter(dia => dia >= periodo.desde && dia <= periodo.hasta)
    elegibles.push({ c, ingreso: d.ingreso, periodo, hastaAuto, motivoHasta, esBaja, fechaBaja, dias })
  }

  const conductoresPago = elegibles.map(e => ({ id: e.c.id, dni: e.c.numero_dni, cuit: e.c.numero_cuit, cbu: e.c.cbu, desde: e.periodo.desde, hasta: e.hastaAuto }))
  const rangoPago = { desde: p.fecha_inicio, hasta: p.fecha_fin }
  // Los depósitos de Cresium los carga en el saldo el servidor (server-cresium-pagos.js)
  const pagos = await cargarPagosB1(conductoresPago, rangoPago)

  const filas = elegibles.map(e => {
    const pagosConductor = pagos.get(e.c.id) || []
    return {
      id: e.c.id,
      nombre: `${e.c.nombres || ''} ${e.c.apellidos || ''}`.trim(),
      dni: e.c.numero_dni,
      cuit: e.c.numero_cuit,
      categoria: e.c.categoria_licencia,
      categoriaOtra: e.c.categoria_licencia_otra,
      estado: e.c.conductores_estados?.codigo || null,
      esBaja: e.esBaja,
      fechaBaja: e.fechaBaja,
      motivoBaja: e.c.motivo_baja || null,
      ingreso: e.ingreso.fecha,
      esReingreso: e.ingreso.esReingreso,
      pagaHasta: e.periodo.hasta,
      motivoHasta: e.motivoHasta,
      fechaD1: e.c.fecha_licencia_d1,
      pagos: pagosConductor,
      resumen: repartirPagosB1(e.dias, pagosConductor, hoy),
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { promo: p, filas }
}

/** Tipo de pago para mostrar en Saldos: manual o transferencia (todo lo que viene de Cresium). */
export function tipoPagoSaldos(p: PagoB1): 'Pago Manual' | 'Pago por Transferencia Bancaria' {
  return p.origen === 'manual' ? 'Pago Manual' : 'Pago por Transferencia Bancaria'
}
