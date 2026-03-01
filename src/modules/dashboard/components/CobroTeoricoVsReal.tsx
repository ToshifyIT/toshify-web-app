import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { startOfWeek, endOfWeek, addDays, format, setWeek, startOfMonth, endOfMonth, parseISO, parse, isValid, getWeek, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { PeriodPicker } from './PeriodPicker'
import './CobroTeoricoVsReal.css'

type Granularity = 'semana' | 'mes' | 'ano'

// Helpers de fecha para consistencia con Facturación (Timezone Argentina)
const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function toArgDate(timestamp: string | null | undefined): string {
  if (!timestamp) return '-'
  return argDateFmt.format(new Date(timestamp))
}

// Datos de ejemplo iniciales
const INITIAL_DATA = [
  { dia: 'Lun', teorico: 0, real: 0 },
  { dia: 'Mar', teorico: 0, real: 0 },
  { dia: 'Mié', teorico: 0, real: 0 },
  { dia: 'Jue', teorico: 0, real: 0 },
  { dia: 'Vie', teorico: 0, real: 0 },
  { dia: 'Sáb', teorico: 0, real: 0 },
  { dia: 'Dom', teorico: 0, real: 0 },
]

const formatCurrencyK = (value: number) => {
  return `$${Math.round(value / 1000)}K`
}

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="cobro-teorico-tooltip">
        <span className="cobro-teorico-tooltip-label">{label}</span>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="cobro-teorico-tooltip-item" style={{ color: entry.color }}>
            <span style={{ fontWeight: 600 }}>{entry.name}:</span>
            <span>{formatCurrencyFull(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function CobroTeoricoVsReal() {
  const { sedeActualId } = useSede()
  const [granularity, setGranularity] = useState<Granularity>('semana')
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
  })
  const [chartData, setChartData] = useState(INITIAL_DATA)
  const [loading, setLoading] = useState(false)

  // Cargar datos cuando cambia el periodo específico
  useEffect(() => {
    if (!selectedPeriod) return

    const fetchData = async () => {
      setLoading(true)
      try {
        let startDate: Date, endDate: Date
        let anioNum: number = new Date().getFullYear()

        if (granularity === 'semana') {
          // Formato PeriodPicker: "Sem XX YYYY"
          const match = selectedPeriod.match(/Sem (\d+) (\d{4})/)
          if (match) {
            const semanaNum = parseInt(match[1])
            anioNum = parseInt(match[2])
            
            // Calcular fecha inicio de la semana (Lunes)
            const dateWithWeek = setWeek(new Date(anioNum, 0, 4), semanaNum, { weekStartsOn: 1, firstWeekContainsDate: 4 })
            startDate = startOfWeek(dateWithWeek, { weekStartsOn: 1 })
            endDate = endOfWeek(dateWithWeek, { weekStartsOn: 1 })
          } else {
             // Fallback
             startDate = startOfWeek(new Date(), { weekStartsOn: 1 })
             endDate = endOfWeek(new Date(), { weekStartsOn: 1 })
          }
        } else if (granularity === 'mes') {
          // Formato PeriodPicker: "Mmm YYYY" (e.g. Ene 2026)
          const parsedDate = parse(selectedPeriod, 'MMM yyyy', new Date(), { locale: es })
          if (isValid(parsedDate)) {
             startDate = startOfMonth(parsedDate)
             endDate = endOfMonth(parsedDate)
             anioNum = parsedDate.getFullYear()
          } else {
             startDate = startOfMonth(new Date())
             endDate = endOfMonth(new Date())
          }
        } else if (granularity === 'ano') {
          // Formato PeriodPicker: "YYYY"
          anioNum = parseInt(selectedPeriod) || new Date().getFullYear()
          startDate = new Date(anioNum, 0, 1)
          endDate = new Date(anioNum, 11, 31)
        } else {
           // Default fallback
           startDate = startOfWeek(new Date(), { weekStartsOn: 1 })
           endDate = endOfWeek(new Date(), { weekStartsOn: 1 })
        }

        console.log(`[CobroTeorico] Analizando periodo: ${format(startDate, 'yyyy-MM-dd')} a ${format(endDate, 'yyyy-MM-dd')}`)
        console.group('[CobroTeorico] CÁLCULO DETALLADO DE COBROS')

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
            dia: format(d, 'EEE', { locale: es }).replace(/^\w/, (c) => c.toUpperCase()),
            garantiaTeorica: 0,
            garantiaReal: 0,
            alquiler: 0
          })
        })

        // ---------------------------------------------------------
        // 1. OBTENER CONDUCTORES Y ASIGNACIONES (Lógica Reporte)
        // ---------------------------------------------------------
        
        // 1.1 Obtener conceptos de facturación para cálculo de alquiler
        const { data: conceptos } = await supabase
            .from('conceptos_nomina')
            .select('codigo, precio_base, precio_final')
            .in('codigo', ['P001', 'P002', 'P013'])
            .eq('activo', true)
        
        const preciosMap = new Map<string, number>()
        conceptos?.forEach((c: any) => {
            preciosMap.set(c.codigo, c.precio_final || c.precio_base || 0)
        })

        let qAsignaciones = supabase
          .from('asignaciones_conductores')
          .select(`
            conductor_id, horario, fecha_inicio, fecha_fin, estado,
            asignaciones!inner(horario, estado, fecha_fin, vehiculo_id, vehiculos(patente)),
            conductores!inner(id, nombres, apellidos, numero_dni, sede_id)
          `)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

        if (sedeActualId) {
           qAsignaciones = qAsignaciones.eq('conductores.sede_id', sedeActualId)
        }

        const { data: asignacionesSemana } = await qAsignaciones
        
        // Mapa de días trabajados por conductor
        // Map<conductor_id, Set<fecha_str>>
        const diasTrabajadosPorConductor = new Map<string, Set<string>>()
        const alquilerPorConductor = new Map<string, number>() // Alquiler acumulado
        const conductorInfoMap = new Map<string, any>()
        // Nuevo: Log detallado por conductor (días trabajados y montos)
        const logsPorConductor = new Map<string, any>()

        asignacionesSemana?.forEach((ac: any) => {
           const cond = ac.conductores
           const asig = ac.asignaciones
           if (!cond || !asig) return
           
           if (sedeActualId && cond.sede_id !== sedeActualId) return

           const estado = (asig.estado || '').toLowerCase()
           
           // Filtros: Ignorar Programadas y Huérfanos
           if (['programado', 'programada'].includes(estado)) return
           if (['finalizado', 'finalizada', 'cancelado', 'cancelada'].includes(estado) && !asig.fecha_fin) return 

           // Verificar Intersección
           const acInicio = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : null
           const padInicio = asig.fecha_inicio ? parseISO(toArgDate(asig.fecha_inicio)) : null
           
           const inicioReal = acInicio && padInicio 
             ? (acInicio > padInicio ? acInicio : padInicio) 
             : (acInicio || padInicio || startDate)

           const acFin = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin)) : null
           const padFin = asig.fecha_fin ? parseISO(toArgDate(asig.fecha_fin)) : null
           
           const finReal = acFin && padFin
             ? (acFin < padFin ? acFin : padFin)
             : (acFin || padFin || endDate)

           // Intersección con la semana
           const efInicio = inicioReal < startDate ? startDate : inicioReal
           const efFin = finReal > endDate ? endDate : finReal

           if (efInicio <= efFin) {
             // Guardar info conductor
             if (!conductorInfoMap.has(cond.id)) {
               conductorInfoMap.set(cond.id, {
                 id: cond.id,
                 nombres: cond.nombres,
                 apellidos: cond.apellidos,
                 dni: cond.numero_dni,
                 // Debug: guardar fechas de asignación para log
                 debug_inicio_asignacion: ac.fecha_inicio,
                 debug_fin_asignacion: ac.fecha_fin || asig.fecha_fin || 'Sin fin'
               })
             }
             if (!diasTrabajadosPorConductor.has(cond.id)) {
               diasTrabajadosPorConductor.set(cond.id, new Set())
             }

             // Inicializar log detallado si no existe
             if (!logsPorConductor.has(cond.id)) {
                 const diasObj: any = {}
                 // Inicializar todos los días del periodo en 0
                 daysInterval.forEach(d => {
                     const dayKey = format(d, 'yyyy-MM-dd') // Usar fecha completa como key interna
                     diasObj[dayKey] = 0
                 })
                 logsPorConductor.set(cond.id, {
                     ID: cond.id,
                     Conductor: `${cond.nombres} ${cond.apellidos}`,
                     ...diasObj,
                     Total: 0
                 })
             }

             // Determinar precio diario según modalidad
             let codigoConcepto = 'P002' // Default CARGO
             const modalidadAsignacion = asig.horario // 'TURNO' o 'CARGO'
             const horarioConductor = ac.horario // 'diurno', 'nocturno', 'todo_dia'
             const horarioLower = (horarioConductor || '').toLowerCase().trim()
             
             if (modalidadAsignacion === 'CARGO' || horarioLower === 'todo_dia') {
                 codigoConcepto = 'P002'
             } else if (modalidadAsignacion === 'TURNO') {
                 if (horarioLower === 'nocturno' || horarioLower === 'n') {
                     codigoConcepto = 'P013'
                 } else {
                     codigoConcepto = 'P001'
                 }
             }
             const precioDiario = preciosMap.get(codigoConcepto) || 0

             const diasSet = diasTrabajadosPorConductor.get(cond.id)!
             const logEntry = logsPorConductor.get(cond.id)

             let current = new Date(efInicio)
             while (current <= efFin) {
               const diaStr = format(current, 'yyyy-MM-dd')

               if (!diasSet.has(diaStr)) {
                 diasSet.add(diaStr)
                 
                 // Acumular alquiler por conductor (para tabla log)
                 const currentAlquiler = alquilerPorConductor.get(cond.id) || 0
                 alquilerPorConductor.set(cond.id, currentAlquiler + precioDiario)
                 
                 // Actualizar log detallado
                 if (logEntry) {
                     // Usar key de fecha YYYY-MM-DD
                     if (logEntry[diaStr] !== undefined) {
                         logEntry[diaStr] += precioDiario
                         logEntry.Total += precioDiario
                     }
                 }

                 // Acumular alquiler por día (para gráfico)
                 if (diasMap.has(diaStr)) {
                    diasMap.get(diaStr)!.alquiler += precioDiario
                 }
               }
               current = addDays(current, 1)
             }
           }
        })

        const conductoresActivos = Array.from(conductorInfoMap.values())
        console.log(`[Paso 1] Conductores obtenidos en la semana: ${conductoresActivos.length}`)
        console.table(conductoresActivos.map(c => ({ ID: c.id, Nombre: `${c.nombres} ${c.apellidos}`, DNI: c.dni })))

        // ---------------------------------------------------------
        // 2. CÁLCULO DE GARANTÍA
        // ---------------------------------------------------------
        
        // Obtener garantías configuradas (SIN FILTRO de estado para replicar lógica de Reporte)
        const { data: garantiasData } = await supabase
          .from('garantias_conductores')
          .select('conductor_id, monto_cuota_semanal, estado, cuotas_pagadas, cuotas_totales')
          .in('conductor_id', Array.from(conductorInfoMap.keys()))

        const garantiaMap = new Map<string, any>()
        garantiasData?.forEach((g: any) => garantiaMap.set(g.conductor_id, g))

        // [LOG REVISIÓN] Mostrar listado de garantías para validar montos (50000, 0, vacío)
        // Incluye rango de fechas de la semana seleccionada para verificación
        const semanaLog = `${format(startDate, 'dd/MM/yyyy')} al ${format(endDate, 'dd/MM/yyyy')}`
        console.group(`[REVISIÓN SEMANA ${semanaLog}] - LISTADO DE CONDUCTORES Y GARANTÍAS`)
        
        const debugGarantias = conductoresActivos.map(c => {
            const g = garantiaMap.get(c.id)
            
            // Lógica replicada de ReporteFacturacionTab:
            // 1. Si no existe registro -> Se asume 50000 (Default)
            // 2. Si existe -> Verificar estado y cuotas
            let montoCalculado = 0
            let estadoLog = ''

            if (!g) {
                montoCalculado = 50000
                estadoLog = 'No registro (Default 50k)'
            } else {
                const completada = g.estado === 'completada' || g.estado === 'cancelada' || (g.cuotas_pagadas >= g.cuotas_totales && g.cuotas_totales > 0)
                if (completada) {
                    montoCalculado = 0
                    estadoLog = `Excluido (${g.estado} - ${g.cuotas_pagadas}/${g.cuotas_totales})`
                } else {
                    montoCalculado = g.monto_cuota_semanal || 50000
                    estadoLog = `Activo (${g.estado})`
                }
            }

            return {
                ID: c.id,
                Conductor: `${c.nombres} ${c.apellidos}`,
                'Monto DB': g?.monto_cuota_semanal || 'N/A',
                'Monto Final': montoCalculado,
                'Estado Lógica': estadoLog,
                'Inicio Asignación': c.debug_inicio_asignacion,
                'Fin Asignación': c.debug_fin_asignacion,
                'Días Trabajados': diasTrabajadosPorConductor.get(c.id)?.size || 0,
                'Alquiler': alquilerPorConductor.get(c.id) || 0
            }
        })
        console.table(debugGarantias)
        console.groupEnd()

        // A) GARANTÍA TEÓRICA (Green): Filtro estricto 50000 (Calculado)
        const conductoresConGarantia50k = conductoresActivos.filter(c => {
          const g = garantiaMap.get(c.id)
          
          // 1. Caso: Sin registro de garantía -> Asumir 50000 (Lógica Reporte)
          if (!g) return true 

          // 2. Caso: Con registro -> Validar que NO esté completada/cancelada
          const completada = g.estado === 'completada' || g.estado === 'cancelada' || (g.cuotas_pagadas >= g.cuotas_totales && g.cuotas_totales > 0)
          if (completada) return false

          // 3. Caso: Activa -> Validar monto exacto
          const monto = g.monto_cuota_semanal || 0
          
          // Debug específico para Sergio
          if (c.nombres.toUpperCase().includes('SERGIO') && c.apellidos.toUpperCase().includes('FROENER')) {
             console.log(`[Debug Garantía Sergio] ID: ${c.id}, Garantía encontrada:`, g, `Monto: ${monto}, Completada: ${completada}`)
          }

          return monto === 50000
        })
        
        const totalGarantiaTeoricaSemanal = 50000 * conductoresConGarantia50k.length
        const garantiaTeoricaDiaria = totalGarantiaTeoricaSemanal / 7 // Mantener base semanal de 50k / 7

        console.log(`[Garantía TEÓRICA - Green] Conductores con 50k: ${conductoresConGarantia50k.length}`)
        console.log(`[Garantía TEÓRICA - Green] Total Semanal: ${totalGarantiaTeoricaSemanal} / 7 = ${garantiaTeoricaDiaria.toFixed(2)} por día`)

        console.group('[DETALLE ALQUILER POR DÍA] - Conductores con Garantía 50K')
        const logsFiltrados = conductoresConGarantia50k
            .map(c => logsPorConductor.get(c.id))
            .filter(Boolean)
        console.table(logsFiltrados)
        console.groupEnd()

        // C) ALQUILER TEÓRICO (Green): Suma de alquileres SOLO de conductores 50k
        const alquilerTeoricoPorDia = new Map<string, number>()
        const debugSumaDiaria: any[] = []
        
        // Mapear nombres de días a fechas para sumar desde los logs
        daysInterval.forEach(d => {
             const dayName = format(d, 'EEEE', { locale: es }).replace(/^\w/, c => c.toUpperCase())
             const diaStr = format(d, 'yyyy-MM-dd')
             alquilerTeoricoPorDia.set(diaStr, 0)
             
             debugSumaDiaria.push({
                 Dia: dayName,
                 Fecha: diaStr,
                 'Conductores que suman': [],
                 Total: 0
             })
        })

        logsFiltrados.forEach((log: any) => {
             daysInterval.forEach(d => {
                 const diaStr = format(d, 'yyyy-MM-dd')
                 const monto = log[diaStr] || 0 // Usar key fecha
                 
                 const current = alquilerTeoricoPorDia.get(diaStr) || 0
                 alquilerTeoricoPorDia.set(diaStr, current + monto)
                 
                 // Debug
                 if (monto > 0) {
                     const debugItem = debugSumaDiaria.find(x => x.Fecha === diaStr)
                    if (debugItem) {
                        debugItem['Conductores que suman'].push(`[${log.ID}] ${log.Conductor}: $${monto}`)
                        debugItem.Total += monto
                    }
                 }
             })
        })

        console.group('[DETALLE SUMA DIARIA - ALQUILER TEÓRICO]')
        console.table(debugSumaDiaria.map(d => ({
            ...d,
            'Conductores que suman': d['Conductores que suman'].join(' | ')
        })))
        console.groupEnd()

        // B) GARANTÍA REAL (Blue): Suma real de garantías configuradas
        // REEMPLAZADO POR NUEVA LÓGICA DE COBRO APP (SOLICITUD USUARIO)
        /*
        let totalGarantiaRealSemanal = 0
        conductoresActivos.forEach(c => {
          const g = garantiaMap.get(c.id)
          const monto = g?.monto_cuota_semanal || 0
          totalGarantiaRealSemanal += monto
        })
        const garantiaRealDiaria = totalGarantiaRealSemanal / 7

        console.log(`[Garantía REAL - Blue] Total Semanal (Suma Real): ${totalGarantiaRealSemanal} / 7 = ${garantiaRealDiaria.toFixed(2)} por día`)
        
        // Aplicar a cada día
        diasMap.forEach(d => {
          d.garantiaTeorica += garantiaTeoricaDiaria
          d.garantiaReal += garantiaRealDiaria
        })
        */

        // ---------------------------------------------------------
        // NUEVA LÓGICA BLUE LINE: COBRO APP DE CONDUCTORES 50K
        // ---------------------------------------------------------
        console.group('[COBRO REAL - Blue] Análisis Cabify Historico (Conductores 50k)')
        
        const dnis50k = conductoresConGarantia50k.map(c => c.dni).filter(Boolean)
        const cobroRealPorDia = new Map<string, number>()
        
        // Inicializar mapa de cobro real por día
        daysInterval.forEach((d) => {
            const diaStr = format(d, 'yyyy-MM-dd')
            cobroRealPorDia.set(diaStr, 0)
        })

        if (dnis50k.length > 0) {
            // Consultar histórico
            const { data: historicoData, error: historicoError } = await supabase
                .from('cabify_historico')
                .select('fecha_inicio, cobro_app, dni, fecha_guardado, cabify_driver_id')
                .in('dni', dnis50k)
                .gte('fecha_inicio', format(startDate, 'yyyy-MM-dd'))
                .lte('fecha_inicio', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')

            if (historicoError) {
                console.error('Error consultando cabify_historico:', historicoError)
            } else {
                console.log(`Registros encontrados en cabify_historico: ${historicoData?.length || 0}`)

                // 1. Eliminar duplicados (Lógica de cabifyHistoricalService)
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
                console.log(`Registros únicos procesados: ${uniqueRecords.length}`)

                // 2. Agrupar por conductor para logs y sumar al total diario
                const cobroAppPorConductor = new Map<string, any>()

                // Inicializar estructura para logs
                conductoresConGarantia50k.forEach(c => {
                    const diasObj: any = {}
                    daysInterval.forEach(d => {
                        const diaStr = format(d, 'yyyy-MM-dd')
                        diasObj[diaStr] = 0
                    })
                    
                    cobroAppPorConductor.set(c.dni, {
                        ID: c.id,
                        Conductor: `${c.nombres} ${c.apellidos}`,
                        DNI: c.dni,
                        ...diasObj,
                        Total: 0
                    })
                })

                uniqueRecords.forEach((record: any) => {
                    const fechaDia = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
                    const monto = Number(record.cobro_app || 0)
                    
                    // Sumar al total diario (Blue Line)
                    // Verificar que la fecha esté en el rango de la semana (diasMap tiene las keys correctas)
                    if (cobroRealPorDia.has(fechaDia)) {
                        const current = cobroRealPorDia.get(fechaDia) || 0
                        cobroRealPorDia.set(fechaDia, current + monto)
                    }

                    // Actualizar log por conductor
                    const logEntry = cobroAppPorConductor.get(record.dni)
                    if (logEntry) {
                        if (logEntry[fechaDia] !== undefined) {
                            logEntry[fechaDia] += monto
                            logEntry.Total += monto
                        }
                    }
                })

                // Mostrar Log Tabla
                console.table(Array.from(cobroAppPorConductor.values()))
            }
        } else {
            console.log('No hay conductores con garantía 50k para buscar en histórico.')
        }
        console.groupEnd()

        // Aplicar a cada día (Blue Line = Cobro App Real)
        diasMap.forEach(d => {
          // Mantener lógica anterior de Garantía Teórica (Green)
          d.garantiaTeorica += garantiaTeoricaDiaria
          
          // Nueva lógica Real (Blue)
          const diaStr = format(d.fecha, 'yyyy-MM-dd')
          d.garantiaReal = cobroRealPorDia.get(diaStr) || 0
        })

        // ---------------------------------------------------------
        // 3. CONSOLIDAR DATOS
        // ---------------------------------------------------------
        // Datos diarios base
        const dailyData = Array.from(diasMap.values()).map(d => {
          const diaStr = format(d.fecha, 'yyyy-MM-dd')
          const alquilerTeorico = alquilerTeoricoPorDia.get(diaStr) || 0
          
          const totalTeorico = d.garantiaTeorica + alquilerTeorico
          const totalReal = d.garantiaReal 
          
          return {
            ...d,
            teorico: totalTeorico,
            real: totalReal
          }
        })

        // Agregación según granularidad
        let finalData: any[] = []

        if (granularity === 'semana') {
             finalData = dailyData
        } else if (granularity === 'mes') {
            // Agrupar por Semana (Sem 01, Sem 02...)
            const grouped = new Map<string, { label: string, teorico: number, real: number, count: number }>()
            
            dailyData.forEach(d => {
                const weekNum = getWeek(d.fecha, { weekStartsOn: 1 })
                const key = `Sem ${weekNum.toString().padStart(2, '0')}`
                
                if (!grouped.has(key)) {
                    grouped.set(key, { label: key, teorico: 0, real: 0, count: 0 })
                }
                const g = grouped.get(key)!
                g.teorico += d.teorico
                g.real += d.real
                g.count++
            })
            
            finalData = Array.from(grouped.values()).map(g => ({
                dia: g.label, // Eje X
                teorico: g.teorico,
                real: g.real
            }))
        } else if (granularity === 'ano') {
            // Agrupar por Mes (Ene, Feb...)
            const grouped = new Map<string, { label: string, order: number, teorico: number, real: number }>()
            
            dailyData.forEach(d => {
                const monthName = format(d.fecha, 'MMM', { locale: es })
                const label = monthName.charAt(0).toUpperCase() + monthName.slice(1)
                const order = d.fecha.getMonth()
                
                if (!grouped.has(label)) {
                    grouped.set(label, { label, order, teorico: 0, real: 0 })
                }
                const g = grouped.get(label)!
                g.teorico += d.teorico
                g.real += d.real
            })
            
            finalData = Array.from(grouped.values())
                .sort((a, b) => a.order - b.order)
                .map(g => ({
                    dia: g.label, // Eje X
                    teorico: g.teorico,
                    real: g.real
                }))
        }

        console.log(`[CobroTeorico] Datos finales generados (${granularity}): ${finalData.length} puntos`)
        setChartData(finalData)

      } catch (error) {
        console.error('Error calculando cobro teórico vs real:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedPeriod, granularity, sedeActualId])

  const handleGranularityChange = (val: Granularity) => {
    setGranularity(val)
    const now = new Date()
    // Reset to current period for that granularity
    if (val === 'semana') {
      const week = getWeek(now, { weekStartsOn: 1 })
      setSelectedPeriod(`Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`)
    } else if (val === 'mes') {
      const monthName = format(now, 'MMM', { locale: es })
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
      setSelectedPeriod(`${capMonth} ${now.getFullYear()}`)
    } else if (val === 'ano') {
      setSelectedPeriod(now.getFullYear().toString())
    }
  }

  return (
    <div className="cobro-teorico-container">
      <div className="cobro-teorico-header">
        <h2 className="cobro-teorico-title">INGRESO ESPERADO VS PERCIBIDO</h2>
        
        <div className="cobro-teorico-controls">
           <div className="dashboard-granularity-buttons-container">
            <button
              type="button"
              className={granularity === 'semana' ? 'dashboard-granularity-button dashboard-granularity-button--active' : 'dashboard-granularity-button'}
              onClick={() => handleGranularityChange('semana')}
            >
              Semana
            </button>
            <button
              type="button"
              className={granularity === 'mes' ? 'dashboard-granularity-button dashboard-granularity-button--active' : 'dashboard-granularity-button'}
              onClick={() => handleGranularityChange('mes')}
            >
              Mes
            </button>
            <button
              type="button"
              className={granularity === 'ano' ? 'dashboard-granularity-button dashboard-granularity-button--active' : 'dashboard-granularity-button'}
              onClick={() => handleGranularityChange('ano')}
            >
              Año
            </button>
          </div>

          <PeriodPicker 
              granularity={granularity}
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              className="cobro-teorico-picker"
              align="right"
            />
        </div>
      </div>

      <div className="cobro-teorico-chart-wrapper">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            Cargando...
          </div>
        ) : (
          <ResponsiveContainer width="99%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-primary, #e5e7eb)" />
              <XAxis 
                dataKey="dia" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }}
                tickFormatter={formatCurrencyK}
                domain={['auto', 'auto']}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--text-tertiary, #9ca3af)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend 
                verticalAlign="top" 
                height={36}
                iconType="plainline"
                wrapperStyle={{ top: 0, right: 0, left: 0 }}
              />
              <Line
                type="linear"
                dataKey="teorico"
                name="INGRESO ESPERADO"
                stroke="#16a34a"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="real"
                name="INGRESO PERCIBIDO"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--card-bg, #ffffff)', stroke: '#2563eb', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#2563eb', stroke: 'var(--card-bg, #ffffff)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
