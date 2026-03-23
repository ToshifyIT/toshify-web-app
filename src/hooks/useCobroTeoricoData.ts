import { useState, useEffect } from 'react'
import { startOfWeek, endOfWeek, addDays, format, setWeek, startOfMonth, endOfMonth, parseISO, parse, isValid, getWeek, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'
import { normalizeDni } from '../utils/normalizeDocuments'

export type Granularity = 'semana' | 'mes' | 'ano'

export interface ChartDataPoint {
  dia: string
  teorico: number
  real: number
  garantia: number
  alquiler: number
}

async function getCabifyTable(sedeId: string | null | undefined): Promise<string> {
  if (!sedeId) return 'cabify_historico'
  const { data } = await supabase
    .from('sedes')
    .select('cabify_tabla')
    .eq('id', sedeId)
    .single()
  return (data as any)?.cabify_tabla || 'cabify_historico'
}

// Helpers de fecha para consistencia con Facturación (Timezone Argentina)
const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function toArgDate(timestamp: string | null | undefined): string {
  if (!timestamp) return '-'
  return argDateFmt.format(new Date(timestamp))
}

// Estructura de detalle de día trabajado por conductor
interface DiaDetalle {
  fecha: string
  fechaKey: string
  diaSemana: string
  horario: string
  trabajado: boolean
  alquilerDia: number
}

/**
 * Función core que ejecuta toda la lógica de cálculo de cobro teórico vs real.
 * Recibe directamente startDate/endDate ya calculados, granularidad y sedeId.
 * Retorna los datos del gráfico listos para renderizar.
 */
export async function fetchCobroData(
  startDate: Date,
  endDate: Date,
  granularity: Granularity,
  sedeActualId: string | null | undefined
): Promise<ChartDataPoint[]> {
  // Inicializar estructura de datos diaria
  const diasMap = new Map<string, {
    fecha: Date,
    dia: string,
    garantiaTeorica: number,
    garantiaReal: number,
    alquiler: number
  }>()

  const daysInterval = eachDayOfInterval({ start: startDate, end: endDate })

  daysInterval.forEach(d => {
    const key = format(d, 'yyyy-MM-dd')
    diasMap.set(key, {
      fecha: d,
      dia: `${format(d, 'EEE', { locale: es }).replace(/^\w/, (c) => c.toUpperCase())} ${format(d, 'dd/MM')}`,
      garantiaTeorica: 0,
      garantiaReal: 0,
      alquiler: 0
    })
  })

  // Nombres de días de la semana
  const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

  // 1.1 Obtener precios: historial + nomina (fallback)
  const fechaInicioStr = format(startDate, 'yyyy-MM-dd')
  const fechaFinStr = format(endDate, 'yyyy-MM-dd')

  const [historialResult, nominaResult] = await Promise.all([
    (supabase.from('conceptos_facturacion_historial') as any)
      .select('codigo, precio_base, precio_final, fecha_vigencia_desde, fecha_vigencia_hasta')
      .in('codigo', ['P001', 'P002', 'P003', 'P013', 'P014', 'P015', 'P016'])
      .lte('fecha_vigencia_desde', fechaFinStr)
      .gte('fecha_vigencia_hasta', fechaInicioStr),
    supabase
      .from('conceptos_nomina')
      .select('codigo, precio_base, precio_final')
      .eq('activo', true)
      .in('codigo', ['P001', 'P002', 'P003', 'P013', 'P014', 'P015', 'P016']),
  ])
  const historialPrecios = historialResult.data
  const conceptosNomina = nominaResult.data

  const preciosMap = new Map<string, number>()
  ;(conceptosNomina || []).forEach((c: any) => {
    preciosMap.set(c.codigo, c.precio_final ?? c.precio_base ?? 0)
  })

  const historialPorCodigo = new Map<string, any[]>()
  for (const h of (historialPrecios || [])) {
    const arr = historialPorCodigo.get(h.codigo) || []
    arr.push(h)
    historialPorCodigo.set(h.codigo, arr)
  }

  const getPrecioEnFecha = (codigo: string, fecha: Date): number => {
    const fechaStr = fecha.toISOString().split('T')[0]
    const registros = historialPorCodigo.get(codigo)
    if (registros) {
      for (const h of registros) {
        if (h.fecha_vigencia_desde <= fechaStr && h.fecha_vigencia_hasta >= fechaStr) {
          return h.precio_final ?? h.precio_base
        }
      }
    }
    return preciosMap.get(codigo) || 0
  }

  // PASO 1a: DESCUBRIMIENTO DE CONDUCTORES (overlap generoso)
  const { data: asignacionesDescubrimiento } = await (supabase
    .from('asignaciones_conductores') as any)
    .select(`
      conductor_id, horario, fecha_inicio, fecha_fin, estado,
      asignaciones!inner(horario, estado, fecha_fin, vehiculo_id, vehiculos(patente)),
      conductores!inner(numero_dni, sede_id)
    `)
    .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

  const dnisDescubiertos = new Set<string>()

  for (const ac of (asignacionesDescubrimiento || []) as any[]) {
    const cond = ac.conductores
    const asig = ac.asignaciones
    if (!cond || !asig) continue

    if (sedeActualId && cond.sede_id !== sedeActualId) continue

    const estadoPadre = (asig.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(estadoPadre)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asig.fecha_fin) continue

    const acInicioGen = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : new Date('2020-01-01')
    const acFinGen = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin))
      : (asig.fecha_fin ? parseISO(toArgDate(asig.fecha_fin)) : new Date('2099-12-31'))

    if (acFinGen < startDate || acInicioGen > endDate) continue

    dnisDescubiertos.add(cond.numero_dni)
  }

  if (dnisDescubiertos.size === 0) {
    return Array.from(diasMap.values()).map(d => ({
      dia: d.dia, teorico: 0, real: 0, garantia: 0, alquiler: 0
    }))
  }

  const dnisList = Array.from(dnisDescubiertos)
  let qConductores = supabase
    .from('conductores')
    .select('id, nombres, apellidos, numero_dni, fecha_terminacion')
    .in('numero_dni', dnisList)
  if (sedeActualId) qConductores = qConductores.eq('sede_id', sedeActualId)
  const { data: conductoresData } = await qConductores

  const conductorInfoMap = new Map<string, any>()
  const fechaTermMap = new Map<string, Date>()
  for (const c of (conductoresData || []) as any[]) {
    conductorInfoMap.set(c.id, {
      id: c.id,
      nombres: c.nombres,
      apellidos: c.apellidos,
      dni: c.numero_dni,
    })
    if (c.fecha_terminacion) {
      fechaTermMap.set(c.id, parseISO(c.fecha_terminacion))
    }
  }

  // PASO 1.1: CÁLCULO DETALLADO DE DÍAS (lógica estricta)
  const conductorIds = Array.from(conductorInfoMap.keys())

  const { data: asignacionesDetalle } = await (supabase
    .from('asignaciones_conductores') as any)
    .select(`
      id, conductor_id, horario, fecha_inicio, fecha_fin, estado,
      asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)
    `)
    .in('conductor_id', conductorIds)
    .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

  const diasTrabajadosPorConductor = new Map<string, Map<string, string>>()
  const alquilerPorConductor = new Map<string, number>()

  interface Prorrateo {
    CARGO: number; TURNO_DIURNO: number; TURNO_NOCTURNO: number;
    monto_CARGO: number; monto_TURNO_DIURNO: number; monto_TURNO_NOCTURNO: number;
  }
  const prorrateoMap = new Map<string, Prorrateo>()

  const asignacionesPorConductor = new Map<string, Array<{
    modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO';
    codigoConcepto: string;
    fechaInicio: Date;
    fechaFin: Date;
  }>>()

  conductorIds.forEach(id => {
    diasTrabajadosPorConductor.set(id, new Map())
    alquilerPorConductor.set(id, 0)
    prorrateoMap.set(id, {
      CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0,
      monto_CARGO: 0, monto_TURNO_DIURNO: 0, monto_TURNO_NOCTURNO: 0
    })
    asignacionesPorConductor.set(id, [])
  })

  // PASE 1: Contar días DEDUPLICANDO por fecha
  for (const ac of (asignacionesDetalle || []) as any[]) {
    const asignacion = ac.asignaciones
    if (!asignacion) continue

    const estadoPadre = (asignacion.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(estadoPadre)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asignacion.fecha_fin) continue

    const conductorInicioD = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : null
    const padreInicioD = asignacion.fecha_inicio ? parseISO(toArgDate(asignacion.fecha_inicio)) : null
    const acInicio = conductorInicioD && padreInicioD
      ? (conductorInicioD > padreInicioD ? conductorInicioD : padreInicioD)
      : (conductorInicioD || padreInicioD || startDate)

    const conductorFinD = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin)) : null
    const padreFinD = asignacion.fecha_fin ? parseISO(toArgDate(asignacion.fecha_fin)) : null
    const acFin = conductorFinD && padreFinD
      ? (conductorFinD < padreFinD ? conductorFinD : padreFinD)
      : (conductorFinD || padreFinD || endDate)

    const efInicio = acInicio < startDate ? startDate : acInicio
    let efFin = acFin > endDate ? endDate : acFin

    const tieneFinPropio = ac.fecha_fin || asignacion.fecha_fin
    const fechaTerm = fechaTermMap.get(ac.conductor_id)
    if (fechaTerm && !tieneFinPropio && efFin > fechaTerm) {
      efFin = fechaTerm
    }

    if (efInicio > efFin) continue

    const modalidadAsignacion = asignacion.horario
    const horarioConductor = ac.horario
    const horarioLower = (horarioConductor || '').toLowerCase().trim()

    let modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO' = 'CARGO'
    let codigoConcepto = 'P002'
    let horarioLabel = 'CARGO'

    if (modalidadAsignacion === 'CARGO' || horarioLower === 'todo_dia') {
      modalidad = 'CARGO'
      codigoConcepto = 'P002'
      horarioLabel = 'CARGO'
    } else if (modalidadAsignacion === 'TURNO') {
      if (horarioLower === 'nocturno' || horarioLower === 'n') {
        modalidad = 'TURNO_NOCTURNO'
        codigoConcepto = 'P013'
        horarioLabel = 'NOCTURNO'
      } else {
        modalidad = 'TURNO_DIURNO'
        codigoConcepto = 'P001'
        horarioLabel = 'DIURNO'
      }
    }

    const diasMap2 = diasTrabajadosPorConductor.get(ac.conductor_id)!
    const prorrateo = prorrateoMap.get(ac.conductor_id)!
    let diasReales = 0

    let current = new Date(efInicio)
    while (current <= efFin) {
      const diaStr = format(current, 'yyyy-MM-dd')
      if (!diasMap2.has(diaStr)) {
        diasMap2.set(diaStr, horarioLabel)
        if (modalidad === 'CARGO') prorrateo.CARGO++
        else if (modalidad === 'TURNO_NOCTURNO') prorrateo.TURNO_NOCTURNO++
        else prorrateo.TURNO_DIURNO++
        diasReales++
      }
      current = addDays(current, 1)
    }

    if (diasReales <= 0) continue

    asignacionesPorConductor.get(ac.conductor_id)!.push({
      modalidad,
      codigoConcepto,
      fechaInicio: efInicio,
      fechaFin: efFin,
    })
  }

  // PASE 2: Calcular MONTOS con precios históricos
  const codigosPorModalidad: Record<string, string> = {
    'CARGO': 'P002',
    'TURNO_DIURNO': 'P001',
    'TURNO_NOCTURNO': 'P013'
  }

  for (const [conductorId, asignaciones] of asignacionesPorConductor.entries()) {
    const prorrateo = prorrateoMap.get(conductorId)
    if (!prorrateo) continue

    for (const asig of asignaciones) {
      const codigo = codigosPorModalidad[asig.modalidad]
      const montoKey = `monto_${asig.modalidad}` as keyof Prorrateo

      const currentDate = new Date(asig.fechaInicio)
      while (currentDate <= asig.fechaFin) {
        const precioDiario = getPrecioEnFecha(codigo, currentDate)
        ;(prorrateo as any)[montoKey] += precioDiario
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }

    prorrateo.monto_CARGO = Math.round(prorrateo.monto_CARGO)
    prorrateo.monto_TURNO_DIURNO = Math.round(prorrateo.monto_TURNO_DIURNO)
    prorrateo.monto_TURNO_NOCTURNO = Math.round(prorrateo.monto_TURNO_NOCTURNO)

    const subtotalAlquiler = prorrateo.monto_CARGO + prorrateo.monto_TURNO_DIURNO + prorrateo.monto_TURNO_NOCTURNO
    alquilerPorConductor.set(conductorId, subtotalAlquiler)
  }

  // Calcular alquiler por día para el gráfico
  conductorIds.forEach(id => {
    const dias = diasTrabajadosPorConductor.get(id)
    if (!dias || dias.size === 0) return
    for (const [diaStr, horarioLabel] of dias.entries()) {
      const codigo = horarioLabel === 'CARGO' ? 'P002'
        : horarioLabel === 'NOCTURNO' ? 'P013' : 'P001'
      const precioDia = getPrecioEnFecha(codigo, parseISO(diaStr))
      if (diasMap.has(diaStr)) {
        diasMap.get(diaStr)!.alquiler += precioDia
      }
    }
  })

  const conductoresActivos = Array.from(conductorInfoMap.values()).filter(c => {
    const dias = diasTrabajadosPorConductor.get(c.id)
    return dias && dias.size > 0
  })

  // CÁLCULO DE GARANTÍA
  const { data: garantiasData } = await supabase
    .from('garantias_conductores')
    .select('conductor_id, monto_cuota_semanal, estado, cuotas_pagadas, cuotas_totales')
    .in('conductor_id', conductorIds)

  const garantiaMap = new Map<string, any>()
  garantiasData?.forEach((g: any) => garantiaMap.set(g.conductor_id, g))

  const { data: conceptoP003 } = await supabase
    .from('conceptos_nomina')
    .select('codigo, precio_base, precio_final')
    .eq('codigo', 'P003')
    .eq('activo', true)
    .maybeSingle()

  const precioP003 = conceptoP003?.precio_final ?? conceptoP003?.precio_base ?? 7143
  const cuotaGarantiaSemanalDefault = Math.round(precioP003 * 7)

  const garantiaCalculadaMap = new Map<string, number>()

  conductoresActivos.forEach(c => {
    const g = garantiaMap.get(c.id)
    let subtotalGarantia = 0

    if (g) {
      const completada = g.estado === 'completada' || g.estado === 'cancelada'
        || (g.cuotas_pagadas >= g.cuotas_totales && g.cuotas_totales > 0)
      if (completada) {
        subtotalGarantia = 0
      } else {
        subtotalGarantia = g.monto_cuota_semanal || cuotaGarantiaSemanalDefault
      }
    } else {
      subtotalGarantia = cuotaGarantiaSemanalDefault
    }

    garantiaCalculadaMap.set(c.id, subtotalGarantia)
  })

  const conductoresConGarantia50k = conductoresActivos.filter(c => {
    return garantiaCalculadaMap.get(c.id) === 50000
  })

  const totalGarantiaTeoricaSemanal = 50000 * conductoresConGarantia50k.length
  const garantiaTeoricaDiaria = totalGarantiaTeoricaSemanal / 7

  const alquilerTeoricoPorDia = new Map<string, number>()
  daysInterval.forEach(d => {
    alquilerTeoricoPorDia.set(format(d, 'yyyy-MM-dd'), 0)
  })

  conductoresConGarantia50k.forEach(c => {
    const alquilerTotal = alquilerPorConductor.get(c.id) || 0
    const dias = diasTrabajadosPorConductor.get(c.id)
    if (!dias || dias.size === 0) return
    const alquilerDiaProporcional = alquilerTotal / dias.size
    for (const [diaStr] of dias.entries()) {
      const current = alquilerTeoricoPorDia.get(diaStr) || 0
      alquilerTeoricoPorDia.set(diaStr, current + alquilerDiaProporcional)
    }
  })

  // Construir estructura ConductorFiltrado (conductores 50k)
  conductoresConGarantia50k.map(c => {
    const diasMap2 = diasTrabajadosPorConductor.get(c.id) || new Map<string, string>()
    const alquiler = alquilerPorConductor.get(c.id) || 0

    const diasTrabajados = Array.from(diasMap2.entries()).filter(([, h]) => !!h)
    const alquilerDiaProrrateo = diasTrabajados.length > 0 ? alquiler / diasTrabajados.length : 0

    const diasDetalle: DiaDetalle[] = daysInterval.map(d => {
      const key = format(d, 'yyyy-MM-dd')
      const horarioDia = diasMap2.get(key)
      let alquilerDia = 0
      if (horarioDia) {
        alquilerDia = alquilerDiaProrrateo
      }
      return {
        fecha: format(d, 'dd/MM/yyyy'),
        fechaKey: key,
        diaSemana: diasNombres[d.getDay()],
        horario: horarioDia || '-',
        trabajado: !!horarioDia,
        alquilerDia,
      }
    })

    return {
      id: c.id,
      nombre: `${c.nombres} ${c.apellidos}`.trim(),
      dni: c.dni,
      diasTotal: diasMap2.size,
      alquiler,
      garantia: garantiaCalculadaMap.get(c.id) || 50000,
      diasDetalle,
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  // COBRO APP DE CONDUCTORES 50K (Blue Line)
  const dnis50k = conductoresConGarantia50k.map(c => normalizeDni(c.dni)).filter(Boolean)
  const cobroRealPorDia = new Map<string, number>()

  daysInterval.forEach((d) => {
    const diaStr = format(d, 'yyyy-MM-dd')
    cobroRealPorDia.set(diaStr, 0)
  })

  if (dnis50k.length > 0) {
    const cabifyTable = await getCabifyTable(sedeActualId)
    const { data: historicoData, error: historicoError } = await supabase
      .from(cabifyTable)
      .select('fecha_inicio, cobro_app, dni, fecha_guardado, cabify_driver_id')
      .in('dni', dnis50k)
      .gte('fecha_inicio', format(startDate, 'yyyy-MM-dd'))
      .lte('fecha_inicio', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')

    if (!historicoError) {
      const uniqueRecordsMap = new Map<string, any>()

      historicoData?.forEach((record: any) => {
        const dni = record.dni
        if (!dni) return
        const fechaDia = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
        const uniqueKey = `${dni}_${fechaDia}`
        const existing = uniqueRecordsMap.get(uniqueKey)
        if (!existing) {
          uniqueRecordsMap.set(uniqueKey, record)
        } else {
          const existingDate = new Date(existing.fecha_guardado || 0)
          const currentDate = new Date(record.fecha_guardado || 0)
          if (currentDate > existingDate) {
            uniqueRecordsMap.set(uniqueKey, record)
          }
        }
      })

      const uniqueRecords = Array.from(uniqueRecordsMap.values())

      uniqueRecords.forEach((record: any) => {
        const fechaDia = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
        const monto = Number(record.cobro_app || 0)
        if (cobroRealPorDia.has(fechaDia)) {
          const current = cobroRealPorDia.get(fechaDia) || 0
          cobroRealPorDia.set(fechaDia, current + monto)
        }
      })
    }
  }

  // Aplicar a cada día
  diasMap.forEach(d => {
    d.garantiaTeorica += garantiaTeoricaDiaria
    const diaStr = format(d.fecha, 'yyyy-MM-dd')
    d.garantiaReal = cobroRealPorDia.get(diaStr) || 0
  })

  // CONSOLIDAR DATOS
  const dailyData = Array.from(diasMap.values()).map(d => {
    const diaStr = format(d.fecha, 'yyyy-MM-dd')
    const alquilerTeorico = alquilerTeoricoPorDia.get(diaStr) || 0
    const totalTeorico = d.garantiaTeorica + alquilerTeorico
    const totalReal = d.garantiaReal

    return {
      ...d,
      teorico: totalTeorico,
      real: totalReal,
      garantia: d.garantiaTeorica,
      alquiler: alquilerTeorico
    }
  })

  // Agregación según granularidad
  let finalData: ChartDataPoint[] = []

  if (granularity === 'semana') {
    finalData = dailyData.map(d => ({
      dia: d.dia, teorico: d.teorico, real: d.real, garantia: d.garantia, alquiler: d.alquiler
    }))
  } else if (granularity === 'mes') {
    const grouped = new Map<string, { label: string, teorico: number, real: number, garantia: number, alquiler: number }>()
    dailyData.forEach(d => {
      const weekNum = getWeek(d.fecha, { weekStartsOn: 1 })
      const key = `Sem ${weekNum.toString().padStart(2, '0')}`
      if (!grouped.has(key)) {
        grouped.set(key, { label: key, teorico: 0, real: 0, garantia: 0, alquiler: 0 })
      }
      const g = grouped.get(key)!
      g.teorico += d.teorico
      g.real += d.real
      g.garantia += d.garantia
      g.alquiler += d.alquiler
    })
    finalData = Array.from(grouped.values()).map(g => ({
      dia: g.label, teorico: g.teorico, real: g.real, garantia: g.garantia, alquiler: g.alquiler
    }))
  } else if (granularity === 'ano') {
    const grouped = new Map<string, { label: string, order: number, teorico: number, real: number, garantia: number, alquiler: number }>()
    dailyData.forEach(d => {
      const monthName = format(d.fecha, 'MMM', { locale: es })
      const label = monthName.charAt(0).toUpperCase() + monthName.slice(1)
      const order = d.fecha.getMonth()
      if (!grouped.has(label)) {
        grouped.set(label, { label, order, teorico: 0, real: 0, garantia: 0, alquiler: 0 })
      }
      const g = grouped.get(label)!
      g.teorico += d.teorico
      g.real += d.real
      g.garantia += d.garantia
      g.alquiler += d.alquiler
    })
    finalData = Array.from(grouped.values())
      .sort((a, b) => a.order - b.order)
      .map(g => ({
        dia: g.label, teorico: g.teorico, real: g.real, garantia: g.garantia, alquiler: g.alquiler
      }))
  }

  return finalData
}

/**
 * Parsea el string del PeriodPicker a un rango de fechas (startDate, endDate).
 */
export function parsePeriodToRange(selectedPeriod: string, granularity: Granularity): { startDate: Date; endDate: Date } {
  let startDate: Date, endDate: Date

  if (granularity === 'semana') {
    const match = selectedPeriod.match(/Sem (\d+) (\d{4})/)
    if (match) {
      const semanaNum = parseInt(match[1])
      const anioNum = parseInt(match[2])
      const dateWithWeek = setWeek(new Date(anioNum, 0, 4), semanaNum, { weekStartsOn: 1, firstWeekContainsDate: 4 })
      startDate = startOfWeek(dateWithWeek, { weekStartsOn: 1 })
      endDate = endOfWeek(dateWithWeek, { weekStartsOn: 1 })
    } else {
      startDate = startOfWeek(new Date(), { weekStartsOn: 1 })
      endDate = endOfWeek(new Date(), { weekStartsOn: 1 })
    }
  } else if (granularity === 'mes') {
    const parsedDate = parse(selectedPeriod, 'MMM yyyy', new Date(), { locale: es })
    if (isValid(parsedDate)) {
      startDate = startOfMonth(parsedDate)
      endDate = endOfMonth(parsedDate)
    } else {
      startDate = startOfMonth(new Date())
      endDate = endOfMonth(new Date())
    }
  } else if (granularity === 'ano') {
    const anioNum = parseInt(selectedPeriod) || new Date().getFullYear()
    startDate = new Date(anioNum, 0, 1)
    endDate = new Date(anioNum, 11, 31)
  } else {
    startDate = startOfWeek(new Date(), { weekStartsOn: 1 })
    endDate = endOfWeek(new Date(), { weekStartsOn: 1 })
  }

  return { startDate, endDate }
}

/**
 * Hook que consume fetchCobroData y maneja el estado de loading/data.
 */
export function useCobroTeoricoData(granularity: Granularity, selectedPeriod: string | undefined) {
  const { sedeActualId } = useSede()
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedPeriod) return

    let isMounted = true

    const doFetch = async () => {
      setLoading(true)
      try {
        const { startDate, endDate } = parsePeriodToRange(selectedPeriod, granularity)
        const data = await fetchCobroData(startDate, endDate, granularity, sedeActualId)
        if (isMounted) {
          setChartData(data)
        }
      } catch {
        // silently ignored
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    doFetch()

    return () => { isMounted = false }
  }, [selectedPeriod, granularity, sedeActualId])

  return { chartData, loading }
}
