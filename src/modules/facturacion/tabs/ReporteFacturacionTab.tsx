/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Filter,
  AlertCircle,
  Calculator,
  Gauge,
  Edit2,
  Search
} from 'lucide-react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { formatCurrency, formatDate, FACTURACION_CONFIG, calcularMora } from '../../../types/facturacion.types'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, parseISO, differenceInDays, isAfter, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'
import { RITPreviewTable, type RITPreviewRow } from '../components/RITPreviewTable'
import { FacturacionPreviewTable, type FacturacionPreviewRow, type ConceptoPendiente, type ConceptoNomina } from '../components/FacturacionPreviewTable'
import { CabifyPreviewTable, type CabifyPreviewRow } from '../components/CabifyPreviewTable'

// Tipos para datos de facturación generada
interface FacturacionConductor {
  id: string
  periodo_id: string
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  tipo_alquiler: 'CARGO' | 'TURNO'
  turnos_base: number
  turnos_cobrados: number
  factor_proporcional: number
  subtotal_alquiler: number
  subtotal_garantia: number
  subtotal_cargos: number
  subtotal_descuentos: number
  subtotal_neto: number
  saldo_anterior: number
  dias_mora: number
  monto_mora: number
  total_a_pagar: number
  estado: string
  created_at: string
  // Datos de Cabify (Vista Previa)
  ganancia_cabify?: number
  cubre_cuota?: boolean
  cuota_garantia_numero?: string // ej: "15/20"
  // Datos detallados para RIT export (P005, P006, P007)
  monto_peajes?: number       // P005 - Peajes de Cabify
  monto_excesos?: number      // P006 - Excesos de KM
  km_exceso?: number          // KM de exceso
  monto_penalidades?: number  // P007 - Penalidades
  // Detalle de penalidades para el modal
  penalidades_detalle?: Array<{
    monto: number
    detalle: string
    tipo: 'completa' | 'cuota'
    cuotaNum?: number
    totalCuotas?: number
  }>
}

interface FacturacionDetalle {
  id: string
  facturacion_id: string
  concepto_codigo: string
  concepto_descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  total: number
  es_descuento: boolean
  referencia_id: string | null
  referencia_tipo: string | null
}

// Tipo para excesos de km asociados a cada conductor
interface ExcesoKm {
  id: string
  conductor_id: string
  km_exceso: number
  monto_total: number
  aplicado: boolean
}

interface PeriodoFacturacion {
  id: string
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  estado: 'abierto' | 'cerrado' | 'procesando' | 'sin_generar'
  total_conductores: number
  total_cargos: number
  total_descuentos: number
  total_neto: number
  fecha_cierre: string | null
}

// Función para obtener el inicio de semana en Argentina (lunes)
function getSemanaArgentina(date: Date) {
  const inicio = startOfWeek(date, { weekStartsOn: 1 }) // Lunes
  const fin = endOfWeek(date, { weekStartsOn: 1 }) // Domingo
  return { inicio, fin }
}



export function ReporteFacturacionTab() {
  // Estados principales
  const [facturaciones, setFacturaciones] = useState<FacturacionConductor[]>([])
  const [periodo, setPeriodo] = useState<PeriodoFacturacion | null>(null)
  const [excesos, setExcesos] = useState<ExcesoKm[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // Vista Previa - cálculo on-the-fly sin guardar en BD
  const [modoVistaPrevia, setModoVistaPrevia] = useState(false)
  const [vistaPreviaData, setVistaPreviaData] = useState<FacturacionConductor[]>([])
  const [loadingVistaPrevia, setLoadingVistaPrevia] = useState(false)
  const [buscarConductor, setBuscarConductor] = useState('')

  // Estado de semana seleccionada
  const [semanaActual, setSemanaActual] = useState(() => {
    const hoy = new Date()
    return getSemanaArgentina(hoy)
  })

  // Modal de detalle
  const [showDetalle, setShowDetalle] = useState(false)
  const [detalleFacturacion, setDetalleFacturacion] = useState<FacturacionConductor | null>(null)
  const [detalleItems, setDetalleItems] = useState<FacturacionDetalle[]>([])
  const [exportingPdf, setExportingPdf] = useState(false)

  

  // Memoized filtered detalle items to avoid recalculation on each render
  const detalleCargos = useMemo(() => detalleItems.filter(d => !d.es_descuento), [detalleItems])
  const detalleDescuentos = useMemo(() => detalleItems.filter(d => d.es_descuento), [detalleItems])

  // Table instance and filters
  const [tableInstance, setTableInstance] = useState<Table<FacturacionConductor> | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)
  // Filtros para Vista Previa (dropdown simple)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  // Filtros Excel por columna
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [patenteSearch, setPatenteSearch] = useState('')
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  // RIT Preview mode
  const [showRITPreview, setShowRITPreview] = useState(false)
  const [ritPreviewData, setRitPreviewData] = useState<RITPreviewRow[]>([])
  const [loadingRITPreview, setLoadingRITPreview] = useState(false)

  // Recalcular período abierto
  const [recalculando, setRecalculando] = useState(false)

  // Exportar SiFactura
  const [exportingSiFactura, setExportingSiFactura] = useState(false)
  
  // Exportar Facturación Cabify
  const [exportingCabify, setExportingCabify] = useState(false)
  
  // Cabify Preview mode
  const [showCabifyPreview, setShowCabifyPreview] = useState(false)
  const [cabifyPreviewData, setCabifyPreviewData] = useState<CabifyPreviewRow[]>([])
  const [loadingCabifyPreview, setLoadingCabifyPreview] = useState(false)
  
  // SiFactura Preview mode
  const [showSiFacturaPreview, setShowSiFacturaPreview] = useState(false)
  const [siFacturaPreviewData, setSiFacturaPreviewData] = useState<FacturacionPreviewRow[]>([])
  const [loadingSiFacturaPreview, setLoadingSiFacturaPreview] = useState(false)
  const [conceptosPendientes, setConceptosPendientes] = useState<ConceptoPendiente[]>([])
  const [conceptosNomina, setConceptosNomina] = useState<ConceptoNomina[]>([])

  // Al montar: buscar última semana generada y navegar a ella
  useEffect(() => {
    async function irAUltimaSemanaGenerada() {
      const { data: ultimoPeriodo } = await (supabase
        .from('periodos_facturacion') as any)
        .select('fecha_inicio, fecha_fin')
        .in('estado', ['abierto', 'cerrado'])
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })
        .limit(1)
        .single()

      if (ultimoPeriodo) {
        const inicio = parseISO(ultimoPeriodo.fecha_inicio)
        const fin = parseISO(ultimoPeriodo.fecha_fin)
        setSemanaActual({ inicio, fin })
      }
    }
    irAUltimaSemanaGenerada()
  }, [])

  // Cargar facturaciones cuando cambia la semana
  useEffect(() => {
    // Resetear modo vista previa al cambiar de semana
    setModoVistaPrevia(false)
    setVistaPreviaData([])
    setBuscarConductor('')
    cargarFacturacion()
  }, [semanaActual])

  // Cargar conceptos de nómina al montar (para agregar ajustes manuales)
  useEffect(() => {
    async function cargarConceptos() {
      const { data } = await supabase
        .from('conceptos_nomina')
        .select('id, codigo, descripcion, tipo, es_variable, iva_porcentaje')
        .eq('activo', true)
        .order('codigo')
      
      if (data) {
        setConceptosNomina(data as ConceptoNomina[])
      }
    }
    cargarConceptos()
  }, [])

  // Cerrar dropdown de filtro al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) setOpenColumnFilter(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openColumnFilter])

  // Datos para filtros (usar facturaciones o vistaPreviaData según modo)
  const datosParaFiltros = modoVistaPrevia ? vistaPreviaData : facturaciones

  // Listas de valores únicos para filtros Excel
  const conductoresUnicos = useMemo(() =>
    [...new Set(datosParaFiltros.map(f => f.conductor_nombre).filter(Boolean))].sort() as string[]
  , [datosParaFiltros])

  const patentesUnicas = useMemo(() =>
    [...new Set(datosParaFiltros.map(f => f.vehiculo_patente).filter(Boolean))].sort() as string[]
  , [datosParaFiltros])

  // Listas filtradas por búsqueda
  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  const patentesFiltradas = useMemo(() => {
    if (!patenteSearch) return patentesUnicas
    return patentesUnicas.filter(p => p.toLowerCase().includes(patenteSearch.toLowerCase()))
  }, [patentesUnicas, patenteSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleTipoFilter = (val: string) => setTipoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const togglePatenteFilter = (val: string) => setPatenteFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarFacturacion() {
    setLoading(true)
    try {
      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)

      // 1. Buscar el período para esta semana
      const { data: periodoData, error: errPeriodo } = await supabase
        .from('periodos_facturacion')
        .select('*')
        .eq('semana', semana)
        .eq('anio', anio)
        .single()

      if (errPeriodo && errPeriodo.code !== 'PGRST116') {
        throw errPeriodo
      }

      if (!periodoData) {
        // No hay período generado - cargar vista previa automáticamente
        setPeriodo(null)
        setFacturaciones([])
        setLoading(false)
        // Cargar vista previa automática
        cargarVistaPreviaInterno()
        return
      }

      setPeriodo(periodoData as PeriodoFacturacion)
      setModoVistaPrevia(false) // Hay período generado, no mostrar vista previa

      // 2. Cargar facturaciones de conductores para este período
      // JOIN con tabla conductores para obtener nombre actualizado
      const { data: facturacionesData, error: errFact } = await (supabase
        .from('facturacion_conductores') as any)
        .select(`
          *,
          conductor:conductores!conductor_id(nombres, apellidos)
        `)
        .eq('periodo_id', (periodoData as any).id)

      if (errFact) throw errFact

      // Usar nombre de tabla conductores en formato "Nombres Apellidos"
      let facturacionesTransformadas = (facturacionesData || []).map((f: any) => ({
        ...f,
        conductor_nombre: f.conductor 
          ? `${f.conductor.nombres || ''} ${f.conductor.apellidos || ''}`.trim()
          : f.conductor_nombre || ''
      }))

      // 2.5 Cargar ganancias de Cabify para el período
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, ganancia_total')
        .gte('fecha_inicio', (periodoData as any).fecha_inicio + 'T00:00:00')
        .lte('fecha_inicio', (periodoData as any).fecha_fin + 'T23:59:59')

      // Agrupar ganancias por DNI
      const gananciasPorDni = new Map<string, number>()
      ;(cabifyData || []).forEach((c: any) => {
        if (c.dni) {
          const dniStr = String(c.dni)
          const actual = gananciasPorDni.get(dniStr) || 0
          gananciasPorDni.set(dniStr, actual + (parseFloat(c.ganancia_total) || 0))
        }
      })

      // Agregar ganancia_cabify a cada facturación
      facturacionesTransformadas = facturacionesTransformadas.map((f: any) => {
        const ganancia = f.conductor_dni ? (gananciasPorDni.get(String(f.conductor_dni)) || 0) : 0
        const cuotaFija = f.subtotal_alquiler + f.subtotal_garantia
        return {
          ...f,
          ganancia_cabify: ganancia,
          cubre_cuota: ganancia >= cuotaFija
        }
      })
      
      // Ordenar por nombre
      facturacionesTransformadas.sort((a: any, b: any) => 
        (a.conductor_nombre || '').localeCompare(b.conductor_nombre || '')
      )
      
      setFacturaciones(facturacionesTransformadas as FacturacionConductor[])

      // 3. Cargar excesos de kilometraje para este período
      const { data: excesosData } = await (supabase
        .from('excesos_kilometraje') as any)
        .select('id, conductor_id, km_exceso, monto_total, aplicado')
        .eq('periodo_id', (periodoData as any).id)

      setExcesos((excesosData || []) as ExcesoKm[])

    } catch (error) {
      console.error('Error cargando facturación:', error)
      Swal.fire('Error', 'No se pudo cargar la facturación', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Función auxiliar para calcular días trabajados (prorrateo)
  function calcularDiasTrabajados(
    fechaInicioAsig: string | null,
    fechaFinAsig: string | null,
    fechaInicioPeriodo: string,
    fechaFinPeriodo: string
  ): number {
    const periodoInicio = parseISO(fechaInicioPeriodo)
    const periodoFin = parseISO(fechaFinPeriodo)

    // Si no hay fecha de inicio de asignación, asumimos semana completa
    if (!fechaInicioAsig) {
      return 7
    }

    const asigInicio = parseISO(fechaInicioAsig)
    const asigFin = fechaFinAsig ? parseISO(fechaFinAsig) : null

    // Fecha efectiva de inicio: el máximo entre inicio asignación e inicio período
    const fechaEfectivaInicio = isAfter(asigInicio, periodoInicio) ? asigInicio : periodoInicio

    // Fecha efectiva de fin: el mínimo entre fin asignación (si existe) y fin período
    let fechaEfectivaFin = periodoFin
    if (asigFin && isBefore(asigFin, periodoFin)) {
      fechaEfectivaFin = asigFin
    }

    // Si la fecha de fin es antes de la de inicio, no hay días trabajados
    if (isBefore(fechaEfectivaFin, fechaEfectivaInicio)) {
      return 0
    }

    // Calcular días incluyendo ambos extremos
    const dias = differenceInDays(fechaEfectivaFin, fechaEfectivaInicio) + 1
    return Math.max(0, Math.min(7, dias))
  }

  // VISTA PREVIA: Calcular facturación on-the-fly sin guardar en BD
  async function cargarVistaPreviaInterno(showError = false) {
    setLoadingVistaPrevia(true)
    setModoVistaPrevia(true)

    try {
      const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
      // Para Vista Previa: usar HOY como fecha fin si estamos en la semana actual
      const hoy = new Date()
      const esSemanaActual = hoy >= semanaActual.inicio && hoy <= semanaActual.fin
      const fechaFinEfectiva = esSemanaActual ? hoy : semanaActual.fin
      const fechaFin = format(fechaFinEfectiva, 'yyyy-MM-dd')
      // Días disponibles en el período (ej: si hoy es miércoles = 3 días: lun, mar, mie)
      const diasDisponibles = differenceInDays(fechaFinEfectiva, semanaActual.inicio) + 1

      // 1. Cargar asignaciones activas que apliquen a esta semana
      const { data: asignaciones, error: errAsig } = await supabase
        .from('asignaciones')
        .select(`
          id,
          conductor_id,
          vehiculo_id,
          horario,
          fecha_inicio,
          fecha_fin,
          estado,
          conductores:conductor_id(id, nombres, apellidos, numero_dni, numero_cuit),
          vehiculos:vehiculo_id(id, patente)
        `)
        .or(`estado.eq.activa,and(fecha_fin.gte.${fechaInicio},fecha_fin.lte.${fechaFin})`)

      if (errAsig) throw errAsig

      // 2. Cargar saldos de conductores
      const { data: saldos } = await (supabase
        .from('saldos_conductores') as any)
        .select('conductor_id, saldo_actual, dias_mora')

      const saldosMap = new Map<string, { conductor_id: string; saldo_actual: number; dias_mora: number }>(
        (saldos || []).map((s: any) => [s.conductor_id, s])
      )

      // 3. Cargar garantías (TODAS para saber el estado de cuotas)
      // Nota: conductor_id puede ser NULL (importado desde histórico), usamos conductor_nombre como clave
      const { data: garantias } = await (supabase
        .from('garantias_conductores') as any)
        .select('conductor_id, conductor_nombre, estado, cuotas_pagadas, cuotas_totales, tipo_alquiler')

      const garantiasMap = new Map<string, {
        conductor_id: string | null;
        conductor_nombre: string;
        estado: string;
        cuotas_pagadas: number;
        cuotas_totales: number;
        tipo_alquiler: string;
      }>((garantias || []).map((g: any) => [g.conductor_nombre?.toLowerCase().trim() || '', g]))

      // 3.1 Cargar datos de Cabify desde la tabla cabify_historico
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, ganancia_total, cobro_efectivo, peajes')
        .gte('fecha_inicio', fechaInicio + 'T00:00:00')
        .lte('fecha_inicio', fechaFin + 'T23:59:59')

      // Crear mapa de ganancias Cabify por DNI (sumar si hay múltiples registros)
      const cabifyMap = new Map<string, number>()
      // Crear mapa de peajes Cabify por DNI (P005)
      const peajesMap = new Map<string, number>()
      ;(cabifyData || []).forEach((record: any) => {
        if (record.dni) {
          // Ganancias
          const actualGanancia = cabifyMap.get(record.dni) || 0
          const ganancia = parseFloat(String(record.ganancia_total)) || 0
          cabifyMap.set(record.dni, actualGanancia + ganancia)
          // Peajes (P005)
          const actualPeajes = peajesMap.get(record.dni) || 0
          const peajes = parseFloat(String(record.peajes)) || 0
          peajesMap.set(record.dni, actualPeajes + peajes)
        }
      })

      // 4. Cargar tickets a favor aprobados (no aplicados)
      const { data: tickets } = await (supabase
        .from('tickets_favor') as any)
        .select('conductor_id, monto, estado')
        .eq('estado', 'aprobado')

      const ticketsMap = new Map<string, number>()
      ;(tickets || []).forEach((t: any) => {
        const actual = ticketsMap.get(t.conductor_id) || 0
        ticketsMap.set(t.conductor_id, actual + t.monto)
      })

      // 5. Cargar excesos de km pendientes
      const { data: excesosData } = await (supabase
        .from('excesos_kilometraje') as any)
        .select('conductor_id, km_exceso, monto_total, aplicado')
        .eq('aplicado', false)

      const excesosMap = new Map<string, { kmExceso: number; monto: number }>()
      ;(excesosData || []).forEach((e: any) => {
        const actual = excesosMap.get(e.conductor_id) || { kmExceso: 0, monto: 0 }
        excesosMap.set(e.conductor_id, {
          kmExceso: actual.kmExceso + e.km_exceso,
          monto: actual.monto + e.monto_total
        })
      })

      setExcesos((excesosData || []) as ExcesoKm[])

      // 5.1 Cargar penalidades/cobros para la semana (P007)
      // Incluye: 
      //   a) Penalidades aplicadas completas (no fraccionadas) para esta semana
      //   b) Cuotas de penalidades fraccionadas que corresponden a esta semana
      
      const semanaDelPeriodo = getWeek(parseISO(fechaInicio), { weekStartsOn: 1 })
      const anioDelPeriodo = getYear(parseISO(fechaInicio))
      
      // a) Penalidades aplicadas completas en esta semana
      const { data: penalidadesCompletas } = await (supabase
        .from('penalidades') as any)
        .select('conductor_id, monto, detalle, observaciones')
        .eq('aplicado', true)
        .eq('fraccionado', false)
        .eq('semana_aplicacion', semanaDelPeriodo)
        .eq('anio_aplicacion', anioDelPeriodo)
      
      // b) Cuotas fraccionadas de esta semana (no aplicadas aún)
      // Buscar cuotas que coincidan con semana Y (anio correcto O anio null)
      const { data: cuotasSemana } = await (supabase
        .from('penalidades_cuotas') as any)
        .select('id, penalidad_id, monto_cuota, numero_cuota, anio')
        .eq('semana', semanaDelPeriodo)
        .eq('aplicado', false)
      
      // Filtrar solo las cuotas del año correcto o sin año definido
      const cuotasFiltradas = (cuotasSemana || []).filter((c: any) => 
        !c.anio || c.anio === anioDelPeriodo
      )

      // Obtener los conductor_id de las penalidades asociadas a las cuotas
      const penalidadIds = [...new Set((cuotasFiltradas || []).map((c: any) => c.penalidad_id).filter(Boolean))]
      
      let penalidadesPadre: any[] = []
      if (penalidadIds.length > 0) {
        const { data: penData } = await (supabase
          .from('penalidades') as any)
          .select('id, conductor_id, cantidad_cuotas, observaciones')
          .in('id', penalidadIds)
        penalidadesPadre = penData || []
      }
      
      const penalidadConductorMap = new Map<string, string>(
        penalidadesPadre.map((p: any) => [p.id, p.conductor_id])
      )
      
      // Map para cantidad de cuotas de cada penalidad fraccionada
      const penalidadCuotasMap = new Map<string, number>(
        penalidadesPadre.map((p: any) => [p.id, p.cantidad_cuotas || 1])
      )

      const penalidadesMap = new Map<string, number>()
      // Map para guardar el detalle de penalidades por conductor
      const detalleMap = new Map<string, Array<{
        monto: number
        detalle: string
        tipo: 'completa' | 'cuota'
        cuotaNum?: number
        totalCuotas?: number
      }>>()
      
      // Sumar penalidades completas
      ;(penalidadesCompletas || []).forEach((p: any) => {
        if (p.conductor_id) {
          const actual = penalidadesMap.get(p.conductor_id) || 0
          penalidadesMap.set(p.conductor_id, actual + (p.monto || 0))
          
          // Guardar detalle
          const detalles = detalleMap.get(p.conductor_id) || []
          detalles.push({
            monto: p.monto || 0,
            detalle: p.detalle || p.observaciones || 'Cobro por incidencia',
            tipo: 'completa'
          })
          detalleMap.set(p.conductor_id, detalles)
        }
      })
      
      // Sumar cuotas fraccionadas
      ;(cuotasFiltradas || []).forEach((c: any) => {
        const conductorId = penalidadConductorMap.get(c.penalidad_id)
        if (conductorId) {
          const actual = penalidadesMap.get(conductorId) || 0
          penalidadesMap.set(conductorId, actual + (c.monto_cuota || 0))
          
          // Guardar detalle de cuota
          const penPadre = penalidadesPadre.find((p: any) => p.id === c.penalidad_id)
          const detalles = detalleMap.get(conductorId) || []
          detalles.push({
            monto: c.monto_cuota || 0,
            detalle: penPadre?.observaciones || 'Cobro fraccionado',
            tipo: 'cuota',
            cuotaNum: c.numero_cuota,
            totalCuotas: penalidadCuotasMap.get(c.penalidad_id) || 1
          })
          detalleMap.set(conductorId, detalles)
        }
      })
      
      // 6. Calcular facturación proyectada para cada conductor
      const facturacionesProyectadas: FacturacionConductor[] = []

      for (const asig of (asignaciones || [])) {
        const conductor = (asig as any).conductores
        const vehiculo = (asig as any).vehiculos

        if (!conductor) continue

        const conductorId = conductor.id
        const tipoAlquiler = (asig as any).horario === 'CARGO' ? 'CARGO' : 'TURNO'

        // Calcular días trabajados (prorrateo)
        const diasTrabajados = calcularDiasTrabajados(
          (asig as any).fecha_inicio,
          (asig as any).fecha_fin,
          fechaInicio,
          fechaFin
        )

        if (diasTrabajados === 0) continue

        // Factor proporcional basado en días disponibles del período, no siempre 7
        // Ej: Si estamos en miércoles (3 días disponibles) y trabajó 3, factor = 3/7 = 0.43
        const factorProporcional = diasTrabajados / 7

        // Alquiler con prorrateo
        const alquilerBase = tipoAlquiler === 'CARGO'
          ? FACTURACION_CONFIG.ALQUILER_CARGO
          : FACTURACION_CONFIG.ALQUILER_TURNO
        const subtotalAlquiler = Math.round(alquilerBase * factorProporcional)

        // Garantía con prorrateo
        // REGLA: TODO conductor con asignación activa DEBE pagar garantía desde el día 1
        // La garantía es $50,000 semanal (prorrateado) hasta completar 20 cuotas (CARGO) o 16 cuotas (TURNO)
        // Buscar garantía por nombre (conductor_id puede ser NULL en garantías importadas del histórico)
        const conductorNombreCompleto = `${conductor.nombres || ''} ${conductor.apellidos || ''}`.toLowerCase().trim()
        const garantia = garantiasMap.get(conductorNombreCompleto)
        let subtotalGarantia = 0
        let cuotaGarantiaNumero = ''
        const cuotasTotales = tipoAlquiler === 'CARGO'
          ? FACTURACION_CONFIG.GARANTIA_CUOTAS_CARGO
          : FACTURACION_CONFIG.GARANTIA_CUOTAS_TURNO

        if (garantia) {
          // Si tiene registro de garantía, verificar si ya completó todas las cuotas
          if (garantia.estado === 'completada' || garantia.cuotas_pagadas >= garantia.cuotas_totales) {
            // Ya completó la garantía - no cobra más
            subtotalGarantia = 0
            cuotaGarantiaNumero = 'NA' // Completada
          } else {
            // Tiene garantía activa en curso - mostrar siguiente cuota a pagar
            subtotalGarantia = Math.round(FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL * factorProporcional)
            const cuotaActual = garantia.cuotas_pagadas + 1
            cuotaGarantiaNumero = `${cuotaActual} de ${garantia.cuotas_totales}`
          }
        } else {
          // Sin registro de garantía = conductor nuevo, empieza cuota 1
          subtotalGarantia = Math.round(FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL * factorProporcional)
          cuotaGarantiaNumero = `1 de ${cuotasTotales}`
        }

        // Datos por DNI del conductor
        const dniConductor = conductor.numero_dni || ''

        // Excesos de KM (P006)
        const exceso = excesosMap.get(conductorId)
        const montoExcesos = exceso?.monto || 0
        const kmExceso = exceso?.kmExceso || 0

        // Peajes de Cabify (P005)
        const montoPeajes = peajesMap.get(dniConductor) || 0

        // Penalidades (P007)
        const montoPenalidades = penalidadesMap.get(conductorId) || 0

        // Subtotal cargos (incluye P005, P006, P007)
        const subtotalCargos = subtotalAlquiler + subtotalGarantia + montoExcesos + montoPeajes + montoPenalidades

        // Tickets a favor (descuentos)
        const subtotalDescuentos = ticketsMap.get(conductorId) || 0

        // Saldo anterior y mora
        // La mora se cobra 5% flat si hay saldo pendiente y NO hizo abono
        // diasMora = 0 significa que hizo abono (sin mora)
        // diasMora > 0 significa que no hizo abono (con mora)
        const saldo = saldosMap.get(conductorId)
        const saldoAnterior = saldo?.saldo_actual || 0
        const diasMora = saldo?.dias_mora || 0
        const hizoAbono = diasMora === 0
        const montoMora = calcularMora(saldoAnterior, hizoAbono)

        // Total a pagar
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + saldoAnterior + montoMora

        // Datos de Cabify - ganancia semanal del conductor
        const gananciaCabify = cabifyMap.get(dniConductor) || 0
        // El conductor cubre su cuota semanal si su ganancia >= alquiler + garantía
        const cuotaFijaSemanal = subtotalAlquiler + subtotalGarantia
        const cubreCuota = gananciaCabify >= cuotaFijaSemanal

        facturacionesProyectadas.push({
          id: `preview-${conductorId}`,
          periodo_id: 'preview',
          conductor_id: conductorId,
          conductor_nombre: `${(conductor.apellidos || '').toUpperCase()}, ${(conductor.nombres || '').toUpperCase()}`,
          conductor_dni: dniConductor,
          conductor_cuit: conductor.numero_cuit || null,
          vehiculo_id: vehiculo?.id || null,
          vehiculo_patente: vehiculo?.patente || null,
          tipo_alquiler: tipoAlquiler,
          turnos_base: diasDisponibles, // Días disponibles hasta hoy (o 7 si semana pasada)
          turnos_cobrados: diasTrabajados,
          factor_proporcional: factorProporcional,
          subtotal_alquiler: subtotalAlquiler,
          subtotal_garantia: subtotalGarantia,
          subtotal_cargos: subtotalCargos,
          subtotal_descuentos: subtotalDescuentos,
          subtotal_neto: subtotalNeto,
          saldo_anterior: saldoAnterior,
          dias_mora: diasMora,
          monto_mora: montoMora,
          total_a_pagar: totalAPagar,
          estado: 'borrador',
          created_at: new Date().toISOString(),
          // Datos de Cabify (Vista Previa)
          ganancia_cabify: gananciaCabify,
          cubre_cuota: cubreCuota,
          cuota_garantia_numero: cuotaGarantiaNumero,
          // Datos detallados para RIT export
          monto_peajes: montoPeajes,       // P005
          monto_excesos: montoExcesos,     // P006
          km_exceso: kmExceso,
          monto_penalidades: montoPenalidades,  // P007
          // Detalle de penalidades para el modal
          penalidades_detalle: detalleMap.get(conductorId) || []
        })
      }

      // Ordenar por nombre
      facturacionesProyectadas.sort((a, b) => a.conductor_nombre.localeCompare(b.conductor_nombre))

      setVistaPreviaData(facturacionesProyectadas)

    } catch (error) {
      console.error('Error cargando vista previa:', error)
      if (showError) {
        Swal.fire('Error', 'No se pudo cargar la vista previa', 'error')
      }
    } finally {
      setLoadingVistaPrevia(false)
    }
  }

  // Función pública para recalcular
  function cargarVistaPrevia() {
    cargarVistaPreviaInterno(true)
  }

  // Recalcular período abierto - actualiza excesos, tickets y penalidades en la BD
  async function recalcularPeriodoAbierto() {
    if (!periodo || periodo.estado !== 'abierto') {
      Swal.fire('Error', 'Solo se puede recalcular un período abierto', 'error')
      return
    }

    const confirmResult = await Swal.fire({
      title: '¿Recalcular facturación?',
      html: `
        <p>Esto actualizará los datos de facturación incorporando:</p>
        <ul style="text-align:left; margin-top:10px;">
          <li>Excesos de KM pendientes</li>
          <li>Tickets a favor aprobados</li>
          <li>Penalidades del período</li>
          <li>Peajes de Cabify</li>
          <li>Multas de Tránsito</li>
        </ul>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recalcular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)'
    })

    if (!confirmResult.isConfirmed) return

    setRecalculando(true)
    try {
      const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
      const fechaFin = format(semanaActual.fin, 'yyyy-MM-dd')

      // 0. Cargar conceptos de nómina para vincular concepto_id
      const { data: conceptosData } = await supabase
        .from('conceptos_nomina')
        .select('id, codigo, descripcion, precio_final, iva_porcentaje, tipo')

      const conceptosMap = new Map<string, { id: string; descripcion: string; precio_final: number; iva_porcentaje: number; tipo: string }>()
      ;(conceptosData || []).forEach((c: any) => {
        conceptosMap.set(c.codigo, {
          id: c.id,
          descripcion: c.descripcion,
          precio_final: c.precio_final,
          iva_porcentaje: c.iva_porcentaje || 0,
          tipo: c.tipo
        })
      })

      // 1. Cargar tickets a favor aprobados (no aplicados)
      const { data: tickets } = await (supabase
        .from('tickets_favor') as any)
        .select('conductor_id, monto, estado')
        .eq('estado', 'aprobado')

      const ticketsMap = new Map<string, number>()
      ;(tickets || []).forEach((t: any) => {
        const actual = ticketsMap.get(t.conductor_id) || 0
        ticketsMap.set(t.conductor_id, actual + t.monto)
      })

      // 2. Cargar excesos de km pendientes
      const { data: excesosData } = await (supabase
        .from('excesos_kilometraje') as any)
        .select('conductor_id, km_exceso, monto_total, aplicado')
        .eq('aplicado', false)

      const excesosMap = new Map<string, { kmExceso: number; monto: number }>()
      ;(excesosData || []).forEach((e: any) => {
        const actual = excesosMap.get(e.conductor_id) || { kmExceso: 0, monto: 0 }
        excesosMap.set(e.conductor_id, {
          kmExceso: actual.kmExceso + e.km_exceso,
          monto: actual.monto + e.monto_total
        })
      })

      // 3. Cargar penalidades/cobros para la semana (P007)
      const semanaDelPeriodoRecalc = getWeek(parseISO(fechaInicio), { weekStartsOn: 1 })
      const anioDelPeriodoRecalc = getYear(parseISO(fechaInicio))
      
      // a) Penalidades aplicadas completas en esta semana
      const { data: penalidadesCompletas } = await (supabase
        .from('penalidades') as any)
        .select('conductor_id, monto, detalle')
        .eq('aplicado', true)
        .eq('fraccionado', false)
        .eq('semana_aplicacion', semanaDelPeriodoRecalc)
        .eq('anio_aplicacion', anioDelPeriodoRecalc)
      
      // b) Cuotas fraccionadas de esta semana
      const { data: cuotasSemanaRecalc } = await (supabase
        .from('penalidades_cuotas') as any)
        .select('id, penalidad_id, monto_cuota, numero_cuota, anio')
        .eq('semana', semanaDelPeriodoRecalc)
        .eq('aplicado', false)
      
      // Filtrar cuotas del año correcto o sin año
      const cuotasFiltradasRecalc = (cuotasSemanaRecalc || []).filter((c: any) => 
        !c.anio || c.anio === anioDelPeriodoRecalc
      )

      // Obtener los conductor_id de las penalidades asociadas
      const penalidadIdsRecalc = [...new Set((cuotasFiltradasRecalc || []).map((c: any) => c.penalidad_id).filter(Boolean))]
      
      let penalidadesPadreRecalc: any[] = []
      if (penalidadIdsRecalc.length > 0) {
        const { data: penDataRecalc } = await (supabase
          .from('penalidades') as any)
          .select('id, conductor_id, cantidad_cuotas, observaciones')
          .in('id', penalidadIdsRecalc)
        penalidadesPadreRecalc = penDataRecalc || []
      }
      
      const penalidadConductorMapRecalc = new Map<string, string>(
        penalidadesPadreRecalc.map((p: any) => [p.id, p.conductor_id])
      )
      
      // Para recalc también necesitamos cantidad_cuotas
      const penalidadCuotasMapRecalc = new Map<string, number>(
        penalidadesPadreRecalc.map((p: any) => [p.id, p.cantidad_cuotas || 1])
      )

      const penalidadesMap = new Map<string, number>()
      // Map para guardar el detalle de penalidades por conductor (para el modal)
      const detalleMapRecalc = new Map<string, Array<{
        monto: number
        detalle: string
        tipo: 'completa' | 'cuota'
        cuotaNum?: number
        totalCuotas?: number
      }>>()
      
      // Sumar penalidades completas
      ;(penalidadesCompletas || []).forEach((p: any) => {
        if (p.conductor_id) {
          const actual = penalidadesMap.get(p.conductor_id) || 0
          penalidadesMap.set(p.conductor_id, actual + (p.monto || 0))
          
          // Guardar detalle
          const detalles = detalleMapRecalc.get(p.conductor_id) || []
          detalles.push({
            monto: p.monto || 0,
            detalle: p.detalle || 'Cobro por incidencia',
            tipo: 'completa'
          })
          detalleMapRecalc.set(p.conductor_id, detalles)
        }
      })
      
      // Sumar cuotas fraccionadas
      ;(cuotasFiltradasRecalc || []).forEach((c: any) => {
        const conductorId = penalidadConductorMapRecalc.get(c.penalidad_id)
        if (conductorId) {
          const actual = penalidadesMap.get(conductorId) || 0
          penalidadesMap.set(conductorId, actual + (c.monto_cuota || 0))
          
          // Guardar detalle de cuota
          const penPadre = penalidadesPadreRecalc.find((p: any) => p.id === c.penalidad_id)
          const detalles = detalleMapRecalc.get(conductorId) || []
          detalles.push({
            monto: c.monto_cuota || 0,
            detalle: penPadre?.observaciones || 'Cobro fraccionado',
            tipo: 'cuota',
            cuotaNum: c.numero_cuota,
            totalCuotas: penalidadCuotasMapRecalc.get(c.penalidad_id) || 1
          })
          detalleMapRecalc.set(conductorId, detalles)
        }
      })

      // 3b. Cargar cobros fraccionados de esta semana (P010)
      const { data: cobrosRecalc } = await (supabase
        .from('cobros_fraccionados') as any)
        .select('*')
        .eq('semana', semanaDelPeriodoRecalc)
        .eq('anio', anioDelPeriodoRecalc)
        .eq('aplicado', false)

      const cobrosMap = new Map<string, any[]>()
      ;(cobrosRecalc || []).forEach((c: any) => {
        if (!cobrosMap.has(c.conductor_id)) cobrosMap.set(c.conductor_id, [])
        cobrosMap.get(c.conductor_id)!.push(c)
      })

      // 4. Cargar peajes de Cabify
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, peajes')
        .gte('fecha_inicio', fechaInicio + 'T00:00:00')
        .lte('fecha_inicio', fechaFin + 'T23:59:59')

      const peajesMap = new Map<string, number>()
      ;(cabifyData || []).forEach((record: any) => {
        if (record.dni) {
          const actual = peajesMap.get(record.dni) || 0
          const peajes = parseFloat(String(record.peajes)) || 0
          peajesMap.set(record.dni, actual + peajes)
        }
      })

      // 5. Cargar multas de tránsito (P008)
      const { data: multasData } = await (supabase
        .from('multas_historico') as any)
        .select('patente, importe, fecha_infraccion, detalle, infraccion')
        .gte('fecha_infraccion', fechaInicio)
        .lte('fecha_infraccion', fechaFin)

      const multasMap = new Map<string, { monto: number; cantidad: number }>()
      ;(multasData || []).forEach((m: any) => {
        if (m.patente) {
          const patenteNorm = m.patente.toUpperCase().replace(/\s+/g, '')
          const actual = multasMap.get(patenteNorm) || { monto: 0, cantidad: 0 }
          // El importe puede venir como string con formato "Gs. 1.234.567"
          let montoMulta = 0
          if (typeof m.importe === 'string') {
            montoMulta = parseFloat(m.importe.replace(/[^\d.-]/g, '')) || 0
          } else {
            montoMulta = parseFloat(m.importe) || 0
          }
          multasMap.set(patenteNorm, {
            monto: actual.monto + montoMulta,
            cantidad: actual.cantidad + 1
          })
        }
      })

      // 6. Para cada facturación existente, recalcular con los nuevos datos
      let actualizados = 0
      for (const fact of facturaciones) {
        const conductorId = fact.conductor_id
        const dniConductor = fact.conductor_dni || ''

        // Obtener valores actualizados
        const exceso = excesosMap.get(conductorId)
        const montoExcesos = exceso?.monto || 0
        const kmExceso = exceso?.kmExceso || 0
        const montoPeajes = peajesMap.get(dniConductor) || 0
        const montoPenalidades = penalidadesMap.get(conductorId) || 0
        const subtotalDescuentos = ticketsMap.get(conductorId) || 0

        // Obtener multas por patente del vehículo
        const patenteNorm = (fact.vehiculo_patente || '').toUpperCase().replace(/\s+/g, '')
        const multasVehiculo = multasMap.get(patenteNorm)
        const montoMultas = multasVehiculo?.monto || 0
        const cantidadMultas = multasVehiculo?.cantidad || 0

        // Cobros fraccionados del conductor (P010) - solo cuota de esta semana
        const cobrosConductor = cobrosMap.get(conductorId) || []
        const montoCobros = cobrosConductor.reduce((sum: number, c: any) => sum + (c.monto_cuota || 0), 0)

        // Recalcular cargos totales (incluye multas y cobros fraccionados)
        const subtotalCargos = fact.subtotal_alquiler + fact.subtotal_garantia + montoExcesos + montoPeajes + montoPenalidades + montoMultas + montoCobros
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + fact.saldo_anterior + fact.monto_mora

        // Actualizar facturacion_conductores
        const { error: errUpdate } = await (supabase
          .from('facturacion_conductores') as any)
          .update({
            subtotal_cargos: subtotalCargos,
            subtotal_descuentos: subtotalDescuentos,
            subtotal_neto: subtotalNeto,
            total_a_pagar: totalAPagar,
            updated_at: new Date().toISOString()
          })
          .eq('id', fact.id)

        if (errUpdate) {
          console.error('Error actualizando facturación:', errUpdate)
          continue
        }

        // Actualizar/crear detalles de excesos (P006)
        if (montoExcesos > 0) {
          const netoExceso = Math.round(montoExcesos / 1.21)
          const ivaExceso = montoExcesos - netoExceso

          // Buscar si ya existe el detalle
          const { data: existingDet } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P006')
            .maybeSingle()

          const conceptoP006 = conceptosMap.get('P006')
          if (existingDet) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_id: conceptoP006?.id || null,
                concepto_descripcion: conceptoP006?.descripcion || `Exceso KM (${kmExceso} km)`,
                precio_unitario: montoExcesos,
                subtotal: netoExceso,
                iva_monto: ivaExceso,
                total: montoExcesos
              })
              .eq('id', existingDet.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_id: conceptoP006?.id || null,
                concepto_codigo: 'P006',
                concepto_descripcion: conceptoP006?.descripcion || `Exceso KM (${kmExceso} km)`,
                cantidad: 1,
                precio_unitario: montoExcesos,
                subtotal: netoExceso,
                iva_porcentaje: conceptoP006?.iva_porcentaje || 21,
                iva_monto: ivaExceso,
                total: montoExcesos,
                es_descuento: false
              })
          }
        }

        // Actualizar/crear detalles de penalidades (P007)
        if (montoPenalidades > 0) {
          const { data: existingPen } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P007')
            .maybeSingle()

          const conceptoP007 = conceptosMap.get('P007')
          if (existingPen) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_id: conceptoP007?.id || null,
                concepto_descripcion: conceptoP007?.descripcion || 'Multas/Infracciones',
                precio_unitario: montoPenalidades,
                subtotal: montoPenalidades,
                total: montoPenalidades
              })
              .eq('id', existingPen.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_id: conceptoP007?.id || null,
                concepto_codigo: 'P007',
                concepto_descripcion: conceptoP007?.descripcion || 'Multas/Infracciones',
                cantidad: 1,
                precio_unitario: montoPenalidades,
                subtotal: montoPenalidades,
                iva_porcentaje: conceptoP007?.iva_porcentaje || 0,
                iva_monto: 0,
                total: montoPenalidades,
                es_descuento: false
              })
          }
        }

        // Actualizar/crear detalles de tickets (P004)
        if (subtotalDescuentos > 0) {
          const { data: existingTkt } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P004')
            .maybeSingle()

          const conceptoP004 = conceptosMap.get('P004')
          if (existingTkt) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_id: conceptoP004?.id || null,
                concepto_descripcion: conceptoP004?.descripcion || 'Tickets a Favor',
                precio_unitario: subtotalDescuentos,
                subtotal: subtotalDescuentos,
                total: subtotalDescuentos
              })
              .eq('id', existingTkt.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_id: conceptoP004?.id || null,
                concepto_codigo: 'P004',
                concepto_descripcion: conceptoP004?.descripcion || 'Tickets a Favor',
                cantidad: 1,
                precio_unitario: subtotalDescuentos,
                subtotal: subtotalDescuentos,
                iva_porcentaje: conceptoP004?.iva_porcentaje || 0,
                iva_monto: 0,
                total: subtotalDescuentos,
                es_descuento: true
              })
          }
        }

        // Actualizar/crear detalles de peajes (P005)
        if (montoPeajes > 0) {
          const { data: existingPeaje } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P005')
            .maybeSingle()

          const conceptoP005 = conceptosMap.get('P005')
          if (existingPeaje) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_id: conceptoP005?.id || null,
                concepto_descripcion: conceptoP005?.descripcion || 'Peajes Cabify',
                precio_unitario: montoPeajes,
                subtotal: montoPeajes,
                total: montoPeajes
              })
              .eq('id', existingPeaje.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_id: conceptoP005?.id || null,
                concepto_codigo: 'P005',
                concepto_descripcion: conceptoP005?.descripcion || 'Peajes Cabify',
                cantidad: 1,
                precio_unitario: montoPeajes,
                subtotal: montoPeajes,
                iva_porcentaje: conceptoP005?.iva_porcentaje || 0,
                iva_monto: 0,
                total: montoPeajes,
                es_descuento: false
              })
          }
        }

        // Actualizar/crear detalles de multas de tránsito (P008)
        if (montoMultas > 0) {
          const { data: existingMulta } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P008')
            .maybeSingle()

          const conceptoP008 = conceptosMap.get('P008')
          if (existingMulta) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_id: conceptoP008?.id || null,
                concepto_descripcion: conceptoP008?.descripcion || `Multas de Tránsito (${cantidadMultas})`,
                precio_unitario: montoMultas,
                cantidad: cantidadMultas,
                subtotal: montoMultas,
                total: montoMultas
              })
              .eq('id', existingMulta.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_id: conceptoP008?.id || null,
                concepto_codigo: 'P008',
                concepto_descripcion: conceptoP008?.descripcion || `Multas de Tránsito (${cantidadMultas})`,
                cantidad: cantidadMultas,
                precio_unitario: Math.round(montoMultas / cantidadMultas),
                subtotal: montoMultas,
                iva_porcentaje: conceptoP008?.iva_porcentaje || 0,
                iva_monto: 0,
                total: montoMultas,
                es_descuento: false
              })
          }
        }

        // Actualizar/crear detalles de cobros fraccionados (P010)
        for (const cobro of cobrosConductor) {
          const descripcionCobro = cobro.descripcion ||
            `Cuota ${cobro.numero_cuota} de ${cobro.total_cuotas}`

          // Buscar si ya existe un detalle P010 para este cobro específico
          const { data: existingCobro } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', fact.id)
            .eq('concepto_codigo', 'P010')
            .eq('referencia_id', cobro.id)
            .maybeSingle()

          if (existingCobro) {
            await (supabase.from('facturacion_detalle') as any)
              .update({
                concepto_descripcion: descripcionCobro,
                precio_unitario: cobro.monto_cuota,
                subtotal: cobro.monto_cuota,
                total: cobro.monto_cuota
              })
              .eq('id', existingCobro.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: fact.id,
                concepto_codigo: 'P010',
                concepto_descripcion: descripcionCobro,
                cantidad: 1,
                precio_unitario: cobro.monto_cuota,
                subtotal: cobro.monto_cuota,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: cobro.monto_cuota,
                es_descuento: false,
                referencia_id: cobro.id,
                referencia_tipo: 'cobro_fraccionado'
              })
          }
        }

        actualizados++
      }

      // Actualizar totales del período
      const totalCargos = facturaciones.reduce((sum, f) => {
        const exceso = excesosMap.get(f.conductor_id)
        const montoExcesos = exceso?.monto || 0
        const montoPeajes = peajesMap.get(f.conductor_dni || '') || 0
        const montoPenalidades = penalidadesMap.get(f.conductor_id) || 0
        const patenteNorm = (f.vehiculo_patente || '').toUpperCase().replace(/\s+/g, '')
        const montoMultas = multasMap.get(patenteNorm)?.monto || 0
        const montoCobrosF = (cobrosMap.get(f.conductor_id) || []).reduce((s: number, c: any) => s + (c.monto_cuota || 0), 0)
        return sum + f.subtotal_alquiler + f.subtotal_garantia + montoExcesos + montoPeajes + montoPenalidades + montoMultas + montoCobrosF
      }, 0)

      const totalDescuentos = facturaciones.reduce((sum, f) => {
        return sum + (ticketsMap.get(f.conductor_id) || 0)
      }, 0)

      await (supabase.from('periodos_facturacion') as any)
        .update({
          total_cargos: totalCargos,
          total_descuentos: totalDescuentos,
          total_neto: totalCargos - totalDescuentos,
          updated_at: new Date().toISOString()
        })
        .eq('id', periodo.id)

      // Contar totales incorporados para el resumen
      const totalExcesosIncorp = Array.from(excesosMap.values()).reduce((sum, e) => sum + e.monto, 0)
      const totalPeajesIncorp = Array.from(peajesMap.values()).reduce((sum, p) => sum + p, 0)
      const totalPenalidadesIncorp = Array.from(penalidadesMap.values()).reduce((sum, p) => sum + p, 0)
      const totalTicketsIncorp = Array.from(ticketsMap.values()).reduce((sum, t) => sum + t, 0)
      const totalMultasIncorp = Array.from(multasMap.values()).reduce((sum, m) => sum + m.monto, 0)
      const cantidadMultasIncorp = Array.from(multasMap.values()).reduce((sum, m) => sum + m.cantidad, 0)

      // Recargar datos
      await cargarFacturacion()

      // Mostrar resumen detallado
      const formatMonto = (m: number) => m.toLocaleString('es-PY', { maximumFractionDigits: 0 })
      const detallesIncorp: string[] = []
      if (totalExcesosIncorp > 0) detallesIncorp.push(`Excesos KM: Gs. ${formatMonto(totalExcesosIncorp)}`)
      if (totalPeajesIncorp > 0) detallesIncorp.push(`Peajes: Gs. ${formatMonto(totalPeajesIncorp)}`)
      if (totalPenalidadesIncorp > 0) detallesIncorp.push(`Penalidades: Gs. ${formatMonto(totalPenalidadesIncorp)}`)
      if (totalMultasIncorp > 0) detallesIncorp.push(`Multas de Tránsito (${cantidadMultasIncorp}): Gs. ${formatMonto(totalMultasIncorp)}`)
      if (totalTicketsIncorp > 0) detallesIncorp.push(`Tickets a Favor: Gs. ${formatMonto(totalTicketsIncorp)}`)

      showSuccess('Recálculo completado', `${actualizados} registros actualizados${detallesIncorp.length > 0 ? ` - ${detallesIncorp.join(', ')}` : ''}`)

    } catch (error) {
      console.error('Error recalculando período:', error)
      Swal.fire('Error', 'No se pudo recalcular el período', 'error')
    } finally {
      setRecalculando(false)
    }
  }

  // Ver detalle de facturación
  async function verDetalle(facturacion: FacturacionConductor) {
    console.log('[verDetalle] INICIO - modoVistaPrevia:', modoVistaPrevia, 'facturacion.id:', facturacion.id)
    setLoadingDetalle(true)
    setShowDetalle(true)
    setDetalleFacturacion(facturacion)

    // En modo Vista Previa, generar detalles simulados desde los datos calculados
    if (modoVistaPrevia || facturacion.id.startsWith('preview-')) {
      console.log('[verDetalle] Entrando en modo Vista Previa')
      const detallesSimulados: FacturacionDetalle[] = []

      // P001/P002 - Alquiler
      if (facturacion.subtotal_alquiler > 0) {
        const codigoAlquiler = facturacion.tipo_alquiler === 'CARGO' ? 'P001' : 'P002'
        const descAlquiler = facturacion.tipo_alquiler === 'CARGO' ? 'Alquiler a Cargo' : 'Alquiler a Turno'
        const diasDesc = facturacion.turnos_cobrados < 7 ? ` (${facturacion.turnos_cobrados}/7 días)` : ''
        detallesSimulados.push({
          id: `det-alquiler-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: codigoAlquiler,
          concepto_descripcion: descAlquiler + diasDesc,
          cantidad: facturacion.turnos_cobrados,
          precio_unitario: Math.round(facturacion.subtotal_alquiler / facturacion.turnos_cobrados),
          subtotal: facturacion.subtotal_alquiler,
          total: facturacion.subtotal_alquiler,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P003 - Garantía
      if (facturacion.subtotal_garantia > 0) {
        const diasDesc = facturacion.turnos_cobrados < 7 ? ` (${facturacion.turnos_cobrados}/7 días)` : ''
        detallesSimulados.push({
          id: `det-garantia-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P003',
          concepto_descripcion: 'Cuota de Garantía' + diasDesc,
          cantidad: 1,
          precio_unitario: facturacion.subtotal_garantia,
          subtotal: facturacion.subtotal_garantia,
          total: facturacion.subtotal_garantia,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P006 - Excesos KM
      const excesosCond = getExcesosConductor(facturacion.conductor_id)
      const montoExcesos = excesosCond.reduce((sum, e) => sum + e.monto_total, 0)
      if (montoExcesos > 0) {
        const kmTotal = excesosCond.reduce((sum, e) => sum + e.km_exceso, 0)
        detallesSimulados.push({
          id: `det-exceso-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P006',
          concepto_descripcion: `Exceso de Kilometraje (+${kmTotal} km)`,
          cantidad: 1,
          precio_unitario: montoExcesos,
          subtotal: montoExcesos,
          total: montoExcesos,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P007 - Multas/Penalidades - Consultar directamente de la BD
      // Consultar TODAS las penalidades del conductor para esta semana
      const { data: penalidades } = await supabase
        .from('penalidades')
        .select('id, monto, observaciones, fraccionado, cantidad_cuotas')
        .eq('conductor_id', facturacion.conductor_id)
        .eq('aplicado', true)
      
      // Agregar cada penalidad
      ;(penalidades || []).forEach((p: any, idx: number) => {
        if (!p.fraccionado) {
          // Penalidad completa
          detallesSimulados.push({
            id: `det-pen-${facturacion.conductor_id}-${idx}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'P007',
            concepto_descripcion: p.observaciones || 'Multa/Infracción',
            cantidad: 1,
            precio_unitario: p.monto,
            subtotal: p.monto,
            total: p.monto,
            es_descuento: false,
            referencia_id: p.id,
            referencia_tipo: 'penalidad'
          })
        }
      })
      
      // Si no hay penalidades pero hay monto, mostrar el total
      if ((penalidades || []).length === 0 && facturacion.monto_penalidades && facturacion.monto_penalidades > 0) {
        detallesSimulados.push({
          id: `det-penalidades-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P007',
          concepto_descripcion: 'Multas/Infracciones',
          cantidad: 1,
          precio_unitario: facturacion.monto_penalidades,
          subtotal: facturacion.monto_penalidades,
          total: facturacion.monto_penalidades,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P010 - Cobros fraccionados (plan de pagos) de esta semana
      {
        const semDetalle = periodo?.semana || getWeek(semanaActual.inicio, { weekStartsOn: 1 })
        const anioDetalle = periodo?.anio || getYear(semanaActual.inicio)
        const { data: cobrosDetalle } = await (supabase
          .from('cobros_fraccionados') as any)
          .select('*')
          .eq('conductor_id', facturacion.conductor_id)
          .eq('semana', semDetalle)
          .eq('anio', anioDetalle)
          .eq('aplicado', false)

        ;(cobrosDetalle || []).forEach((cobro: any, idx: number) => {
          const descripcionCobro = cobro.descripcion ||
            `Cuota ${cobro.numero_cuota} de ${cobro.total_cuotas}`
          detallesSimulados.push({
            id: `det-cobro-${facturacion.conductor_id}-${idx}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'P010',
            concepto_descripcion: descripcionCobro,
            cantidad: 1,
            precio_unitario: cobro.monto_cuota,
            subtotal: cobro.monto_cuota,
            total: cobro.monto_cuota,
            es_descuento: false,
            referencia_id: cobro.id,
            referencia_tipo: 'cobro_fraccionado'
          })
        })
      }

      // P004 - Tickets a Favor (descuentos)
      if (facturacion.subtotal_descuentos > 0) {
        detallesSimulados.push({
          id: `det-tickets-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P004',
          concepto_descripcion: 'Tickets a Favor',
          cantidad: 1,
          precio_unitario: facturacion.subtotal_descuentos,
          subtotal: facturacion.subtotal_descuentos,
          total: facturacion.subtotal_descuentos,
          es_descuento: true,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      setDetalleItems(detallesSimulados)
      setLoadingDetalle(false)
      return
    }

    // Modo normal: cargar desde BD
    try {
      // Cargar detalles de la facturación
      const { data: detalles, error } = await supabase
        .from('facturacion_detalle')
        .select('*')
        .eq('facturacion_id', facturacion.id)
        .order('es_descuento')
        .order('concepto_codigo')

      if (error) throw error

      // Filtrar el item genérico de MULTAS/INFRACCIONES (P007) y reemplazar con detalle real
      const detallesSinPenalidades = (detalles || []).filter((d: any) => d.concepto_codigo !== 'P007')
      
      // Consultar detalle de penalidades del conductor
      const { data: penalidades } = await supabase
        .from('penalidades')
        .select('id, monto, observaciones, fraccionado, cantidad_cuotas')
        .eq('conductor_id', facturacion.conductor_id)
        .eq('aplicado', true)
      
      // Crear items de detalle para cada penalidad
      const detallesPenalidades: FacturacionDetalle[] = (penalidades || [])
        .filter((p: any) => !p.fraccionado)
        .map((p: any, idx: number) => ({
          id: `det-pen-${facturacion.conductor_id}-${idx}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P007',
          concepto_descripcion: p.observaciones || 'Multa/Infracción',
          cantidad: 1,
          precio_unitario: p.monto,
          subtotal: p.monto,
          total: p.monto,
          es_descuento: false,
          referencia_id: p.id,
          referencia_tipo: 'penalidad'
        }))
      
      // Combinar detalles
      const todosDetalles = [...detallesSinPenalidades, ...detallesPenalidades] as FacturacionDetalle[]
      setDetalleItems(todosDetalles)
    } catch (error) {
      console.error('Error cargando detalle:', error)
      Swal.fire('Error', 'No se pudo cargar el detalle', 'error')
      setShowDetalle(false)
    } finally {
      setLoadingDetalle(false)
    }
  }

  // ==========================================
  // REGISTRAR PAGO DE FACTURACIÓN SEMANAL
  // ==========================================
  async function registrarPagoFacturacion(facturacion: FacturacionConductor) {
    const semanaNum = periodo?.semana || getWeek(semanaActual.inicio, { weekStartsOn: 1 })
    const anioNum = periodo?.anio || getYear(semanaActual.inicio)

    const hoy = new Date()
    const semanaHoy = Math.ceil(
      (hoy.getTime() - new Date(hoy.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    const anioHoy = hoy.getFullYear()

    let semanaOptionsHtml = ''
    for (let s = 1; s <= 52; s++) {
      const selected = s === semanaHoy ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

    const saldoColor = facturacion.total_a_pagar > 0 ? '#ff0033' : '#16a34a'
    const saldoLabel = facturacion.total_a_pagar > 0 ? 'Debe' : 'A Favor'

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Registrar Pago Semanal</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${facturacion.conductor_nombre}</div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #6B7280; font-size: 12px;">DNI: <strong style="color: #374151;">${facturacion.conductor_dni || '-'}</strong></span>
              <span style="color: #6B7280; font-size: 12px;">Semana: <strong style="color: #374151;">S${semanaNum}/${anioNum}</strong></span>
            </div>
            <div style="margin-top: 6px; padding: 6px 8px; background: white; border-radius: 4px; border: 1px solid #E5E7EB;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>Alquiler:</span><span>${formatCurrency(facturacion.subtotal_alquiler)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>Garantía:</span><span>${formatCurrency(facturacion.subtotal_garantia)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>Cargos:</span><span>${formatCurrency(facturacion.subtotal_cargos)}</span>
              </div>
              ${facturacion.subtotal_descuentos > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #16a34a;">
                <span>Descuentos:</span><span>-${formatCurrency(facturacion.subtotal_descuentos)}</span>
              </div>` : ''}
              ${facturacion.saldo_anterior !== 0 ? `<div style="display: flex; justify-content: space-between; font-size: 12px; color: ${facturacion.saldo_anterior > 0 ? '#ff0033' : '#16a34a'};">
                <span>Saldo Anterior:</span><span>${formatCurrency(facturacion.saldo_anterior)}</span>
              </div>` : ''}
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; margin-top: 4px; padding-top: 4px; border-top: 1px solid #E5E7EB; color: ${saldoColor};">
                <span>TOTAL (${saldoLabel}):</span><span>${formatCurrency(Math.abs(facturacion.total_a_pagar))}</span>
              </div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Semana pago:</label>
              <select id="swal-semana" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${semanaOptionsHtml}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Año:</label>
              <select id="swal-anio" class="swal2-select" style="width: 100%; font-size: 14px;">
                <option value="2025">2025</option>
                <option value="${anioHoy}" selected>${anioHoy}</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto a pagar:</label>
            <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${Math.abs(facturacion.total_a_pagar)}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Transferencia, Efectivo, Recibo #123">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar Pago',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      width: 420,
      preConfirm: () => {
        const semana = parseInt((document.getElementById('swal-semana') as HTMLSelectElement).value)
        const anio = parseInt((document.getElementById('swal-anio') as HTMLSelectElement).value)
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value
        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        return { monto: parseFloat(monto), referencia, semana, anio }
      }
    })

    if (!formValues) return

    try {
      // 1. Registrar pago en pagos_conductores
      const { error: errorPago } = await (supabase.from('pagos_conductores') as any)
        .insert({
          conductor_id: facturacion.conductor_id,
          tipo_cobro: 'facturacion_semanal',
          referencia_id: facturacion.id,
          referencia_tabla: 'facturacion_conductores',
          numero_cuota: null,
          monto: formValues.monto,
          fecha_pago: new Date().toISOString(),
          referencia: formValues.referencia || null,
          semana: formValues.semana,
          anio: formValues.anio,
          conductor_nombre: facturacion.conductor_nombre
        })

      if (errorPago) throw errorPago

      // 2. Actualizar saldo_actual en saldos_conductores
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual')
        .eq('conductor_id', facturacion.conductor_id)
        .single()

      if (saldoExistente) {
        const nuevoSaldo = saldoExistente.saldo_actual + formValues.monto
        await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: nuevoSaldo,
            ultima_actualizacion: new Date().toISOString()
          })
          .eq('id', saldoExistente.id)
      }

      // 3. Registrar en abonos_conductores como audit trail
      await (supabase.from('abonos_conductores') as any).insert({
        conductor_id: facturacion.conductor_id,
        tipo: 'abono',
        monto: formValues.monto,
        concepto: `Pago facturación S${semanaNum}/${anioNum}`,
        referencia: formValues.referencia || null,
        semana: formValues.semana,
        anio: formValues.anio,
        fecha_abono: new Date().toISOString()
      })

      // 4. Si el pago cubre el total, marcar facturación como pagada
      if (formValues.monto >= Math.abs(facturacion.total_a_pagar) && !facturacion.id.startsWith('preview-')) {
        await (supabase.from('facturacion_conductores') as any)
          .update({ estado: 'pagado' })
          .eq('id', facturacion.id)
      }

      showSuccess('Pago Registrado', `${facturacion.conductor_nombre} - ${formatCurrency(formValues.monto)}`)
    } catch (error: any) {
      console.error('Error registrando pago:', error)
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  // Navegación de semanas
  function semanaAnterior() {
    const nuevaFecha = subWeeks(semanaActual.inicio, 1)
    setSemanaActual(getSemanaArgentina(nuevaFecha))
  }

  function semanaSiguiente() {
    const nuevaFecha = addWeeks(semanaActual.inicio, 1)
    setSemanaActual(getSemanaArgentina(nuevaFecha))
  }

  function irASemanaActual() {
    setSemanaActual(getSemanaArgentina(new Date()))
  }

  // Exportar a PDF
  async function exportarPDF() {
    if (!detalleFacturacion) return

    // Usar periodo si existe, o generar datos desde infoSemana para Vista Previa
    const semanaNum = periodo?.semana || getWeek(semanaActual.inicio, { weekStartsOn: 1 })
    const anioNum = periodo?.anio || getYear(semanaActual.inicio)
    const fechaInicioStr = periodo?.fecha_inicio || format(semanaActual.inicio, 'yyyy-MM-dd')
    const fechaFinStr = periodo?.fecha_fin || format(semanaActual.fin, 'yyyy-MM-dd')

    setExportingPdf(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 15
      let y = 15

      // Colores
      const rojo = '#ff0033'
      const gris = '#6B7280'
      const negro = '#111827'
      const verde = '#059669'

      // Header con logo
      pdf.setFontSize(24)
      pdf.setTextColor(rojo)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOSHIFY', margin, y)

      pdf.setFontSize(10)
      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Sistema de Gestión de Flota', margin, y + 6)

      // Título del documento
      pdf.setFontSize(14)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('FACTURACIÓN', pageWidth - margin, y, { align: 'right' })

      pdf.setFontSize(10)
      pdf.setTextColor(rojo)
      pdf.text(`Semana ${semanaNum} / ${anioNum}`, pageWidth - margin, y + 6, { align: 'right' })

      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${format(parseISO(fechaInicioStr), 'dd/MM/yyyy')} - ${format(parseISO(fechaFinStr), 'dd/MM/yyyy')}`, pageWidth - margin, y + 11, { align: 'right' })

      y += 25

      // Línea separadora
      pdf.setDrawColor(220, 38, 38)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 10

      // Datos del conductor
      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CONDUCTOR', margin, y)
      y += 6

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Nombre: ${detalleFacturacion.conductor_nombre}`, margin, y)
      pdf.text(`DNI: ${detalleFacturacion.conductor_dni}`, pageWidth / 2, y)
      y += 5
      if (detalleFacturacion.conductor_cuit) {
        pdf.text(`CUIT: ${detalleFacturacion.conductor_cuit}`, margin, y)
      }
      pdf.text(`Vehículo: ${detalleFacturacion.vehiculo_patente || '-'}`, pageWidth / 2, y)
      y += 5
      pdf.text(`Tipo: ${detalleFacturacion.tipo_alquiler}`, margin, y)
      pdf.text(`Turnos: ${detalleFacturacion.turnos_cobrados}/${detalleFacturacion.turnos_base}`, pageWidth / 2, y)
      y += 10

      // Línea separadora
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // CARGOS
      pdf.setFontSize(11)
      pdf.setTextColor(rojo)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CARGOS (A PAGAR)', margin, y)
      y += 7

      pdf.setFontSize(10)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'normal')

      const cargos = detalleItems.filter(d => !d.es_descuento)
      cargos.forEach(cargo => {
        pdf.text(cargo.concepto_descripcion, margin, y)
        pdf.text(formatCurrency(cargo.total), pageWidth - margin, y, { align: 'right' })
        y += 5
      })

      // Saldo anterior y mora
      if (detalleFacturacion.saldo_anterior > 0) {
        pdf.text('Saldo Anterior', margin, y)
        pdf.text(formatCurrency(detalleFacturacion.saldo_anterior), pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      if (detalleFacturacion.monto_mora > 0) {
        pdf.text(`Mora (${detalleFacturacion.dias_mora} días)`, margin, y)
        pdf.text(formatCurrency(detalleFacturacion.monto_mora), pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      y += 3
      pdf.setFont('helvetica', 'bold')
      pdf.text('SUBTOTAL CARGOS', margin, y)
      pdf.text(formatCurrency(detalleFacturacion.subtotal_cargos + detalleFacturacion.saldo_anterior + detalleFacturacion.monto_mora), pageWidth - margin, y, { align: 'right' })
      y += 10

      // DESCUENTOS
      const descuentos = detalleItems.filter(d => d.es_descuento)
      if (descuentos.length > 0) {
        pdf.setFontSize(11)
        pdf.setTextColor(verde)
        pdf.setFont('helvetica', 'bold')
        pdf.text('DESCUENTOS (A FAVOR)', margin, y)
        y += 7

        pdf.setFontSize(10)
        pdf.setTextColor(negro)
        pdf.setFont('helvetica', 'normal')

        descuentos.forEach(desc => {
          pdf.text(desc.concepto_descripcion, margin, y)
          pdf.text(`-${formatCurrency(desc.total)}`, pageWidth - margin, y, { align: 'right' })
          y += 5
        })

        y += 3
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(verde)
        pdf.text('SUBTOTAL DESCUENTOS', margin, y)
        pdf.text(`-${formatCurrency(detalleFacturacion.subtotal_descuentos)}`, pageWidth - margin, y, { align: 'right' })
        y += 10
      }

      // TOTAL
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      const totalFinal = detalleFacturacion.total_a_pagar
      const saldoColor = totalFinal > 0 ? rojo : verde

      pdf.setFontSize(14)
      pdf.setTextColor(saldoColor)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOTAL A PAGAR', margin, y)
      pdf.text(formatCurrency(totalFinal), pageWidth - margin, y, { align: 'right' })

      // Pie de página
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, pdf.internal.pageSize.getHeight() - 10)
      pdf.text('TOSHIFY - Sistema de Gestión de Flota', pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: 'right' })

      // Guardar PDF
      const nombreArchivo = `Facturacion_${detalleFacturacion.conductor_nombre.replace(/\s+/g, '_')}_Semana${semanaNum}_${anioNum}.pdf`
      pdf.save(nombreArchivo)

      showSuccess('PDF Exportado', `Se descargó: ${nombreArchivo}`)
    } catch (error) {
      console.error('Error exportando PDF:', error)
      Swal.fire('Error', 'No se pudo exportar el PDF', 'error')
    } finally {
      setExportingPdf(false)
    }
  }

  // Filtrar datos según los filtros Excel por columna
  const facturacionesFiltradas = useMemo(() => {
    return facturaciones.filter(f => {
      // Filtro por conductor (multiselect)
      if (conductorFilter.length > 0 && !conductorFilter.includes(f.conductor_nombre)) return false
      // Filtro por tipo alquiler (multiselect)
      if (tipoFilter.length > 0 && !tipoFilter.includes(f.tipo_alquiler)) return false
      // Filtro por patente (multiselect)
      if (patenteFilter.length > 0 && !patenteFilter.includes(f.vehiculo_patente || '')) return false
      return true
    })
  }, [facturaciones, conductorFilter, tipoFilter, patenteFilter])

  // Exportar a Excel
  async function exportarExcel() {
    if (!periodo) return

    setExportingExcel(true)
    try {
      const dataToExport = tableInstance
        ? tableInstance.getFilteredRowModel().rows.map(row => row.original)
        : facturacionesFiltradas

      if (dataToExport.length === 0) {
        Swal.fire('Sin datos', 'No hay datos para exportar', 'warning')
        setExportingExcel(false)
        return
      }

      const wb = XLSX.utils.book_new()

      // HOJA 1: RESUMEN
      const resumenData: (string | number)[][] = [
        ['TOSHIFY - REPORTE DE FACTURACIÓN'],
        [`Semana ${periodo.semana} del ${periodo.anio}`],
        [`Período: ${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} al ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`],
        [`Estado: ${periodo.estado.toUpperCase()}`],
        [''],
        ['RESUMEN GENERAL'],
        [''],
        ['Concepto', 'Cantidad/Monto'],
        ['Total Conductores', periodo.total_conductores],
        ['Total Cargos', periodo.total_cargos],
        ['Total Descuentos', periodo.total_descuentos],
        ['Total Neto', periodo.total_neto],
        [''],
        [''],
        ['DETALLE POR CONDUCTOR'],
        [''],
        ['Conductor', 'DNI', 'CUIT', 'Vehículo', 'Tipo', 'Turnos', 'Alquiler', 'Garantía', 'Cargos', 'Descuentos', 'Saldo Ant.', 'Mora', 'Total']
      ]

      dataToExport.forEach(f => {
        resumenData.push([
          f.conductor_nombre,
          f.conductor_dni || '-',
          f.conductor_cuit || '-',
          f.vehiculo_patente || '-',
          f.tipo_alquiler,
          `${f.turnos_cobrados}/${f.turnos_base}`,
          f.subtotal_alquiler,
          f.subtotal_garantia,
          f.subtotal_cargos,
          f.subtotal_descuentos,
          f.saldo_anterior,
          f.monto_mora,
          f.total_a_pagar
        ])
      })

      resumenData.push([''])
      resumenData.push([
        'TOTALES', '', '', '', '', '',
        dataToExport.reduce((sum, f) => sum + f.subtotal_alquiler, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_garantia, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_cargos, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_descuentos, 0),
        dataToExport.reduce((sum, f) => sum + f.saldo_anterior, 0),
        dataToExport.reduce((sum, f) => sum + f.monto_mora, 0),
        dataToExport.reduce((sum, f) => sum + f.total_a_pagar, 0)
      ])

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
      wsResumen['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 },
        { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }
      ]
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      const nombreArchivo = `Facturacion_Semana${periodo.semana}_${periodo.anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      showSuccess('Reporte Exportado', `Se descargó: ${nombreArchivo}`)
    } catch (error) {
      console.error('Error exportando Excel:', error)
      Swal.fire('Error', 'No se pudo exportar el reporte', 'error')
    } finally {
      setExportingExcel(false)
    }
  }

  // Preparar preview de SiFactura (30 columnas) - muestra antes de exportar
  async function prepararSiFacturaPreview() {
    if (!periodo) return

    setLoadingSiFacturaPreview(true)
    try {
      // Cargar detalles de facturación para este período
      const { data: detalles } = await supabase
        .from('facturacion_detalle')
        .select(`
          *,
          facturacion_conductores!inner(
            id, conductor_id, conductor_nombre, conductor_dni, conductor_cuit,
            vehiculo_patente, tipo_alquiler, periodo_id, turnos_cobrados
          )
        `)

      // Filtrar por período actual
      const detallesFiltrados = (detalles || []).filter(
        (d: any) => d.facturacion_conductores?.periodo_id === periodo.id
      )
      const detallesTyped = detallesFiltrados as any[]
      
      // Cargar emails de conductores
      const dnis = [...new Set(facturacionesFiltradas.map(f => f.conductor_dni).filter(Boolean))]
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('numero_dni, email')
        .in('numero_dni', dnis)
      
      const emailMap = new Map((conductoresData || []).map((c: any) => [c.numero_dni, c.email]))

      // Obtener IDs de detalles ya insertados (para comparar)
      const detallesReferencias = new Set(
        detallesTyped
          .filter((d: any) => d.referencia_id)
          .map((d: any) => d.referencia_id)
      )

      // Cargar conceptos pendientes (no aplicados y no en facturacion_detalle)
      const conductorIds = facturacionesFiltradas.map(f => f.conductor_id).filter(Boolean)
      const pendientes: ConceptoPendiente[] = []

      // 1. Tickets pendientes
      const { data: ticketsPendientes } = await (supabase
        .from('tickets_favor') as any)
        .select('*, conductor:conductores(nombres, apellidos)')
        .in('conductor_id', conductorIds)
        .eq('estado', 'aprobado')
        .is('periodo_aplicado_id', null)

      for (const t of (ticketsPendientes || []) as any[]) {
        if (!detallesReferencias.has(t.id)) {
          pendientes.push({
            id: t.id,
            tipo: 'ticket',
            conductorId: t.conductor_id,
            conductorNombre: t.conductor?.nombres && t.conductor?.apellidos 
              ? `${t.conductor.nombres} ${t.conductor.apellidos}` 
              : t.conductor_nombre || 'Sin nombre',
            monto: t.monto,
            descripcion: t.descripcion || t.tipo,
            tabla: 'tickets_favor',
            fechaCreacion: t.created_at,
            creadoPor: t.created_by_name,
            origenDetalle: `Ticket ${t.tipo || ''} - Creado ${t.created_at ? format(parseISO(t.created_at), 'dd/MM/yyyy', { locale: es }) : ''}`
          })
        }
      }

      // 2. Penalidades pendientes (NO fraccionadas, filtradas por fecha del período)
      const { data: penalidadesPendientes } = await (supabase
        .from('penalidades') as any)
        .select('*, conductor:conductores(nombres, apellidos), tipos_cobro_descuento(nombre)')
        .in('conductor_id', conductorIds)
        .eq('aplicado', false)
        .eq('rechazado', false)
        .eq('fraccionado', false)
        .eq('semana', periodo.semana)

      for (const p of (penalidadesPendientes || []) as any[]) {
        if (!detallesReferencias.has(p.id)) {
          pendientes.push({
            id: p.id,
            tipo: 'penalidad',
            conductorId: p.conductor_id,
            conductorNombre: p.conductor?.nombres && p.conductor?.apellidos 
              ? `${p.conductor.nombres} ${p.conductor.apellidos}` 
              : p.conductor_nombre || 'Sin nombre',
            monto: p.monto || 0,
            descripcion: p.detalle || p.tipos_cobro_descuento?.nombre || 'Penalidad',
            tabla: 'penalidades',
            fechaCreacion: p.created_at,
            creadoPor: p.created_by_name,
            origenDetalle: `Penalidad completa - ${p.tipos_cobro_descuento?.nombre || 'Sin tipo'} - Creado ${p.created_at ? format(parseISO(p.created_at), 'dd/MM/yyyy', { locale: es }) : ''}`,
            // Datos adicionales
            penalidadId: p.id,
            tipoPenalidad: p.tipos_cobro_descuento?.nombre,
            motivoPenalidad: p.motivo,
            notasPenalidad: p.notas,
            fechaPenalidad: p.fecha,
            // Origen siniestro si existe (se cargará el código después)
            siniestroId: p.siniestro_id
          })
        }
      }

      // 3. Cobros fraccionados pendientes de esta semana
      const { data: cobrosPendientes } = await (supabase
        .from('cobros_fraccionados') as any)
        .select('*, conductor:conductores(nombres, apellidos)')
        .in('conductor_id', conductorIds)
        .eq('semana', periodo.semana)
        .eq('anio', periodo.anio)
        .eq('aplicado', false)

      for (const c of (cobrosPendientes || []) as any[]) {
        if (!detallesReferencias.has(c.id)) {
          pendientes.push({
            id: c.id,
            tipo: 'cobro_fraccionado',
            conductorId: c.conductor_id,
            conductorNombre: c.conductor?.nombres && c.conductor?.apellidos 
              ? `${c.conductor.nombres} ${c.conductor.apellidos}` 
              : 'Sin nombre',
            monto: c.monto_cuota,
            descripcion: c.descripcion || `Cuota ${c.numero_cuota} de ${c.total_cuotas}`,
            tabla: 'cobros_fraccionados',
            fechaCreacion: c.created_at,
            creadoPor: c.created_by_name,
            montoTotal: c.monto_total,
            cuotaActual: c.numero_cuota,
            totalCuotas: c.total_cuotas,
            origenDetalle: `Cobro fraccionado - Total: ${formatCurrency(c.monto_total || 0)} en ${c.total_cuotas} cuotas - Creado ${c.created_at ? format(parseISO(c.created_at), 'dd/MM/yyyy', { locale: es }) : ''}`
          })
        }
      }

      // 4. Penalidades cuotas (penalidades fraccionadas) pendientes de esta semana
      const { data: penalidadesCuotasPendientes } = await (supabase
        .from('penalidades_cuotas') as any)
        .select('*, penalidad:penalidades(id, conductor_id, conductor_nombre, detalle, monto, notas, fecha, motivo, siniestro_id, created_at, created_by_name, conductor:conductores(nombres, apellidos))')
        .eq('semana', periodo.semana)
        .eq('anio', periodo.anio)
        .eq('aplicado', false)

      for (const pc of (penalidadesCuotasPendientes || []) as any[]) {
        if (!detallesReferencias.has(pc.id) && pc.penalidad?.conductor_id && conductorIds.includes(pc.penalidad.conductor_id)) {
          const conductorNombre = pc.penalidad?.conductor?.nombres && pc.penalidad?.conductor?.apellidos
            ? `${pc.penalidad.conductor.nombres} ${pc.penalidad.conductor.apellidos}`
            : pc.penalidad?.conductor_nombre || 'Sin nombre'
          pendientes.push({
            id: pc.id,
            tipo: 'cobro_fraccionado',
            conductorId: pc.penalidad.conductor_id,
            conductorNombre,
            monto: pc.monto_cuota,
            descripcion: pc.penalidad?.detalle || 'Penalidad fraccionada',
            tabla: 'penalidades_cuotas',
            fechaCreacion: pc.penalidad?.created_at,
            creadoPor: pc.penalidad?.created_by_name,
            montoTotal: pc.penalidad?.monto,
            cuotaActual: pc.numero_cuota,
            totalCuotas: pc.total_cuotas,
            penalidadId: pc.penalidad?.id,
            motivoPenalidad: pc.penalidad?.motivo,
            notasPenalidad: pc.penalidad?.notas,
            fechaPenalidad: pc.penalidad?.fecha,
            siniestroId: pc.penalidad?.siniestro_id
          })
        }
      }

      // Cargar códigos de siniestro para los pendientes que tienen siniestro_id
      const siniestroIds = pendientes.filter(p => p.siniestroId).map(p => p.siniestroId).filter(Boolean) as string[]
      if (siniestroIds.length > 0) {
        const { data: siniestrosData } = await supabase
          .from('siniestros')
          .select('id, codigo')
          .in('id', siniestroIds)
        
        const siniestroMap = new Map((siniestrosData || []).map((s: any) => [s.id, s.codigo]))
        pendientes.forEach(p => {
          if (p.siniestroId && siniestroMap.has(p.siniestroId)) {
            p.siniestroCodigo = siniestroMap.get(p.siniestroId)
          }
        })
      }

      setConceptosPendientes(pendientes)

      // Crear Set de conductores con saldos pendientes para marcarlos en el preview
      const conductoresConSaldosPendientes = new Set(pendientes.map(p => p.conductorId))

      // Fechas del período
      const fechaEmision = parseISO(periodo.fecha_fin)
      const fechaVencimiento = addWeeks(parseISO(periodo.fecha_fin), 1)
      const periodoDesc = `${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} al ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`

      // Función para crear fila SiFactura (para preview)
      const crearFilaPreview = (
        numero: number,
        fact: FacturacionConductor,
        total: number,
        codigoProducto: string,
        descripcionAdicional: string,
        facturacionId?: string,
        detalleId?: string
      ): FacturacionPreviewRow => {
        // Redondear total a 2 decimales para evitar errores de punto flotante
        total = Math.round(total * 100) / 100

        // Determinar tipo de factura según CUIT
        const tieneCuit = fact.conductor_cuit && fact.conductor_cuit.length >= 11
        const tipoFactura = tieneCuit ? 'FACTURA_A' : 'FACTURA_B'
        const condicionIva = tieneCuit ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL'
        const email = emailMap.get(fact.conductor_dni) || ''
        
        // NUMERO CUIL = DNI, NUMERO DNI = CUIT
        const numeroCuil = fact.conductor_dni || ''
        const numeroDni = fact.conductor_cuit || ''
        
        // Determinar IVA según concepto
        // Con IVA 21%: P001, P002, P009
        // Exentos: P003, P004, P005, P007, P010
        const conceptosConIva = ['P001', 'P002', 'P009']
        const tieneIva = conceptosConIva.includes(codigoProducto)
        
        let netoGravado = 0
        let ivaAmount = 0
        let exento = 0
        let ivaPorcentaje = 'IVA_EXENTO'
        
        if (tieneIva) {
          netoGravado = Math.round((total / 1.21) * 100) / 100
          ivaAmount = Math.round((total - netoGravado) * 100) / 100
          ivaPorcentaje = 'IVA_21'
        } else {
          exento = total
        }

        // Validaciones
        let tieneError = false
        let errorMsg = ''
        if (!numeroCuil && !numeroDni) {
          tieneError = true
          errorMsg = 'Sin DNI ni CUIT'
        }

        return {
          numero,
          fechaEmision,
          fechaVencimiento,
          puntoVenta: 5,
          tipoFactura,
          tipoDocumento: 'CUIL',
          numeroCuil,
          numeroDni,
          total,
          cobrado: 0,
          condicionIva,
          condicionVenta: 'CTA_CTE',
          razonSocial: fact.conductor_nombre,
          domicilio: '',
          codigoProducto,
          descripcionAdicional,
          email,
          nota: '',
          moneda: 'PES',
          tipoCambio: 1,
          netoGravado,
          ivaAmount,
          exento,
          totalRepetido: total,
          ivaPorcentaje,
          generarAsiento: 'SI',
          cuentaDebito: 4500007,
          cuentaCredito: 0,
          referencia: 'ND',
          check: '',
          conductorId: fact.conductor_id,
          tieneError,
          errorMsg,
          facturacionId,
          detalleId,
          tieneSaldosPendientes: conductoresConSaldosPendientes.has(fact.conductor_id)
        }
      }

      // Generar filas para preview
      const filasPreview: FacturacionPreviewRow[] = []
      let numeroFactura = 1

      // Procesar cada facturación
      for (const fact of facturacionesFiltradas) {
        const detallesConductor = detallesTyped.filter(
          (d: any) => d.facturacion_conductores?.id === fact.id
        )

        if (detallesConductor.length > 0) {
          for (const det of detallesConductor) {
            if (det.total <= 0) continue

            let descripcionAdicional = ''
            if (det.concepto_codigo === 'P001' || det.concepto_codigo === 'P002') {
              descripcionAdicional = String(fact.turnos_cobrados || 7)
            } else if (det.concepto_codigo === 'P003') {
              descripcionAdicional = fact.cuota_garantia_numero || '1 de 16'
            } else if (det.concepto_codigo === 'P005') {
              descripcionAdicional = periodoDesc
            } else if (det.concepto_descripcion) {
              descripcionAdicional = det.concepto_descripcion
            }

            filasPreview.push(crearFilaPreview(
              numeroFactura++,
              fact,
              det.total,
              det.concepto_codigo,
              descripcionAdicional,
              fact.id,
              det.id
            ))
          }
        } else {
          // Sin detalles, crear filas basadas en subtotales (sin IDs de detalle)
          if (fact.subtotal_alquiler > 0) {
            const codigoAlquiler = fact.tipo_alquiler === 'CARGO' ? 'P002' : 'P001'
            filasPreview.push(crearFilaPreview(
              numeroFactura++,
              fact,
              fact.subtotal_alquiler,
              codigoAlquiler,
              String(fact.turnos_cobrados || 7),
              fact.id
            ))
          }

          if (fact.subtotal_garantia > 0) {
            filasPreview.push(crearFilaPreview(
              numeroFactura++,
              fact,
              fact.subtotal_garantia,
              'P003',
              fact.cuota_garantia_numero || '1 de 16',
              fact.id
            ))
          }
        }
      }

      if (filasPreview.length === 0) {
        Swal.fire('Sin datos', 'No hay conceptos para exportar a SiFactura', 'warning')
        return
      }

      setSiFacturaPreviewData(filasPreview)
      setShowSiFacturaPreview(true)

    } catch {
      Swal.fire('Error', 'No se pudo cargar el preview de SiFactura', 'error')
    } finally {
      setLoadingSiFacturaPreview(false)
    }
  }

  // Exportar a Excel Facturación (desde el preview)
  async function exportarSiFacturaExcel() {
    if (siFacturaPreviewData.length === 0) return

    setExportingSiFactura(true)
    try {
      const wb = XLSX.utils.book_new()

      // Headers exactos de SiFactura
      const headers = [
        'N°',
        'FECHA EMISION. Debe ser con formato dd/mm/aaaa',
        'FECHA VENCIMIENTO. Debe ser con formato dd/mm/aaaa',
        'PUNTO DE VENTA',
        "TIPO FACTURA. Ver valores permiido en la solapa 'Tablas de ayuda'",
        "TIPO DOCUMENTO. Ver valores permiido en la solapa 'Tablas de ayuda'",
        'NUMERO CUIL ',
        'NUMERO DNI ',
        'TOTAL. Importe total de su comprobante',
        'COBRADO. Importe total cobrado para este comprobante, valor entre 0 y TOTAL, en caso de ser mayor el sistema lo seteará en el valor igual al TOTAL',
        "CONDICION IVA. Ver valores permitido en la solapa 'Tablas de ayuda'",
        "CONDICION DE VENTA. Ver valores permiido en la solapa 'Tablas de ayuda'",
        'RAZON SOCIAL. Indicar la razón social del receptor del comprobante, si éste existe detro de Sifactura,  se tomará dicha razón social para el comprobante generado, sino el software creará un nuevo cliente con el tipo de documento, número y razón social aquí indicada.',
        'DOMICILIO',
        "CODIGO PRODUCTO. Este código debe existir en la sección de Base de datos->Producto (el tipo de sección del producto debe ser VENTAS)",
        'DESCRIPCION ADICIONAL. Esta descripción se concatenará al final de la descripción del producto previamente creado dentro de Sifactura',
        'EMAIL. Correo electrónico al que se enviará el comprobante de venta',
        'NOTA. Puede o no existir, si este campo s completa, se imprimirá al pie del comprobante y se verá en la impresión',
        'MONEDA',
        'TIPO DE CAMBIO. Debe ser igual a 1 para la moneda PES',
        'NETO GRAVADO. Si el tipo decomprobante enviado es RECIBO y/o FACTURA C este valor debe ser cero',
        'Imp IVA al 21%',
        'EXENTO. Si el tipo decomprobante enviado es RECIBO y/o FACTURA C este valor debe ser cero',
        'TOTAL ',
        'IVA PORCENTAJE. Debe utilizar el valor IVA_EXENTO si el tipo de factura es RECIBO_C, RECIBO_X y/o FACTURA_X',
        "Generar asiento contable. Ver valores permiido en la solapa 'Tablas de ayuda'",
        'Contabilidad. ID del plan de cuenta de la cuenta debito (de la sección Contabilidad->Plan de Cuenta) sin puntos, solo números',
        'Contabilidad. ID del plan de cuenta de la cuenta crédito (de la sección Contabilidad->Plan de Cuenta) sin puntos, solo números',
        'REFERENCIA. En caso de ND o NC puede indicar el comprobante referenciado',
        'CHECK '
      ]

      // Convertir preview data a formato array para Excel
      const filasExport = siFacturaPreviewData.map(row => [
        row.numero,
        row.fechaEmision,
        row.fechaVencimiento,
        row.puntoVenta,
        row.tipoFactura,
        row.tipoDocumento,
        row.numeroCuil,
        row.numeroDni,
        row.total,
        row.cobrado,
        row.condicionIva,
        row.condicionVenta,
        row.razonSocial,
        row.domicilio,
        row.codigoProducto,
        row.descripcionAdicional,
        row.email,
        row.nota,
        row.moneda,
        row.tipoCambio,
        row.netoGravado,
        row.ivaAmount,
        row.exento,
        row.totalRepetido,
        row.ivaPorcentaje,
        row.generarAsiento,
        row.cuentaDebito,
        row.cuentaCredito,
        row.referencia,
        row.check
      ])

      const wsData = [headers, ...filasExport]
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Ajustar anchos de columna
      ws['!cols'] = [
        { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
        { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
        { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 8 },
        { wch: 40 }, { wch: 25 }, { wch: 15 }, { wch: 6 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Encabezado ')

      // Usar período si existe, sino semanaActual
      const semanaNum = periodo ? periodo.semana : getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anioNum = periodo ? periodo.anio : getYear(semanaActual.inicio)
      const nombreArchivo = `Facturacion_Semana${semanaNum}_${anioNum}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      showSuccess('Facturación Exportada', `Se descargó: ${nombreArchivo} (${filasExport.length} líneas)`)
    } catch {
      Swal.fire('Error', 'No se pudo exportar el reporte de facturación', 'error')
    } finally {
      setExportingSiFactura(false)
    }
  }

  // Preparar preview de Facturación desde Vista Previa (sin período generado)
  // Consulta las tablas reales para obtener datos detallados de cada concepto
  async function prepararFacturacionPreviewVistaPrevia() {
    if (vistaPreviaData.length === 0) return

    setLoadingSiFacturaPreview(true)
    try {
      const conductorIds = vistaPreviaData.map(f => f.conductor_id).filter(Boolean)
      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)

      // 1. Cargar emails de conductores
      const dnis = [...new Set(vistaPreviaData.map(f => f.conductor_dni).filter(Boolean))]
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('id, numero_dni, email')
        .in('numero_dni', dnis)
      
      const emailMap = new Map((conductoresData || []).map((c: any) => [c.numero_dni, c.email]))

      // 2. Cargar garantías activas
      const { data: garantiasData } = await supabase
        .from('garantias_conductores')
        .select('*')
        .in('conductor_id', conductorIds)
        .in('estado', ['pendiente', 'en_curso'])
      
      const garantiasMap = new Map((garantiasData || []).map((g: any) => [g.conductor_id, g]))

      // 3. Cargar tickets a favor pendientes de aplicar
      const { data: ticketsData } = await supabase
        .from('tickets_favor')
        .select('*')
        .in('conductor_id', conductorIds)
        .eq('estado', 'aprobado')
        .is('periodo_aplicado_id', null)
      
      // Agrupar tickets por conductor
      const ticketsMap = new Map<string, any[]>()
      ;(ticketsData || []).forEach((t: any) => {
        if (!ticketsMap.has(t.conductor_id)) ticketsMap.set(t.conductor_id, [])
        ticketsMap.get(t.conductor_id)!.push(t)
      })

      // 4. Cargar TODAS las penalidades pendientes (para detectar las no incluidas)
      // Penalidades se filtran por el campo 'semana' (número de semana del período)
      const { data: todasPenalidadesData } = await supabase
        .from('penalidades')
        .select('*, tipos_cobro_descuento(nombre), conductor:conductores(nombres, apellidos)')
        .eq('aplicado', false)
        .eq('rechazado', false)
        .eq('fraccionado', false) // Solo NO fraccionadas (las fraccionadas van por penalidades_cuotas)
        .eq('semana', semana)
      
      const todasPenalidadesFiltradas = todasPenalidadesData || []
      
      // Separar penalidades incluidas (conductores en Vista Previa) de las no incluidas
      const penalidadesFiltradas = todasPenalidadesFiltradas.filter((p: any) => conductorIds.includes(p.conductor_id))
      const penalidadesNoIncluidas = todasPenalidadesFiltradas.filter((p: any) => !conductorIds.includes(p.conductor_id))
      
      // Agrupar penalidades por conductor
      const penalidadesMap = new Map<string, any[]>()
      penalidadesFiltradas.forEach((p: any) => {
        if (!penalidadesMap.has(p.conductor_id)) penalidadesMap.set(p.conductor_id, [])
        penalidadesMap.get(p.conductor_id)!.push(p)
      })

      // 5. Cargar cobros fraccionados para esta semana
      const { data: cobrosData } = await supabase
        .from('cobros_fraccionados')
        .select('*')
        .in('conductor_id', conductorIds)
        .eq('semana', semana)
        .eq('anio', anio)
        .eq('aplicado', false)
      
      // Agrupar cobros por conductor
      const cobrosMap = new Map<string, any[]>()
      ;(cobrosData || []).forEach((c: any) => {
        if (!cobrosMap.has(c.conductor_id)) cobrosMap.set(c.conductor_id, [])
        cobrosMap.get(c.conductor_id)!.push(c)
      })

      // 6. Cargar saldos (para mora)
      const { data: saldosData } = await supabase
        .from('saldos_conductores')
        .select('*')
        .in('conductor_id', conductorIds)
      
      const saldosMap = new Map((saldosData || []).map((s: any) => [s.conductor_id, s]))

      // 7. Cargar penalidades_cuotas (cobros fraccionados de penalidades)
      const { data: penalidadesCuotasData } = await supabase
        .from('penalidades_cuotas')
        .select('*, penalidad:penalidades(conductor_id, conductor_nombre, conductor:conductores(nombres, apellidos))')
        .eq('semana', semana)
        .eq('anio', anio)
        .eq('aplicado', false)
      
      // Identificar penalidades_cuotas no incluidas (de conductores fuera de Vista Previa)
      const penalidadesCuotasNoIncluidas = (penalidadesCuotasData || []).filter(
        (pc: any) => pc.penalidad?.conductor_id && !conductorIds.includes(pc.penalidad.conductor_id)
      )

      // 8. Cargar tickets a favor de conductores NO en Vista Previa
      const { data: todosTicketsData } = await supabase
        .from('tickets_favor')
        .select('*, conductor:conductores(nombres, apellidos)')
        .eq('estado', 'aprobado')
        .is('periodo_aplicado_id', null)
      
      const ticketsNoIncluidos = (todosTicketsData || []).filter(
        (t: any) => !conductorIds.includes(t.conductor_id)
      )

      // 9. Cargar cobros fraccionados de conductores NO en Vista Previa
      const { data: todosCobrosData } = await supabase
        .from('cobros_fraccionados')
        .select('*, conductor:conductores(nombres, apellidos)')
        .eq('semana', semana)
        .eq('anio', anio)
        .eq('aplicado', false)
      
      const cobrosNoIncluidos = (todosCobrosData || []).filter(
        (c: any) => !conductorIds.includes(c.conductor_id)
      )

      // Crear lista de conceptos NO incluidos para mostrar en el panel
      const pendientes: ConceptoPendiente[] = []
      
      // Penalidades no incluidas
      for (const p of penalidadesNoIncluidas as any[]) {
        const conductorNombre = p.conductor?.nombres && p.conductor?.apellidos
          ? `${p.conductor.nombres} ${p.conductor.apellidos}`
          : p.conductor_nombre || 'Sin nombre'
        pendientes.push({
          id: p.id,
          tipo: 'penalidad',
          conductorId: p.conductor_id,
          conductorNombre,
          monto: p.monto || 0,
          descripcion: `[NO EN PREVIEW] ${p.detalle || p.tipos_cobro_descuento?.nombre || 'Penalidad'}`,
          tabla: 'penalidades'
        })
      }
      
      // Penalidades cuotas no incluidas
      for (const pc of penalidadesCuotasNoIncluidas as any[]) {
        const conductorNombre = pc.penalidad?.conductor?.nombres && pc.penalidad?.conductor?.apellidos
          ? `${pc.penalidad.conductor.nombres} ${pc.penalidad.conductor.apellidos}`
          : pc.penalidad?.conductor_nombre || 'Sin nombre'
        pendientes.push({
          id: pc.id,
          tipo: 'cobro_fraccionado',
          conductorId: pc.penalidad?.conductor_id || '',
          conductorNombre,
          monto: pc.monto_cuota,
          descripcion: `[NO EN PREVIEW] Cuota ${pc.numero_cuota} - Penalidad fraccionada`,
          tabla: 'penalidades_cuotas'
        })
      }
      
      // Tickets no incluidos
      for (const t of ticketsNoIncluidos as any[]) {
        const conductorNombre = t.conductor?.nombres && t.conductor?.apellidos
          ? `${t.conductor.nombres} ${t.conductor.apellidos}`
          : t.conductor_nombre || 'Sin nombre'
        pendientes.push({
          id: t.id,
          tipo: 'ticket',
          conductorId: t.conductor_id,
          conductorNombre,
          monto: t.monto,
          descripcion: `[NO EN PREVIEW] ${t.descripcion || t.tipo}`,
          tabla: 'tickets_favor'
        })
      }
      
      // Cobros fraccionados no incluidos
      for (const c of cobrosNoIncluidos as any[]) {
        const conductorNombre = c.conductor?.nombres && c.conductor?.apellidos
          ? `${c.conductor.nombres} ${c.conductor.apellidos}`
          : 'Sin nombre'
        pendientes.push({
          id: c.id,
          tipo: 'cobro_fraccionado',
          conductorId: c.conductor_id,
          conductorNombre,
          monto: c.monto_cuota,
          descripcion: `[NO EN PREVIEW] Cuota ${c.numero_cuota} de ${c.total_cuotas}`,
          tabla: 'cobros_fraccionados'
        })
      }
      
      // Guardar conceptos pendientes para mostrar en el panel
      setConceptosPendientes(pendientes)

      // Fechas del período
      const fechaEmision = semanaActual.fin
      const fechaVencimiento = addWeeks(semanaActual.fin, 1)
      const periodoDesc = `${format(semanaActual.inicio, 'dd/MM/yyyy')} al ${format(semanaActual.fin, 'dd/MM/yyyy')}`

      // Crear Set de conductores con saldos pendientes (penalidades, tickets, cobros fraccionados, penalidades_cuotas)
      const conductoresConSaldosPendientes = new Set<string>()
      penalidadesFiltradas.forEach((p: any) => conductoresConSaldosPendientes.add(p.conductor_id))
      ;(ticketsData || []).forEach((t: any) => conductoresConSaldosPendientes.add(t.conductor_id))
      ;(cobrosData || []).forEach((c: any) => conductoresConSaldosPendientes.add(c.conductor_id))
      ;(penalidadesCuotasData || []).forEach((pc: any) => {
        if (pc.penalidad?.conductor_id) conductoresConSaldosPendientes.add(pc.penalidad.conductor_id)
      })

      // Función para crear fila preview
      const crearFilaPreview = (
        numero: number,
        fact: FacturacionConductor,
        total: number,
        codigoProducto: string,
        descripcionAdicional: string
      ): FacturacionPreviewRow => {
        // Redondear total a 2 decimales para evitar errores de punto flotante
        total = Math.round(total * 100) / 100

        const tieneCuit = fact.conductor_cuit && fact.conductor_cuit.length >= 11
        const tipoFactura = tieneCuit ? 'FACTURA_A' : 'FACTURA_B'
        const condicionIva = tieneCuit ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL'
        const email = emailMap.get(fact.conductor_dni) || ''
        
        const numeroCuil = fact.conductor_dni || ''
        const numeroDni = fact.conductor_cuit || ''
        
        // IVA según producto
        const conceptosConIva = ['P001', 'P002', 'P009']
        const tieneIva = conceptosConIva.includes(codigoProducto)
        
        let netoGravado = 0
        let ivaAmount = 0
        let exento = 0
        let ivaPorcentaje = 'IVA_EXENTO'
        
        if (tieneIva) {
          netoGravado = Math.round((total / 1.21) * 100) / 100
          ivaAmount = Math.round((total - netoGravado) * 100) / 100
          ivaPorcentaje = 'IVA_21'
        } else {
          exento = total
        }

        let tieneError = false
        let errorMsg = ''
        if (!numeroCuil && !numeroDni) {
          tieneError = true
          errorMsg = 'Sin DNI ni CUIT'
        }

        return {
          numero,
          fechaEmision,
          fechaVencimiento,
          puntoVenta: 5,
          tipoFactura,
          tipoDocumento: 'CUIL',
          numeroCuil,
          numeroDni,
          total,
          cobrado: 0,
          condicionIva,
          condicionVenta: 'CTA_CTE',
          razonSocial: fact.conductor_nombre,
          domicilio: '',
          codigoProducto,
          descripcionAdicional,
          email,
          nota: '',
          moneda: 'PES',
          tipoCambio: 1,
          netoGravado,
          ivaAmount,
          exento,
          totalRepetido: total,
          ivaPorcentaje,
          generarAsiento: 'SI',
          cuentaDebito: 4500007,
          cuentaCredito: 0,
          referencia: 'ND',
          check: '',
          conductorId: fact.conductor_id,
          tieneError,
          errorMsg,
          tieneSaldosPendientes: conductoresConSaldosPendientes.has(fact.conductor_id)
        }
      }

      // Generar filas para preview
      const filasPreview: FacturacionPreviewRow[] = []
      let numeroFactura = 1

      for (const fact of vistaPreviaData) {
        // P001/P002 - Alquiler (TURNO/CARGO)
        if (fact.subtotal_alquiler > 0) {
          const codigoAlquiler = fact.tipo_alquiler === 'CARGO' ? 'P002' : 'P001'
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            fact.subtotal_alquiler,
            codigoAlquiler,
            String(fact.turnos_cobrados || 7)
          ))
        }

        // P003 - Garantía (desde garantias_conductores)
        const garantia = garantiasMap.get(fact.conductor_id)
        if (garantia && garantia.cuotas_pagadas < garantia.cuotas_totales) {
          const cuotaActual = garantia.cuotas_pagadas + 1
          const descripcionGarantia = `${cuotaActual} de ${garantia.cuotas_totales}`
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            garantia.monto_cuota_semanal || 50000,
            'P003',
            descripcionGarantia
          ))
        }

        // P004 - Tickets a favor (desde tickets_favor)
        const tickets = ticketsMap.get(fact.conductor_id) || []
        for (const ticket of tickets) {
          let descripcionTicket = 'Telepases'
          if (ticket.tipo === 'COMISION_REFERIDO') descripcionTicket = 'Comisión Referido'
          else if (ticket.tipo === 'BONO_5_VENTAS') descripcionTicket = 'Bono 5 Ventas'
          else if (ticket.tipo === 'BONO_EVENTO') descripcionTicket = 'Bono Evento'
          else if (ticket.descripcion) descripcionTicket = ticket.descripcion
          
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            ticket.monto,
            'P004',
            descripcionTicket
          ))
        }

        // P005 - Peajes (desde cabify - ya calculado en vistaPreviaData)
        if (fact.monto_peajes && fact.monto_peajes > 0) {
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            fact.monto_peajes,
            'P005',
            periodoDesc
          ))
        }

        // P007 - Penalidades (desde penalidades)
        const penalidades = penalidadesMap.get(fact.conductor_id) || []
        for (const penalidad of penalidades) {
          const descripcionPenalidad = penalidad.detalle || 
            penalidad.tipos_cobro_descuento?.nombre || 
            'Penalidad'
          
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            penalidad.monto,
            'P007',
            descripcionPenalidad
          ))
        }

        // P009 - Mora (desde saldos_conductores)
        const saldo = saldosMap.get(fact.conductor_id)
        if (saldo && saldo.saldo_actual < 0) {
          const deuda = Math.abs(saldo.saldo_actual)
          const mora = Math.round(deuda * 0.05 * 100) / 100 // 5% semanal
          if (mora > 0) {
            filasPreview.push(crearFilaPreview(
              numeroFactura++,
              fact,
              mora,
              'P009',
              `Mora 5% s/deuda $${deuda.toLocaleString()}`
            ))
          }
        }

        // P010 - Cobros fraccionados (desde cobros_fraccionados)
        const cobros = cobrosMap.get(fact.conductor_id) || []
        for (const cobro of cobros) {
          const descripcionCobro = cobro.descripcion || 
            `Cuota ${cobro.numero_cuota} de ${cobro.total_cuotas}`
          
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            cobro.monto_cuota,
            'P010',
            descripcionCobro
          ))
        }
      }

      if (filasPreview.length === 0) {
        Swal.fire('Sin datos', 'No hay conceptos para el preview', 'warning')
        return
      }

      setSiFacturaPreviewData(filasPreview)
      setShowSiFacturaPreview(true)

    } catch {
      Swal.fire('Error', 'No se pudo cargar el preview de Facturación', 'error')
    } finally {
      setLoadingSiFacturaPreview(false)
    }
  }

  // Preparar datos para RIT Preview (formato Bruno Timoteo)
  async function prepareRITPreview() {
    if (!periodo) return

    setLoadingRITPreview(true)
    try {
      // Cargar detalles de facturación con información del conductor
      const { data: detalles, error } = await supabase
        .from('facturacion_detalle')
        .select(`
          *,
          facturacion_conductores!inner(
            id,
            conductor_id,
            conductor_nombre,
            conductor_dni,
            conductor_cuit,
            vehiculo_patente,
            tipo_alquiler,
            turnos_cobrados,
            periodo_id,
            subtotal_alquiler,
            subtotal_garantia,
            subtotal_cargos,
            subtotal_descuentos,
            saldo_anterior,
            monto_mora,
            total_a_pagar
          )
        `)

      if (error) throw error

      // Filtrar por período actual
      const detallesFiltrados = (detalles || []).filter(
        (d: any) => d.facturacion_conductores?.periodo_id === periodo.id
      )

      // Agrupar por conductor
      const conductoresMap = new Map<string, any>()
      detallesFiltrados.forEach((det: any) => {
        const fc = det.facturacion_conductores
        if (!fc) return

        if (!conductoresMap.has(fc.id)) {
          conductoresMap.set(fc.id, {
            facturacion: fc,
            detalles: []
          })
        }
        conductoresMap.get(fc.id).detalles.push(det)
      })

      // Cargar información de garantías para número de cuota
      // Nota: conductor_id puede ser NULL (importado desde histórico), usamos conductor_nombre como clave
      const { data: garantias } = await supabase
        .from('garantias_conductores')
        .select('conductor_id, conductor_nombre, cuotas_pagadas, cuotas_totales, estado')

      const garantiasMap = new Map<string, { cuotas_pagadas: number; cuotas_totales: number; estado: string }>(
        (garantias || []).map((g: any) => [g.conductor_nombre?.toLowerCase().trim() || '', g])
      )

      // Convertir a formato RITPreviewRow
      const previewData: RITPreviewRow[] = []

      conductoresMap.forEach((data, facturacionId) => {
        const fc = data.facturacion
        const detallesArr = data.detalles

        // Buscar valores específicos en detalles
        let valorPeaje = 0
        let excesoKm = 0
        let valorMultas = 0
        let descuentoRepuestos = 0
        let ticketsFavor = 0
        let comisionReferido = 0

        detallesArr.forEach((det: any) => {
          const codigo = det.concepto_codigo
          const total = det.total || 0

          if (codigo === 'P005') valorPeaje += total
          else if (codigo === 'P006') excesoKm += total
          else if (codigo === 'P007') valorMultas += total
          else if (codigo === 'P008') descuentoRepuestos += total
          else if (codigo === 'P004') {
            // P004 puede ser tickets o comisión por referido
            if (det.concepto_descripcion?.toLowerCase().includes('referido')) {
              comisionReferido += total
            } else {
              ticketsFavor += total
            }
          }
        })

        // Obtener número de cuota de garantía (formato: "X de Y")
        // X = cuota actual a pagar (cuotas_pagadas + 1)
        // Buscar por nombre (conductor_id puede ser NULL en garantías importadas)
        const conductorNombreKey = (fc.conductor_nombre || '').toLowerCase().trim()
        const garantia = garantiasMap.get(conductorNombreKey)
        let numeroCuota = 'NA'
        if (fc.subtotal_garantia > 0) {
          if (garantia) {
            // Si garantía completada, mostrar NA
            if (garantia.estado === 'completada' || garantia.cuotas_pagadas >= garantia.cuotas_totales) {
              numeroCuota = 'NA'
            } else {
              // Conductor con registro de garantía: mostrar siguiente cuota a pagar
              const cuotaActual = garantia.cuotas_pagadas + 1
              numeroCuota = `${cuotaActual} de ${garantia.cuotas_totales}`
            }
          } else {
            // Conductor nuevo sin registro: primera cuota
            const cuotasTotales = fc.tipo_alquiler === 'CARGO' ? 20 : 16
            numeroCuota = `1 de ${cuotasTotales}`
          }
        }

        const row: RITPreviewRow = {
          id: facturacionId,
          semana: `S${periodo.semana}`,
          corte: `${format(parseISO(periodo.fecha_inicio), 'dd/MM')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`,
          conductor: fc.conductor_nombre,
          dni: fc.conductor_dni || '',
          cuit: fc.conductor_cuit || '',
          patente: fc.vehiculo_patente || '',
          tipo: fc.tipo_alquiler,
          valorAlquiler: fc.subtotal_alquiler || 0,
          detalleTurno: fc.turnos_cobrados || 0,
          cuotaGarantia: fc.subtotal_garantia || 0,
          numeroCuota,
          valorPeaje,
          excesoKm,
          valorMultas,
          descuentoRepuestos,
          interes5: fc.monto_mora || 0,
          ticketsFavor,
          comisionReferido,
          totalPagar: fc.total_a_pagar || 0,
          conductorId: fc.conductor_id,
          tipoAlquiler: fc.tipo_alquiler,
          saldoAnterior: fc.saldo_anterior || 0
        }

        previewData.push(row)
      })

      // Ordenar por conductor
      previewData.sort((a, b) => a.conductor.localeCompare(b.conductor))

      setRitPreviewData(previewData)
      setShowRITPreview(true)

    } catch (error) {
      console.error('Error preparando preview RIT:', error)
      Swal.fire('Error', 'No se pudo cargar los datos del preview', 'error')
    } finally {
      setLoadingRITPreview(false)
    }
  }

  // Sincronizar cambios del preview RIT con la BD
  async function syncRITChanges(updatedData: RITPreviewRow[]): Promise<boolean> {
    if (!periodo) return false

    try {
      // Actualizar cada facturacion_conductores con los nuevos valores
      for (const row of updatedData) {
        // 1. Actualizar facturacion_conductores principal
        const { error } = await (supabase
          .from('facturacion_conductores') as any)
          .update({
            subtotal_alquiler: row.valorAlquiler,
            turnos_cobrados: row.detalleTurno,
            subtotal_garantia: row.cuotaGarantia,
            monto_mora: row.interes5,
            subtotal_descuentos: row.ticketsFavor + row.comisionReferido + row.descuentoRepuestos,
            total_a_pagar: row.totalPagar
          })
          .eq('id', row.id)

        if (error) {
          console.error('Error actualizando facturación:', error)
          throw error
        }

        // 2. Upsert detalles - P005 Peajes
        if (row.valorPeaje > 0) {
          const { data: existeP005 } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P005')
            .single()

          if (existeP005) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.valorPeaje, subtotal: row.valorPeaje })
              .eq('id', existeP005.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P005',
                concepto_descripcion: 'Telepeajes (Cabify)',
                cantidad: 1,
                precio_unitario: row.valorPeaje,
                subtotal: row.valorPeaje,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: row.valorPeaje,
                es_credito: false
              })
          }
        }

        // 3. Upsert detalles - P006 Exceso KM
        if (row.excesoKm > 0) {
          const netoExceso = Math.round(row.excesoKm / 1.21)
          const ivaExceso = row.excesoKm - netoExceso

          const { data: existeP006 } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P006')
            .single()

          if (existeP006) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.excesoKm, subtotal: netoExceso, iva_monto: ivaExceso })
              .eq('id', existeP006.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P006',
                concepto_descripcion: 'Exceso de Kilometraje',
                cantidad: 1,
                precio_unitario: row.excesoKm,
                subtotal: netoExceso,
                iva_porcentaje: 21,
                iva_monto: ivaExceso,
                total: row.excesoKm,
                es_credito: false
              })
          }
        }

        // 4. Upsert detalles - P007 Multas/Penalidades
        if (row.valorMultas > 0) {
          const { data: existeP007 } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P007')
            .single()

          if (existeP007) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.valorMultas, subtotal: row.valorMultas })
              .eq('id', existeP007.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P007',
                concepto_descripcion: 'Multas y Penalidades',
                cantidad: 1,
                precio_unitario: row.valorMultas,
                subtotal: row.valorMultas,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: row.valorMultas,
                es_credito: false
              })
          }
        }

        // 5. Upsert detalles - P008 Descuento Repuestos
        if (row.descuentoRepuestos > 0) {
          const { data: existeP008 } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P008')
            .single()

          if (existeP008) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.descuentoRepuestos, subtotal: row.descuentoRepuestos })
              .eq('id', existeP008.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P008',
                concepto_descripcion: 'Descuento Repuestos',
                cantidad: 1,
                precio_unitario: row.descuentoRepuestos,
                subtotal: row.descuentoRepuestos,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: row.descuentoRepuestos,
                es_credito: true
              })
          }
        }

        // 6. Upsert detalles - P004 Tickets a Favor
        if (row.ticketsFavor > 0) {
          const { data: existeP004 } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P004')
            .ilike('concepto_descripcion', '%ticket%')
            .single()

          if (existeP004) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.ticketsFavor, subtotal: row.ticketsFavor })
              .eq('id', existeP004.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P004',
                concepto_descripcion: 'Tickets a Favor',
                cantidad: 1,
                precio_unitario: row.ticketsFavor,
                subtotal: row.ticketsFavor,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: row.ticketsFavor,
                es_credito: true
              })
          }
        }

        // 7. Upsert detalles - P004 Comisión Referido
        if (row.comisionReferido > 0) {
          const { data: existeRef } = await (supabase
            .from('facturacion_detalle') as any)
            .select('id')
            .eq('facturacion_id', row.id)
            .eq('concepto_codigo', 'P004')
            .ilike('concepto_descripcion', '%referido%')
            .single()

          if (existeRef) {
            await (supabase.from('facturacion_detalle') as any)
              .update({ total: row.comisionReferido, subtotal: row.comisionReferido })
              .eq('id', existeRef.id)
          } else {
            await (supabase.from('facturacion_detalle') as any)
              .insert({
                facturacion_id: row.id,
                concepto_codigo: 'P004',
                concepto_descripcion: 'Comisión por Referido',
                cantidad: 1,
                precio_unitario: row.comisionReferido,
                subtotal: row.comisionReferido,
                iva_porcentaje: 0,
                iva_monto: 0,
                total: row.comisionReferido,
                es_credito: true
              })
          }
        }

        // 8. Actualizar garantía del conductor si cambió la cuota
        if (row.cuotaGarantia > 0 && row.numeroCuota && row.numeroCuota !== 'NA') {
          const matchCuota = row.numeroCuota.match(/(\d+)\s*de\s*(\d+)/)
          if (matchCuota) {
            const cuotaActual = parseInt(matchCuota[1])
            const cuotasTotales = parseInt(matchCuota[2])
            const cuotasPagadas = cuotaActual - 1

            const conductorNombreKey = row.conductor.toLowerCase().trim()
            const { data: garantiaExistente } = await (supabase
              .from('garantias_conductores') as any)
              .select('id, cuotas_pagadas')
              .ilike('conductor_nombre', `%${conductorNombreKey.split(' ')[0]}%`)
              .single()

            if (garantiaExistente) {
              await (supabase.from('garantias_conductores') as any)
                .update({
                  cuotas_pagadas: cuotasPagadas,
                  monto_pagado: cuotasPagadas * row.cuotaGarantia,
                  estado: cuotasPagadas >= cuotasTotales ? 'completada' : 'en_curso'
                })
                .eq('id', garantiaExistente.id)
            }
          }
        }
      }

      // Actualizar totales del período
      const totalNeto = updatedData.reduce((sum, r) => sum + r.totalPagar, 0)
      const totalCargos = updatedData.reduce((sum, r) =>
        sum + r.valorAlquiler + r.cuotaGarantia + r.valorPeaje + r.excesoKm + r.valorMultas + r.interes5, 0)
      const totalDescuentos = updatedData.reduce((sum, r) =>
        sum + r.ticketsFavor + r.comisionReferido + r.descuentoRepuestos, 0)

      await (supabase
        .from('periodos_facturacion') as any)
        .update({
          total_cargos: totalCargos,
          total_descuentos: totalDescuentos,
          total_neto: totalNeto
        })
        .eq('id', periodo.id)

      // Recargar datos
      await cargarFacturacion()

      return true
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
      return false
    }
  }

  // Sincronizar cambios de FacturacionPreviewTable a la BD
  async function syncFacturacionChanges(updatedData: FacturacionPreviewRow[]): Promise<boolean> {
    if (!periodo) return false

    try {
      // 1. Procesar filas eliminadas
      const deletedRows = updatedData.filter(row => row.isDeleted && row.detalleId)
      for (const row of deletedRows) {
        const { error } = await (supabase
          .from('facturacion_detalle') as any)
          .delete()
          .eq('id', row.detalleId)
        
        if (error) throw error
      }

      // 2. Procesar filas nuevas (ajustes manuales)
      const newRows = updatedData.filter(row => row.isNew && !row.isDeleted)
      for (const row of newRows) {
        if (!row.facturacionId) {
          // Si no tiene facturacionId, buscar por conductorId
          const facturacion = facturacionesFiltradas.find(f => f.conductor_id === row.conductorId)
          if (!facturacion) continue
          row.facturacionId = facturacion.id
        }

        // Determinar si es descuento basado en el total negativo
        const esDescuento = row.total < 0
        const montoAbsoluto = Math.abs(row.total)
        const netoAbsoluto = Math.abs(row.netoGravado)
        const ivaAbsoluto = Math.abs(row.ivaAmount)

        const { error } = await (supabase
          .from('facturacion_detalle') as any)
          .insert({
            facturacion_id: row.facturacionId,
            concepto_codigo: row.codigoProducto,
            concepto_descripcion: row.descripcionAdicional || `Ajuste Manual - ${row.codigoProducto}`,
            cantidad: 1,
            precio_unitario: montoAbsoluto,
            subtotal: netoAbsoluto > 0 ? netoAbsoluto : montoAbsoluto,
            iva_porcentaje: row.ivaPorcentaje === 'IVA_21' ? 21 : 0,
            iva_monto: ivaAbsoluto,
            total: montoAbsoluto,
            es_descuento: esDescuento,
            referencia_id: null,
            referencia_tipo: 'ajuste_manual'
          })

        if (error) throw error
      }

      // 3. Actualizar filas existentes modificadas
      const existingRows = updatedData.filter(row => !row.isNew && !row.isDeleted && row.detalleId)
      for (const row of existingRows) {
        const { error } = await (supabase
          .from('facturacion_detalle') as any)
          .update({
            total: Math.abs(row.total),
            subtotal: row.netoGravado > 0 ? Math.abs(row.netoGravado) : Math.abs(row.exento),
            iva_monto: Math.abs(row.ivaAmount),
            concepto_descripcion: row.descripcionAdicional
          })
          .eq('id', row.detalleId)

        if (error) throw error
      }

      // Recargar datos para reflejar los cambios
      await cargarFacturacion()
      
      // Recargar el preview con los datos actualizados
      await prepararSiFacturaPreview()

      return true
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
      return false
    }
  }

  // Enlazar concepto pendiente a facturacion_detalle
  async function enlazarConceptoPendiente(pendiente: ConceptoPendiente, codigoProducto: string): Promise<boolean> {
    if (!periodo) return false

    try {
      // Buscar facturacion_conductores para este conductor
      const facturacion = facturacionesFiltradas.find(f => f.conductor_id === pendiente.conductorId)
      if (!facturacion) {
        Swal.fire('Error', 'No se encontró la facturación del conductor', 'error')
        return false
      }

      // Determinar si tiene IVA
      const conceptosConIva = ['P001', 'P002', 'P009']
      const tieneIva = conceptosConIva.includes(codigoProducto)
      const subtotal = tieneIva ? Math.round((pendiente.monto / 1.21) * 100) / 100 : pendiente.monto
      const ivaMonto = tieneIva ? pendiente.monto - subtotal : 0

      // Insertar en facturacion_detalle
      const { error: insertError } = await (supabase
        .from('facturacion_detalle') as any)
        .insert({
          facturacion_id: facturacion.id,
          concepto_codigo: codigoProducto,
          concepto_descripcion: pendiente.descripcion,
          cantidad: 1,
          precio_unitario: pendiente.monto,
          subtotal: subtotal,
          iva_porcentaje: tieneIva ? 21 : 0,
          iva_monto: ivaMonto,
          total: pendiente.monto,
          es_descuento: pendiente.tipo === 'ticket',
          referencia_id: pendiente.id,
          referencia_tipo: pendiente.tipo
        })

      if (insertError) throw insertError

      // Marcar como aplicado en la tabla origen
      if (pendiente.tabla === 'tickets_favor') {
        await (supabase.from('tickets_favor') as any)
          .update({ 
            estado: 'aplicado', 
            periodo_aplicado_id: periodo.id, 
            fecha_aplicacion: new Date().toISOString() 
          })
          .eq('id', pendiente.id)
      } else if (pendiente.tabla === 'penalidades') {
        await (supabase.from('penalidades') as any)
          .update({ aplicado: true, fecha_aplicacion: new Date().toISOString() })
          .eq('id', pendiente.id)
      } else if (pendiente.tabla === 'cobros_fraccionados') {
        await (supabase.from('cobros_fraccionados') as any)
          .update({ aplicado: true, fecha_aplicacion: new Date().toISOString() })
          .eq('id', pendiente.id)
      }

      // Recargar datos
      await prepararSiFacturaPreview()

      return true
    } catch {
      Swal.fire('Error', 'No se pudo enlazar el concepto', 'error')
      return false
    }
  }

  // Exportar Vista Previa a Excel - Formato RIT (cada fila es un producto/concepto)
  async function exportarVistaPreviaExcel() {
    if (vistaPreviaData.length === 0) {
      Swal.fire('Sin datos', 'No hay datos para exportar', 'warning')
      return
    }

    setExportingExcel(true)
    try {
      // Filtrar datos según filtros actuales
      const dataToExport = vistaPreviaData.filter(f => {
        if (buscarConductor) {
          const search = buscarConductor.toLowerCase()
          if (!f.conductor_nombre.toLowerCase().includes(search) &&
              !f.conductor_dni?.toLowerCase().includes(search) &&
              !f.vehiculo_patente?.toLowerCase().includes(search)) {
            return false
          }
        }
        if (filtroTipo !== 'todos' && f.tipo_alquiler !== filtroTipo) return false
        if (filtroEstado === 'deuda' && f.total_a_pagar <= 0) return false
        if (filtroEstado === 'favor' && f.total_a_pagar > 0) return false
        return true
      })

      const fechaInicio = format(semanaActual.inicio, 'dd/MM/yyyy')
      const fechaFin = format(semanaActual.fin, 'dd/MM/yyyy')

      const wb = XLSX.utils.book_new()

      // HOJA RIT: Formato para contabilidad - cada fila es un concepto por conductor
      const ritData: (string | number)[][] = [
        [
          'Fecha Emisión', 'Fecha Vto', 'Pto Venta', 'Tipo Factura',
          'CUIT', 'DNI', 'Condición IVA', 'Condición Venta', 'Razón Social',
          'Código Prod', 'Descripción', 'Cantidad', 'Neto Gravado', 'IVA 21%', 'Total Importe',
          'Cobrado', 'Tipo Nota', 'Moneda', 'Tipo Cambio'
        ]
      ]

      // Productos sin IVA (exentos): P003, P004, P005, P007, P010
      // Productos con IVA 21%: P001, P002, P006

      dataToExport.forEach(f => {
        const tieneCuit = !!f.conductor_cuit
        const tipoFactura = tieneCuit ? 'A' : 'B'
        const condicionIva = tieneCuit ? 'Responsable Inscripto' : 'Consumidor Final'
        const diasDesc = f.turnos_cobrados < 7 ? ` (${f.turnos_cobrados}/7 días)` : ''

        // P001/P002 - Alquiler (con IVA 21%)
        if (f.subtotal_alquiler > 0) {
          const codigoAlquiler = f.tipo_alquiler === 'CARGO' ? 'P001' : 'P002'
          const descAlquiler = f.tipo_alquiler === 'CARGO' ? 'Alquiler a Cargo' : 'Alquiler a Turno'
          const netoAlquiler = Math.round(f.subtotal_alquiler / 1.21)
          const ivaAlquiler = f.subtotal_alquiler - netoAlquiler

          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            codigoAlquiler, descAlquiler + diasDesc, f.turnos_cobrados, netoAlquiler, ivaAlquiler, f.subtotal_alquiler,
            0, 'ND', 'Peso', 1
          ])
        }

        // P003 - Garantía (exento IVA)
        if (f.subtotal_garantia > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P003', 'Cuota de Garantía' + diasDesc, f.turnos_cobrados, f.subtotal_garantia, 0, f.subtotal_garantia,
            0, 'ND', 'Peso', 1
          ])
        }

        // P004 - Tickets a Favor (exento IVA, NOTA CRÉDITO)
        if (f.subtotal_descuentos > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P004', 'Tickets a Favor', 1, f.subtotal_descuentos, 0, f.subtotal_descuentos,
            0, 'NC', 'Peso', 1
          ])
        }

        // P005 - Telepeajes (exento IVA)
        if ((f.monto_peajes || 0) > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P005', 'Telepeajes (Cabify)', 1, f.monto_peajes || 0, 0, f.monto_peajes || 0,
            0, 'ND', 'Peso', 1
          ])
        }

        // P006 - Exceso de Kilometraje (con IVA 21%)
        if ((f.monto_excesos || 0) > 0) {
          const netoExceso = Math.round((f.monto_excesos || 0) / 1.21)
          const ivaExceso = (f.monto_excesos || 0) - netoExceso
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P006', `Exceso KM (${f.km_exceso || 0} km)`, 1, netoExceso, ivaExceso, f.monto_excesos || 0,
            0, 'ND', 'Peso', 1
          ])
        }

        // P007 - Penalidades (exento IVA)
        if ((f.monto_penalidades || 0) > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P007', 'Penalidades', 1, f.monto_penalidades || 0, 0, f.monto_penalidades || 0,
            0, 'ND', 'Peso', 1
          ])
        }

        // P009 - Saldo Anterior (exento IVA) - si hay saldo adeudado
        if (f.saldo_anterior > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P009', 'Saldo Adeudado Semana Anterior', 1, f.saldo_anterior, 0, f.saldo_anterior,
            0, 'ND', 'Peso', 1
          ])
        }

        // P010 - Mora (exento IVA)
        if (f.monto_mora > 0) {
          ritData.push([
            fechaInicio, fechaFin, 5, tipoFactura,
            f.conductor_cuit || '', f.conductor_dni || '', condicionIva, 'Cuenta Corriente', f.conductor_nombre,
            'P010', `Mora (${f.dias_mora} días)`, f.dias_mora, f.monto_mora, 0, f.monto_mora,
            0, 'ND', 'Peso', 1
          ])
        }
      })

      const wsRIT = XLSX.utils.aoa_to_sheet(ritData)
      wsRIT['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
        { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 30 },
        { wch: 10 }, { wch: 35 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 10 }
      ]
      XLSX.utils.book_append_sheet(wb, wsRIT, 'Facturación RIT')

      // HOJA 2: Resumen por conductor
      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)

      const resumenData: (string | number)[][] = [
        ['TOSHIFY - RESUMEN LIQUIDACIÓN PROYECTADA'],
        [`Semana ${semana} del ${anio}`],
        [`Período: ${fechaInicio} al ${fechaFin}`],
        [''],
        ['Conductor', 'DNI', 'CUIT', 'Patente', 'Tipo', 'Días', 'Alquiler', 'Garantía', 'Descuentos', 'Peajes', 'Excesos KM', 'Penalidades', 'Saldo Ant.', 'Mora', 'TOTAL']
      ]

      dataToExport.forEach(f => {
        resumenData.push([
          f.conductor_nombre,
          f.conductor_dni || '-',
          f.conductor_cuit || '-',
          f.vehiculo_patente || '-',
          f.tipo_alquiler,
          f.turnos_cobrados,
          f.subtotal_alquiler,
          f.subtotal_garantia,
          f.subtotal_descuentos,
          f.monto_peajes || 0,
          f.monto_excesos || 0,
          f.monto_penalidades || 0,
          f.saldo_anterior,
          f.monto_mora,
          f.total_a_pagar
        ])
      })

      // Totales
      resumenData.push([''])
      resumenData.push([
        'TOTALES', '', '', '', '',
        dataToExport.reduce((sum, f) => sum + f.turnos_cobrados, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_alquiler, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_garantia, 0),
        dataToExport.reduce((sum, f) => sum + f.subtotal_descuentos, 0),
        dataToExport.reduce((sum, f) => sum + (f.monto_peajes || 0), 0),
        dataToExport.reduce((sum, f) => sum + (f.monto_excesos || 0), 0),
        dataToExport.reduce((sum, f) => sum + (f.monto_penalidades || 0), 0),
        dataToExport.reduce((sum, f) => sum + f.saldo_anterior, 0),
        dataToExport.reduce((sum, f) => sum + f.monto_mora, 0),
        dataToExport.reduce((sum, f) => sum + f.total_a_pagar, 0)
      ])

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
      wsResumen['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 },
        { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 14 }
      ]
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      const nombreArchivo = `Facturacion_Semana${semana}_${anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      showSuccess('Reporte Exportado', `Se descargó: ${nombreArchivo}`)
    } catch (error) {
      console.error('Error exportando Excel:', error)
      Swal.fire('Error', 'No se pudo exportar el reporte', 'error')
    } finally {
      setExportingExcel(false)
    }
  }

  // Preparar Preview Facturación Cabify
  async function prepararCabifyPreview() {
    if (vistaPreviaData.length === 0) {
      Swal.fire('Sin datos', 'No hay datos para generar preview', 'warning')
      return
    }

    setLoadingCabifyPreview(true)
    try {
      // Filtrar datos según filtros actuales
      const dataToExport = vistaPreviaData.filter(f => {
        if (buscarConductor) {
          const search = buscarConductor.toLowerCase()
          if (!f.conductor_nombre.toLowerCase().includes(search) &&
              !f.conductor_dni?.toLowerCase().includes(search) &&
              !f.vehiculo_patente?.toLowerCase().includes(search)) {
            return false
          }
        }
        if (filtroTipo !== 'todos' && f.tipo_alquiler !== filtroTipo) return false
        if (filtroEstado === 'deuda' && f.total_a_pagar <= 0) return false
        if (filtroEstado === 'favor' && f.total_a_pagar > 0) return false
        return true
      })

      // Obtener emails de conductores
      const dnis = [...new Set(dataToExport.map(f => f.conductor_dni).filter(Boolean))]
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('numero_dni, email')
        .in('numero_dni', dnis)
      
      const emailMap = new Map((conductoresData || []).map((c: { numero_dni: string; email: string | null }) => [c.numero_dni, c.email]))

      // Cargar datos de Cabify desde cabify_historico
      const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
      const fechaFin = format(semanaActual.fin, 'yyyy-MM-dd')
      
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, horas_conectadas, ganancia_total, cobro_app, cobro_efectivo')
        .gte('fecha_inicio', fechaInicio + 'T00:00:00')
        .lte('fecha_inicio', fechaFin + 'T23:59:59')

      // Agrupar datos de Cabify por DNI (sumar si hay múltiples registros)
      const cabifyMap = new Map<string, { horas: number; ganancia: number; cobroApp: number; efectivo: number }>()
      ;(cabifyData || []).forEach((record: { dni: string; horas_conectadas: number; ganancia_total: number; cobro_app: number; cobro_efectivo: number }) => {
        if (record.dni) {
          const existing = cabifyMap.get(record.dni) || { horas: 0, ganancia: 0, cobroApp: 0, efectivo: 0 }
          cabifyMap.set(record.dni, {
            horas: existing.horas + (Number(record.horas_conectadas) || 0),
            ganancia: existing.ganancia + (Number(record.ganancia_total) || 0),
            cobroApp: existing.cobroApp + (Number(record.cobro_app) || 0),
            efectivo: existing.efectivo + (Number(record.cobro_efectivo) || 0)
          })
        }
      })

      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)

      // Generar filas para el preview
      const previewRows: CabifyPreviewRow[] = dataToExport.map(f => {
        const email = emailMap.get(f.conductor_dni || '') || ''
        const cabifyInfo = cabifyMap.get(f.conductor_dni || '') || { horas: 0, ganancia: 0, cobroApp: 0, efectivo: 0 }
        
        // Importe Contrato = Monto del alquiler (P001/P002)
        const importeContrato = f.subtotal_alquiler || 0
        
        // EXCEDENTES = Todo lo demás: garantía, penalidades, peajes, excesos km, etc.
        // EXCLUYENDO: descuentos (tickets a favor), saldo anterior y mora
        const excedentes = (f.subtotal_garantia || 0) + 
                          (f.monto_penalidades || 0) + 
                          (f.monto_peajes || 0) + 
                          (f.monto_excesos || 0)

        return {
          anio,
          semana,
          fechaInicial: semanaActual.inicio,
          fechaFinal: semanaActual.fin,
          conductor: f.conductor_nombre,
          email,
          patente: f.vehiculo_patente || '',
          dni: f.conductor_dni || '',
          importeContrato,
          excedentes,
          conductorId: f.conductor_id,
          horasConexion: cabifyInfo.horas,
          importeGenerado: cabifyInfo.ganancia,
          importeGeneradoConBonos: cabifyInfo.cobroApp,
          generadoEfectivo: cabifyInfo.efectivo
        }
      })

      setCabifyPreviewData(previewRows)
      setShowCabifyPreview(true)
    } catch {
      Swal.fire('Error', 'No se pudo generar el preview de Cabify', 'error')
    } finally {
      setLoadingCabifyPreview(false)
    }
  }

  // Preparar Preview Cabify desde Facturación Generada (con período)
  async function prepararCabifyPreviewDesdeFacturacion() {
    if (facturaciones.length === 0 || !periodo) {
      Swal.fire('Sin datos', 'No hay datos para generar preview', 'warning')
      return
    }

    setLoadingCabifyPreview(true)
    try {
      // Obtener emails de conductores
      const dnis = [...new Set(facturaciones.map(f => f.conductor_dni).filter(Boolean))]
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('numero_dni, email')
        .in('numero_dni', dnis)
      
      const emailMap = new Map((conductoresData || []).map((c: { numero_dni: string; email: string | null }) => [c.numero_dni, c.email]))

      // Cargar datos guardados de facturacion_cabify (si existen)
      const { data: savedCabifyData } = await (supabase
        .from('facturacion_cabify') as any)
        .select('*')
        .eq('periodo_id', periodo.id)
      
      // Crear mapa de datos guardados por conductor_id
      const savedDataMap = new Map<string, any>()
      ;(savedCabifyData || []).forEach((record: any) => {
        if (record.conductor_id) {
          savedDataMap.set(record.conductor_id, record)
        }
      })

      // Cargar datos de Cabify desde cabify_historico (para valores por defecto)
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, horas_conectadas, ganancia_total, cobro_app, cobro_efectivo')
        .gte('fecha_inicio', periodo.fecha_inicio + 'T00:00:00')
        .lte('fecha_inicio', periodo.fecha_fin + 'T23:59:59')

      // Agrupar datos de Cabify por DNI (sumar si hay múltiples registros)
      const cabifyMap = new Map<string, { horas: number; ganancia: number; cobroApp: number; efectivo: number }>()
      ;(cabifyData || []).forEach((record: { dni: string; horas_conectadas: number; ganancia_total: number; cobro_app: number; cobro_efectivo: number }) => {
        if (record.dni) {
          const existing = cabifyMap.get(record.dni) || { horas: 0, ganancia: 0, cobroApp: 0, efectivo: 0 }
          cabifyMap.set(record.dni, {
            horas: existing.horas + (Number(record.horas_conectadas) || 0),
            ganancia: existing.ganancia + (Number(record.ganancia_total) || 0),
            cobroApp: existing.cobroApp + (Number(record.cobro_app) || 0),
            efectivo: existing.efectivo + (Number(record.cobro_efectivo) || 0)
          })
        }
      })

      const fechaInicio = parseISO(periodo.fecha_inicio)
      const fechaFin = parseISO(periodo.fecha_fin)

      // Generar filas para el preview
      const previewRows: CabifyPreviewRow[] = facturaciones.map(f => {
        const email = emailMap.get(f.conductor_dni || '') || ''
        const cabifyInfo = cabifyMap.get(f.conductor_dni || '') || { horas: 0, ganancia: 0, cobroApp: 0, efectivo: 0 }
        const savedData = savedDataMap.get(f.conductor_id)
        
        // Si hay datos guardados, usarlos; sino usar los calculados
        if (savedData) {
          return {
            anio: periodo.anio,
            semana: periodo.semana,
            fechaInicial: fechaInicio,
            fechaFinal: fechaFin,
            conductor: savedData.conductor_nombre || f.conductor_nombre,
            email: savedData.conductor_email || email,
            patente: savedData.vehiculo_patente || f.vehiculo_patente || '',
            dni: savedData.conductor_dni || f.conductor_dni || '',
            importeContrato: Number(savedData.importe_contrato) || 0,
            excedentes: Number(savedData.excedentes) || 0,
            conductorId: f.conductor_id,
            horasConexion: Number(savedData.horas_conexion) || 0,
            importeGenerado: Number(savedData.importe_generado) || 0,
            importeGeneradoConBonos: Number(savedData.importe_generado_bonos) || 0,
            generadoEfectivo: Number(savedData.generado_efectivo) || 0,
            id: savedData.id
          }
        }
        
        // Importe Contrato = Monto del alquiler
        const importeContrato = f.subtotal_alquiler || 0
        
        // EXCEDENTES = garantía + penalidades + peajes + excesos
        const excedentes = (f.subtotal_garantia || 0) + 
                          (f.monto_penalidades || 0) + 
                          (f.monto_peajes || 0) + 
                          (f.monto_excesos || 0)

        return {
          anio: periodo.anio,
          semana: periodo.semana,
          fechaInicial: fechaInicio,
          fechaFinal: fechaFin,
          conductor: f.conductor_nombre,
          email,
          patente: f.vehiculo_patente || '',
          dni: f.conductor_dni || '',
          importeContrato,
          excedentes,
          conductorId: f.conductor_id,
          horasConexion: cabifyInfo.horas,
          importeGenerado: cabifyInfo.ganancia,
          importeGeneradoConBonos: cabifyInfo.cobroApp,
          generadoEfectivo: cabifyInfo.efectivo
        }
      })

      setCabifyPreviewData(previewRows)
      setShowCabifyPreview(true)
    } catch {
      Swal.fire('Error', 'No se pudo generar el preview de Cabify', 'error')
    } finally {
      setLoadingCabifyPreview(false)
    }
  }

  // Exportar Facturación Cabify desde el Preview
  function exportarCabifyExcel() {
    if (cabifyPreviewData.length === 0) return

    setExportingCabify(true)
    try {
      const semana = cabifyPreviewData[0].semana
      const anio = cabifyPreviewData[0].anio
      
      // Fechas como número de Excel (días desde 1/1/1900)
      const fechaInicioExcel = Math.floor((cabifyPreviewData[0].fechaInicial.getTime() - new Date(1899, 11, 30).getTime()) / 86400000)
      const fechaFinExcel = Math.floor((cabifyPreviewData[0].fechaFinal.getTime() - new Date(1899, 11, 30).getTime()) / 86400000)

      const wb = XLSX.utils.book_new()

      // Formato Cabify: cada fila es un conductor (todas las columnas del Excel)
      const cabifyData: (string | number | null)[][] = [
        ['Año', 'Semana Fact.', 'Fecha Inicial', 'Fecha Final', 'Conductor', 'Email', 'Patente', 'DNI', 'Importe Contrato', 'EXCEDENTES', '#DO', 'Horas de conexion', 'Importe Generado', 'Importe Generado (con bonos)', 'Generado efectivo']
      ]

      cabifyPreviewData.forEach(row => {
        cabifyData.push([
          row.anio,
          row.semana,
          fechaInicioExcel,
          fechaFinExcel,
          row.conductor,
          row.email,
          row.patente,
          row.dni,
          row.importeContrato,
          row.excedentes,
          '', // #DO - vacío, lo llena Cabify
          row.horasConexion,
          row.importeGenerado,
          row.importeGeneradoConBonos,
          row.generadoEfectivo
        ])
      })

      const ws = XLSX.utils.aoa_to_sheet(cabifyData)
      
      // Formato de columnas
      ws['!cols'] = [
        { wch: 6 },   // Año
        { wch: 12 },  // Semana Fact.
        { wch: 14 },  // Fecha Inicial
        { wch: 14 },  // Fecha Final
        { wch: 30 },  // Conductor
        { wch: 35 },  // Email
        { wch: 12 },  // Patente
        { wch: 12 },  // DNI
        { wch: 16 },  // Importe Contrato
        { wch: 14 },  // EXCEDENTES
        { wch: 8 },   // #DO
        { wch: 16 },  // Horas de conexion
        { wch: 16 },  // Importe Generado
        { wch: 22 },  // Importe Generado (con bonos)
        { wch: 16 }   // Generado efectivo
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Facturación Cabify')

      const nombreArchivo = `Facturacion_Cabify_S${semana}_${anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      showSuccess('Reporte Cabify Exportado', `Se descargó: ${nombreArchivo}`)
    } catch {
      Swal.fire('Error', 'No se pudo exportar el reporte de Cabify', 'error')
    } finally {
      setExportingCabify(false)
    }
  }

  // Sincronizar cambios del preview Cabify con la BD
  async function syncCabifyChanges(updatedData: CabifyPreviewRow[]): Promise<boolean> {
    if (!periodo) return false

    try {
      for (const row of updatedData) {
        // Verificar si ya existe un registro para este conductor en este período
        const { data: existingRecord } = await (supabase
          .from('facturacion_cabify') as any)
          .select('id')
          .eq('periodo_id', periodo.id)
          .eq('conductor_id', row.conductorId)
          .single()

        const recordData = {
          periodo_id: periodo.id,
          conductor_id: row.conductorId,
          conductor_nombre: row.conductor,
          conductor_dni: row.dni,
          conductor_email: row.email,
          vehiculo_patente: row.patente,
          importe_contrato: row.importeContrato,
          excedentes: row.excedentes,
          horas_conexion: row.horasConexion,
          importe_generado: row.importeGenerado,
          importe_generado_bonos: row.importeGeneradoConBonos,
          generado_efectivo: row.generadoEfectivo,
          updated_at: new Date().toISOString()
        }

        if (existingRecord) {
          // Actualizar registro existente
          const { error } = await (supabase
            .from('facturacion_cabify') as any)
            .update(recordData)
            .eq('id', existingRecord.id)

          if (error) throw error
        } else {
          // Insertar nuevo registro
          const { error } = await (supabase
            .from('facturacion_cabify') as any)
            .insert(recordData)

          if (error) throw error
        }
      }

      // Actualizar el estado local con los datos guardados
      setCabifyPreviewData(updatedData)
      return true
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
      return false
    }
  }

  // Stats calculados - funciona para facturación generada y vista previa
  const stats = useMemo(() => {
    // Si estamos en modo vista previa, calcular desde vistaPreviaData
    if (modoVistaPrevia && vistaPreviaData.length > 0) {
      return {
        total_conductores: vistaPreviaData.length,
        total_cargos: vistaPreviaData.reduce((sum, f) => sum + f.subtotal_cargos + f.saldo_anterior + f.monto_mora, 0),
        total_descuentos: vistaPreviaData.reduce((sum, f) => sum + f.subtotal_descuentos, 0),
        total_neto: vistaPreviaData.reduce((sum, f) => sum + f.total_a_pagar, 0),
        conductores_deben: vistaPreviaData.filter(f => f.total_a_pagar > 0).length,
        conductores_favor: vistaPreviaData.filter(f => f.total_a_pagar <= 0).length
      }
    }
    // Modo normal con período generado
    if (!periodo) return null
    return {
      total_conductores: periodo.total_conductores,
      total_cargos: periodo.total_cargos,
      total_descuentos: periodo.total_descuentos,
      total_neto: periodo.total_neto,
      conductores_deben: facturaciones.filter(f => f.total_a_pagar > 0).length,
      conductores_favor: facturaciones.filter(f => f.total_a_pagar <= 0).length
    }
  }, [periodo, facturaciones, modoVistaPrevia, vistaPreviaData])

  // Helper para obtener excesos de un conductor
  const getExcesosConductor = (conductorId: string) => {
    return excesos.filter(e => e.conductor_id === conductorId)
  }

  // Función para editar saldo de un conductor
  async function editarSaldo(facturacion: FacturacionConductor) {
    // Detectar tema oscuro
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const colors = {
      bg: isDark ? '#1E293B' : '#fff',
      text: isDark ? '#F1F5F9' : '#374151',
      textSecondary: isDark ? '#94A3B8' : '#6B7280',
      textMuted: isDark ? '#64748B' : '#9CA3AF',
      border: isDark ? '#475569' : '#D1D5DB',
      inputBg: isDark ? '#0F172A' : '#fff'
    }

    const { value: nuevoSaldo } = await Swal.fire({
      title: 'Ajustar Saldo',
      background: colors.bg,
      color: colors.text,
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <p style="font-size: 13px; color: ${colors.textSecondary}; margin-bottom: 12px;">
            <strong style="color: ${colors.text}">${facturacion.conductor_nombre}</strong>
          </p>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: ${colors.text}; text-transform: uppercase;">Saldo Actual</label>
            <input id="swal-saldo" type="number" value="${facturacion.saldo_anterior}" style="width: 100%; padding: 10px 12px; border: 1px solid ${colors.border}; border-radius: 6px; font-size: 14px; background: ${colors.inputBg}; color: ${colors.text};">
          </div>
          <p style="font-size: 11px; color: ${colors.textMuted};">
            Positivo = Deuda del conductor<br>
            Negativo = Saldo a favor del conductor
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      preConfirm: () => {
        return parseFloat((document.getElementById('swal-saldo') as HTMLInputElement).value) || 0
      }
    })

    if (nuevoSaldo === undefined) return

    try {
      // Actualizar en saldos_conductores
      const { error } = await (supabase
        .from('saldos_conductores') as any)
        .upsert({
          conductor_id: facturacion.conductor_id,
          saldo_actual: nuevoSaldo,
          ultima_actualizacion: new Date().toISOString()
        }, { onConflict: 'conductor_id' })

      if (error) throw error

      showSuccess('Saldo Actualizado', 'El nuevo saldo se aplicará en la próxima generación')
    } catch (error: any) {
      console.error('Error actualizando saldo:', error)
      Swal.fire('Error', error.message || 'No se pudo actualizar el saldo', 'error')
    }
  }

  // Columnas de la tabla
  const columns = useMemo<ColumnDef<FacturacionConductor>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {conductorFilter.length > 0 && `(${conductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${conductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={conductorSearch}
                onChange={(e) => setConductorSearch(e.target.value)}
              />
              <div className="dt-excel-filter-list">
                {conductoresFiltrados.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${conductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={conductorFilter.includes(c)} onChange={() => toggleConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {conductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setConductorFilter([]); setConductorSearch('') }}>
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <strong style={{ fontSize: '13px', textTransform: 'uppercase' }}>{row.original.conductor_nombre}</strong>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'vehiculo_patente',
      header: () => (
        <div className="dt-column-filter">
          <span>Patente {patenteFilter.length > 0 && `(${patenteFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${patenteFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'patente' ? null : 'patente') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'patente' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar patente..."
                value={patenteSearch}
                onChange={(e) => setPatenteSearch(e.target.value)}
              />
              <div className="dt-excel-filter-list">
                {patentesFiltradas.map(p => (
                  <label key={p} className={`dt-column-filter-checkbox ${patenteFilter.includes(p) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={patenteFilter.includes(p)} onChange={() => togglePatenteFilter(p)} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
              {patenteFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setPatenteFilter([]); setPatenteSearch('') }}>
                  Limpiar ({patenteFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {row.original.vehiculo_patente || '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'tipo_alquiler',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {['CARGO', 'TURNO'].map(t => (
                  <label key={t} className={`dt-column-filter-checkbox ${tipoFilter.includes(t) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={tipoFilter.includes(t)} onChange={() => toggleTipoFilter(t)} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              {tipoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setTipoFilter([])}>
                  Limpiar ({tipoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.tipo_alquiler === 'CARGO' ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`} style={{ fontSize: '10px' }}>
          {row.original.tipo_alquiler}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'alquiler_desglose',
      header: 'Alquiler',
      cell: ({ row }) => {
        const alquiler = row.original.subtotal_alquiler
        const ganancia = row.original.ganancia_cabify || 0
        // Porcentaje de cobertura: cuánto de su alquiler cubrió con ganancia Cabify
        const porcentajeCubierto = alquiler > 0 ? Math.min(100, Math.round((ganancia / alquiler) * 100)) : 0
        const cubreCuota = ganancia >= alquiler && ganancia > 0

        return (
          <div style={{ fontSize: '12px', minWidth: '100px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {formatCurrency(alquiler)}
            </div>
            {/* Barra de progreso: cuánto cubrió con Cabify */}
            <div style={{ 
              width: '100%', 
              height: '8px', 
              backgroundColor: '#e5e7eb', 
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid #d1d5db'
            }}>
              <div style={{ 
                width: `${Math.max(porcentajeCubierto, 0)}%`, 
                height: '100%', 
                backgroundColor: cubreCuota ? '#10b981' : porcentajeCubierto >= 70 ? '#f59e0b' : '#ef4444',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
                minWidth: porcentajeCubierto > 0 ? '4px' : '0'
              }} />
            </div>
            <div style={{ 
              fontSize: '9px', 
              color: cubreCuota ? '#10b981' : '#6b7280', 
              marginTop: '3px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{porcentajeCubierto}% cubierto</span>
              {cubreCuota && <span style={{ color: '#10b981', fontWeight: 600 }}>✓</span>}
            </div>
          </div>
        )
      }
    },
    {
      id: 'garantia_desglose',
      header: 'Garantía',
      cell: ({ row }) => {
        const garantia = row.original.subtotal_garantia
        const cuotaNum = row.original.cuota_garantia_numero || ''
        const isCompletada = cuotaNum === 'NA'
        const ganancia = row.original.ganancia_cabify || 0
        const alquiler = row.original.subtotal_alquiler
        
        // Calcular restante después de cubrir alquiler
        const restante = Math.max(0, ganancia - alquiler)
        // Porcentaje de cobertura de garantía con el restante
        const porcentajeCubierto = garantia > 0 ? Math.min(100, Math.round((restante / garantia) * 100)) : 0
        const cubreGarantia = restante >= garantia && ganancia > 0

        if (isCompletada) {
          return (
            <div style={{ fontSize: '12px' }}>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'var(--badge-green-bg)',
                color: 'var(--badge-green-text)',
                fontSize: '10px',
                fontWeight: 600
              }}>
                COMPLETADA
              </span>
            </div>
          )
        }

        return (
          <div style={{ fontSize: '12px', minWidth: '90px' }}>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {formatCurrency(garantia)}
            </div>
            {/* Barra de progreso: cuánto cubrió con restante de Cabify */}
            <div style={{ 
              width: '100%', 
              height: '8px', 
              backgroundColor: '#e5e7eb', 
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid #d1d5db'
            }}>
              <div style={{ 
                width: `${Math.max(porcentajeCubierto, 0)}%`, 
                height: '100%', 
                backgroundColor: cubreGarantia ? '#10b981' : porcentajeCubierto >= 70 ? '#f59e0b' : '#ef4444',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
                minWidth: porcentajeCubierto > 0 ? '4px' : '0'
              }} />
            </div>
            <div style={{ 
              fontSize: '9px', 
              color: cubreGarantia ? '#10b981' : '#6b7280', 
              marginTop: '3px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{cuotaNum && `${cuotaNum}`}</span>
              {cubreGarantia && <span style={{ color: '#10b981', fontWeight: 600 }}>✓</span>}
            </div>
          </div>
        )
      }
    },
    {
      id: 'excesos_km',
      header: () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Gauge size={12} />
          <span>Excesos</span>
        </div>
      ),
      cell: ({ row }) => {
        const excesosCond = getExcesosConductor(row.original.conductor_id)
        const totalExcesos = excesosCond.reduce((sum, e) => sum + e.monto_total, 0)
        const kmTotal = excesosCond.reduce((sum, e) => sum + e.km_exceso, 0)

        if (excesosCond.length === 0) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
        }

        return (
          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--badge-red-text)' }}>
              {formatCurrency(totalExcesos)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              +{kmTotal} km
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'saldo_anterior',
      header: 'Saldo Ant.',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            fontSize: '12px',
            fontWeight: row.original.saldo_anterior !== 0 ? 600 : 400,
            color: row.original.saldo_anterior > 0 ? 'var(--badge-red-text)' : row.original.saldo_anterior < 0 ? 'var(--badge-green-text)' : 'var(--text-muted)'
          }}>
            {row.original.saldo_anterior !== 0 ? formatCurrency(row.original.saldo_anterior) : '-'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); editarSaldo(row.original) }}
            style={{
              padding: '2px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              opacity: 0.6
            }}
            title="Ajustar saldo"
          >
            <Edit2 size={12} />
          </button>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'subtotal_descuentos',
      header: 'Tickets',
      cell: ({ row }) => (
        <span style={{
          fontSize: '12px',
          fontWeight: row.original.subtotal_descuentos > 0 ? 600 : 400,
          color: row.original.subtotal_descuentos > 0 ? 'var(--badge-green-text)' : 'var(--text-muted)'
        }}>
          {row.original.subtotal_descuentos > 0 ? `-${formatCurrency(row.original.subtotal_descuentos)}` : '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'total_a_pagar',
      header: 'TOTAL',
      cell: ({ row }) => {
        const total = row.original.total_a_pagar
        return (
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '4px',
            background: total > 0 ? 'var(--badge-red-bg)' : 'var(--badge-green-bg)',
            color: total > 0 ? 'var(--badge-red-text)' : 'var(--badge-green-text)'
          }}>
            {formatCurrency(total)}
          </span>
        )
      },
      enableSorting: true,
    },
    // Columna de Ganancia Cabify (solo visible en Vista Previa)
    ...(modoVistaPrevia ? [{
      id: 'ganancia_cabify',
      header: () => (
        <div style={{ textAlign: 'center' }}>
          <span>Cabify</span>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Ganancia</div>
        </div>
      ),
      cell: ({ row }: { row: any }) => {
        const ganancia = row.original.ganancia_cabify || 0
        const cubreCuota = row.original.cubre_cuota
        const cuotaFija = row.original.subtotal_alquiler + row.original.subtotal_garantia

        return (
          <div style={{ fontSize: '12px', textAlign: 'center' }}>
            <div style={{
              fontWeight: 600,
              color: cubreCuota ? 'var(--badge-green-text)' : 'var(--badge-red-text)',
              padding: '2px 6px',
              borderRadius: '4px',
              background: cubreCuota ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)'
            }}>
              {formatCurrency(ganancia)}
            </div>
            <div style={{
              fontSize: '9px',
              marginTop: '2px',
              color: cubreCuota ? 'var(--badge-green-text)' : 'var(--badge-red-text)'
            }}>
              {cubreCuota ? '✓ Cubre' : `Faltan ${formatCurrency(cuotaFija - ganancia)}`}
            </div>
          </div>
        )
      },
      enableSorting: true
    }] as ColumnDef<FacturacionConductor>[] : []),
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
          <button
            className="dt-btn-action dt-btn-view"
            onClick={(e) => { e.stopPropagation(); verDetalle(row.original) }}
            data-tooltip="Ver detalle"
            style={{ padding: '6px' }}
          >
            <Eye size={14} />
          </button>
          {row.original.total_a_pagar > 0 && (
            <button
              className="dt-btn-action"
              onClick={(e) => { e.stopPropagation(); registrarPagoFacturacion(row.original) }}
              data-tooltip="Registrar pago"
              style={{ padding: '6px', color: '#16a34a' }}
            >
              <DollarSign size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [excesos, modoVistaPrevia, conductorFilter, conductorSearch, conductoresFiltrados, tipoFilter, patenteFilter, patenteSearch, patentesFiltradas, openColumnFilter])

  // Info de la semana
  const infoSemana = useMemo(() => {
    const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
    const anio = getYear(semanaActual.inicio)
    const inicio = format(semanaActual.inicio, 'dd/MM', { locale: es })
    const fin = format(semanaActual.fin, 'dd/MM', { locale: es })
    return { semana, anio, inicio, fin }
  }, [semanaActual])

  // Si estamos en modo Preview Facturación, mostrar el componente de preview
  if (showSiFacturaPreview && siFacturaPreviewData.length > 0) {
    // Usar datos del período si existe, sino de semanaActual (Vista Previa)
    const semanaNum = periodo ? periodo.semana : infoSemana.semana
    const anioNum = periodo ? periodo.anio : infoSemana.anio
    const fechaInicioStr = periodo 
      ? format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')
      : format(semanaActual.inicio, 'dd/MM/yyyy')
    const fechaFinStr = periodo
      ? format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')
      : format(semanaActual.fin, 'dd/MM/yyyy')

    const esPeriodoAbierto = periodo?.estado === 'abierto'
    
    return (
      <FacturacionPreviewTable
        data={siFacturaPreviewData}
        conceptos={conceptosNomina}
        semana={semanaNum}
        anio={anioNum}
        fechaInicio={fechaInicioStr}
        fechaFin={fechaFinStr}
        periodoAbierto={esPeriodoAbierto}
        conceptosPendientes={conceptosPendientes}
        onEnlazarConcepto={esPeriodoAbierto ? enlazarConceptoPendiente : undefined}
        onClose={() => {
          setShowSiFacturaPreview(false)
          setSiFacturaPreviewData([])
          setConceptosPendientes([])
        }}
        onExport={exportarSiFacturaExcel}
        exporting={exportingSiFactura}
        onSync={esPeriodoAbierto ? syncFacturacionChanges : undefined}
      />
    )
  }

  // Si estamos en modo RIT Preview, mostrar el componente de preview
  if (showRITPreview && periodo) {
    const periodoAbierto = periodo.estado === 'abierto'
    return (
      <RITPreviewTable
        data={ritPreviewData}
        semana={periodo.semana}
        anio={periodo.anio}
        fechaInicio={format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')}
        fechaFin={format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}
        periodoAbierto={periodoAbierto}
        onClose={() => {
          setShowRITPreview(false)
          setRitPreviewData([])
        }}
        onSync={periodoAbierto ? syncRITChanges : undefined}
      />
    )
  }

  // Si estamos en modo Cabify Preview, mostrar el componente de preview
  if (showCabifyPreview && cabifyPreviewData.length > 0) {
    const semanaNum = periodo ? periodo.semana : infoSemana.semana
    const anioNum = periodo ? periodo.anio : infoSemana.anio
    const fechaInicioStr = periodo 
      ? format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')
      : format(semanaActual.inicio, 'dd/MM/yyyy')
    const fechaFinStr = periodo
      ? format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')
      : format(semanaActual.fin, 'dd/MM/yyyy')
    
    const esPeriodoAbierto = periodo?.estado === 'abierto'

    return (
      <CabifyPreviewTable
        data={cabifyPreviewData}
        semana={semanaNum}
        anio={anioNum}
        fechaInicio={fechaInicioStr}
        fechaFin={fechaFinStr}
        periodoId={esPeriodoAbierto ? periodo?.id : undefined}
        onClose={() => {
          setShowCabifyPreview(false)
          setCabifyPreviewData([])
        }}
        onExport={exportarCabifyExcel}
        exporting={exportingCabify}
        onSync={esPeriodoAbierto ? syncCabifyChanges : undefined}
      />
    )
  }

  return (
    <>
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando facturacion..." size="lg" />

      {/* Selector de semana */}
      <div className="fact-semana-selector">
        <div className="fact-semana-nav">
          <button className="fact-nav-btn" onClick={semanaAnterior} title="Semana anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="fact-semana-info">
            <span className="fact-semana-titulo">Semana {infoSemana.semana}</span>
            <span className="fact-semana-fecha">{infoSemana.inicio} - {infoSemana.fin} / {infoSemana.anio}</span>
          </div>
          <button className="fact-nav-btn" onClick={semanaSiguiente} title="Semana siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="fact-semana-actions">
          <button className="fact-btn-secondary" onClick={irASemanaActual}>
            <Calendar size={14} />
            Semana Actual
          </button>
          <button className="fact-btn-secondary" onClick={cargarFacturacion} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            Actualizar
          </button>
          {periodo?.estado === 'abierto' && (
            <button
              className="fact-btn-primary"
              onClick={recalcularPeriodoAbierto}
              disabled={recalculando || loading}
              title="Recalcular incorporando excesos, tickets y penalidades"
            >
              <Calculator size={14} className={recalculando ? 'spinning' : ''} />
              {recalculando ? 'Recalculando...' : 'Recalcular'}
            </button>
          )}
        </div>
      </div>

      {/* Estado del período */}
      {periodo && (
        <div className="fact-periodo-estado" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: periodo.estado === 'cerrado' ? 'var(--badge-red-bg)' : periodo.estado === 'abierto' ? 'var(--badge-green-bg)' : 'var(--badge-yellow-bg)',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          <AlertCircle size={16} style={{ color: periodo.estado === 'cerrado' ? 'var(--badge-red-text)' : periodo.estado === 'abierto' ? 'var(--badge-green-text)' : 'var(--badge-yellow-text)' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            Estado del período: <strong style={{ textTransform: 'uppercase' }}>{periodo.estado}</strong>
            {periodo.fecha_cierre && ` - Cerrado el ${formatDate(periodo.fecha_cierre)}`}
          </span>
        </div>
      )}

      {/* Vista Previa Mode - Muestra datos calculados on-the-fly (carga automáticamente cuando no hay período) */}
      {modoVistaPrevia && (
        <>
          {/* Banner indicador de Vista Previa */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 16px',
            background: 'var(--badge-blue-bg)',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '1px solid var(--color-info)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calculator size={20} style={{ color: 'var(--color-info)' }} />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--badge-blue-text)', fontSize: '14px' }}>
                  VISTA PREVIA - Liquidación Proyectada
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Cálculo en tiempo real desde asignaciones activas. No guardado en BD.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={cargarVistaPrevia}
                disabled={loadingVistaPrevia}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  background: 'var(--color-info)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} className={loadingVistaPrevia ? 'spinning' : ''} />
                Recalcular
              </button>
              <button
                onClick={() => {
                  setModoVistaPrevia(false)
                  setVistaPreviaData([])
                }}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Salir
              </button>
            </div>
          </div>

          {/* Stats de Vista Previa */}
          {stats && (
            <div className="fact-stats">
              <div className="fact-stats-grid">
                <div className="fact-stat-card">
                  <Users size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.total_conductores}</span>
                    <span className="stat-label">Conductores</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingUp size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_cargos)}</span>
                    <span className="stat-label">Total Cargos</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingDown size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_descuentos)}</span>
                    <span className="stat-label">Total Descuentos</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <DollarSign size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_neto)}</span>
                    <span className="stat-label">Total Proyectado</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingUp size={18} className="stat-icon red" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.conductores_deben}</span>
                    <span className="stat-label">Deben</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingDown size={18} className="stat-icon green" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.conductores_favor}</span>
                    <span className="stat-label">A Favor</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buscador de conductor */}
          <div className="fact-search-container">
            <Search size={18} className="fact-search-icon" />
            <input
              type="text"
              placeholder="Buscar conductor por nombre, DNI o patente..."
              value={buscarConductor}
              onChange={(e) => setBuscarConductor(e.target.value)}
              className="fact-search-input"
            />
            {buscarConductor && (
              <button
                onClick={() => setBuscarConductor('')}
                className="fact-search-clear"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filtros para Vista Previa */}
          <div className="fact-filtros-columna">
            <div className="fact-filtros-grupo">
              <Filter size={14} />
              <span className="fact-filtros-label">Filtros:</span>

              <select
                className="fact-filtro-select"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
              >
                <option value="todos">Todos los tipos</option>
                <option value="TURNO">Solo TURNO</option>
                <option value="CARGO">Solo CARGO</option>
              </select>

              <select
                className="fact-filtro-select"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="deuda">Con deuda</option>
                <option value="favor">A favor</option>
              </select>

              {(filtroTipo !== 'todos' || filtroEstado !== 'todos' || buscarConductor) && (
                <button
                  className="fact-filtro-limpiar"
                  onClick={() => {
                    setFiltroTipo('todos')
                    setFiltroEstado('todos')
                    setBuscarConductor('')
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="fact-export-btn-group">
              <button
                className="fact-btn-export"
                onClick={prepararFacturacionPreviewVistaPrevia}
                disabled={loadingSiFacturaPreview || vistaPreviaData.length === 0}
                style={{ backgroundColor: '#059669' }}
              >
                {loadingSiFacturaPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingSiFacturaPreview ? 'Cargando...' : 'Preview Facturación'}
              </button>
              <button
                className="fact-btn-export"
                onClick={exportarVistaPreviaExcel}
                disabled={exportingExcel || vistaPreviaData.length === 0}
              >
                {exportingExcel ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
                {exportingExcel ? 'Exportando...' : 'Exportar Excel RIT'}
              </button>
              <button
                className="fact-btn-export"
                onClick={prepararCabifyPreview}
                disabled={loadingCabifyPreview || vistaPreviaData.length === 0}
                style={{ backgroundColor: '#7C3AED' }}
              >
                {loadingCabifyPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingCabifyPreview ? 'Cargando...' : 'Preview Cabify'}
              </button>
            </div>
          </div>

          {/* DataTable con Vista Previa */}
          <DataTable
            data={vistaPreviaData.filter(f => {
              // Filtro por búsqueda
              if (buscarConductor) {
                const search = buscarConductor.toLowerCase()
                if (!f.conductor_nombre.toLowerCase().includes(search) &&
                    !f.conductor_dni?.toLowerCase().includes(search) &&
                    !f.vehiculo_patente?.toLowerCase().includes(search)) {
                  return false
                }
              }
              // Filtros existentes
              if (filtroTipo !== 'todos' && f.tipo_alquiler !== filtroTipo) return false
              if (filtroEstado === 'deuda' && f.total_a_pagar <= 0) return false
              if (filtroEstado === 'favor' && f.total_a_pagar > 0) return false
              return true
            })}
            columns={columns}
            loading={loadingVistaPrevia}
            searchPlaceholder="Buscar..."
            emptyIcon={<Calculator size={48} />}
            emptyTitle="Sin asignaciones activas"
            emptyDescription="No hay conductores con asignaciones activas para esta semana"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
            onTableReady={setTableInstance}
          />
        </>
      )}

      {/* Con período generado (solo si no está en modo vista previa) */}
      {periodo && !modoVistaPrevia && (
        <>
          {/* Stats */}
          {stats && (
            <div className="fact-stats">
              <div className="fact-stats-grid">
                <div className="fact-stat-card">
                  <Users size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.total_conductores}</span>
                    <span className="stat-label">Conductores</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingUp size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_cargos)}</span>
                    <span className="stat-label">Total Cargos</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingDown size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_descuentos)}</span>
                    <span className="stat-label">Total Descuentos</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <DollarSign size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_neto)}</span>
                    <span className="stat-label">Total Neto</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingUp size={18} className="stat-icon red" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.conductores_deben}</span>
                    <span className="stat-label">Deben</span>
                  </div>
                </div>
                <div className="fact-stat-card">
                  <TrendingDown size={18} className="stat-icon green" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.conductores_favor}</span>
                    <span className="stat-label">A Favor</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="fact-filtros-columna">
            <div className="fact-filtros-grupo">
              <Filter size={14} />
              <span className="fact-filtros-label">Filtros:</span>

              <select
                className="fact-filtro-select"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
              >
                <option value="todos">Todos los tipos</option>
                <option value="TURNO">Solo TURNO</option>
                <option value="CARGO">Solo CARGO</option>
              </select>

              <select
                className="fact-filtro-select"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="deuda">Con deuda</option>
                <option value="favor">A favor</option>
              </select>

              {(filtroTipo !== 'todos' || filtroEstado !== 'todos') && (
                <button
                  className="fact-filtro-limpiar"
                  onClick={() => {
                    setFiltroTipo('todos')
                    setFiltroEstado('todos')
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="fact-export-btn-group">
              <button
                className="fact-btn-export"
                onClick={prepararSiFacturaPreview}
                disabled={loadingSiFacturaPreview || facturacionesFiltradas.length === 0}
                style={{ backgroundColor: '#059669' }}
              >
                {loadingSiFacturaPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingSiFacturaPreview ? 'Cargando...' : 'Preview Facturación'}
              </button>
              <button
                className="fact-btn-export"
                onClick={prepararCabifyPreviewDesdeFacturacion}
                disabled={loadingCabifyPreview || facturacionesFiltradas.length === 0}
                style={{ backgroundColor: '#7C3AED' }}
              >
                {loadingCabifyPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingCabifyPreview ? 'Cargando...' : 'Preview Cabify'}
              </button>
              {/* Botones ocultos para mantener funciones */}
              <button style={{ display: 'none' }} onClick={exportarExcel} disabled={exportingExcel}>Excel</button>
              <button style={{ display: 'none' }} onClick={prepareRITPreview} disabled={loadingRITPreview}>RIT</button>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={facturacionesFiltradas}
            columns={columns}
            loading={loading}
            searchPlaceholder="Buscar por conductor, DNI, patente..."
            emptyIcon={<FileText size={48} />}
            emptyTitle="Sin facturaciones"
            emptyDescription="No hay conductores facturados en este período"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
            onTableReady={setTableInstance}
          />
        </>
      )}

      {/* Modal de detalle */}
      {showDetalle && (
        <div className="fact-modal-overlay" onClick={() => setShowDetalle(false)}>
          <div className="fact-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Detalle de Facturación</h2>
              <button className="fact-modal-close" onClick={() => setShowDetalle(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="fact-modal-body">
              {loadingDetalle ? (
                <div className="fact-loading-detalle">
                  <Loader2 size={32} className="spinning" />
                  <span>Cargando detalle...</span>
                </div>
              ) : detalleFacturacion ? (
                <div className="fact-detalle">
                  {/* Encabezado */}
                  <div className="fact-detalle-header">
                    <div className="fact-detalle-conductor">
                      <h3>{detalleFacturacion.conductor_nombre}</h3>
                      <span>{detalleFacturacion.conductor_cuit || `DNI: ${detalleFacturacion.conductor_dni}`}</span>
                    </div>
                    <div className="fact-detalle-periodo">
                      <span className="fact-detalle-semana">Semana {periodo?.semana || infoSemana.semana}</span>
                      <span className="fact-detalle-fechas">
                        {periodo
                          ? `${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`
                          : `${infoSemana.inicio} - ${infoSemana.fin} / ${infoSemana.anio}`
                        }
                      </span>
                      {modoVistaPrevia && (
                        <span style={{ fontSize: '10px', color: '#3B82F6', marginTop: '4px' }}>
                          (Vista Previa - Proyección)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info de asignación */}
                  <div className="fact-detalle-asignacion">
                    <div className="fact-info-item">
                      <span className="label">Vehículo:</span>
                      <span className="value">{detalleFacturacion.vehiculo_patente || '-'}</span>
                    </div>
                    <div className="fact-info-item">
                      <span className="label">Tipo:</span>
                      <span className={`dt-badge ${detalleFacturacion.tipo_alquiler === 'CARGO' ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`}>
                        {detalleFacturacion.tipo_alquiler}
                      </span>
                    </div>
                    <div className="fact-info-item">
                      <span className="label">Turnos:</span>
                      <span className="value">{detalleFacturacion.turnos_cobrados}/{detalleFacturacion.turnos_base}</span>
                    </div>
                  </div>

                  {/* Sección de Cargos */}
                  <div className="fact-detalle-seccion">
                    <h4 className="fact-seccion-titulo cargos">Cargos (A Pagar)</h4>
                    <div className="fact-detalle-items">
                      {detalleCargos.map(item => (
                        <div key={item.id} className="fact-item">
                          <span className="fact-item-desc">
                            {item.concepto_descripcion}
                            {item.cantidad > 1 && <small> x{item.cantidad}</small>}
                          </span>
                          <span className="fact-item-monto">{formatCurrency(item.total)}</span>
                        </div>
                      ))}

                      {/* Saldo anterior positivo = debe pagar */}
                      {detalleFacturacion.saldo_anterior > 0 && (
                        <div className="fact-item" style={{ background: '#FEF3C7', padding: '6px 8px', borderRadius: '4px', marginTop: '4px' }}>
                          <span className="fact-item-desc" style={{ color: '#92400E' }}>Saldo Anterior (Deuda)</span>
                          <span className="fact-item-monto" style={{ color: '#ff0033' }}>{formatCurrency(detalleFacturacion.saldo_anterior)}</span>
                        </div>
                      )}

                      {detalleFacturacion.monto_mora > 0 && (
                        <div className="fact-item">
                          <span className="fact-item-desc">Mora ({detalleFacturacion.dias_mora} días al 1%)</span>
                          <span className="fact-item-monto">{formatCurrency(detalleFacturacion.monto_mora)}</span>
                        </div>
                      )}

                      <div className="fact-item total">
                        <span className="fact-item-desc">SUBTOTAL CARGOS</span>
                        <span className="fact-item-monto">
                          {formatCurrency(detalleFacturacion.subtotal_cargos + Math.max(0, detalleFacturacion.saldo_anterior) + detalleFacturacion.monto_mora)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sección de Descuentos / Créditos */}
                  {(detalleDescuentos.length > 0 || detalleFacturacion.saldo_anterior < 0) && (
                    <div className="fact-detalle-seccion">
                      <h4 className="fact-seccion-titulo creditos">Descuentos / Créditos (A Favor)</h4>
                      <div className="fact-detalle-items">
                        {detalleDescuentos.map(item => (
                          <div key={item.id} className="fact-item">
                            <span className="fact-item-desc">{item.concepto_descripcion}</span>
                            <span className="fact-item-monto credito">-{formatCurrency(item.total)}</span>
                          </div>
                        ))}

                        {/* Saldo anterior negativo = crédito a favor */}
                        {detalleFacturacion.saldo_anterior < 0 && (
                          <div className="fact-item" style={{ background: '#D1FAE5', padding: '6px 8px', borderRadius: '4px', marginTop: '4px' }}>
                            <span className="fact-item-desc" style={{ color: '#065F46' }}>Saldo a Favor (Crédito Acumulado)</span>
                            <span className="fact-item-monto credito" style={{ color: '#059669', fontWeight: 600 }}>
                              -{formatCurrency(Math.abs(detalleFacturacion.saldo_anterior))}
                            </span>
                          </div>
                        )}

                        <div className="fact-item total">
                          <span className="fact-item-desc">SUBTOTAL DESCUENTOS</span>
                          <span className="fact-item-monto credito">
                            -{formatCurrency(detalleFacturacion.subtotal_descuentos + Math.abs(Math.min(0, detalleFacturacion.saldo_anterior)))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Saldo Final */}
                  <div className="fact-detalle-saldo">
                    <span className="fact-saldo-label">TOTAL A PAGAR</span>
                    <span className={`fact-saldo-valor ${detalleFacturacion.total_a_pagar > 0 ? 'debe' : 'favor'}`}>
                      {formatCurrency(detalleFacturacion.total_a_pagar)}
                    </span>
                    <span className="fact-saldo-estado">
                      {detalleFacturacion.total_a_pagar > 0 ? 'El conductor debe pagar' : 'Saldo a favor del conductor'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="fact-no-data">No se encontró información</div>
              )}
            </div>

            <div className="fact-modal-footer">
              <button className="fact-btn-secondary" onClick={() => setShowDetalle(false)}>
                Cerrar
              </button>
              {detalleFacturacion && detalleFacturacion.total_a_pagar > 0 && (
                <button
                  className="fact-btn-primary"
                  onClick={() => { setShowDetalle(false); registrarPagoFacturacion(detalleFacturacion) }}
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                >
                  <DollarSign size={16} />
                  Registrar Pago
                </button>
              )}
              <button
                className="fact-btn-primary"
                onClick={exportarPDF}
                disabled={exportingPdf || !detalleFacturacion || (modoVistaPrevia && detalleItems.length === 0)}
              >
                {exportingPdf ? <Loader2 size={16} className="spinning" /> : <Download size={16} />}
                {exportingPdf ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
