// src/modules/facturacion/utils/transferenciasCresium.ts
// Registrar Pago (Saldos) con una transferencia de Cresium que el cruce automático no puede
// atribuir sola: la hizo un familiar o amigo del conductor (otro CUIT, otra cuenta).
//
// Se busca la transferencia por CUIT/CUIL, DNI, CBU/CVU o nombre de quien la hizo (últimos
// DIAS_BUSQUEDA días) y se carga en el saldo del conductor igual que lo hace el servidor
// (server-cresium-pagos.js): "Transferencia bancaria" o "Transferencia bancaria - B1", con la
// fecha y el monto de la transferencia, en su semana (o en la actual si esa ya cerró).
// La transferencia queda marcada en cresium_movimientos.pago_* para que no se use dos veces.
//
// Opcional: recordar que esa persona paga por el conductor (cresium_pagadores_conductor), así
// sus próximas transferencias entran solas.

import { supabase } from '../../../lib/supabase'
import { aplicarMovimientoSaldo } from '../../../services/controlSaldosService'
import { hoyART, sumarDiasISO } from '../../../utils/fechaArgentina'
import { semanaISO } from '../../../utils/semanaISO'
import {
  asignarPagador, cruzar, esCuitEmpresa, indexarConductores, nombreConductor, nombreParaBuscar,
  obtenerConductores, obtenerPagadores, soloDigitos, tipoDeConsulta,
  type MovimientoCruce,
} from '../../administracion/cresium-conductores/cruceCresium'
import { PROMO_CYBER_LICENCIA_B1 } from '../../promociones/catalogoPromociones'
import { idSaldoConductor, semanaCerrada } from './pagosB1'
import { cargarIngresosConductores, periodoPagoB1 } from './promocionesFacturacion'

export const DIAS_BUSQUEDA = 7
/** Desde acá el servidor carga solo las transferencias (server-cresium-pagos.js) */
const DESDE_AUTOMATICO = '2026-11-26T15:00:00Z'
export const CONCEPTO_TRANSFERENCIA = 'Transferencia bancaria'
export const CONCEPTO_TRANSFERENCIA_B1 = 'Transferencia bancaria - B1'

export interface TransferenciaCresium {
  id: string
  empresa: string
  cresium_id: number
  fecha: string
  procesado_en: string | null
  contraparte: string | null
  cuit: string | null
  cuenta_contraparte: string | null
  banco_contraparte: string | null
  importe: number
  /** Ya cargada en el saldo de alguien (nombre), o null */
  cargadaA: string | null
  /** Se cruza sola con un conductor (nombre) */
  correspondeA: string | null
  /** Anterior al 26/11 12:00: el servidor no la carga (en esa época se cargaban a mano) */
  anteriorAlAutomatico: boolean
}

const COLUMNAS = 'id, empresa, cresium_id, fecha, procesado_en, contraparte, cuit, cuenta_contraparte, banco_contraparte, importe, nota, direccion, tipo, pago_cargado_en, pago_omitido, pago_conductor_id'

/**
 * Transferencias recibidas de los últimos días que coinciden con lo buscado, de la sede de la
 * pantalla (filtrarSede = aplicarFiltroSede: Buenos Aires o Pruebas).
 */
export async function buscarTransferencias(
  texto: string,
  filtrarSede?: <Q>(query: Q) => Q,
): Promise<TransferenciaCresium[]> {
  const tipo = tipoDeConsulta(texto)
  if (!tipo) throw new Error('Escribí un CUIT/CUIL (11 números), un DNI (7 u 8), un CBU/CVU (22) o un nombre (3 letras o más)')
  const desde = sumarDiasISO(hoyART(), -DIAS_BUSQUEDA)
  const digitos = soloDigitos(texto)

  const consultar = (conSede: boolean) => {
    let q = (supabase.from('cresium_movimientos') as any)
      .select(COLUMNAS)
      .eq('direccion', 'entrada').eq('tipo', 'DEPOSIT').eq('estado', 'SUCCESS')
      .gte('fecha', desde)
    if (conSede && filtrarSede) q = filtrarSede(q)
    if (tipo === 'nombre') q = q.ilike('contraparte', `%${nombreParaBuscar(texto).replace(/ /g, '%')}%`)
    if (tipo === 'cbu') q = q.eq('cuenta_contraparte', digitos)
    if (tipo === 'cuit') q = q.or(`cuit.eq.${digitos},cuit.like.__${digitos.slice(2, 10)}_`)
    if (tipo === 'dni') q = q.like('cuit', `__${digitos.padStart(8, '0')}_`)
    return q.order('procesado_en', { ascending: false }).limit(50)
  }
  let { data, error } = await consultar(true)
  // Sin la columna sede_id (falta sql/cresium_movimientos_sede.sql): sin filtro de sede
  if (error?.code === '42703') ({ data, error } = await consultar(false))
  if (error) throw new Error(`No se pudo buscar en Cresium: ${error.message}`)
  const movs = ((data || []) as any[]).filter(m => !esCuitEmpresa(m.cuit))
  if (movs.length === 0) return []

  // Para saber si ya se cargó, o si se cruza sola con un conductor
  const [conductores, pagadores, asignadasB1] = await Promise.all([
    obtenerConductores(qc => qc),
    obtenerPagadores(),
    (supabase.from('promocion_b1_pagos') as any)
      .select('conductor_id, cresium_movimiento_id')
      .eq('origen', 'cresium').is('anulado_at', null)
      .in('cresium_movimiento_id', movs.map(m => m.id)),
  ])
  const porId = new Map(conductores.map(c => [c.id, c]))
  const indice = indexarConductores(conductores, pagadores || [])
  const asignadaB1 = new Map(((asignadasB1.data || []) as any[]).map(a => [a.cresium_movimiento_id, a.conductor_id]))

  return movs.map(m => {
    const cargado = m.pago_conductor_id ? porId.get(m.pago_conductor_id) : null
    const deB1 = asignadaB1.get(m.id) ? porId.get(asignadaB1.get(m.id)) : null
    const cruce = cruzar([m as MovimientoCruce], indice)[0]?.conductor || deB1 || null
    return {
      id: m.id, empresa: m.empresa, cresium_id: m.cresium_id, fecha: m.fecha, procesado_en: m.procesado_en,
      contraparte: m.contraparte, cuit: m.cuit, cuenta_contraparte: m.cuenta_contraparte,
      banco_contraparte: m.banco_contraparte, importe: Number(m.importe) || 0,
      cargadaA: m.pago_cargado_en || m.pago_omitido ? (cargado ? nombreConductor(cargado) : 'otro conductor') : null,
      correspondeA: cruce ? nombreConductor(cruce) : null,
      anteriorAlAutomatico: !!m.procesado_en && m.procesado_en < DESDE_AUTOMATICO,
    }
  })
}

/** ¿Ese día el conductor paga por día con la promoción de licencia B1? */
async function esPagoB1(conductorId: string, fecha: string): Promise<boolean> {
  const { data: promo } = await (supabase.from('promociones') as any)
    .select('fecha_inicio, fecha_fin')
    .eq('clave', PROMO_CYBER_LICENCIA_B1)
    .maybeSingle()
  if (!promo?.fecha_inicio || !promo?.fecha_fin) return false
  const datos = (await cargarIngresosConductores([conductorId], fecha)).get(conductorId)
  if (!datos) return false
  const periodo = periodoPagoB1(promo, datos)
  return !!periodo && fecha >= periodo.desde && fecha <= periodo.hasta
}

/**
 * Carga la transferencia en el saldo del conductor. Devuelve el saldo nuevo.
 * Falla si alguien ya la cargó (no se usa dos veces).
 */
export async function registrarTransferencia(
  conductorId: string,
  t: TransferenciaCresium,
  opciones: { recordar: boolean; vinculo: string | null },
  usuario: { id: string | null; nombre: string | null },
): Promise<number> {
  // Reservar la transferencia (una sola escritura: solo si sigue libre)
  const { data: reservada, error: errReserva } = await (supabase.from('cresium_movimientos') as any)
    .update({ pago_cargado_en: new Date().toISOString(), pago_conductor_id: conductorId })
    .eq('id', t.id).is('pago_cargado_en', null).is('pago_omitido', null)
    .select('id')
  if (errReserva) throw new Error(`No se pudo reservar la transferencia: ${errReserva.message}`)
  if (!reservada || reservada.length === 0) throw new Error('Esa transferencia ya se cargó en un saldo')

  let saldoMovido = false
  try {
    const cerrada = await semanaCerrada(conductorId, t.fecha)
    const sem = semanaISO(cerrada ? hoyART() : t.fecha)
    const concepto = (await esPagoB1(conductorId, t.fecha)) ? CONCEPTO_TRANSFERENCIA_B1 : CONCEPTO_TRANSFERENCIA
    const saldoId = await idSaldoConductor(conductorId)

    const { data: abono, error: errAbono } = await (supabase.from('abonos_conductores') as any)
      .insert({
        conductor_id: conductorId, tipo: 'abono', monto: t.importe, concepto, referencia: null,
        semana: sem.semana, anio: sem.anio,
        fecha_abono: t.procesado_en || `${t.fecha}T12:00:00-03:00`,
        created_by_name: usuario.nombre,
      })
      .select('id')
      .single()
    if (errAbono) throw new Error(`No se pudo registrar el abono: ${errAbono.message}`)

    const nuevoSaldo = await aplicarMovimientoSaldo({
      saldoId,
      delta: t.importe,
      camposExtra: (saldo) => (saldo >= 0 ? { dias_mora: 0 } : {}),
    })
    saldoMovido = true

    const { data: saldo } = await (supabase.from('saldos_conductores') as any)
      .select('conductor_nombre, conductor_dni, conductor_cuit')
      .eq('id', saldoId)
      .single()
    const { data: movimiento, error: errMov } = await (supabase.from('control_saldos') as any)
      .insert({
        conductor_id: conductorId,
        conductor_nombre: saldo?.conductor_nombre || 'Desconocido',
        conductor_dni: saldo?.conductor_dni || null,
        conductor_cuit: saldo?.conductor_cuit || null,
        semana: sem.semana,
        anio: sem.anio,
        tipo_movimiento: 'pago_manual',
        monto_movimiento: t.importe,
        referencia: concepto,
        saldo_adeudado: nuevoSaldo < 0 ? Math.abs(nuevoSaldo) : 0,
        saldo_a_favor: nuevoSaldo > 0 ? nuevoSaldo : 0,
        saldo_pendiente: nuevoSaldo,
        created_by_name: usuario.nombre || 'Sistema',
      })
      .select('id')
      .single()
    if (errMov) throw new Error(`Error registrando movimiento en el historial: ${errMov.message}`)

    await (supabase.from('cresium_movimientos') as any)
      .update({ pago_abono_id: abono.id, pago_control_saldo_id: movimiento.id })
      .eq('id', t.id)

    if (opciones.recordar) {
      await asignarPagador(t as unknown as MovimientoCruce, conductorId, opciones.vinculo, usuario.id)
    }
    return nuevoSaldo
  } catch (err) {
    // Si todavía no se tocó el saldo, se libera la transferencia para poder volver a intentar
    if (!saldoMovido) {
      await (supabase.from('cresium_movimientos') as any)
        .update({ pago_cargado_en: null, pago_conductor_id: null })
        .eq('id', t.id)
    }
    throw err
  }
}
