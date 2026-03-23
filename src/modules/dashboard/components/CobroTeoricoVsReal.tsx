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

const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'
function getCabifyTable(sedeId: string | null | undefined): string {
  return sedeId === SEDE_BARILOCHE_ID ? 'cabify_historico_bariloche' : 'cabify_historico'
}
import { normalizeDni } from '../../../utils/normalizeDocuments'
import { PeriodPicker } from './PeriodPicker'
import { CobroComparativo } from './CobroComparativo'
import './CobroTeoricoVsReal.css'

type Granularity = 'semana' | 'mes' | 'ano'
type ActiveTab = 'datos' | 'comparativo'

// Estructura de detalle de día trabajado por conductor
interface DiaDetalle {
  fecha: string        // "dd/MM/yyyy"
  fechaKey: string     // "yyyy-MM-dd" (para lookup interno)
  diaSemana: string    // "Lunes", "Martes", etc.
  horario: string      // "DIURNO" | "NOCTURNO" | "CARGO" | "-"
  trabajado: boolean
  alquilerDia: number  // Monto de alquiler para ese día
}

// Estructura de conductor filtrado (garantía 50k)
/*
interface ConductorFiltrado {
  id: string
  nombre: string
  dni: string
  diasTotal: number
  alquiler: number
  garantia: number
  diasDetalle: DiaDetalle[]
}
*/

// Helpers de fecha para consistencia con Facturación (Timezone Argentina)
const ARG_TZ = 'America/Argentina/Buenos_Aires'
const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function toArgDate(timestamp: string | null | undefined): string {
  if (!timestamp) return '-'
  return argDateFmt.format(new Date(timestamp))
}

// Datos de ejemplo iniciales
const INITIAL_DATA = (() => {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i)
    return {
      dia: `${format(d, 'EEE', { locale: es }).replace(/^\w/, (c: string) => c.toUpperCase())} ${format(d, 'dd/MM')}`,
      teorico: 0,
      real: 0,
    }
  })
})()

const formatCurrencyK = (value: number) => {
  return `$${Math.round(value / 1000)}K`
}

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Cálculo de variación porcentual
    const data = payload[0]?.payload || {};
    const teorico = Number(data.teorico || 0);
    const real = Number(data.real || 0);
    
    let variationElement = null;
    if (teorico > 0) {
      const diff = real - teorico;
      const percentage = Math.abs((diff / teorico) * 100).toFixed(1);
      const direction = diff >= 0 ? 'mayor' : 'menor';
      
      variationElement = (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4 }}>
          El INGRESO PERCIBIDO es un <span style={{ fontWeight: 600, color: diff >= 0 ? '#10b981' : '#ef4444' }}>{percentage}% {direction}</span> respecto a INGRESO ESPERADO
        </div>
      );
    }

    return (
      <div className="cobro-teorico-tooltip">
        <span className="cobro-teorico-tooltip-label">{label}</span>
        {payload.map((entry: any, index: number) => (
          <div key={index} style={{ marginBottom: 4 }}>
            <div className="cobro-teorico-tooltip-item" style={{ color: entry.color }}>
              <span style={{ fontWeight: 600 }}>{entry.name}:</span>
              <span>{formatCurrencyFull(entry.value)}</span>
            </div>
            {entry.dataKey === 'teorico' && entry.payload && (
               <div style={{ paddingLeft: 12, fontSize: '0.85em', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 1, marginTop: -2, marginBottom: 4 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                   <span>• Garantía:</span>
                   <span>{formatCurrencyFull(entry.payload.garantia || 0)}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                   <span>• Alquiler:</span>
                   <span>{formatCurrencyFull(entry.payload.alquiler || 0)}</span>
                 </div>
               </div>
            )}
          </div>
        ))}
        {variationElement}
      </div>
    )
  }
  return null
}

// =====================================================
// Helper: Ejecutar pipeline completo de cálculo para un rango de mes independiente.
// Retorna datos por día (garantiaTeorica, alquilerTeorico, cobroReal)
// usando los conductores, garantías y precios PROPIOS de ese mes.
// =====================================================
async function calcularPipelineMesIndependiente(
  rangeStart: Date,
  rangeEnd: Date,
  sedeActualId: string | null
): Promise<Map<string, { garantiaTeorica: number, alquilerTeorico: number, cobroReal: number }>> {
  const daysInt = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  const fIniStr = format(rangeStart, 'yyyy-MM-dd')
  const fFinStr = format(rangeEnd, 'yyyy-MM-dd')

  const resultado = new Map<string, { garantiaTeorica: number, alquilerTeorico: number, cobroReal: number }>()
  daysInt.forEach(d => resultado.set(format(d, 'yyyy-MM-dd'), { garantiaTeorica: 0, alquilerTeorico: 0, cobroReal: 0 }))

  // 1. Precios
  const [histRes, nomRes] = await Promise.all([
    (supabase.from('conceptos_facturacion_historial') as any)
      .select('codigo, precio_base, precio_final, fecha_vigencia_desde, fecha_vigencia_hasta')
      .in('codigo', ['P001', 'P002', 'P003', 'P013', 'P014', 'P015', 'P016'])
      .lte('fecha_vigencia_desde', fFinStr)
      .gte('fecha_vigencia_hasta', fIniStr),
    supabase.from('conceptos_nomina')
      .select('codigo, precio_base, precio_final')
      .eq('activo', true)
      .in('codigo', ['P001', 'P002', 'P003', 'P013', 'P014', 'P015', 'P016']),
  ])
  const pMap = new Map<string, number>()
  ;(nomRes.data || []).forEach((c: any) => pMap.set(c.codigo, c.precio_final ?? c.precio_base ?? 0))
  const hPorCod = new Map<string, any[]>()
  for (const h of (histRes.data || [])) {
    const arr = hPorCod.get(h.codigo) || []
    arr.push(h)
    hPorCod.set(h.codigo, arr)
  }
  const getPrecio = (codigo: string, fecha: Date): number => {
    const fs = fecha.toISOString().split('T')[0]
    const regs = hPorCod.get(codigo)
    if (regs) { for (const h of regs) { if (h.fecha_vigencia_desde <= fs && h.fecha_vigencia_hasta >= fs) return h.precio_final ?? h.precio_base } }
    return pMap.get(codigo) || 0
  }

  // 2. Descubrimiento de conductores (overlap generoso)
  const { data: asigDesc } = await (supabase.from('asignaciones_conductores') as any)
    .select(`conductor_id, horario, fecha_inicio, fecha_fin, estado,
      asignaciones!inner(horario, estado, fecha_fin, vehiculo_id, vehiculos(patente)),
      conductores!inner(numero_dni, sede_id)`)
    .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])
  const dnisDesc = new Set<string>()
  for (const ac of (asigDesc || []) as any[]) {
    const cond = ac.conductores; const asig = ac.asignaciones
    if (!cond || !asig) continue
    if (sedeActualId && cond.sede_id !== sedeActualId) continue
    const ep = (asig.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(ep)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(ep) && !asig.fecha_fin) continue
    const acIni = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : new Date('2020-01-01')
    const acFn = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin)) : (asig.fecha_fin ? parseISO(toArgDate(asig.fecha_fin)) : new Date('2099-12-31'))
    if (acFn < rangeStart || acIni > rangeEnd) continue
    dnisDesc.add(cond.numero_dni)
  }
  if (dnisDesc.size === 0) return resultado

  // 3. Datos de conductores
  const dnisList = Array.from(dnisDesc)
  let qC = supabase.from('conductores').select('id, nombres, apellidos, numero_dni, fecha_terminacion').in('numero_dni', dnisList)
  if (sedeActualId) qC = qC.eq('sede_id', sedeActualId)
  const { data: condData } = await qC
  const cInfoMap = new Map<string, any>()
  const fTermMap = new Map<string, Date>()
  for (const c of (condData || []) as any[]) {
    cInfoMap.set(c.id, { id: c.id, nombres: c.nombres, apellidos: c.apellidos, dni: c.numero_dni })
    if (c.fecha_terminacion) fTermMap.set(c.id, parseISO(c.fecha_terminacion))
  }
  const cIds = Array.from(cInfoMap.keys())
  if (cIds.length === 0) return resultado

  // 4. Asignaciones detalladas
  const { data: asigDet } = await (supabase.from('asignaciones_conductores') as any)
    .select('id, conductor_id, horario, fecha_inicio, fecha_fin, estado, asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)')
    .in('conductor_id', cIds)
    .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

  const diasTrabMap = new Map<string, Map<string, string>>()
  const alqMap = new Map<string, number>()
  interface PrAdj { CARGO: number; TURNO_DIURNO: number; TURNO_NOCTURNO: number; monto_CARGO: number; monto_TURNO_DIURNO: number; monto_TURNO_NOCTURNO: number }
  const prMap = new Map<string, PrAdj>()
  const asigPorC = new Map<string, Array<{ modalidad: string; codigoConcepto: string; fechaInicio: Date; fechaFin: Date }>>()
  cIds.forEach(id => {
    diasTrabMap.set(id, new Map()); alqMap.set(id, 0)
    prMap.set(id, { CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0, monto_CARGO: 0, monto_TURNO_DIURNO: 0, monto_TURNO_NOCTURNO: 0 })
    asigPorC.set(id, [])
  })

  // Pase 1: Contar días
  for (const ac of (asigDet || []) as any[]) {
    const asignacion = ac.asignaciones
    if (!asignacion) continue
    const ep = (asignacion.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(ep)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(ep) && !asignacion.fecha_fin) continue
    const cIni = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : null
    const pIni = asignacion.fecha_inicio ? parseISO(toArgDate(asignacion.fecha_inicio)) : null
    const acInicio = cIni && pIni ? (cIni > pIni ? cIni : pIni) : (cIni || pIni || rangeStart)
    const cFin = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin)) : null
    const pFin = asignacion.fecha_fin ? parseISO(toArgDate(asignacion.fecha_fin)) : null
    const acFin = cFin && pFin ? (cFin < pFin ? cFin : pFin) : (cFin || pFin || rangeEnd)
    const efIni = acInicio < rangeStart ? rangeStart : acInicio
    let efFn = acFin > rangeEnd ? rangeEnd : acFin
    const tieneFinP = ac.fecha_fin || asignacion.fecha_fin
    const fT = fTermMap.get(ac.conductor_id)
    if (fT && !tieneFinP && efFn > fT) efFn = fT
    if (efIni > efFn) continue

    const modA = asignacion.horario
    const hL = (ac.horario || '').toLowerCase().trim()
    let modalidad = 'CARGO', codConc = 'P002', horLabel = 'CARGO'
    if (modA === 'CARGO' || hL === 'todo_dia') { modalidad = 'CARGO'; codConc = 'P002'; horLabel = 'CARGO' }
    else if (modA === 'TURNO') {
      if (hL === 'nocturno' || hL === 'n') { modalidad = 'TURNO_NOCTURNO'; codConc = 'P013'; horLabel = 'NOCTURNO' }
      else { modalidad = 'TURNO_DIURNO'; codConc = 'P001'; horLabel = 'DIURNO' }
    }
    const dm = diasTrabMap.get(ac.conductor_id)!
    const pr = prMap.get(ac.conductor_id)!
    let diasR = 0
    let cur = new Date(efIni)
    while (cur <= efFn) {
      const ds = format(cur, 'yyyy-MM-dd')
      if (!dm.has(ds)) {
        dm.set(ds, horLabel)
        if (modalidad === 'CARGO') pr.CARGO++
        else if (modalidad === 'TURNO_NOCTURNO') pr.TURNO_NOCTURNO++
        else pr.TURNO_DIURNO++
        diasR++
      }
      cur = addDays(cur, 1)
    }
    if (diasR <= 0) continue
    asigPorC.get(ac.conductor_id)!.push({ modalidad, codigoConcepto: codConc, fechaInicio: efIni, fechaFin: efFn })
  }

  // Pase 2: Calcular montos
  const codPorMod: Record<string, string> = { 'CARGO': 'P002', 'TURNO_DIURNO': 'P001', 'TURNO_NOCTURNO': 'P013' }
  for (const [cId, asigs] of asigPorC.entries()) {
    const pr = prMap.get(cId)
    if (!pr) continue
    for (const a of asigs) {
      const cod = codPorMod[a.modalidad]
      const mk = `monto_${a.modalidad}` as keyof PrAdj
      const cd = new Date(a.fechaInicio)
      while (cd <= a.fechaFin) { (pr as any)[mk] += getPrecio(cod, cd); cd.setDate(cd.getDate() + 1) }
    }
    pr.monto_CARGO = Math.round(pr.monto_CARGO)
    pr.monto_TURNO_DIURNO = Math.round(pr.monto_TURNO_DIURNO)
    pr.monto_TURNO_NOCTURNO = Math.round(pr.monto_TURNO_NOCTURNO)
    alqMap.set(cId, pr.monto_CARGO + pr.monto_TURNO_DIURNO + pr.monto_TURNO_NOCTURNO)
  }

  // 5. Garantías y filtro 50k
  const condActivos = Array.from(cInfoMap.values()).filter(c => { const d = diasTrabMap.get(c.id); return d && d.size > 0 })
  const [garRes, p003Res] = await Promise.all([
    supabase.from('garantias_conductores')
      .select('conductor_id, monto_cuota_semanal, estado, cuotas_pagadas, cuotas_totales')
      .in('conductor_id', cIds),
    supabase.from('conceptos_nomina').select('codigo, precio_base, precio_final')
      .eq('codigo', 'P003').eq('activo', true).maybeSingle()
  ])
  const gMap = new Map<string, any>()
  garRes.data?.forEach((g: any) => gMap.set(g.conductor_id, g))
  const pp003 = p003Res.data?.precio_final ?? p003Res.data?.precio_base ?? 7143
  const cuotaDef = Math.round(pp003 * 7)
  const gCalcMap = new Map<string, number>()
  condActivos.forEach(c => {
    const g = gMap.get(c.id)
    let sub = 0
    if (g) {
      const compl = g.estado === 'completada' || g.estado === 'cancelada' || (g.cuotas_pagadas >= g.cuotas_totales && g.cuotas_totales > 0)
      if (!compl) sub = g.monto_cuota_semanal || cuotaDef
    } else { sub = cuotaDef }
    gCalcMap.set(c.id, sub)
  })
  const cond50k = condActivos.filter(c => gCalcMap.get(c.id) === 50000)
  const garTeoDiaria = (50000 * cond50k.length) / 7

  // 6. Alquiler teórico por día (solo 50k)
  const alqTeoPorDia = new Map<string, number>()
  daysInt.forEach(d => alqTeoPorDia.set(format(d, 'yyyy-MM-dd'), 0))
  cond50k.forEach(c => {
    const alqT = alqMap.get(c.id) || 0
    const dias = diasTrabMap.get(c.id)
    if (!dias || dias.size === 0) return
    const alqDia = alqT / dias.size
    for (const [ds] of dias.entries()) { alqTeoPorDia.set(ds, (alqTeoPorDia.get(ds) || 0) + alqDia) }
  })

  // 7. Cobro real (cabify_historico / cabify_historico_bariloche según sede)
  const dnis50k = cond50k.map(c => normalizeDni(c.dni)).filter(Boolean)
  const cobroRealPorDia = new Map<string, number>()
  daysInt.forEach(d => cobroRealPorDia.set(format(d, 'yyyy-MM-dd'), 0))
  if (dnis50k.length > 0) {
    const { data: hist } = await supabase.from(getCabifyTable(sedeActualId))
      .select('fecha_inicio, cobro_app, dni, fecha_guardado')
      .in('dni', dnis50k)
      .gte('fecha_inicio', fIniStr)
      .lte('fecha_inicio', fFinStr + 'T23:59:59')
    const uniqM = new Map<string, any>()
    hist?.forEach((r: any) => {
      if (!r.dni) return
      const fd = r.fecha_inicio ? r.fecha_inicio.split('T')[0] : ''
      const uk = `${r.dni}_${fd}`
      const ex = uniqM.get(uk)
      if (!ex || new Date(r.fecha_guardado || 0) > new Date(ex.fecha_guardado || 0)) uniqM.set(uk, r)
    })
    for (const r of Array.from(uniqM.values())) {
      const fd = r.fecha_inicio.split('T')[0]
      if (cobroRealPorDia.has(fd)) cobroRealPorDia.set(fd, (cobroRealPorDia.get(fd) || 0) + Number(r.cobro_app || 0))
    }
  }

  // 8. Construir resultado
  for (const d of daysInt) {
    const ds = format(d, 'yyyy-MM-dd')
    resultado.set(ds, {
      garantiaTeorica: garTeoDiaria,
      alquilerTeorico: alqTeoPorDia.get(ds) || 0,
      cobroReal: cobroRealPorDia.get(ds) || 0
    })
  }
  return resultado
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('datos')
  // const [conductoresFiltrados, setConductoresFiltrados] = useState<ConductorFiltrado[]>([])

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

        // ---------------------------------------------------------
        // 1. OBTENER CONDUCTORES Y ASIGNACIONES (Lógica Reporte Facturación)
        // Flujo de 2 pasos: 1a) Descubrimiento generoso → 1.1) Cálculo detallado
        // ---------------------------------------------------------

        // Nombres de días de la semana para el mapeo
        const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

        // 1.1 Obtener precios: historial + nomina (fallback) — misma lógica que Facturación
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

        // Fallback: precios actuales de conceptos_nomina
        const preciosMap = new Map<string, number>()
        ;(conceptosNomina || []).forEach((c: any) => {
          preciosMap.set(c.codigo, c.precio_final ?? c.precio_base ?? 0)
        })

        // Pre-indexar historial por código para O(1) lookup
        const historialPorCodigo = new Map<string, any[]>()
        for (const h of (historialPrecios || [])) {
          const arr = historialPorCodigo.get(h.codigo) || []
          arr.push(h)
          historialPorCodigo.set(h.codigo, arr)
        }

        // Helper: obtener precio vigente en una fecha específica (réplica de getPrecioEnFechaVP)
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

        // =====================================================
        // PASO 1a: DESCUBRIMIENTO DE CONDUCTORES (overlap generoso)
        // Misma lógica que Facturación paso 1a — defaults 2020/2099
        // =====================================================
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

          // Filtro de sede EN MEMORIA (igual que Facturación)
          if (sedeActualId && cond.sede_id !== sedeActualId) continue

          // Skip programadas y huérfanos
          const estadoPadre = (asig.estado || '').toLowerCase()
          if (['programado', 'programada'].includes(estadoPadre)) continue
          if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asig.fecha_fin) continue

          // Overlap GENEROSO (mismos defaults que Facturación: 2020 / 2099)
          const acInicioGen = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : new Date('2020-01-01')
          const acFinGen = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin))
            : (asig.fecha_fin ? parseISO(toArgDate(asig.fecha_fin)) : new Date('2099-12-31'))

          if (acFinGen < startDate || acInicioGen > endDate) continue

          dnisDescubiertos.add(cond.numero_dni)
        }

        // Obtener datos completos de los conductores descubiertos
        if (dnisDescubiertos.size === 0) {
          // setConductoresFiltrados([])
          setChartData(Array.from(diasMap.values()).map(d => ({
            dia: d.dia, teorico: 0, real: 0, garantia: 0, alquiler: 0
          })))
          setLoading(false)
          return
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

        // =====================================================
        // PASO 1.1: CÁLCULO DETALLADO DE DÍAS (lógica estricta)
        // Segunda query con conductor_ids conocidos
        // =====================================================
        const conductorIds = Array.from(conductorInfoMap.keys())

        const { data: asignacionesDetalle } = await (supabase
          .from('asignaciones_conductores') as any)
          .select(`
            id, conductor_id, horario, fecha_inicio, fecha_fin, estado,
            asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)
          `)
          .in('conductor_id', conductorIds)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

        // Map<conductor_id, Map<fecha_str, horario>> — guarda fecha Y horario (deduplicado)
        const diasTrabajadosPorConductor = new Map<string, Map<string, string>>()
        const alquilerPorConductor = new Map<string, number>()

        // Prorrateo por modalidad (réplica exacta de ProrrateoVistaPrevia de Facturación)
        interface Prorrateo {
          CARGO: number; TURNO_DIURNO: number; TURNO_NOCTURNO: number;
          monto_CARGO: number; monto_TURNO_DIURNO: number; monto_TURNO_NOCTURNO: number;
        }
        const prorrateoMap = new Map<string, Prorrateo>()

        // Guardar asignaciones procesadas por conductor para segundo pase de montos
        const asignacionesPorConductor = new Map<string, Array<{
          modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO';
          codigoConcepto: string;
          fechaInicio: Date;
          fechaFin: Date;
        }>>()

        // Inicializar estructuras para todos los conductores
        conductorIds.forEach(id => {
          diasTrabajadosPorConductor.set(id, new Map())
          alquilerPorConductor.set(id, 0)
          prorrateoMap.set(id, {
            CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0,
            monto_CARGO: 0, monto_TURNO_DIURNO: 0, monto_TURNO_NOCTURNO: 0
          })
          asignacionesPorConductor.set(id, [])
        })

        // -------------------------------------------------------
        // PASE 1: Contar días DEDUPLICANDO por fecha (para diasTotal)
        // Réplica de Facturación líneas 1188-1256
        // -------------------------------------------------------
        for (const ac of (asignacionesDetalle || []) as any[]) {
          const asignacion = ac.asignaciones
          if (!asignacion) continue

          const estadoPadre = (asignacion.estado || '').toLowerCase()
          if (['programado', 'programada'].includes(estadoPadre)) continue
          if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asignacion.fecha_fin) continue

          // Inicio: MAX entre conductor y padre (normalizar a TZ Argentina)
          const conductorInicioD = ac.fecha_inicio ? parseISO(toArgDate(ac.fecha_inicio)) : null
          const padreInicioD = asignacion.fecha_inicio ? parseISO(toArgDate(asignacion.fecha_inicio)) : null
          const acInicio = conductorInicioD && padreInicioD
            ? (conductorInicioD > padreInicioD ? conductorInicioD : padreInicioD)
            : (conductorInicioD || padreInicioD || startDate)

          // Fin: MIN entre conductor y padre
          const conductorFinD = ac.fecha_fin ? parseISO(toArgDate(ac.fecha_fin)) : null
          const padreFinD = asignacion.fecha_fin ? parseISO(toArgDate(asignacion.fecha_fin)) : null
          const acFin = conductorFinD && padreFinD
            ? (conductorFinD < padreFinD ? conductorFinD : padreFinD)
            : (conductorFinD || padreFinD || endDate)

          // Rango efectivo dentro del período
          const efInicio = acInicio < startDate ? startDate : acInicio
          let efFin = acFin > endDate ? endDate : acFin

          // Tope por fecha_terminacion (solo si la asignación no tiene fin propio)
          const tieneFinPropio = ac.fecha_fin || asignacion.fecha_fin
          const fechaTerm = fechaTermMap.get(ac.conductor_id)
          if (fechaTerm && !tieneFinPropio && efFin > fechaTerm) {
            efFin = fechaTerm
          }

          if (efInicio > efFin) continue

          // Determinar modalidad
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

          // Contar días DEDUPLICANDO (para diasTotal y horarioLabel)
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

          // Guardar asignación para el segundo pase de montos
          asignacionesPorConductor.get(ac.conductor_id)!.push({
            modalidad,
            codigoConcepto,
            fechaInicio: efInicio,
            fechaFin: efFin,
          })
        }

        // -------------------------------------------------------
        // PASE 2: Calcular MONTOS con precios históricos SIN deduplicar
        // Réplica exacta de Facturación líneas 1335-1355
        // -------------------------------------------------------
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

          // Redondear montos (igual que Facturación)
          prorrateo.monto_CARGO = Math.round(prorrateo.monto_CARGO)
          prorrateo.monto_TURNO_DIURNO = Math.round(prorrateo.monto_TURNO_DIURNO)
          prorrateo.monto_TURNO_NOCTURNO = Math.round(prorrateo.monto_TURNO_NOCTURNO)

          // subtotalAlquiler = monto_CARGO + monto_TURNO_DIURNO + monto_TURNO_NOCTURNO
          const subtotalAlquiler = prorrateo.monto_CARGO + prorrateo.monto_TURNO_DIURNO + prorrateo.monto_TURNO_NOCTURNO
          alquilerPorConductor.set(conductorId, subtotalAlquiler)
        }

        // -------------------------------------------------------
        // OVERRIDE: Si existe período guardado, usar subtotal_alquiler de BD
        // Facturación muestra datos guardados en facturacion_conductores,
        // que pueden diferir de los precios actuales de conceptos_nomina
        // -------------------------------------------------------
        // let alquilerGuardadoInfo = ''
        // if (granularity === 'semana') {
        //   const matchPeriodo = selectedPeriod.match(/Sem (\d+) (\d{4})/)
        //   if (matchPeriodo) {
        //     const semanaNum = parseInt(matchPeriodo[1])
        //     const anioQuery = parseInt(matchPeriodo[2])
        //     // Buscar período guardado
        //     const { data: periodoData } = await (supabase.from('periodos_facturacion') as any)
        //       .select('id')
        //       .eq('semana', semanaNum)
        //       .eq('anio', anioQuery)
        //       .order('created_at', { ascending: false })
        //       .limit(1)

        //     const periodoGuardado = periodoData?.[0]
        //     if (periodoGuardado) {
        //       // Cargar subtotal_alquiler guardado por conductor_id
        //       const { data: factGuardadas } = await (supabase
        //         .from('facturacion_conductores') as any)
        //         .select('conductor_id, subtotal_alquiler')
        //         .eq('periodo_id', periodoGuardado.id)

        //       if (factGuardadas && factGuardadas.length > 0) {
        //         let overrideCount = 0
        //         for (const fg of factGuardadas) {
        //           if (alquilerPorConductor.has(fg.conductor_id) && fg.subtotal_alquiler != null) {
        //             alquilerPorConductor.set(fg.conductor_id, fg.subtotal_alquiler)
        //             overrideCount++
        //           }
        //         }
        //         alquilerGuardadoInfo = `OVERRIDE: ${overrideCount} conductores con alquiler de BD (periodo ${periodoGuardado.id})`
        //       }
        //     }
        //   }
        // }

        // Calcular alquiler por día para el gráfico (usando prorrateo por día)
        // Aquí distribuimos el subtotalAlquiler proporcionalmente por día trabajado
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

        // Filtrar conductores con 0 días (no aportan a facturación)
        const conductoresActivos = Array.from(conductorInfoMap.values()).filter(c => {
          const dias = diasTrabajadosPorConductor.get(c.id)
          return dias && dias.size > 0
        })

        // ---------------------------------------------------------
        // 2. CÁLCULO DE GARANTÍA (Misma lógica que Facturación)
        // ---------------------------------------------------------

        // Obtener garantías configuradas (SIN FILTRO de estado para replicar lógica de Reporte)
        const { data: garantiasData } = await supabase
          .from('garantias_conductores')
          .select('conductor_id, monto_cuota_semanal, estado, cuotas_pagadas, cuotas_totales')
          .in('conductor_id', conductorIds)

        const garantiaMap = new Map<string, any>()
        garantiasData?.forEach((g: any) => garantiaMap.set(g.conductor_id, g))

        // Obtener P003 para cuota de garantía default (igual que Facturación)
        const { data: conceptoP003 } = await supabase
          .from('conceptos_nomina')
          .select('codigo, precio_base, precio_final')
          .eq('codigo', 'P003')
          .eq('activo', true)
          .maybeSingle()

        const precioP003 = conceptoP003?.precio_final ?? conceptoP003?.precio_base ?? 7143
        const cuotaGarantiaSemanalDefault = Math.round(precioP003 * 7)

        // Calcular subtotalGarantia por conductor (misma fórmula que Facturación)
        // y filtrar los que tienen exactamente 50000
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

        // Filtro: conductores cuya garantía calculada es 50000
        const conductoresConGarantia50k = conductoresActivos.filter(c => {
          return garantiaCalculadaMap.get(c.id) === 50000
        })

        const totalGarantiaTeoricaSemanal = 50000 * conductoresConGarantia50k.length
        const garantiaTeoricaDiaria = totalGarantiaTeoricaSemanal / 7

        // C) ALQUILER TEÓRICO (Green): Suma de alquileres SOLO de conductores 50k
        // Calcular alquiler teórico por día sumando contribución de cada conductor 50k
        const alquilerTeoricoPorDia = new Map<string, number>()
        daysInterval.forEach(d => {
          alquilerTeoricoPorDia.set(format(d, 'yyyy-MM-dd'), 0)
        })

        conductoresConGarantia50k.forEach(c => {
          const alquilerTotal = alquilerPorConductor.get(c.id) || 0
          const dias = diasTrabajadosPorConductor.get(c.id)
          if (!dias || dias.size === 0) return
          // Distribuir alquiler proporcionalmente entre días trabajados
          const alquilerDiaProporcional = alquilerTotal / dias.size
          for (const [diaStr] of dias.entries()) {
            const current = alquilerTeoricoPorDia.get(diaStr) || 0
            alquilerTeoricoPorDia.set(diaStr, current + alquilerDiaProporcional)
          }
        })

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

        // Aplicar a cada día
        diasMap.forEach(d => {
          d.garantiaTeorica += garantiaTeoricaDiaria
          d.garantiaReal += garantiaRealDiaria
        })
        */

        // ---------------------------------------------------------
        // CONSTRUIR ESTRUCTURA ConductorFiltrado[] (conductores 50k)
        // ---------------------------------------------------------
        // const conductoresFiltradosResult: ConductorFiltrado[] = conductoresConGarantia50k.map(c => {
        // const conductoresFiltradosResult = conductoresConGarantia50k.map(c => {
        conductoresConGarantia50k.map(c => {
          const diasMap2 = diasTrabajadosPorConductor.get(c.id) || new Map<string, string>()
          const alquiler = alquilerPorConductor.get(c.id) || 0
          const garantiaMonto = garantiaCalculadaMap.get(c.id) || 50000

          // Construir diasDetalle
          // Distribuir alquiler (potencialmente overrideado desde BD) proporcionalmente por día
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
            garantia: garantiaMonto,
            diasDetalle,
          }
        }).sort((a, b) => a.nombre.localeCompare(b.nombre))

        // setConductoresFiltrados(conductoresFiltradosResult)

        // ---------------------------------------------------------
        // NUEVA LÓGICA BLUE LINE: COBRO APP DE CONDUCTORES 50K
        // ---------------------------------------------------------
        const dnis50k = conductoresConGarantia50k.map(c => normalizeDni(c.dni)).filter(Boolean)
        const cobroRealPorDia = new Map<string, number>()
        
        // Inicializar mapa de cobro real por día
        daysInterval.forEach((d) => {
            const diaStr = format(d, 'yyyy-MM-dd')
            cobroRealPorDia.set(diaStr, 0)
        })

        if (dnis50k.length > 0) {
            // Consultar histórico (tabla dinámica según sede)
            const { data: historicoData, error: historicoError } = await supabase
                .from(getCabifyTable(sedeActualId))
                .select('fecha_inicio, cobro_app, dni, fecha_guardado, cabify_driver_id')
                .in('dni', dnis50k)
                .gte('fecha_inicio', format(startDate, 'yyyy-MM-dd'))
                .lte('fecha_inicio', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')

            if (historicoError) {
                // silently ignored
            } else {
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

                // 2. Agrupar por conductor para logs y sumar al total diario
                const cobroAppPorConductor = new Map<string, any>()

                // Inicializar estructura para logs
                conductoresConGarantia50k.forEach(c => {
                    const diasObj: any = {}
                    daysInterval.forEach(d => {
                        const diaStr = format(d, 'yyyy-MM-dd')
                        diasObj[diaStr] = 0
                    })
                    
                    cobroAppPorConductor.set(normalizeDni(c.dni), {
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
                    const logEntry = cobroAppPorConductor.get(normalizeDni(record.dni))
                    if (logEntry) {
                        if (logEntry[fechaDia] !== undefined) {
                            logEntry[fechaDia] += monto
                            logEntry.Total += monto
                        }
                    }
                })

            }
        }

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
            real: totalReal,
            garantia: d.garantiaTeorica,
            alquiler: alquilerTeorico
          }
        })

        // Agregación según granularidad
        let finalData: any[] = []

        if (granularity === 'semana') {
             finalData = dailyData
        } else if (granularity === 'mes') {
            // === PASO A: Agrupar datos del mes por Semana (Sem 01, Sem 02...) ===
            const grouped = new Map<string, { label: string, teorico: number, real: number, count: number, garantia: number, alquiler: number }>()

            dailyData.forEach(d => {
                const weekNum = getWeek(d.fecha, { weekStartsOn: 1 })
                const key = `Sem ${weekNum.toString().padStart(2, '0')}`

                if (!grouped.has(key)) {
                    grouped.set(key, { label: key, teorico: 0, real: 0, count: 0, garantia: 0, alquiler: 0 })
                }
                const g = grouped.get(key)!
                g.teorico += d.teorico
                g.real += d.real
                g.garantia += (d as any).garantia
                g.alquiler += (d as any).alquiler
                g.count++
            })

            // === PASO B: Identificar semanas de borde y calcular con pipeline independiente por mes ===
            const firstWeekMonday = startOfWeek(startDate, { weekStartsOn: 1 })
            const lastWeekSunday = endOfWeek(endDate, { weekStartsOn: 1 })

            const compDaysBefore: Date[] = []
            if (firstWeekMonday < startDate) {
              let d = new Date(firstWeekMonday)
              while (d < startDate) { compDaysBefore.push(new Date(d)); d = addDays(d, 1) }
            }
            const compDaysAfter: Date[] = []
            if (lastWeekSunday > endDate) {
              let d = addDays(endDate, 1)
              while (d <= lastWeekSunday) { compDaysAfter.push(new Date(d)); d = addDays(d, 1) }
            }

            const hasBefore = compDaysBefore.length > 0
            const hasAfter = compDaysAfter.length > 0

            if (hasBefore || hasAfter) {
              // Ejecutar pipelines INDEPENDIENTES para los meses adyacentes en paralelo
              const [prevMonthResult, nextMonthResult] = await Promise.all([
                hasBefore
                  ? calcularPipelineMesIndependiente(
                      startOfMonth(addDays(startDate, -1)),
                      endOfMonth(addDays(startDate, -1)),
                      sedeActualId
                    )
                  : Promise.resolve(null),
                hasAfter
                  ? calcularPipelineMesIndependiente(
                      startOfMonth(addDays(endDate, 1)),
                      endOfMonth(addDays(endDate, 1)),
                      sedeActualId
                    )
                  : Promise.resolve(null),
              ])

              // Sumar datos del mes ANTERIOR (pipeline independiente) a la primera semana
              if (hasBefore && prevMonthResult) {
                const weekNum = getWeek(compDaysBefore[0], { weekStartsOn: 1 })
                const weekKey = `Sem ${weekNum.toString().padStart(2, '0')}`
                const g = grouped.get(weekKey)
                if (g) {
                  let adjTeorico = 0, adjReal = 0, adjGarantia = 0, adjAlquiler = 0
                  for (const cd of compDaysBefore) {
                    const diaStr = format(cd, 'yyyy-MM-dd')
                    const datos = prevMonthResult.get(diaStr)
                    if (datos) {
                      adjGarantia += datos.garantiaTeorica
                      adjAlquiler += datos.alquilerTeorico
                      adjTeorico += datos.garantiaTeorica + datos.alquilerTeorico
                      adjReal += datos.cobroReal
                    }
                  }
                  g.teorico += adjTeorico
                  g.real += adjReal
                  g.garantia += adjGarantia
                  g.alquiler += adjAlquiler
                  g.count += compDaysBefore.length
                }
              }

              // Sumar datos del mes SIGUIENTE (pipeline independiente) a la última semana
              if (hasAfter && nextMonthResult) {
                const weekNum = getWeek(compDaysAfter[0], { weekStartsOn: 1 })
                const weekKey = `Sem ${weekNum.toString().padStart(2, '0')}`
                const g = grouped.get(weekKey)
                if (g) {
                  let adjTeorico = 0, adjReal = 0, adjGarantia = 0, adjAlquiler = 0
                  for (const cd of compDaysAfter) {
                    const diaStr = format(cd, 'yyyy-MM-dd')
                    const datos = nextMonthResult.get(diaStr)
                    if (datos) {
                      adjGarantia += datos.garantiaTeorica
                      adjAlquiler += datos.alquilerTeorico
                      adjTeorico += datos.garantiaTeorica + datos.alquilerTeorico
                      adjReal += datos.cobroReal
                    }
                  }
                  g.teorico += adjTeorico
                  g.real += adjReal
                  g.garantia += adjGarantia
                  g.alquiler += adjAlquiler
                  g.count += compDaysAfter.length
                }
              }
            }

            finalData = Array.from(grouped.values()).map(g => ({
                dia: g.label,
                teorico: g.teorico,
                real: g.real,
                garantia: g.garantia,
                alquiler: g.alquiler
            }))
        } else if (granularity === 'ano') {
            // Agrupar por Mes (Ene, Feb...)
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
                g.garantia += (d as any).garantia
                g.alquiler += (d as any).alquiler
            })
            
            finalData = Array.from(grouped.values())
                .sort((a, b) => a.order - b.order)
                .map(g => ({
                    dia: g.label, // Eje X
                    teorico: g.teorico,
                    real: g.real,
                    garantia: g.garantia,
                    alquiler: g.alquiler
                }))
        }

        setChartData(finalData)

      } catch {
        // silently ignored
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
      {/* Tabs de navegación */}
      <div className="cobro-teorico-tabs">
        <button
          type="button"
          className={`cobro-teorico-tab ${activeTab === 'datos' ? 'cobro-teorico-tab--active' : ''}`}
          onClick={() => setActiveTab('datos')}
        >
          Gráfico de Datos
        </button>
        <button
          type="button"
          className={`cobro-teorico-tab ${activeTab === 'comparativo' ? 'cobro-teorico-tab--active' : ''}`}
          onClick={() => setActiveTab('comparativo')}
        >
          Gráfico Comparativo
        </button>
      </div>

      {activeTab === 'datos' ? (
        <>
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
                    wrapperStyle={{ top: 0, right: 0, left: 0, fontSize: '0.92rem' }}
                    formatter={(value: string) => {
                      const match = value.match(/^(.+?)\s*\((.+)\)$/)
                      if (match) {
                        return (
                          <span style={{ color: '#374151', fontWeight: 600 }}>
                            {match[1]} <span style={{ fontSize: '0.78em', opacity: 0.6 }}>({match[2]})</span>
                          </span>
                        )
                      }
                      return <span style={{ color: '#374151', fontWeight: 600 }}>{value}</span>
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="teorico"
                    name={`Ingreso Esperado (${selectedPeriod.replace(/\s+\d{4}$/, '')})`}
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="real"
                    name={`Ingreso Percibido (${selectedPeriod.replace(/\s+\d{4}$/, '')})`}
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

        </>
      ) : (
        <CobroComparativo
          granularity={granularity}
          onGranularityChange={handleGranularityChange}
        />
      )}
    </div>
  )
}
