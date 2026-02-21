/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useMemo, useRef } from 'react'
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
  // Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  // FileSpreadsheet,
  Filter,
  AlertCircle,
  Calculator,
  Edit2,
  Search,
  Play,
  Banknote,
  Upload,
  Lock
} from 'lucide-react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import { formatCurrency, formatDate, FACTURACION_CONFIG, calcularMora } from '../../../types/facturacion.types'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, parseISO } from 'date-fns'
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
  // Prorrateo desglosado por modalidad (Vista Previa)
  prorrateo_cargo_dias?: number
  prorrateo_cargo_monto?: number
  prorrateo_diurno_dias?: number
  prorrateo_diurno_monto?: number
  prorrateo_nocturno_dias?: number
  prorrateo_nocturno_monto?: number
  // Datos de pago registrado
  monto_cobrado?: number
  fecha_pago?: string | null
  // Estado de facturación semanal (Activo, Pausa, De baja)
  estado_billing?: 'Activo' | 'Pausa' | 'De baja'
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
  sede_id: string | null
}

// Función para obtener el inicio de semana en Argentina (lunes)
function getSemanaArgentina(date: Date) {
  const inicio = startOfWeek(date, { weekStartsOn: 1 }) // Lunes
  const fin = endOfWeek(date, { weekStartsOn: 1 }) // Domingo
  return { inicio, fin }
}



export function ReporteFacturacionTab() {
  const { profile } = useAuth()
  const { sedeActualId, sedeUsuario } = useSede()
  
  // Ref para auto-recalcular después de crear un nuevo período
  const autoRecalcularRef = useRef(false)
  const [generando, setGenerando] = useState(false)

  // Estados principales
  const [facturaciones, setFacturaciones] = useState<FacturacionConductor[]>([])
  const [periodo, setPeriodo] = useState<PeriodoFacturacion | null>(null)
  const [periodoAnteriorCerrado, setPeriodoAnteriorCerrado] = useState(true) // Si la semana anterior está cerrada
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

  // Modal de desglose de días
  const [showDiasModal, setShowDiasModal] = useState(false)

  const [diasModalData, setDiasModalData] = useState<{
    conductorId: string
    conductorNombre: string
    conductorDni: string
    totalDias: number
    dias: {
      fecha: string
      diaSemana: string
      horario: string
      trabajado: boolean
    }[]
    historial: {
      fechaInicio: string
      fechaFin: string
      padreEstado: string
      horario: string
      dias: number
      nota: string
    }[]
  } | null>(null)
  const [loadingDias, setLoadingDias] = useState(false)

  // Modal de historial de asignaciones (completo, todas las asignaciones del conductor)
  const [showHistorialModal, setShowHistorialModal] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [historialModalData, setHistorialModalData] = useState<{
    conductorNombre: string
    conductorDni: string
    asignaciones: {
      id: string
      vehiculoPatente: string
      horario: string
      estado: string
      padreEstado: string
      fechaInicio: string
      fechaFin: string | null
      modalidad: string
    }[]
  } | null>(null)

  // Modal de detalle
  const [showDetalle, setShowDetalle] = useState(false)
  const [detalleFacturacion, setDetalleFacturacion] = useState<FacturacionConductor | null>(null)
  const [detalleItems, setDetalleItems] = useState<FacturacionDetalle[]>([])
  const [exportingPdf, setExportingPdf] = useState(false)
  const [detallePagos, setDetallePagos] = useState<{
    id: string
    monto: number
    referencia: string | null
    semana: number
    anio: number
    fecha_pago: string
    tipo_cobro: string
  }[]>([])

  

  // Memoized filtered detalle items to avoid recalculation on each render
  const detalleCargos = useMemo(() => detalleItems.filter(d => !d.es_descuento), [detalleItems])
  const detalleDescuentos = useMemo(() => detalleItems.filter(d => d.es_descuento), [detalleItems])

  // Table instance and filters
  const [tableInstance, setTableInstance] = useState<Table<FacturacionConductor> | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)
  // Filtros de tipo/estado removidos - no agregaban valor

  // Filtros Excel por columna
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilter] = useState<string[]>([])
  const [patenteFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  // RIT Preview mode
  const [showRITPreview, setShowRITPreview] = useState(false)
  const [ritPreviewData, setRitPreviewData] = useState<RITPreviewRow[]>([])
  const [loadingRITPreview, setLoadingRITPreview] = useState(false)

  // Recalcular período abierto
  const [recalculando, setRecalculando] = useState(false)
  const [recalculandoProgreso, setRecalculandoProgreso] = useState({ actual: 0, total: 0 })

  // Cerrar período
  const [cerrando, setCerrando] = useState(false)

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [conceptosPendientes, setConceptosPendientes] = useState<ConceptoPendiente[]>([])
  const [conceptosNomina, setConceptosNomina] = useState<ConceptoNomina[]>([])

  // Cargar Pagos Cabify (desde Excel)
  const [showCabifyPagosPreview, setShowCabifyPagosPreview] = useState(false)
  const [cabifyPagosData, setCabifyPagosData] = useState<{
    conductor_nombre: string
    conductor_dni: string
    patente: string
    importe_contrato: number
    disponible: number       // Col P - disponible para descontar
    importe_descontar: number // Col Q - lo que se descuenta
    saldo_adeudado: number   // Col R - lo que queda
    total_a_pagar: number    // de facturacion_conductores
    facturacion_id: string
    conductor_id: string
    conductor_cuit: string
    monto_cobrado: number    // ya cobrado previamente
  }[]>([])
  const [loadingCabifyPagos, setLoadingCabifyPagos] = useState(false)
  const [procesandoCabifyPagos, setProcesandoCabifyPagos] = useState(false)
  const cabifyFileInputRef = useRef<HTMLInputElement>(null)

  // Default: semana actual (inicializada en useState)

  // Cargar facturaciones cuando cambia la semana
  useEffect(() => {
    // Resetear modo vista previa al cambiar de semana
    setModoVistaPrevia(false)
    setVistaPreviaData([])
    setBuscarConductor('')
    cargarFacturacion()
  }, [semanaActual, sedeActualId])

  // Cargar conceptos de nómina al montar (para agregar ajustes manuales)
  useEffect(() => {
    async function cargarConceptos() {
      const { data } = await supabase
        .from('conceptos_nomina')
        .select('id, codigo, descripcion, tipo, es_variable, iva_porcentaje, precio_base, precio_final')
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

  // Listas filtradas por búsqueda
  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  // Cargar desglose de días para un conductor específico
  async function cargarDesgloseDias(conductorId: string, conductorNombre: string, conductorDni: string, _turnosCobrados: number) {
    setShowDiasModal(true)
    setLoadingDias(true)
    setDiasModalData(null)

    // En Vista Previa los IDs vienen con prefijo 'preview-'
    const realConductorId = conductorId.startsWith('preview-') ? conductorId.replace('preview-', '') : conductorId

    try {
      const fechaInicio = periodo?.fecha_inicio || format(semanaActual.inicio, 'yyyy-MM-dd')
      const fechaFin = periodo?.fecha_fin || format(semanaActual.fin, 'yyyy-MM-dd')
      const semanaInicio = parseISO(fechaInicio)
      const semanaFin = parseISO(fechaFin)

      // En Vista Previa de la semana actual: cortar en HOY (no contar días futuros)
      const hoyDesglose = new Date()
      hoyDesglose.setHours(23, 59, 59, 999)
      const esVistaPreviewActual = modoVistaPrevia && hoyDesglose >= semanaInicio && hoyDesglose <= semanaFin
      const limiteConteo = esVistaPreviewActual ? hoyDesglose : semanaFin

      const { data: asignacionesCond } = await (supabase
        .from('asignaciones_conductores') as any)
        .select(`
          id, conductor_id, horario, fecha_inicio, fecha_fin, estado,
          asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)
        `)
        .eq('conductor_id', realConductorId)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado'])

      // Construir un Set de fechas cubiertas con su horario
      const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const diasCubiertos = new Map<string, string>() // fecha -> horario
      const historial: { fechaInicio: string; fechaFin: string; padreEstado: string; horario: string; dias: number; nota: string }[] = []

      for (const ac of (asignacionesCond || []) as any[]) {
        const asignacion = ac.asignaciones
        if (!asignacion) continue

        const estadoPadre = (asignacion.estado || '').toLowerCase()
        const horario = ac.horario || asignacion.horario || '-'
        const acInicioStr = ac.fecha_inicio ? ac.fecha_inicio.substring(0, 10) : 'NULL'
        const acFinStr = ac.fecha_fin ? ac.fecha_fin.substring(0, 10) : 'NULL'

        // Skip PROGRAMADO — asignación no ha iniciado, no cuenta para facturación
        if (['programado', 'programada'].includes(estadoPadre)) {
          historial.push({ fechaInicio: acInicioStr, fechaFin: acFinStr, padreEstado: estadoPadre, horario, dias: 0, nota: 'Programada (no iniciada)' })
          continue
        }

        if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asignacion.fecha_fin) {
          historial.push({ fechaInicio: acInicioStr, fechaFin: acFinStr, padreEstado: estadoPadre, horario, dias: 0, nota: 'Huérfano (padre sin fecha_fin)' })
          continue
        }

        // Normalizar fechas a solo fecha (sin hora) para conteo correcto de días
        const acInicio = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10))
          : (asignacion.fecha_inicio ? parseISO(asignacion.fecha_inicio.substring(0, 10)) : semanaInicio)
        const acFin = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10))
          : (asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : semanaFin)

        if (acFin < semanaInicio || acInicio > limiteConteo) {
          historial.push({ fechaInicio: acInicioStr, fechaFin: acFinStr, padreEstado: estadoPadre, horario, dias: 0, nota: 'Fuera de rango' })
          continue
        }

        const efectivoInicio = acInicio < semanaInicio ? semanaInicio : acInicio
        const efectivoFin = acFin > limiteConteo ? limiteConteo : acFin
        let diasContados = 0

        const cursorAc = new Date(efectivoInicio)
        while (cursorAc <= efectivoFin) {
          const key = format(cursorAc, 'yyyy-MM-dd')
          if (!diasCubiertos.has(key)) {
            diasCubiertos.set(key, horario)
            diasContados++
          }
          cursorAc.setDate(cursorAc.getDate() + 1)
        }
        historial.push({ fechaInicio: acInicioStr, fechaFin: acFinStr, padreEstado: estadoPadre, horario, dias: diasContados, nota: diasContados > 0 ? `${format(efectivoInicio, 'dd/MM')} → ${format(efectivoFin, 'dd/MM')}` : 'Días ya cubiertos' })
      }

      // Generar los 7 días de la semana con su estado
      // Días futuros (después de HOY en Vista Previa) se muestran pero NO como trabajados
      const diasSemana: { fecha: string; diaSemana: string; horario: string; trabajado: boolean }[] = []
      const cursor = new Date(semanaInicio)
      while (cursor <= semanaFin) {
        const key = format(cursor, 'yyyy-MM-dd')
        const cubierto = diasCubiertos.get(key)
        const esFuturo = esVistaPreviewActual && cursor > hoyDesglose
        diasSemana.push({
          fecha: format(cursor, 'dd/MM/yyyy'),
          diaSemana: diasNombres[cursor.getDay()],
          horario: esFuturo ? '-' : (cubierto || '-'),
          trabajado: esFuturo ? false : !!cubierto,
        })
        cursor.setDate(cursor.getDate() + 1)
      }

      setDiasModalData({
        conductorId: realConductorId,
        conductorNombre,
        conductorDni,
        totalDias: Math.min(7, diasCubiertos.size),
        dias: diasSemana,
        historial,
      })
    } catch {
      Swal.fire('Error', 'No se pudo cargar el desglose de días', 'error')
      setShowDiasModal(false)
    } finally {
      setLoadingDias(false)
    }
  }

  // Cargar historial completo de asignaciones para un conductor
  async function cargarHistorialAsignaciones(conductorId: string, conductorNombre: string, conductorDni: string) {
    setShowHistorialModal(true)
    setLoadingHistorial(true)
    setHistorialModalData(null)

    const realConductorId = conductorId.startsWith('preview-') ? conductorId.replace('preview-', '') : conductorId

    try {
      const { data: asignacionesCond } = await (supabase
        .from('asignaciones_conductores') as any)
        .select(`
          id, conductor_id, horario, fecha_inicio, fecha_fin, estado,
          asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin, modalidad,
            vehiculos(patente)
          )
        `)
        .eq('conductor_id', realConductorId)
        .order('fecha_inicio', { ascending: false, nullsFirst: false })

      const asignaciones: {
        id: string
        vehiculoPatente: string
        horario: string
        estado: string
        padreEstado: string
        fechaInicio: string
        fechaFin: string | null
        modalidad: string
      }[] = []

      for (const ac of (asignacionesCond || []) as any[]) {
        const padre = ac.asignaciones
        if (!padre) continue

        const acInicio = ac.fecha_inicio || padre.fecha_inicio || null
        const acFin = ac.fecha_fin || padre.fecha_fin || null

        asignaciones.push({
          id: ac.id,
          vehiculoPatente: padre.vehiculos?.patente || '-',
          horario: ac.horario || padre.horario || '-',
          estado: ac.estado || '-',
          padreEstado: padre.estado || '-',
          fechaInicio: acInicio ? acInicio.substring(0, 10) : '-',
          fechaFin: acFin ? acFin.substring(0, 10) : null,
          modalidad: padre.modalidad || padre.horario || '-',
        })
      }

      // Ordenar por fecha_inicio descendente (más reciente primero)
      asignaciones.sort((a, b) => {
        if (a.fechaInicio === '-') return 1
        if (b.fechaInicio === '-') return -1
        return b.fechaInicio.localeCompare(a.fechaInicio)
      })

      setHistorialModalData({
        conductorNombre,
        conductorDni,
        asignaciones,
      })
    } catch {
      Swal.fire('Error', 'No se pudo cargar el historial de asignaciones', 'error')
      setShowHistorialModal(false)
    } finally {
      setLoadingHistorial(false)
    }
  }

  async function cargarFacturacion() {
    setLoading(true)
    try {
      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)

      // 0. Verificar si la semana ANTERIOR tiene período cerrado
      const semanaAnt = getWeek(subWeeks(semanaActual.inicio, 1), { weekStartsOn: 1 })
      const anioAnt = getYear(subWeeks(semanaActual.inicio, 1))
      let qAnt = supabase
        .from('periodos_facturacion')
        .select('id, estado')
        .eq('semana', semanaAnt)
        .eq('anio', anioAnt)
      if (sedeActualId) qAnt = qAnt.eq('sede_id', sedeActualId)
      const { data: periodoAnt } = await qAnt.single()
      
      // La semana anterior está cerrada si: tiene período con estado 'cerrado', o es semana 1 (no hay anterior)
      const anteriorCerrado = semana === 1 || (periodoAnt?.estado === 'cerrado')
      setPeriodoAnteriorCerrado(anteriorCerrado)

      // 1. Buscar el período para esta semana
      let qPeriodo = supabase
        .from('periodos_facturacion')
        .select('*')
        .eq('semana', semana)
        .eq('anio', anio)
      if (sedeActualId) qPeriodo = qPeriodo.eq('sede_id', sedeActualId)
      const { data: periodoData, error: errPeriodo } = await qPeriodo.single()

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
          conductor:conductores!conductor_id(nombres, apellidos, estado_id, fecha_terminacion)
        `)
        .eq('periodo_id', (periodoData as any).id)

      if (errFact) throw errFact

      // ID del estado "Activo" para conductores
      const ESTADO_ACTIVO_ID_LOAD = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'
      const fechaFinPeriodoLoad = parseISO((periodoData as any).fecha_fin)

      // Cargar asignaciones para determinar si tienen asignación al cierre de la semana y horario
      const conductorIdsLoad = (facturacionesData || []).map((f: any) => f.conductor_id).filter(Boolean)
      const { data: asignacionesLoad } = conductorIdsLoad.length > 0 ? await (supabase
        .from('asignaciones_conductores') as any)
        .select('conductor_id, horario, fecha_inicio, fecha_fin, asignaciones!inner(estado, horario, fecha_inicio, fecha_fin)')
        .in('conductor_id', conductorIdsLoad)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado'])
      : { data: [] }

      const conductoresConAsignacionAlCierreLoad = new Set<string>()
      // Calcular horario (diurno/nocturno) por conductor para períodos guardados
      const horarioMapLoad = new Map<string, { diurno: number; nocturno: number; cargo: number }>()
      ;(asignacionesLoad || []).forEach((ac: any) => {
        const asignacion = ac.asignaciones
        if (!asignacion) return
        const estadoPadre = (asignacion.estado || '').toLowerCase()
        if (['programado', 'programada', 'cancelado', 'cancelada'].includes(estadoPadre)) return
        const acFin = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10)) : null
        const asigFin = asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : null
        const finEfectivo = acFin || asigFin
        if (!finEfectivo || finEfectivo >= fechaFinPeriodoLoad) {
          conductoresConAsignacionAlCierreLoad.add(ac.conductor_id)
        }

        // Calcular overlap con el período para determinar horario
        const periodoInicioLoad = parseISO((periodoData as any).fecha_inicio)
        const acInicioLoad = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10))
          : (asignacion.fecha_inicio ? parseISO(asignacion.fecha_inicio.substring(0, 10)) : periodoInicioLoad)
        const acFinLoad = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10))
          : (asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : fechaFinPeriodoLoad)
        const efInicio = acInicioLoad < periodoInicioLoad ? periodoInicioLoad : acInicioLoad
        const efFin = acFinLoad > fechaFinPeriodoLoad ? fechaFinPeriodoLoad : acFinLoad
        const diasOverlap = Math.max(0, Math.ceil((efFin.getTime() - efInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        if (diasOverlap <= 0) return

        if (!horarioMapLoad.has(ac.conductor_id)) {
          horarioMapLoad.set(ac.conductor_id, { diurno: 0, nocturno: 0, cargo: 0 })
        }
        const h = horarioMapLoad.get(ac.conductor_id)!
        const modalidadPadre = asignacion.horario // 'TURNO' o 'CARGO'
        const horarioCond = (ac.horario || '').toLowerCase().trim()
        if (modalidadPadre === 'CARGO' || horarioCond === 'todo_dia') {
          h.cargo += diasOverlap
        } else if (modalidadPadre === 'TURNO') {
          if (horarioCond === 'nocturno' || horarioCond === 'n') h.nocturno += diasOverlap
          else h.diurno += diasOverlap
        } else {
          h.cargo += diasOverlap
        }
      })

      // Usar nombre de tabla conductores en formato "Nombres Apellidos"
      let facturacionesTransformadas = (facturacionesData || []).map((f: any) => {
        const conductorEstadoId = f.conductor?.estado_id
        const fechaTermLoad = f.conductor?.fecha_terminacion ? parseISO(f.conductor.fecha_terminacion) : null
        const esDeBajaLoad = conductorEstadoId !== ESTADO_ACTIVO_ID_LOAD
          || (fechaTermLoad && fechaTermLoad <= fechaFinPeriodoLoad)
        const tieneAsignacionCierreLoad = conductoresConAsignacionAlCierreLoad.has(f.conductor_id)
        const estadoBilling = esDeBajaLoad ? 'De baja'
          : ((f.turnos_cobrados >= 7 || tieneAsignacionCierreLoad) ? 'Activo' : 'Pausa')
        const horarioInfo = horarioMapLoad.get(f.conductor_id)
        return {
          ...f,
          conductor_nombre: f.conductor 
            ? `${f.conductor.nombres || ''} ${f.conductor.apellidos || ''}`.trim()
            : f.conductor_nombre || '',
          estado_billing: estadoBilling,
          prorrateo_diurno_dias: f.prorrateo_diurno_dias ?? (horarioInfo?.diurno || 0),
          prorrateo_nocturno_dias: f.prorrateo_nocturno_dias ?? (horarioInfo?.nocturno || 0),
          prorrateo_cargo_dias: f.prorrateo_cargo_dias ?? (horarioInfo?.cargo || 0),
        }
      })

      // 2.5 Cargar ganancias y peajes de Cabify para el período
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, ganancia_total, peajes')
        .gte('fecha_inicio', (periodoData as any).fecha_inicio + 'T00:00:00')
        .lte('fecha_inicio', (periodoData as any).fecha_fin + 'T23:59:59')

      // Agrupar ganancias y peajes por DNI (normalizado sin ceros adelante)
      const gananciasPorDni = new Map<string, number>()
      const peajesPorDni = new Map<string, number>()
      ;(cabifyData || []).forEach((c: any) => {
        if (c.dni) {
          const dniNorm = String(c.dni).replace(/^0+/, '')
          const actual = gananciasPorDni.get(dniNorm) || 0
          gananciasPorDni.set(dniNorm, actual + (parseFloat(c.ganancia_total) || 0))
          const actualPeajes = peajesPorDni.get(dniNorm) || 0
          peajesPorDni.set(dniNorm, actualPeajes + (parseFloat(String(c.peajes)) || 0))
        }
      })

      // Agregar ganancia_cabify a cada facturación
      facturacionesTransformadas = facturacionesTransformadas.map((f: any) => {
        const dniNorm = f.conductor_dni ? String(f.conductor_dni).replace(/^0+/, '') : ''
        const ganancia = dniNorm ? (gananciasPorDni.get(dniNorm) || 0) : 0
        const cuotaFija = f.subtotal_alquiler + f.subtotal_garantia
        return {
          ...f,
          ganancia_cabify: ganancia,
          cubre_cuota: ganancia >= cuotaFija
        }
      })
      
      // 2.6 Cargar pagos registrados para este período
      const facIds = facturacionesTransformadas.map((f: any) => f.id)
      const { data: pagosData } = await (supabase
        .from('pagos_conductores') as any)
        .select('referencia_id, monto, fecha_pago')
        .eq('tipo_cobro', 'facturacion_semanal')
        .in('referencia_id', facIds)

      // Agrupar pagos por referencia_id (puede haber pagos parciales)
      const pagosMap = new Map<string, { monto: number; fecha_pago: string | null }>()
      ;(pagosData || []).forEach((p: any) => {
        const existing = pagosMap.get(p.referencia_id)
        if (existing) {
          existing.monto += parseFloat(p.monto) || 0
          if (p.fecha_pago) existing.fecha_pago = p.fecha_pago
        } else {
          pagosMap.set(p.referencia_id, {
            monto: parseFloat(p.monto) || 0,
            fecha_pago: p.fecha_pago || null,
          })
        }
      })

      // 2.7 Cargar detalles de facturación para peajes y penalidades
      const { data: detallesData } = await (supabase
        .from('facturacion_detalle') as any)
        .select('facturacion_id, concepto_codigo, concepto_descripcion, total')
        .in('facturacion_id', facIds)
        .in('concepto_codigo', ['P005', 'P007'])

      // Agrupar por facturacion_id
      const detallesMap = new Map<string, { monto_peajes: number; monto_penalidades: number; penalidades_count: number; penalidades_detalle: Array<{ monto: number; detalle: string }> }>()
      ;(detallesData || []).forEach((d: any) => {
        if (!detallesMap.has(d.facturacion_id)) {
          detallesMap.set(d.facturacion_id, { monto_peajes: 0, monto_penalidades: 0, penalidades_count: 0, penalidades_detalle: [] })
        }
        const entry = detallesMap.get(d.facturacion_id)!
        if (d.concepto_codigo === 'P005') {
          entry.monto_peajes += parseFloat(d.total) || 0
        } else if (d.concepto_codigo === 'P007') {
          entry.monto_penalidades += parseFloat(d.total) || 0
          entry.penalidades_count += 1
          entry.penalidades_detalle.push({ monto: parseFloat(d.total) || 0, detalle: d.concepto_descripcion || 'Penalidad' })
        }
      })

      // Agregar monto_cobrado + detalles a cada facturación
      facturacionesTransformadas = facturacionesTransformadas.map((f: any) => {
        const pago = pagosMap.get(f.id)
        const detalle = detallesMap.get(f.id)
        const peajesDetalle = detalle?.monto_peajes || 0
        // Fallback: si no hay P005 en facturacion_detalle, buscar en cabify_historico por DNI (normalizado)
        const dniNormPeaje = f.conductor_dni ? String(f.conductor_dni).replace(/^0+/, '') : ''
        const peajesCabify = dniNormPeaje ? (peajesPorDni.get(dniNormPeaje) || 0) : 0
        return {
          ...f,
          monto_cobrado: pago?.monto || 0,
          fecha_pago: pago?.fecha_pago || null,
          monto_peajes: peajesDetalle > 0 ? peajesDetalle : peajesCabify,
          monto_penalidades: detalle?.monto_penalidades || 0,
          penalidades_detalle: detalle?.penalidades_detalle || [],
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
      // Semana y año del período (para queries)
      const semanaDelPeriodo = getWeek(parseISO(fechaInicio), { weekStartsOn: 1 })
      const anioDelPeriodo = getYear(parseISO(fechaInicio))

      // 1. Cargar conductores desde asignaciones que se solapan con la semana + penalidades pendientes
      const sedeParaVP = sedeActualId || sedeUsuario?.id
      const conductoresControl: { numero_dni: string; estado: string; patente: string; modalidad: string; valor_alquiler: number | null }[] = []
      const dnisAgregadosVP = new Set<string>()

      // 1a. Conductores con asignaciones activas/finalizadas que se solapan con la semana
      {
        const { data: asignacionesSemanaVP } = await (supabase
          .from('asignaciones_conductores') as any)
          .select(`
            conductor_id, horario, fecha_inicio, fecha_fin, estado,
            asignaciones!inner(horario, estado, fecha_fin, vehiculo_id, vehiculos(patente)),
            conductores!inner(numero_dni, sede_id)
          `)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado'])

        const semInicioVP = parseISO(fechaInicio)
        const semFinVP = parseISO(fechaFin)

        for (const ac of (asignacionesSemanaVP || []) as any[]) {
          const cond = ac.conductores
          const asig = ac.asignaciones
          if (!cond || !asig) continue
          if (sedeParaVP && cond.sede_id !== sedeParaVP) continue

          // Skip PROGRAMADO y huérfanos
          const estadoPadreVPExtra = (asig.estado || '').toLowerCase()
          if (['programado', 'programada'].includes(estadoPadreVPExtra)) continue
          if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadreVPExtra) && !asig.fecha_fin) continue

          // Verificar solapamiento con la semana (normalizar sin hora)
          const acInicioExtra = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10)) : new Date('2020-01-01')
          const acFinExtra = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10))
            : (asig.fecha_fin ? parseISO(asig.fecha_fin.substring(0, 10)) : new Date('2099-12-31'))
          if (acFinExtra < semInicioVP || acInicioExtra > semFinVP) continue

          if (!dnisAgregadosVP.has(cond.numero_dni)) {
            dnisAgregadosVP.add(cond.numero_dni)
            const modalidad = (asig.horario || '').toUpperCase() === 'CARGO' ? 'CARGO' : 'TURNO'
            conductoresControl.push({
              numero_dni: cond.numero_dni,
              estado: 'Activo',
              patente: asig.vehiculos?.patente || '',
              modalidad,
              valor_alquiler: null
            })
          }
        }
      }

      // 1b. Conductores con penalidades pendientes (cobros de incidencias) en la semana
      const dnisConPenalidadesVP = new Set<string>()
      {
        const { data: penalidadesPendientesVP } = await (supabase
          .from('penalidades') as any)
          .select('conductor_id, conductores!inner(numero_dni, sede_id)')
          .gte('fecha', fechaInicio)
          .lte('fecha', format(semanaActual.fin, 'yyyy-MM-dd'))
          .eq('aplicado', false)

        for (const p of (penalidadesPendientesVP || []) as any[]) {
          const cond = p.conductores
          if (!cond || !cond.numero_dni) continue
          if (sedeParaVP && cond.sede_id !== sedeParaVP) continue
          if (dnisAgregadosVP.has(cond.numero_dni)) continue
          dnisAgregadosVP.add(cond.numero_dni)
          dnisConPenalidadesVP.add(cond.numero_dni)
          conductoresControl.push({
            numero_dni: cond.numero_dni,
            estado: 'Activo',
            patente: '',
            modalidad: 'TURNO',
            valor_alquiler: null
          })
        }
      }

      // Obtener datos de conductores desde tabla conductores
      // FILTRAR por sede para obtener solo conductores de esta sede
      const dnisControl = (conductoresControl || []).map((c: any) => c.numero_dni)
      let qConductoresVP = supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit, estado_id, fecha_terminacion')
        .in('numero_dni', dnisControl)
      if (sedeParaVP) qConductoresVP = qConductoresVP.eq('sede_id', sedeParaVP)
      const { data: conductoresData } = await qConductoresVP

      const conductoresDataMap = new Map((conductoresData || []).map((c: any) => [c.numero_dni, c]))
      // ID del estado "Activo" para conductores
      const ESTADO_ACTIVO_ID = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'

      // 1.1 Cargar asignaciones_conductores para calcular prorrateo por días/modalidad/horario
      const conductorIds = (conductoresData || []).map((c: any) => c.id)
      const { data: asignacionesConductores } = await (supabase
        .from('asignaciones_conductores') as any)
        .select(`
          id,
          conductor_id,
          horario,
          fecha_inicio,
          fecha_fin,
          estado,
          asignacion_id,
          asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)
        `)
        .in('conductor_id', conductorIds)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado'])

      // Crear mapa de prorrateo con días y montos para precios históricos
      interface ProrrateoVistaPrevia {
        CARGO: number; TURNO_DIURNO: number; TURNO_NOCTURNO: number;
        monto_CARGO: number; monto_TURNO_DIURNO: number; monto_TURNO_NOCTURNO: number;
      }
      const prorrateoMap = new Map<string, ProrrateoVistaPrevia>()
      
      // Inicializar todos los conductores con 0 días
      conductorIds.forEach((id: string) => {
        prorrateoMap.set(id, { 
          CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0,
          monto_CARGO: 0, monto_TURNO_DIURNO: 0, monto_TURNO_NOCTURNO: 0
        })
      })

      // Calcular días por modalidad/horario para cada conductor
      const fechaInicioSemana = semanaActual.inicio
      // Para semana actual: usar HOY como fin (no contar días futuros)
      const fechaFinSemana = esSemanaActual ? fechaFinEfectiva : semanaActual.fin

      // Map de conductor_id → fecha_terminacion (tope de días para conductores de baja)
      const fechaTermMapVP = new Map<string, Date>()
      for (const c of (conductoresData || []) as any[]) {
        if (c.fecha_terminacion) fechaTermMapVP.set(c.id, parseISO(c.fecha_terminacion))
      }
      
      // Guardar asignaciones por conductor para cálculo de montos con precios históricos
      const asignacionesPorConductorVP = new Map<string, Array<{
        modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO';
        fechaInicio: Date;
        fechaFin: Date;
      }>>()
      conductorIds.forEach((id: string) => asignacionesPorConductorVP.set(id, []))
      
      ;(asignacionesConductores || []).forEach((ac: any) => {
        const asignacion = ac.asignaciones
        if (!asignacion) return
        
        const modalidadAsignacion = asignacion.horario // 'TURNO' o 'CARGO'
        const horarioConductor = ac.horario // 'diurno', 'nocturno', 'todo_dia'
        
        // Si la asignación padre está programada → no ha iniciado, no cuenta para facturación
        const estadoPadreVP = (asignacion.estado || '').toLowerCase()
        if (['programado', 'programada'].includes(estadoPadreVP)) return
        // Si la asignación padre está finalizada/cancelada sin fecha_fin → registro huérfano
        if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadreVP) && !asignacion.fecha_fin) return
        
        // Calcular días que este registro se solapa con la semana
        // Normalizar a solo fecha (sin hora) — timestamps de asignaciones tienen hora que rompe el conteo
        const acInicio = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10)) 
          : (asignacion.fecha_inicio ? parseISO(asignacion.fecha_inicio.substring(0, 10)) : fechaInicioSemana)
        const acFin = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10)) 
          : (asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : fechaFinSemana)
        
        // Rango efectivo dentro de la semana
        const efectivoInicio = acInicio < fechaInicioSemana ? fechaInicioSemana : acInicio
        let efectivoFin = acFin > fechaFinSemana ? fechaFinSemana : acFin

        // Si el conductor tiene fecha_terminacion, no contar días después de esa fecha
        const fechaTermVP = fechaTermMapVP.get(ac.conductor_id)
        if (fechaTermVP && efectivoFin > fechaTermVP) efectivoFin = fechaTermVP
        
        // Calcular días (diferencia en milisegundos / ms por día)
        const dias = Math.max(0, Math.ceil((efectivoFin.getTime() - efectivoInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        
        if (dias <= 0) return
        
        const prorrateo = prorrateoMap.get(ac.conductor_id)
        if (!prorrateo) return
        
        // Determinar modalidad basándose en asignaciones.horario + asignaciones_conductores.horario
        let modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO' = 'CARGO'
        const horarioLowerVP = (horarioConductor || '').toLowerCase().trim()
        if (modalidadAsignacion === 'CARGO' || horarioLowerVP === 'todo_dia') {
          modalidad = 'CARGO'
          prorrateo.CARGO += dias
        } else if (modalidadAsignacion === 'TURNO') {
          if (horarioLowerVP === 'nocturno' || horarioLowerVP === 'n') {
            modalidad = 'TURNO_NOCTURNO'
            prorrateo.TURNO_NOCTURNO += dias
          } else {
            // Default para TURNO: diurno (incluye 'diurno', 'd', null, vacío, etc.)
            modalidad = 'TURNO_DIURNO'
            prorrateo.TURNO_DIURNO += dias
          }
        } else {
          // modalidadAsignacion no reconocida: tratar como CARGO por defecto
          modalidad = 'CARGO'
          prorrateo.CARGO += dias
        }
        
        // Guardar asignación para cálculo de montos
        const asigs = asignacionesPorConductorVP.get(ac.conductor_id)
        if (asigs) {
          asigs.push({ modalidad, fechaInicio: efectivoInicio, fechaFin: efectivoFin })
        }
      })
      
      // Determinar conductores con asignación activa al cierre de la semana
      // Si tiene asignación sin fecha_fin o con fecha_fin >= fin de semana → Activo
      const conductoresConAsignacionAlCierreVP = new Set<string>()
      ;(asignacionesConductores || []).forEach((ac: any) => {
        const asignacion = ac.asignaciones
        if (!asignacion) return
        const estadoPadre = (asignacion.estado || '').toLowerCase()
        if (['programado', 'programada', 'cancelado', 'cancelada'].includes(estadoPadre)) return
        const acFin = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10)) : null
        const asigFin = asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : null
        const finEfectivo = acFin || asigFin
        if (!finEfectivo || finEfectivo >= semanaActual.fin) {
          conductoresConAsignacionAlCierreVP.add(ac.conductor_id)
        }
      })

      // Cargar historial de precios para la semana
      const { data: historialPreciosVP } = await (supabase
        .from('conceptos_facturacion_historial') as any)
        .select('codigo, precio_base, precio_final, fecha_vigencia_desde, fecha_vigencia_hasta')
        .in('codigo', ['P001', 'P002', 'P003', 'P013'])
        .lte('fecha_vigencia_desde', fechaFin)
        .gte('fecha_vigencia_hasta', fechaInicio)
      
      // Cargar precios base directamente (evita race condition con preciosAlquiler state)
      const { data: conceptosNominaVP } = await supabase
        .from('conceptos_nomina')
        .select('codigo, precio_base, precio_final')
        .eq('activo', true)
        .in('codigo', ['P001', 'P002', 'P003', 'P013'])
      const preciosBaseVP = new Map<string, number>()
      ;(conceptosNominaVP || []).forEach((c: any) => {
        preciosBaseVP.set(c.codigo, c.precio_base ?? c.precio_final ?? 0)
      })
      
      // Función helper para obtener precio BASE en una fecha específica (IVA se aplica aparte si tiene CUIT)
      const getPrecioEnFechaVP = (codigo: string, fecha: Date): number => {
        const fechaStr = fecha.toISOString().split('T')[0]
        const historial = (historialPreciosVP || []).find((h: any) => 
          h.codigo === codigo && 
          h.fecha_vigencia_desde <= fechaStr && 
          h.fecha_vigencia_hasta >= fechaStr
        )
        if (historial) return historial.precio_base ?? historial.precio_final
        return preciosBaseVP.get(codigo) || 0
      }
      
      // Mapa de código de concepto por modalidad
      const codigosPorModalidadVP: Record<string, string> = {
        'CARGO': 'P002',
        'TURNO_DIURNO': 'P001', 
        'TURNO_NOCTURNO': 'P013'
      }
      
      // Calcular montos por día usando precios históricos
      for (const [conductorId, asignaciones] of asignacionesPorConductorVP.entries()) {
        const prorrateo = prorrateoMap.get(conductorId)
        if (!prorrateo) continue
        
        for (const asig of asignaciones) {
          const codigo = codigosPorModalidadVP[asig.modalidad]
          const montoKey = `monto_${asig.modalidad}` as keyof ProrrateoVistaPrevia
          
          const currentDate = new Date(asig.fechaInicio)
          while (currentDate <= asig.fechaFin) {
            const precioDiario = getPrecioEnFechaVP(codigo, currentDate)
            ;(prorrateo as any)[montoKey] += precioDiario
            currentDate.setDate(currentDate.getDate() + 1)
          }
        }
        
        prorrateo.monto_CARGO = Math.round(prorrateo.monto_CARGO)
        prorrateo.monto_TURNO_DIURNO = Math.round(prorrateo.monto_TURNO_DIURNO)
        prorrateo.monto_TURNO_NOCTURNO = Math.round(prorrateo.monto_TURNO_NOCTURNO)
      }

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
        .select('conductor_id, conductor_nombre, estado, cuotas_pagadas, cuotas_totales, tipo_alquiler, monto_cuota_semanal')

      const garantiasMap = new Map<string, {
        conductor_id: string | null;
        conductor_nombre: string;
        estado: string;
        cuotas_pagadas: number;
        cuotas_totales: number;
        tipo_alquiler: string;
        monto_cuota_semanal: number | null;
      }>((garantias || []).map((g: any) => [g.conductor_nombre?.toLowerCase().trim() || '', g]))

      // 3.1 Cargar datos de Cabify desde la tabla cabify_historico (peajes de la SEMANA ANTERIOR)
      const peajesInicio = format(subWeeks(parseISO(fechaInicio), 1), 'yyyy-MM-dd')
      const peajesFin = format(subWeeks(parseISO(fechaFin), 1), 'yyyy-MM-dd')
      const [{ data: cabifyData }, { data: cabifyPeajesData }] = await Promise.all([
        supabase.from('cabify_historico')
          .select('dni, ganancia_total, cobro_efectivo')
          .gte('fecha_inicio', fechaInicio + 'T00:00:00')
          .lte('fecha_inicio', fechaFin + 'T23:59:59'),
        supabase.from('cabify_historico')
          .select('dni, peajes')
          .gte('fecha_inicio', peajesInicio + 'T00:00:00')
          .lte('fecha_inicio', peajesFin + 'T23:59:59')
      ])

      // Crear mapa de ganancias Cabify por DNI (sumar si hay múltiples registros)
      const cabifyMap = new Map<string, number>()
      ;(cabifyData || []).forEach((record: any) => {
        if (record.dni) {
          const dniNorm = String(record.dni).replace(/^0+/, '')
          const actualGanancia = cabifyMap.get(dniNorm) || 0
          const ganancia = parseFloat(String(record.ganancia_total)) || 0
          cabifyMap.set(dniNorm, actualGanancia + ganancia)
        }
      })
      // Crear mapa de peajes Cabify por DNI (P005) - semana anterior, SIN redondeo
      // Normalizar DNI: quitar ceros adelante para match consistente
      const peajesMap = new Map<string, number>()
      ;(cabifyPeajesData || []).forEach((record: any) => {
        if (record.dni && record.peajes) {
          const dniNorm = String(record.dni).replace(/^0+/, '')
          const actualPeajes = peajesMap.get(dniNorm) || 0
          const peajes = parseFloat(String(record.peajes)) || 0
          peajesMap.set(dniNorm, actualPeajes + peajes)
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
      
      // a) Penalidades aplicadas completas en esta semana
      const { data: penalidadesCompletas } = await (supabase
        .from('penalidades') as any)
        .select('id, conductor_id, monto, detalle, observaciones, tipos_cobro_descuento(categoria, es_a_favor, nombre)')
        .eq('aplicado', true)
        .eq('fraccionado', false)
        .eq('semana_aplicacion', semanaDelPeriodo)
        .eq('anio_aplicacion', anioDelPeriodo)
      
      // b) Cuotas fraccionadas hasta esta semana + pagos para cruzar
      const [cuotasSemanaRes, pagosCuotasPreviewRes, todasCuotasPenIdsPreviewRes] = await Promise.all([
        (supabase
          .from('penalidades_cuotas') as any)
          .select('id, penalidad_id, monto_cuota, numero_cuota, anio, semana')
          .lte('semana', semanaDelPeriodo),
        // Pagos registrados en pagos_conductores para cruzar
        (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .eq('tipo_cobro', 'penalidad_cuota'),
        // TODOS los penalidad_id que tienen cuotas — para excluir de penalidades completas
        (supabase
          .from('penalidades_cuotas') as any)
          .select('penalidad_id')
      ])

      const cuotasPagadasPreviewIds = new Set(
        (pagosCuotasPreviewRes.data || []).map((p: any) => p.referencia_id).filter(Boolean)
      )
      
      // Filtrar: año correcto o sin año, y excluir cuotas pagadas (aplicado=true O en pagos_conductores)
      const cuotasFiltradas = (cuotasSemanaRes.data || []).filter((c: any) => 
        (!c.anio || c.anio <= anioDelPeriodo) && c.aplicado !== true && !cuotasPagadasPreviewIds.has(c.id)
      )

      // Obtener los conductor_id de las penalidades asociadas a las cuotas
      const penalidadIds = [...new Set((cuotasFiltradas || []).map((c: any) => c.penalidad_id).filter(Boolean))]
      
      let penalidadesPadre: any[] = []
      if (penalidadIds.length > 0) {
        const { data: penData } = await (supabase
          .from('penalidades') as any)
          .select('id, conductor_id, cantidad_cuotas, observaciones, fraccionado')
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

      // TODAS las penalidades que tienen cuotas (pagadas o pendientes) — excluir de penalidades completas
      // Si una penalidad tiene cuotas, SOLO se cobra por cuotas, NUNCA el monto completo
      const penIdsConCuotasPreview = new Set(
        (todasCuotasPenIdsPreviewRes.data || []).map((pc: any) => pc.penalidad_id).filter(Boolean)
      )

      const penalidadesMap = new Map<string, number>() // P006 + P007 (cargos)
      const penalidadesDescuentoMap = new Map<string, number>() // P004 (descuentos)
      // Map para guardar el detalle de penalidades por conductor
      const detalleMap = new Map<string, Array<{
        monto: number
        detalle: string
        tipo: 'completa' | 'cuota'
        cuotaNum?: number
        totalCuotas?: number
      }>>()
      
      // Sumar penalidades completas - segmentadas por categoría
      // Excluir fraccionadas: por ID en penalidades_cuotas O por cantidad_cuotas > 1
      ;(penalidadesCompletas || []).forEach((p: any) => {
        if (p.conductor_id && !penIdsConCuotasPreview.has(p.id) && !(p.cantidad_cuotas && p.cantidad_cuotas > 1)) {
          const categoria = p.tipos_cobro_descuento?.categoria
          // NULL categoria = pendiente, excluir del cálculo
          if (!categoria) return

          if (categoria === 'P004') {
            const actual = penalidadesDescuentoMap.get(p.conductor_id) || 0
            penalidadesDescuentoMap.set(p.conductor_id, actual + (p.monto || 0))
          } else {
            // P006, P007 → cargo
            const actual = penalidadesMap.get(p.conductor_id) || 0
            penalidadesMap.set(p.conductor_id, actual + (p.monto || 0))
          }
          
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
      
      // Sumar cuotas fraccionadas (solo de penalidades con fraccionado=true)
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
      
      // Cuota de garantía semanal: precio diario de conceptos_nomina × 7
      const cuotaGarantiaSemanalVP = (preciosBaseVP.get('P003') || 7143) * 7

      // 6. Calcular facturación proyectada para cada conductor
      const facturacionesProyectadas: FacturacionConductor[] = []

      // Deduplicar por DNI (en caso de duplicados en la tabla de control)
      const dnisYaProcesados = new Set<string>()

      for (const control of (conductoresControl || [])) {
        if (dnisYaProcesados.has(control.numero_dni)) continue
        dnisYaProcesados.add(control.numero_dni)

        const conductor = conductoresDataMap.get(control.numero_dni)
        if (!conductor) continue

        const conductorId = conductor.id
        
        // Obtener prorrateo de días y montos por modalidad/horario (con precios históricos)
        const prorrateo = prorrateoMap.get(conductorId) || { 
          CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0,
          monto_CARGO: 0, monto_TURNO_DIURNO: 0, monto_TURNO_NOCTURNO: 0
        }
        const diasTotales = Math.min(7, prorrateo.CARGO + prorrateo.TURNO_DIURNO + prorrateo.TURNO_NOCTURNO)
        
        // Excluir conductores con 0 días, SALVO que tengan penalidades pendientes
        if (diasTotales === 0 && !dnisConPenalidadesVP.has(control.numero_dni)) continue
        
        // Calcular alquiler usando montos pre-calculados con precios históricos (precio_base sin IVA)
        let subtotalAlquiler = prorrateo.monto_CARGO + prorrateo.monto_TURNO_DIURNO + prorrateo.monto_TURNO_NOCTURNO
        // IVA 21% solo si el conductor tiene CUIT
        if (conductor.numero_cuit && subtotalAlquiler > 0) {
          subtotalAlquiler = Math.round(subtotalAlquiler * 1.21)
        }
        
        // Determinar tipo de alquiler predominante para garantía
        const tipoAlquiler: 'CARGO' | 'TURNO' = prorrateo.CARGO > (prorrateo.TURNO_DIURNO + prorrateo.TURNO_NOCTURNO) 
          ? 'CARGO' 
          : 'TURNO'

        // Factor proporcional para garantía (basado en días trabajados)
        const factorProporcional = diasTotales > 0 ? Math.min(1, diasTotales / 7) : 0

        // Garantía
        const conductorNombreCompleto = `${conductor.nombres || ''} ${conductor.apellidos || ''}`.toLowerCase().trim()
        const garantia = garantiasMap.get(conductorNombreCompleto)
        let subtotalGarantia = 0
        let cuotaGarantiaNumero = ''
        const cuotasTotales = tipoAlquiler === 'CARGO'
          ? FACTURACION_CONFIG.GARANTIA_CUOTAS_CARGO
          : FACTURACION_CONFIG.GARANTIA_CUOTAS_TURNO

        if (garantia) {
          if (garantia.estado === 'completada' || garantia.cuotas_pagadas >= garantia.cuotas_totales) {
            subtotalGarantia = 0
            cuotaGarantiaNumero = 'NA'
          } else {
            subtotalGarantia = garantia.monto_cuota_semanal || cuotaGarantiaSemanalVP
            const cuotaActual = garantia.cuotas_pagadas + 1
            cuotaGarantiaNumero = `${cuotaActual} de ${garantia.cuotas_totales}`
          }
        } else {
          subtotalGarantia = cuotaGarantiaSemanalVP
          cuotaGarantiaNumero = `1 de ${cuotasTotales}`
        }

        // Si tiene 0 días (entró solo por penalidades), no cobrar garantía
        if (diasTotales === 0) {
          subtotalGarantia = 0
          cuotaGarantiaNumero = 'NA'
        }

        // Datos por DNI del conductor (normalizado sin ceros adelante)
        const dniConductor = (conductor.numero_dni || '').replace(/^0+/, '')

        // Excesos de KM (P006) - no aplica si tiene 0 días
        const exceso = excesosMap.get(conductorId)
        const montoExcesos = diasTotales === 0 ? 0 : (exceso?.monto || 0)
        const kmExceso = exceso?.kmExceso || 0

        // Peajes de Cabify (P005) - no aplica si tiene 0 días
        const montoPeajes = diasTotales === 0 ? 0 : (peajesMap.get(dniConductor) || 0)

        // Penalidades (P006 + P007 como cargos) - siempre aplica
        const montoPenalidades = penalidadesMap.get(conductorId) || 0
        // Penalidades P004 como descuentos
        const montoPenalidadesDescuento = penalidadesDescuentoMap.get(conductorId) || 0

        // Subtotal cargos (incluye P005, P006, P007)
        const subtotalCargos = subtotalAlquiler + subtotalGarantia + montoExcesos + montoPeajes + montoPenalidades

        // Tickets a favor (descuentos) + P004 de penalidades
        const subtotalDescuentos = (ticketsMap.get(conductorId) || 0) + montoPenalidadesDescuento

        // Saldo anterior y mora - no aplica si tiene 0 días (solo penalidades)
        const saldo = saldosMap.get(conductorId)
        const saldoAnterior = diasTotales === 0 ? 0 : -(saldo?.saldo_actual || 0)
        const diasMora = diasTotales === 0 ? 0 : (saldo?.dias_mora || 0)
        const montoMora = calcularMora(saldoAnterior, diasMora)

        // Total a pagar
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + saldoAnterior + montoMora

        // Datos de Cabify - ganancia semanal del conductor
        const gananciaCabify = cabifyMap.get(dniConductor) || 0
        const cuotaFijaSemanal = subtotalAlquiler + subtotalGarantia
        const cubreCuota = gananciaCabify >= cuotaFijaSemanal

        facturacionesProyectadas.push({
          id: `preview-${conductorId}`,
          periodo_id: 'preview',
          conductor_id: conductorId,
          conductor_nombre: `${(conductor.apellidos || '').toUpperCase()}, ${(conductor.nombres || '').toUpperCase()}`,
          conductor_dni: dniConductor,
          conductor_cuit: conductor.numero_cuit || null,
          vehiculo_id: null,
          vehiculo_patente: control.patente || null,
          tipo_alquiler: tipoAlquiler,
          turnos_base: 7,
          turnos_cobrados: Math.round(factorProporcional * 7),
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
           // Prorrateo desglosado por modalidad
           prorrateo_cargo_dias: prorrateo.CARGO,
           prorrateo_cargo_monto: prorrateo.monto_CARGO,
           prorrateo_diurno_dias: prorrateo.TURNO_DIURNO,
           prorrateo_diurno_monto: prorrateo.monto_TURNO_DIURNO,
           prorrateo_nocturno_dias: prorrateo.TURNO_NOCTURNO,
           prorrateo_nocturno_monto: prorrateo.monto_TURNO_NOCTURNO,
           // Detalle de penalidades para el modal
           penalidades_detalle: detalleMap.get(conductorId) || [],
           // Estado: De baja si tiene fecha_terminacion o no está activo
           // Activo si tiene 7 días O tiene asignación vigente al cierre de la semana
           estado_billing: (() => {
             const ftVP = conductor.fecha_terminacion ? parseISO(conductor.fecha_terminacion) : null
             const esBajaVP = conductor.estado_id !== ESTADO_ACTIVO_ID || (ftVP && ftVP <= semanaActual.fin)
             if (esBajaVP) return 'De baja'
             const tieneAsignacionCierre = conductoresConAsignacionAlCierreVP.has(conductorId)
             return (diasTotales >= 7 || tieneAsignacionCierre) ? 'Activo' : 'Pausa'
           })(),
         })
       }

       // Ordenar por nombre
       facturacionesProyectadas.sort((a, b) => a.conductor_nombre.localeCompare(b.conductor_nombre))

      setVistaPreviaData(facturacionesProyectadas)

    } catch (error) {
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

  // Generar nuevo período (crea el registro en BD y luego recalcula automáticamente)
  async function generarNuevoPeriodo() {
    if (periodo) return // Ya existe un período

    const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
    const anio = getYear(semanaActual.inicio)
    const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
    const fechaFin = format(semanaActual.fin, 'yyyy-MM-dd')

    const result = await Swal.fire({
      title: `<span style="font-size: 18px; font-weight: 600;">Generar Facturación</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">Semana ${semana} - ${anio}</div>
            <div style="color: #6B7280; font-size: 12px; margin-top: 2px;">
              ${format(semanaActual.inicio, 'dd/MM/yyyy', { locale: es })} al ${format(semanaActual.fin, 'dd/MM/yyyy', { locale: es })}
            </div>
          </div>
          <div style="color: #374151; font-size: 12px;">Este proceso creará el período y calculará todos los conceptos de facturación.</div>
        </div>
      `,
      icon: 'question',
      iconColor: '#ff0033',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 380,
    })

    if (!result.isConfirmed) return

    setGenerando(true)
    try {
      // 1. Crear el período en BD con estado 'procesando'
      const { data: nuevoPeriodo, error: errPeriodo } = await (supabase
        .from('periodos_facturacion') as any)
        .insert({
          semana,
          anio,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          estado: 'procesando',
          created_by_name: profile?.full_name || 'Sistema',
          sede_id: sedeActualId || sedeUsuario?.id,
        })
        .select()
        .single()

      if (errPeriodo) throw errPeriodo

      // 2. Setear el período en state y marcar flag para auto-recalcular
      setPeriodo(nuevoPeriodo as PeriodoFacturacion)
      setModoVistaPrevia(false)
      autoRecalcularRef.current = true
      // El useEffect de abajo detectará el cambio y llamará recalcularPeriodoAbierto()
    } catch (error) {
      console.error('Error generando período:', error)
      Swal.fire('Error', 'No se pudo crear el período de facturación', 'error')
      setGenerando(false)
    }
  }

  // Auto-recalcular después de crear un nuevo período
  useEffect(() => {
    if (autoRecalcularRef.current && periodo && periodo.estado === 'procesando') {
      autoRecalcularRef.current = false
      setGenerando(false)
      // Llamar recalcularPeriodoAbierto sin confirmación (ya se confirmó en generarNuevoPeriodo)
      recalcularPeriodoAbierto(true)
    }
  }, [periodo])

  // Recalcular período abierto - REGENERACIÓN COMPLETA desde cero (misma lógica que PeriodosTab)
  async function recalcularPeriodoAbierto(skipConfirm = false) {
    if (!periodo || (periodo.estado !== 'abierto' && periodo.estado !== 'procesando')) {
      Swal.fire('Error', 'Solo se puede recalcular un período abierto', 'error')
      return
    }

    if (!skipConfirm) {
      const confirmResult = await Swal.fire({
        title: '¿Recalcular facturación?',
        html: `
          <p>Esto <strong>eliminará y regenerará TODA la facturación</strong> del período:</p>
          <ul style="text-align:left; margin-top:10px;">
            <li>Alquiler (P001/P002/P013)</li>
            <li>Garantía (P003)</li>
            <li>Tickets a favor (P004)</li>
            <li>Peajes Cabify (P005)</li>
            <li>Excesos de KM (P006)</li>
            <li>Penalidades (P007)</li>
            <li>Multas de Tránsito (P008)</li>
            <li>Mora (P009)</li>
            <li>Cobros Fraccionados (P010)</li>
          </ul>
          <p style="margin-top:10px; color:#b91c1c;"><small>No cierre ni refresque la página durante el proceso.</small></p>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, recalcular',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: 'var(--color-primary)'
      })

      if (!confirmResult.isConfirmed) return
    }

    setRecalculando(true)
    try {
      // 0. Marcar período como 'procesando'
      await (supabase.from('periodos_facturacion') as any)
        .update({ estado: 'procesando', updated_at: new Date().toISOString() })
        .eq('id', periodo.id)
      setPeriodo(prev => prev ? { ...prev, estado: 'procesando' as const } : prev)

      const fechaInicio = periodo.fecha_inicio
      const fechaFin = periodo.fecha_fin
      const semanaNum = periodo.semana
      const anioNum = periodo.anio
      const periodoId = periodo.id
      // Usar sede_id del período (no depender de sedeActualId que puede ser null)
      const sedeDelPeriodo = periodo.sede_id || sedeActualId

      // 1. RESET: Revertir flags de aplicado para registros vinculados a este período
      // Tickets: tienen periodo_aplicado_id
      await (supabase.from('tickets_favor') as any)
        .update({ estado: 'aprobado', periodo_aplicado_id: null, fecha_aplicacion: null })
        .eq('periodo_aplicado_id', periodoId)

      // Excesos: tienen periodo_id
      await (supabase.from('excesos_kilometraje') as any)
        .update({ aplicado: false, fecha_aplicacion: null })
        .eq('periodo_id', periodoId)

      // Penalidades: por fecha del período (solo NO fraccionadas — las fraccionadas se manejan por cuotas)
      await (supabase.from('penalidades') as any)
        .update({ aplicado: false })
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .eq('aplicado', true)
        .eq('fraccionado', false)

      // Cobros fraccionados: por semana/anio (todas las cuotas hasta esta semana)
      await (supabase.from('cobros_fraccionados') as any)
        .update({ aplicado: false, fecha_aplicacion: null })
        .lte('semana', semanaNum)
        .eq('anio', anioNum)

      // 2. BORRAR toda la facturación existente del período
      // Primero leer los totales para revertir las deudas en saldos_conductores
      const { data: factExistentes } = await supabase
        .from('facturacion_conductores')
        .select('id, conductor_id, subtotal_neto, saldo_aplicado')
        .eq('periodo_id', periodoId)

      if (factExistentes && factExistentes.length > 0) {
        const factIds = factExistentes.map((f: any) => f.id)
        await supabase.from('facturacion_detalle').delete().in('facturacion_id', factIds)

        // Revertir solo registros donde saldo_aplicado=true (generados con código nuevo)
        // La facturación vieja nunca escribió al saldo, así que no hay nada que revertir
        for (const fact of factExistentes as any[]) {
          if (!fact.conductor_id || !fact.subtotal_neto || !fact.saldo_aplicado) continue
          const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
            .select('id, saldo_actual')
            .eq('conductor_id', fact.conductor_id)
            .maybeSingle()
          if (saldoExistente) {
            await (supabase.from('saldos_conductores') as any)
              .update({
                saldo_actual: (saldoExistente.saldo_actual || 0) + fact.subtotal_neto,
                ultima_actualizacion: new Date().toISOString()
              })
              .eq('id', saldoExistente.id)
          }
        }
      }
      await supabase.from('facturacion_conductores').delete().eq('periodo_id', periodoId)

      // 3. Cargar conductores desde asignaciones que se solapan con la semana + penalidades pendientes
      const conductoresControl: { numero_dni: string; estado: string; patente: string; modalidad: string; valor_alquiler: number | null }[] = []
      const dnisAgregadosRecalc = new Set<string>()
      const dnisConPenalidadesRecalc = new Set<string>()

      // 3a. Conductores con asignaciones activas/finalizadas que se solapan con la semana
      {
        const { data: asignacionesSemanaRecalc } = await (supabase
          .from('asignaciones_conductores') as any)
          .select(`
            conductor_id, horario, fecha_inicio, fecha_fin, estado,
            asignaciones!inner(horario, estado, fecha_fin, vehiculo_id, vehiculos(patente)),
            conductores!inner(numero_dni, sede_id)
          `)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado'])

        const semInicioRecalc = parseISO(fechaInicio)
        const semFinRecalc = parseISO(fechaFin)

        for (const ac of (asignacionesSemanaRecalc || []) as any[]) {
          const cond = ac.conductores
          const asig = ac.asignaciones
          if (!cond || !asig) continue
          if (sedeDelPeriodo && cond.sede_id !== sedeDelPeriodo) continue

          // Skip PROGRAMADO y huérfanos
          const estadoPadreRecExtra = (asig.estado || '').toLowerCase()
          if (['programado', 'programada'].includes(estadoPadreRecExtra)) continue
          if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadreRecExtra) && !asig.fecha_fin) continue

          // Verificar solapamiento con la semana (normalizar sin hora)
          const acInicioRecExtra = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10)) : new Date('2020-01-01')
          const acFinRecExtra = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10))
            : (asig.fecha_fin ? parseISO(asig.fecha_fin.substring(0, 10)) : new Date('2099-12-31'))
          if (acFinRecExtra < semInicioRecalc || acInicioRecExtra > semFinRecalc) continue

          if (!dnisAgregadosRecalc.has(cond.numero_dni)) {
            dnisAgregadosRecalc.add(cond.numero_dni)
            const modalidad = (asig.horario || '').toUpperCase() === 'CARGO' ? 'CARGO' : 'TURNO'
            conductoresControl.push({
              numero_dni: cond.numero_dni,
              estado: 'Activo',
              patente: asig.vehiculos?.patente || '',
              modalidad,
              valor_alquiler: null
            })
          }
        }
      }

      // 3b. Conductores con penalidades pendientes (cobros de incidencias) en la semana
      {
        const { data: penalidadesPendientesRecalc } = await (supabase
          .from('penalidades') as any)
          .select('conductor_id, conductores!inner(numero_dni, sede_id)')
          .gte('fecha', fechaInicio)
          .lte('fecha', fechaFin)
          .eq('aplicado', false)

        for (const p of (penalidadesPendientesRecalc || []) as any[]) {
          const cond = p.conductores
          if (!cond || !cond.numero_dni) continue
          if (sedeDelPeriodo && cond.sede_id !== sedeDelPeriodo) continue
          if (dnisAgregadosRecalc.has(cond.numero_dni)) continue
          dnisAgregadosRecalc.add(cond.numero_dni)
          dnisConPenalidadesRecalc.add(cond.numero_dni)
          conductoresControl.push({
            numero_dni: cond.numero_dni,
            estado: 'Activo',
            patente: '',
            modalidad: 'TURNO',
            valor_alquiler: null
          })
        }
      }

      if (!conductoresControl || conductoresControl.length === 0) {
        await (supabase.from('periodos_facturacion') as any)
          .update({ estado: 'abierto', total_conductores: 0 })
          .eq('id', periodoId)
        await cargarFacturacion()
        Swal.fire('Aviso', 'No hay conductores con asignaciones ni penalidades en esta semana', 'warning')
        return
      }

      // Obtener datos de conductores desde tabla conductores
      // FILTRAR por sede del período para obtener solo conductores de esta sede
      const dnisControl = conductoresControl.map((c: any) => c.numero_dni)
      let qConductoresRecalc = supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit, estado_id, fecha_terminacion')
        .in('numero_dni', dnisControl)
      if (sedeDelPeriodo) qConductoresRecalc = qConductoresRecalc.eq('sede_id', sedeDelPeriodo)
      const { data: conductoresData } = await qConductoresRecalc

      const conductoresMap = new Map((conductoresData || []).map((c: any) => [c.numero_dni, c]))
      const conductorIdsTemp = (conductoresData || []).map((c: any) => c.id)

      // Cargar asignaciones_conductores para calcular días reales por modalidad
      const { data: asignacionesConductoresRecalc } = await (supabase
        .from('asignaciones_conductores') as any)
        .select(`
          id, conductor_id, horario, fecha_inicio, fecha_fin, estado,
          asignaciones!inner(id, horario, estado, fecha_inicio, fecha_fin)
        `)
        .in('conductor_id', conductorIdsTemp)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado'])

      // Calcular días reales por conductor por modalidad
      interface ProrrateoRecalc {
        CARGO: number; TURNO_DIURNO: number; TURNO_NOCTURNO: number;
      }
      const prorrateoRecalcMap = new Map<string, ProrrateoRecalc>()
      conductorIdsTemp.forEach((id: string) => {
        prorrateoRecalcMap.set(id, { CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0 })
      })

      const fechaInicioSemanaRecalc = parseISO(fechaInicio)
      const fechaFinSemanaRecalc = parseISO(fechaFin)

      // Map de conductor_id → fecha_terminacion (tope de días para conductores de baja)
      const fechaTerminacionMap = new Map<string, Date>()
      for (const [, c] of conductoresMap) {
        if (c.fecha_terminacion) {
          fechaTerminacionMap.set(c.id, parseISO(c.fecha_terminacion))
        }
      }

      for (const ac of (asignacionesConductoresRecalc || []) as any[]) {
        const asignacion = ac.asignaciones
        if (!asignacion) continue

        // Skip PROGRAMADO — asignación no ha iniciado, no cuenta para facturación
        const estadoPadre = (asignacion.estado || '').toLowerCase()
        if (['programado', 'programada'].includes(estadoPadre)) continue
        // Skip orphan: padre finalizado/cancelado sin fecha_fin
        if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asignacion.fecha_fin) continue

        // Fechas: usar conductor > padre > semana como fallback
        // Normalizar a solo fecha (sin hora) — timestamps tienen hora que rompe el conteo
        const acInicio = ac.fecha_inicio ? parseISO(ac.fecha_inicio.substring(0, 10))
          : (asignacion.fecha_inicio ? parseISO(asignacion.fecha_inicio.substring(0, 10)) : fechaInicioSemanaRecalc)
        const acFin = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10))
          : (asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : fechaFinSemanaRecalc)

        if (acFin < fechaInicioSemanaRecalc || acInicio > fechaFinSemanaRecalc) continue

        const efectivoInicio = acInicio < fechaInicioSemanaRecalc ? fechaInicioSemanaRecalc : acInicio
        let efectivoFin = acFin > fechaFinSemanaRecalc ? fechaFinSemanaRecalc : acFin

        // Si el conductor tiene fecha_terminacion, no contar días después de esa fecha
        const fechaTerm = fechaTerminacionMap.get(ac.conductor_id)
        if (fechaTerm && efectivoFin > fechaTerm) {
          efectivoFin = fechaTerm
        }
        const dias = Math.max(0, Math.ceil((efectivoFin.getTime() - efectivoInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        if (dias <= 0) continue

        const prorrateo = prorrateoRecalcMap.get(ac.conductor_id)
        if (!prorrateo) continue

        const modalidadAsignacion = asignacion.horario
        const horarioLower = (ac.horario || '').toLowerCase().trim()
        if (modalidadAsignacion === 'CARGO' || horarioLower === 'todo_dia') {
          prorrateo.CARGO += dias
        } else if (modalidadAsignacion === 'TURNO') {
          if (horarioLower === 'nocturno' || horarioLower === 'n') {
            prorrateo.TURNO_NOCTURNO += dias
          } else {
            prorrateo.TURNO_DIURNO += dias
          }
        } else {
          prorrateo.CARGO += dias
        }
      }

      // Determinar conductores con asignación activa al cierre de la semana
      const conductoresConAsignacionAlCierreRecalc = new Set<string>()
      ;(asignacionesConductoresRecalc || []).forEach((ac: any) => {
        const asignacion = ac.asignaciones
        if (!asignacion) return
        const estadoPadreR = (asignacion.estado || '').toLowerCase()
        if (['programado', 'programada', 'cancelado', 'cancelada'].includes(estadoPadreR)) return
        const acFinR = ac.fecha_fin ? parseISO(ac.fecha_fin.substring(0, 10)) : null
        const asigFinR = asignacion.fecha_fin ? parseISO(asignacion.fecha_fin.substring(0, 10)) : null
        const finEfectivoR = acFinR || asigFinR
        if (!finEfectivoR || finEfectivoR >= fechaFinSemanaRecalc) {
          conductoresConAsignacionAlCierreRecalc.add(ac.conductor_id)
        }
      })

      // Procesar conductores: solo los que tienen al menos 1 día real en la semana
      const ESTADO_ACTIVO_ID_RECALC = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'
      const conductoresProcesados: {
        conductor_id: string; conductor_nombre: string; conductor_dni: string | null;
        conductor_cuit: string | null; vehiculo_patente: string | null;
        dias_turno_diurno: number; dias_turno_nocturno: number; dias_cargo: number; total_dias: number;
        estado_billing: 'Activo' | 'Pausa' | 'De baja';
      }[] = []
      const dnisYaProcesados = new Set<string>()

      for (const control of conductoresControl) {
        if (dnisYaProcesados.has(control.numero_dni)) continue
        dnisYaProcesados.add(control.numero_dni)

        const conductorData = conductoresMap.get(control.numero_dni)
        if (!conductorData) continue

        const prorrateo = prorrateoRecalcMap.get(conductorData.id) || { CARGO: 0, TURNO_DIURNO: 0, TURNO_NOCTURNO: 0 }
        const totalDias = Math.min(7, prorrateo.CARGO + prorrateo.TURNO_DIURNO + prorrateo.TURNO_NOCTURNO)

        // Excluir conductores con 0 días, SALVO que tengan penalidades pendientes
        if (totalDias === 0 && !dnisConPenalidadesRecalc.has(control.numero_dni)) continue

        // Estado: De baja si tiene fecha_terminacion o no está activo
        // Activo si tiene 7 días O tiene asignación vigente al cierre de la semana
        const fechaTermCond = conductorData.fecha_terminacion ? parseISO(conductorData.fecha_terminacion) : null
        const esDeBaja = conductorData.estado_id !== ESTADO_ACTIVO_ID_RECALC
          || (fechaTermCond && fechaTermCond <= fechaFinSemanaRecalc)
        const tieneAsignacionCierreRecalc = conductoresConAsignacionAlCierreRecalc.has(conductorData.id)
        const estadoBilling: 'Activo' | 'Pausa' | 'De baja' = esDeBaja
          ? 'De baja'
          : ((totalDias >= 7 || tieneAsignacionCierreRecalc) ? 'Activo' : 'Pausa')

        conductoresProcesados.push({
          conductor_id: conductorData.id,
          conductor_nombre: `${conductorData.nombres || ''} ${conductorData.apellidos || ''}`.trim(),
          conductor_dni: conductorData.numero_dni,
          conductor_cuit: conductorData.numero_cuit,
          vehiculo_patente: control.patente || null,
          dias_turno_diurno: prorrateo.TURNO_DIURNO,
          dias_turno_nocturno: prorrateo.TURNO_NOCTURNO,
          dias_cargo: prorrateo.CARGO,
          total_dias: totalDias,
          estado_billing: estadoBilling,
        })
      }

      const conductorIds = conductoresProcesados.map(c => c.conductor_id)

      // 4. Obtener conceptos (precios actuales)
      const { data: conceptos } = await supabase.from('conceptos_nomina').select('*').eq('activo', true)
      
      // Precios DIARIOS (precio_base sin IVA)
      const preciosActuales: Record<string, number> = {
        'P001': ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P001')?.precio_base || 42714,
        'P002': ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P002')?.precio_base || 75429,
        'P003': ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P003')?.precio_base || 7143,
        'P013': ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P013')?.precio_base || 32714
      }
      
      // Precios diarios para alquiler
      const precioTurnoDiurno = preciosActuales['P001']
      const precioCargo = preciosActuales['P002']
      const precioTurnoNocturno = preciosActuales['P013']
      // Garantía: precio en conceptos_nomina es DIARIO, multiplicar por 7 para obtener cuota semanal
      const cuotaGarantia = preciosActuales['P003'] * 7
      
      // 5. Obtener datos adicionales en paralelo
      const [penalidadesRes, ticketsRes, saldosRes, excesosRes, cabifyRes, garantiasRes, cobrosRes, multasRes] = await Promise.all([
        (supabase.from('penalidades') as any).select('*, tipos_cobro_descuento(categoria, es_a_favor, nombre)').in('conductor_id', conductorIds).gte('fecha', fechaInicio).lte('fecha', fechaFin).eq('aplicado', false).eq('fraccionado', false),
        (supabase.from('tickets_favor') as any).select('*').in('conductor_id', conductorIds).eq('estado', 'aprobado'),
        (supabase.from('saldos_conductores') as any).select('*').in('conductor_id', conductorIds),
        (supabase.from('excesos_kilometraje') as any).select('*').in('conductor_id', conductorIds).eq('aplicado', false),
        // Peajes de la SEMANA ANTERIOR
        (() => {
          const peajesInicio = format(subWeeks(parseISO(fechaInicio), 1), 'yyyy-MM-dd')
          const peajesFin = format(subWeeks(parseISO(fechaFin), 1), 'yyyy-MM-dd')
          return supabase.from('cabify_historico').select('dni, peajes').gte('fecha_inicio', peajesInicio + 'T00:00:00').lte('fecha_inicio', peajesFin + 'T23:59:59')
        })(),
        (supabase.from('garantias_conductores') as any).select('*').in('conductor_id', conductorIds),
        (supabase.from('cobros_fraccionados') as any).select('*').in('conductor_id', conductorIds).lte('semana', semanaNum).eq('anio', anioNum),
        (supabase.from('multas_historico') as any).select('patente, importe, fecha_infraccion').gte('fecha_infraccion', fechaInicio).lte('fecha_infraccion', fechaFin),
      ])

      // 5b. Cargar penalidades_cuotas (cuotas de penalidades fraccionadas) hasta esta semana + pagos para cruzar
      const [penalidadesCuotasResult, pagosCuotasRecalcRes, todasCuotasPenIdsRes] = await Promise.all([
        (supabase
          .from('penalidades_cuotas') as any)
          .select('*, penalidad:penalidades(id, conductor_id, detalle, cantidad_cuotas, tipos_cobro_descuento(categoria, es_a_favor, nombre))')
          .lte('semana', semanaNum),
        // Pagos registrados para cruzar (penalidad_cuota + cobro_fraccionado)
        (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .in('tipo_cobro', ['penalidad_cuota', 'cobro_fraccionado']),
        // TODOS los penalidad_id que tienen cuotas (pagadas o no) — para excluir de penalidades completas
        (supabase
          .from('penalidades_cuotas') as any)
          .select('penalidad_id')
      ])

      const cuotasPagadasRecalcIds = new Set(
        (pagosCuotasRecalcRes.data || []).map((p: any) => p.referencia_id).filter(Boolean)
      )

      // Filtrar por año correcto (o sin año), conductores del período, y excluir cuotas pagadas (aplicado=true O en pagos_conductores)
      const penalidadesCuotas = (penalidadesCuotasResult.data || []).filter((pc: any) =>
        (!pc.anio || pc.anio <= anioNum) &&
        pc.penalidad?.conductor_id &&
        conductorIds.includes(pc.penalidad.conductor_id) &&
        pc.aplicado !== true &&
        !cuotasPagadasRecalcIds.has(pc.id)
      )

      // TODAS las penalidades que tienen cuotas (pagadas o pendientes) — excluir del cálculo completo
      // Si una penalidad tiene cuotas, SOLO se cobra por cuotas, NUNCA el monto completo
      const penIdsConCuotas = new Set(
        (todasCuotasPenIdsRes.data || []).map((pc: any) => pc.penalidad_id).filter(Boolean)
      )

      const penalidades = penalidadesRes.data || []
      const tickets = ticketsRes.data || []
      const saldos = saldosRes.data || []
      const excesosArr = excesosRes.data || []
      const garantias = garantiasRes.data || []
      // Filtrar cobros fraccionados: excluir pagados (aplicado=true O en pagos_conductores)
      const cobros = (cobrosRes.data || []).filter((c: any) => c.aplicado !== true && !cuotasPagadasRecalcIds.has(c.id))

      // Mapear peajes por DNI (normalizado sin ceros adelante)
      const peajesMap = new Map<string, number>()
      ;((cabifyRes.data || []) as any[]).forEach((r: any) => {
        if (r.dni && r.peajes) {
          const dniNorm = String(r.dni).replace(/^0+/, '')
          peajesMap.set(dniNorm, (peajesMap.get(dniNorm) || 0) + (parseFloat(String(r.peajes)) || 0))
        }
      })

      // Mapear multas por patente
      const multasMap = new Map<string, { monto: number; cantidad: number }>()
      ;((multasRes.data || []) as any[]).forEach((m: any) => {
        if (m.patente) {
          const p = m.patente.toUpperCase().replace(/\s+/g, '')
          const actual = multasMap.get(p) || { monto: 0, cantidad: 0 }
          const importe = typeof m.importe === 'string' ? parseFloat(m.importe.replace(/[^\d.-]/g, '')) || 0 : parseFloat(m.importe) || 0
          multasMap.set(p, { monto: actual.monto + importe, cantidad: actual.cantidad + 1 })
        }
      })

      // 6. Procesar cada conductor - CREAR facturacion_conductores + facturacion_detalle
      let totalCargosGlobal = 0
      let totalDescuentosGlobal = 0
      let conductoresProcesadosCount = 0
      let erroresConsecutivos = 0
      let totalErrores = 0
      let primerError = ''
      setRecalculandoProgreso({ actual: 0, total: conductoresProcesados.length })

      for (const conductor of conductoresProcesados) {
        // Calcular alquiler con precio diario × días
        let alquilerTotal = 0
        const detallesAlquiler: { codigo: string; descripcion: string; dias: number; monto: number }[] = []

        // P001: Turno Diurno
        if (conductor.dias_turno_diurno > 0) {
          const montoDiurno = Math.round(precioTurnoDiurno * conductor.dias_turno_diurno)
          alquilerTotal += montoDiurno
          detallesAlquiler.push({
            codigo: 'P001', 
            descripcion: conductor.dias_turno_diurno < 7 ? `Alquiler Turno Diurno (${conductor.dias_turno_diurno}/7 días)` : 'Alquiler Turno Diurno',
            dias: conductor.dias_turno_diurno, monto: montoDiurno
          })
        }
        // P013: Turno Nocturno
        if (conductor.dias_turno_nocturno > 0) {
          const montoNocturno = Math.round(precioTurnoNocturno * conductor.dias_turno_nocturno)
          alquilerTotal += montoNocturno
          detallesAlquiler.push({
            codigo: 'P013', 
            descripcion: conductor.dias_turno_nocturno < 7 ? `Alquiler Turno Nocturno (${conductor.dias_turno_nocturno}/7 días)` : 'Alquiler Turno Nocturno',
            dias: conductor.dias_turno_nocturno, monto: montoNocturno
          })
        }
        // P002: A Cargo
        if (conductor.dias_cargo > 0) {
          const montoCargo = Math.round(precioCargo * conductor.dias_cargo)
          alquilerTotal += montoCargo
          detallesAlquiler.push({
            codigo: 'P002', 
            descripcion: conductor.dias_cargo < 7 ? `Alquiler a Cargo (${conductor.dias_cargo}/7 días)` : 'Alquiler a Cargo',
            dias: conductor.dias_cargo, monto: montoCargo
          })
        }

        // IVA 21% solo si el conductor tiene CUIT
        if (conductor.conductor_cuit && alquilerTotal > 0) {
          alquilerTotal = Math.round(alquilerTotal * 1.21)
        }

        // Garantía - valor fijo semanal (no proporcional a días trabajados)
        // Si tiene 0 días (entró solo por penalidades), no cobrar garantía
        const factorProporcional = conductor.total_dias / 7
        const garantiaConductor = (garantias as any[]).find((g: any) => g.conductor_id === conductor.conductor_id)
        const cuotaGarantiaProporcional = conductor.total_dias === 0 ? 0 : (garantiaConductor?.monto_cuota_semanal || cuotaGarantia)
        const cuotaActual = (garantiaConductor?.cuotas_pagadas || 0) + 1
        const totalCuotas = garantiaConductor?.total_cuotas || 16

        // Penalidades - segmentar por categoría de tipo_cobro_descuento
        // Excluir penalidades fraccionadas: por ID en penalidades_cuotas O por cantidad_cuotas > 1
        const pensConductor = (penalidades as any[]).filter((p: any) =>
          p.conductor_id === conductor.conductor_id &&
          !penIdsConCuotas.has(p.id) &&
          !(p.cantidad_cuotas && p.cantidad_cuotas > 1)
        )
        const pensP004 = pensConductor.filter((p: any) => p.tipos_cobro_descuento?.categoria === 'P004')
        const pensP006 = pensConductor.filter((p: any) => p.tipos_cobro_descuento?.categoria === 'P006')
        const pensP007 = pensConductor.filter((p: any) => p.tipos_cobro_descuento?.categoria === 'P007')
        // NULL categoria = pendiente, se excluye del cálculo
        const totalPenP004 = pensP004.reduce((sum: number, p: any) => sum + (p.monto || 0), 0) // descuento
        const totalPenP006 = pensP006.reduce((sum: number, p: any) => sum + (p.monto || 0), 0) // cargo
        const totalPenP007 = pensP007.reduce((sum: number, p: any) => sum + (p.monto || 0), 0) // cargo
        const totalPenalidades = totalPenP006 + totalPenP007 // solo cargos

        // Tickets (descuentos)
        const ticketsConductor = (tickets as any[]).filter((t: any) => t.conductor_id === conductor.conductor_id)
        const totalTickets = ticketsConductor.reduce((sum: number, t: any) => sum + (t.monto || 0), 0)

        // Excesos (P006) - no aplica si tiene 0 días
        const excesosConductor = (excesosArr as any[]).filter((e: any) => e.conductor_id === conductor.conductor_id)
        const totalExcesos = conductor.total_dias === 0 ? 0 : excesosConductor.reduce((sum: number, e: any) => sum + (e.monto_total || 0), 0)

        // Peajes (P005) - no aplica si tiene 0 días
        const totalPeajes = conductor.total_dias === 0 ? 0 : (conductor.conductor_dni ? (peajesMap.get(String(conductor.conductor_dni).replace(/^0+/, '')) || 0) : 0)

        // Cobros fraccionados (P010) - calcular monto real de la cuota
        const cobrosConductor = (cobros as any[]).filter((c: any) => c.conductor_id === conductor.conductor_id)
        // Usar monto_cuota solo si es razonable (menor que monto_total), sino calcular desde monto_total/total_cuotas
        const calcularMontoCuota = (c: any) => {
          const mt = c.monto_total || 0
          const mc = c.monto_cuota || 0
          const tc = c.total_cuotas || 1
          // Si monto_cuota es mayor o igual a monto_total, está mal — recalcular
          return (mc > 0 && mc < mt) ? mc : Math.ceil(mt / tc)
        }
        const totalCobros = cobrosConductor.reduce((sum: number, c: any) => sum + calcularMontoCuota(c), 0)

        // Penalidades cuotas (cuotas de penalidades fraccionadas no pagadas hasta esta semana)
        const cuotasConductor = penalidadesCuotas.filter((pc: any) => pc.penalidad?.conductor_id === conductor.conductor_id)
        const totalCuotasPenalidades = cuotasConductor.reduce((sum: number, pc: any) => sum + (pc.monto_cuota || 0), 0)

        // Multas (P008)
        const patenteNorm = (conductor.vehiculo_patente || '').toUpperCase().replace(/\s+/g, '')
        const multasVehiculo = multasMap.get(patenteNorm)
        const montoMultas = multasVehiculo?.monto || 0
        const cantidadMultas = multasVehiculo?.cantidad || 0

        // Saldo anterior y mora - no aplica si tiene 0 días (solo penalidades)
        const saldoConductor = (saldos as any[]).find((s: any) => s.conductor_id === conductor.conductor_id)
        const saldoAnterior = conductor.total_dias === 0 ? 0 : -(saldoConductor?.saldo_actual || 0)
        const diasMora = conductor.total_dias === 0 ? 0 : (saldoAnterior > 0 ? Math.min(saldoConductor?.dias_mora || 0, 7) : 0)
        const montoMora = conductor.total_dias === 0 ? 0 : (saldoAnterior > 0 ? Math.round(saldoAnterior * 0.01 * diasMora) : 0)

        // Totales
        const subtotalCargos = alquilerTotal + cuotaGarantiaProporcional + totalPenalidades + totalExcesos + totalPeajes + montoMora + montoMultas + totalCobros + totalCuotasPenalidades
        const subtotalDescuentos = totalTickets + totalPenP004
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + saldoAnterior

        totalCargosGlobal += subtotalCargos
        totalDescuentosGlobal += subtotalDescuentos

        const diasTurnoTotal = conductor.dias_turno_diurno + conductor.dias_turno_nocturno
        const tipoAlquilerPrincipal = conductor.dias_cargo >= diasTurnoTotal ? 'CARGO' : 'TURNO'

        // INSERT facturacion_conductores
        const { data: factConductor, error: errFact } = await (supabase
          .from('facturacion_conductores') as any)
          .insert({
            periodo_id: periodoId,
            conductor_id: conductor.conductor_id,
            conductor_nombre: conductor.conductor_nombre,
            conductor_dni: conductor.conductor_dni,
            conductor_cuit: conductor.conductor_cuit,
            vehiculo_id: null,
            vehiculo_patente: conductor.vehiculo_patente,
            tipo_alquiler: tipoAlquilerPrincipal,
            turnos_base: 7,
            turnos_cobrados: conductor.total_dias,
            factor_proporcional: factorProporcional,
            subtotal_alquiler: alquilerTotal,
            subtotal_garantia: cuotaGarantiaProporcional,
            subtotal_cargos: subtotalCargos,
            subtotal_descuentos: subtotalDescuentos,
            subtotal_neto: subtotalNeto,
            saldo_anterior: saldoAnterior,
            dias_mora: diasMora,
            monto_mora: montoMora,
            total_a_pagar: totalAPagar,
            estado: 'calculado',
            saldo_aplicado: true
          })
          .select()
          .single()

        if (errFact) {
          totalErrores++
          erroresConsecutivos++
          if (!primerError) primerError = errFact.message || 'Error desconocido al insertar conductor'
          // Si los primeros 3 inserts fallan consecutivamente, es un problema sistémico - abortar
          if (erroresConsecutivos >= 3 && conductoresProcesadosCount === 0) {
            throw new Error(`Error sistémico al insertar conductores (${erroresConsecutivos} fallos consecutivos): ${primerError}`)
          }
          continue
        }
        erroresConsecutivos = 0 // Reset al tener un éxito

        const facturacionId = (factConductor as any).id

        // INSERT detalles de alquiler (P001/P002/P013)
        for (const detalle of detallesAlquiler) {
          // Determinar precio unitario según código
          let precioUnitario = 0
          if (detalle.codigo === 'P001') precioUnitario = precioTurnoDiurno / 7
          else if (detalle.codigo === 'P013') precioUnitario = precioTurnoNocturno / 7
          else if (detalle.codigo === 'P002') precioUnitario = precioCargo / 7
          
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: detalle.codigo,
            concepto_descripcion: detalle.descripcion,
            cantidad: detalle.dias,
            precio_unitario: precioUnitario,
            subtotal: detalle.monto, total: detalle.monto, es_descuento: false
          })
        }

        // P003 - Garantía
        const descripcionGarantia = conductor.total_dias < 7
          ? `Cuota de Garantía ${cuotaActual} de ${totalCuotas} (${conductor.total_dias}/7 días)`
          : `Cuota de Garantía ${cuotaActual} de ${totalCuotas}`
        await (supabase.from('facturacion_detalle') as any).insert({
          facturacion_id: facturacionId,
          concepto_codigo: 'P003', concepto_descripcion: descripcionGarantia,
          cantidad: conductor.total_dias, precio_unitario: cuotaGarantiaProporcional / 7,
          subtotal: cuotaGarantiaProporcional, total: cuotaGarantiaProporcional, es_descuento: false
        })

        // Penalidades segmentadas por categoría (P004 descuento, P006 cargo, P007 cargo)
        // NULL categoria = pendiente, NO se inserta ni se marca aplicada
        const gruposPenalidades: { pens: any[]; codigo: string; esDescuento: boolean }[] = [
          { pens: pensP004, codigo: 'P004', esDescuento: true },
          { pens: pensP006, codigo: 'P006', esDescuento: false },
          { pens: pensP007, codigo: 'P007', esDescuento: false },
        ]
        for (const grupo of gruposPenalidades) {
          for (const pen of grupo.pens) {
            const tipoNombre = (pen as any).tipos_cobro_descuento?.nombre || 'Sin detalle'
            const descripcion = grupo.codigo === 'P004'
              ? `Ticket: ${tipoNombre}`
              : grupo.codigo === 'P006'
                ? `Exceso KM: ${tipoNombre}`
                : `Penalidad: ${tipoNombre}`
            await (supabase.from('facturacion_detalle') as any).insert({
              facturacion_id: facturacionId,
              concepto_codigo: grupo.codigo,
              concepto_descripcion: descripcion,
              cantidad: 1, precio_unitario: (pen as any).monto,
              subtotal: (pen as any).monto, total: (pen as any).monto, es_descuento: grupo.esDescuento,
              referencia_id: (pen as any).id, referencia_tipo: 'penalidad'
            })
            // Marcar como aplicada
            await (supabase.from('penalidades') as any).update({ aplicado: true }).eq('id', (pen as any).id)
          }
        }

        // P004 - Tickets a Favor (descuentos)
        for (const ticket of ticketsConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P004',
            concepto_descripcion: `Ticket: ${(ticket as any).descripcion || (ticket as any).tipo}`,
            cantidad: 1, precio_unitario: (ticket as any).monto,
            subtotal: (ticket as any).monto, total: (ticket as any).monto, es_descuento: true,
            referencia_id: (ticket as any).id, referencia_tipo: 'ticket'
          })
          // Marcar como aplicado
          await (supabase.from('tickets_favor') as any)
            .update({ estado: 'aplicado', periodo_aplicado_id: periodoId, fecha_aplicacion: new Date().toISOString() })
            .eq('id', (ticket as any).id)
        }

        // P006 - Excesos de kilometraje
        for (const exceso of excesosConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P006',
            concepto_descripcion: `Exceso KM: ${(exceso as any).km_exceso || 0} km`,
            cantidad: 1, precio_unitario: (exceso as any).monto_base || 0,
            iva_porcentaje: (exceso as any).iva_porcentaje || 21,
            iva_monto: (exceso as any).iva_monto || 0,
            subtotal: (exceso as any).monto_base || 0,
            total: (exceso as any).monto_total || 0, es_descuento: false,
            referencia_id: (exceso as any).id, referencia_tipo: 'exceso_km'
          })
          // Marcar como aplicado
          await (supabase.from('excesos_kilometraje') as any)
            .update({ aplicado: true, fecha_aplicacion: new Date().toISOString(), periodo_id: periodoId })
            .eq('id', (exceso as any).id)
        }

        // P005 - Peajes de Cabify
        if (totalPeajes > 0) {
          const descPeaje = `Telepeajes (${format(parseISO(fechaInicio), 'dd/MM', { locale: es })} al ${format(parseISO(fechaFin), 'dd/MM/yyyy', { locale: es })})`
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P005', concepto_descripcion: descPeaje,
            cantidad: 1, precio_unitario: totalPeajes,
            subtotal: totalPeajes, total: totalPeajes, es_descuento: false,
            referencia_tipo: 'cabify_peajes'
          })
        }

        // P008 - Multas de tránsito
        if (montoMultas > 0) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P008',
            concepto_descripcion: `Multas de Tránsito (${cantidadMultas})`,
            cantidad: cantidadMultas,
            precio_unitario: Math.round(montoMultas / cantidadMultas),
            subtotal: montoMultas, total: montoMultas, es_descuento: false
          })
        }

        // P009 - Mora
        if (montoMora > 0) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P009',
            concepto_descripcion: `Mora (${diasMora} días al 1%)`,
            cantidad: diasMora,
            precio_unitario: Math.round(saldoAnterior * 0.01),
            subtotal: montoMora, total: montoMora, es_descuento: false
          })
        }

        // P010 - Cobros fraccionados (plan de pagos)
        for (const cobro of cobrosConductor) {
          const montoCuotaReal = calcularMontoCuota(cobro)
          const descripcionCobro = (cobro as any).descripcion || `Cuota ${(cobro as any).numero_cuota} de ${(cobro as any).total_cuotas}`
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P010', concepto_descripcion: descripcionCobro,
            cantidad: 1, precio_unitario: montoCuotaReal,
            subtotal: montoCuotaReal, total: montoCuotaReal, es_descuento: false,
            referencia_id: (cobro as any).id, referencia_tipo: 'cobro_fraccionado'
          })
          // Marcar como aplicado
          await (supabase.from('cobros_fraccionados') as any)
            .update({ aplicado: true, fecha_aplicacion: new Date().toISOString() })
            .eq('id', (cobro as any).id)
        }

        // Penalidades cuotas (cuotas de penalidades fraccionadas no pagadas hasta esta semana)
        for (const cuota of cuotasConductor) {
          const penPadre = cuota.penalidad
          const categoria = penPadre?.tipos_cobro_descuento?.categoria || 'P007'
          const esDescuento = penPadre?.tipos_cobro_descuento?.es_a_favor === true
          const tipoNombre = penPadre?.tipos_cobro_descuento?.nombre || penPadre?.detalle || 'Penalidad fraccionada'
          const descripcionCuota = `Cuota ${cuota.numero_cuota} - ${tipoNombre} (Total: ${penPadre?.cantidad_cuotas || '?'} cuotas)`
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: esDescuento ? 'P004' : categoria,
            concepto_descripcion: descripcionCuota,
            cantidad: 1, precio_unitario: cuota.monto_cuota,
            subtotal: cuota.monto_cuota, total: cuota.monto_cuota, es_descuento: esDescuento,
            referencia_id: cuota.id, referencia_tipo: 'penalidad_cuota'
          })
          // NO marcar como aplicado — eso se hace cuando se PAGA, no cuando se factura
        }

        // Registrar cargos nuevos en saldos_conductores: restar subtotalNeto del saldo
        // IMPORTANTE: solo restar subtotalNeto (cargos nuevos de esta semana), NO totalAPagar
        // porque totalAPagar incluye saldoAnterior que ya está reflejado en el saldo
        if (subtotalNeto !== 0) {
          const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
            .select('id, saldo_actual')
            .eq('conductor_id', conductor.conductor_id)
            .maybeSingle()

          if (saldoExistente) {
            await (supabase.from('saldos_conductores') as any)
              .update({
                saldo_actual: (saldoExistente.saldo_actual || 0) - subtotalNeto,
                ultima_actualizacion: new Date().toISOString()
              })
              .eq('id', saldoExistente.id)
          } else {
            await (supabase.from('saldos_conductores') as any)
              .insert({
                conductor_id: conductor.conductor_id,
                conductor_nombre: conductor.conductor_nombre,
                conductor_dni: conductor.conductor_dni,
                conductor_cuit: conductor.conductor_cuit || null,
                saldo_actual: -subtotalNeto,
                dias_mora: 0,
                ultima_actualizacion: new Date().toISOString()
              })
          }
        }

        conductoresProcesadosCount++
        setRecalculandoProgreso({ actual: conductoresProcesadosCount, total: conductoresProcesados.length })
      }

      // 7. Validar que se procesó al menos un conductor
      if (conductoresProcesadosCount === 0) {
        throw new Error(
          `No se pudo insertar ningún conductor (${totalErrores} errores de ${conductoresProcesados.length} intentos). ` +
          `Primer error: ${primerError || 'desconocido'}. ` +
          `Los datos del período fueron eliminados — regenere desde la pestaña Períodos.`
        )
      }

      // 8. Actualizar totales del período y volver a 'abierto'
      await (supabase.from('periodos_facturacion') as any)
        .update({
          estado: 'abierto',
          total_conductores: conductoresProcesadosCount,
          total_cargos: totalCargosGlobal,
          total_descuentos: totalDescuentosGlobal,
          total_neto: totalCargosGlobal - totalDescuentosGlobal,
          updated_at: new Date().toISOString()
        })
        .eq('id', periodoId)

      // 9. Recargar datos
      await cargarFacturacion()

      if (totalErrores > 0) {
        Swal.fire('Recálculo parcial',
          `${conductoresProcesadosCount} conductores procesados, pero ${totalErrores} fallaron. Error: ${primerError}`,
          'warning')
      } else {
        showSuccess('Recálculo completado', `${conductoresProcesadosCount} conductores regenerados desde cero`)
      }

    } catch (error: any) {
      // Recuperar estado en caso de error
      await (supabase.from('periodos_facturacion') as any)
        .update({ estado: 'abierto' })
        .eq('id', periodo.id)
      setPeriodo(prev => prev ? { ...prev, estado: 'abierto' as const } : prev)
      Swal.fire('Error', error?.message || 'No se pudo recalcular el período', 'error')
    } finally {
      setRecalculando(false)
      setRecalculandoProgreso({ actual: 0, total: 0 })
    }
  }

  // Cerrar período - copia conductores a la semana siguiente
  async function cerrarPeriodo() {
    if (!periodo || periodo.estado !== 'abierto') {
      Swal.fire('Error', 'Solo se puede cerrar un período abierto', 'error')
      return
    }

    const result = await Swal.fire({
      title: 'Cerrar Período',
      html: `
        <p>¿Cerrar el período <strong>Semana ${periodo.semana} - ${periodo.anio}</strong>?</p>
        <p style="margin-top: 10px;">Los conductores del reporte serán copiados a la semana siguiente.</p>
        <p style="color: #ff0033; margin-top: 10px;">Esta acción bloqueará las ediciones del período.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setCerrando(true)
    try {
      // 1. Cambiar estado del período a cerrado
      const { error } = await (supabase
        .from('periodos_facturacion') as any)
        .update({
          estado: 'cerrado',
          fecha_cierre: new Date().toISOString(),
          cerrado_por_name: profile?.full_name || 'Sistema'
        })
        .eq('id', periodo.id)

      if (error) throw error

      // 2. Calcular semana siguiente
      const fechaInicioActual = parseISO(periodo.fecha_inicio)
      const fechaSiguiente = addWeeks(fechaInicioActual, 1)
      const semanaSiguiente = getWeek(fechaSiguiente, { weekStartsOn: 1 })
      const anioSiguiente = getYear(fechaSiguiente)

      // 3. Obtener conductores de la semana que se cierra
      // Usar sede_id del período (no depender de sedeActualId)
      const sedeCierre = periodo.sede_id || sedeActualId
      let qCopy = (supabase
        .from('conductores_semana_facturacion') as any)
        .select('numero_dni, estado, patente, modalidad, valor_alquiler')
        .eq('semana', periodo.semana)
        .eq('anio', periodo.anio)
      if (sedeCierre) qCopy = qCopy.eq('sede_id', sedeCierre)
      const { data: conductoresActuales } = await qCopy

      let conductoresCopiados = 0
      if (conductoresActuales && conductoresActuales.length > 0) {
        // 4. Verificar cuáles ya existen en la semana siguiente
        const dnis = conductoresActuales.map((c: any) => c.numero_dni)
        let qExist = (supabase
          .from('conductores_semana_facturacion') as any)
          .select('numero_dni')
          .eq('semana', semanaSiguiente)
          .eq('anio', anioSiguiente)
        if (sedeCierre) qExist = qExist.eq('sede_id', sedeCierre)
        const { data: yaExistentes } = await qExist
          .in('numero_dni', dnis)

        const dnisExistentes = new Set((yaExistentes || []).map((c: any) => c.numero_dni))
        const nuevos = conductoresActuales.filter((c: any) => !dnisExistentes.has(c.numero_dni))

        // 5. Insertar conductores nuevos en la semana siguiente
        if (nuevos.length > 0) {
          const registros = nuevos.map((c: any) => ({
            numero_dni: c.numero_dni,
            semana: semanaSiguiente,
            anio: anioSiguiente,
            estado: c.estado,
            patente: c.patente,
            modalidad: c.modalidad,
            valor_alquiler: c.valor_alquiler,
            sede_id: sedeCierre || sedeUsuario?.id,
          }))

          const { error: insertError } = await (supabase
            .from('conductores_semana_facturacion') as any)
            .insert(registros)
          
          if (insertError) {
            throw new Error(`Error copiando conductores: ${insertError.message}`)
          }
          
          conductoresCopiados = nuevos.length
        }

        showSuccess('Período Cerrado', `${conductoresCopiados} conductores copiados a semana ${semanaSiguiente}/${anioSiguiente}`)
      } else {
        showSuccess('Período Cerrado', 'No había conductores para copiar')
      }

      // 6. Actualizar estado local
      setPeriodo(prev => prev ? { 
        ...prev, 
        estado: 'cerrado' as const, 
        fecha_cierre: new Date().toISOString(),
        cerrado_por_name: profile?.full_name || 'Sistema'
      } : prev)

    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo cerrar el período', 'error')
    } finally {
      setCerrando(false)
    }
  }

  // Ver detalle de facturación
  async function verDetalle(facturacion: FacturacionConductor) {
    setLoadingDetalle(true)
    setShowDetalle(true)
    setDetalleFacturacion(facturacion)

    // En modo Vista Previa, generar detalles simulados desde los datos calculados
    if (modoVistaPrevia || facturacion.id.startsWith('preview-')) {
      const detallesSimulados: FacturacionDetalle[] = []
      const totalDias = facturacion.turnos_cobrados
      const diasDesc = totalDias < 7 ? ` (${totalDias}/7 días)` : ''

      // === CARGOS (A PAGAR) ===

      // P002 - Alquiler a Cargo
      const cargoDias = facturacion.prorrateo_cargo_dias || 0
      const cargoMonto = facturacion.prorrateo_cargo_monto || 0
      if (cargoDias > 0 && cargoMonto > 0) {
        let montoConIva = cargoMonto
        if (facturacion.conductor_cuit) montoConIva = Math.round(cargoMonto * 1.21)
        detallesSimulados.push({
          id: `det-cargo-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P002',
          concepto_descripcion: `Alquiler a Cargo (${cargoDias}/7 días)`,
          cantidad: cargoDias,
          precio_unitario: Math.round(montoConIva / cargoDias),
          subtotal: montoConIva,
          total: montoConIva,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P001 - Alquiler Turno Diurno
      const diurnoDias = facturacion.prorrateo_diurno_dias || 0
      const diurnoMonto = facturacion.prorrateo_diurno_monto || 0
      if (diurnoDias > 0 && diurnoMonto > 0) {
        let montoConIva = diurnoMonto
        if (facturacion.conductor_cuit) montoConIva = Math.round(diurnoMonto * 1.21)
        detallesSimulados.push({
          id: `det-diurno-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P001',
          concepto_descripcion: `Alquiler Turno Diurno (${diurnoDias}/7 días)`,
          cantidad: diurnoDias,
          precio_unitario: Math.round(montoConIva / diurnoDias),
          subtotal: montoConIva,
          total: montoConIva,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P013 - Alquiler Turno Nocturno
      const nocturnoDias = facturacion.prorrateo_nocturno_dias || 0
      const nocturnoMonto = facturacion.prorrateo_nocturno_monto || 0
      if (nocturnoDias > 0 && nocturnoMonto > 0) {
        let montoConIva = nocturnoMonto
        if (facturacion.conductor_cuit) montoConIva = Math.round(nocturnoMonto * 1.21)
        detallesSimulados.push({
          id: `det-nocturno-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P013',
          concepto_descripcion: `Alquiler Turno Nocturno (${nocturnoDias}/7 días)`,
          cantidad: nocturnoDias,
          precio_unitario: Math.round(montoConIva / nocturnoDias),
          subtotal: montoConIva,
          total: montoConIva,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P003 - Garantía
      if (facturacion.subtotal_garantia > 0) {
        detallesSimulados.push({
          id: `det-garantia-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P003',
          concepto_descripcion: `Cuota de Garantía${facturacion.cuota_garantia_numero ? ` ${facturacion.cuota_garantia_numero}` : ''}${diasDesc}`,
          cantidad: 1,
          precio_unitario: facturacion.subtotal_garantia,
          subtotal: facturacion.subtotal_garantia,
          total: facturacion.subtotal_garantia,
          es_descuento: false,
          referencia_id: null,
          referencia_tipo: null
        })
      }

      // P005 - Peajes Cabify
      if ((facturacion.monto_peajes || 0) > 0) {
        detallesSimulados.push({
          id: `det-peajes-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P005',
          concepto_descripcion: 'Peajes Cabify (semana anterior)',
          cantidad: 1,
          precio_unitario: facturacion.monto_peajes!,
          subtotal: facturacion.monto_peajes!,
          total: facturacion.monto_peajes!,
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

      // Penalidades completas - Filtrar por semana de aplicación
      const semDetalle = periodo?.semana || getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anioDetalle = periodo?.anio || getYear(semanaActual.inicio)

      const { data: penalidades } = await (supabase
        .from('penalidades') as any)
        .select('id, monto, observaciones, fraccionado, cantidad_cuotas, semana_aplicacion, anio_aplicacion, tipos_cobro_descuento(categoria, es_a_favor, nombre)')
        .eq('conductor_id', facturacion.conductor_id)
        .eq('aplicado', true)
        .eq('fraccionado', false)
        .eq('semana_aplicacion', semDetalle)
        .eq('anio_aplicacion', anioDetalle)

      // Penalidades que tienen cuotas (excluir del listado completo)
      const { data: penIdsConCuotasDet } = await (supabase
        .from('penalidades_cuotas') as any)
        .select('penalidad_id')
      const penConCuotasSet = new Set((penIdsConCuotasDet || []).map((p: any) => p.penalidad_id))

      ;(penalidades || []).forEach((p: any, idx: number) => {
        if (penConCuotasSet.has(p.id)) return // Tiene cuotas, se cobra por cuota
        const categoria = p.tipos_cobro_descuento?.categoria
        if (!categoria) {
          detallesSimulados.push({
            id: `det-pen-pendiente-${facturacion.conductor_id}-${idx}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'PEND',
            concepto_descripcion: `[PENDIENTE] ${p.observaciones || 'Sin tipo asignado'}`,
            cantidad: 1, precio_unitario: p.monto, subtotal: p.monto, total: p.monto,
            es_descuento: false, referencia_id: p.id, referencia_tipo: 'penalidad'
          })
          return
        }
        const tipoNombre = p.tipos_cobro_descuento?.nombre || p.observaciones || 'Sin detalle'
        const esDescuento = categoria === 'P004'
        const descripcion = esDescuento ? `Ticket: ${tipoNombre}` : `Penalidad: ${tipoNombre}`
        detallesSimulados.push({
          id: `det-pen-${facturacion.conductor_id}-${idx}`,
          facturacion_id: facturacion.id,
          concepto_codigo: categoria,
          concepto_descripcion: descripcion,
          cantidad: 1, precio_unitario: p.monto, subtotal: p.monto, total: p.monto,
          es_descuento: esDescuento, referencia_id: p.id, referencia_tipo: 'penalidad'
        })
      })

      // Cuotas fraccionadas de penalidades para esta semana
      {
        const { data: cuotasSemDet } = await (supabase
          .from('penalidades_cuotas') as any)
          .select('id, penalidad_id, monto_cuota, numero_cuota')
          .lte('semana', semDetalle)
        const { data: pagosCuotasDet } = await (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .eq('tipo_cobro', 'penalidad_cuota')
        const cuotasPagadasIds = new Set((pagosCuotasDet || []).map((p: any) => p.referencia_id))

        // Obtener conductor_id y total cuotas de las penalidades padre
        const penIdsCuotas = [...new Set((cuotasSemDet || []).map((c: any) => c.penalidad_id))]
        let penPadreCuotas: any[] = []
        if (penIdsCuotas.length > 0) {
          const { data } = await (supabase.from('penalidades') as any)
            .select('id, conductor_id, cantidad_cuotas, observaciones')
            .in('id', penIdsCuotas)
          penPadreCuotas = data || []
        }
        const penPadreMap = new Map(penPadreCuotas.map((p: any) => [p.id, p]))

        ;(cuotasSemDet || []).filter((c: any) => c.aplicado !== true && !cuotasPagadasIds.has(c.id)).forEach((cuota: any, idx: number) => {
          const padre = penPadreMap.get(cuota.penalidad_id) as any
          if (!padre || padre.conductor_id !== facturacion.conductor_id) return
          detallesSimulados.push({
            id: `det-cuota-${facturacion.conductor_id}-${idx}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'P007',
            concepto_descripcion: `Cuota ${cuota.numero_cuota}/${padre.cantidad_cuotas || '?'}: ${padre.observaciones || 'Cobro fraccionado'}`,
            cantidad: 1, precio_unitario: cuota.monto_cuota, subtotal: cuota.monto_cuota, total: cuota.monto_cuota,
            es_descuento: false, referencia_id: cuota.id, referencia_tipo: 'penalidad_cuota'
          })
        })
      }

      // P010 - Cobros fraccionados (plan de pagos) de esta semana
      {
        const { data: cobrosDetalle } = await (supabase
          .from('cobros_fraccionados') as any)
          .select('*')
          .eq('conductor_id', facturacion.conductor_id)
          .lte('semana', semDetalle)
          .eq('anio', anioDetalle)

        const { data: pagosCobrosDetalle } = await (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .eq('tipo_cobro', 'cobro_fraccionado')
        const cobrosDetallePagadosIds = new Set(
          (pagosCobrosDetalle || []).map((p: any) => p.referencia_id).filter(Boolean)
        )

        ;((cobrosDetalle || []).filter((c: any) => c.aplicado !== true && !cobrosDetallePagadosIds.has(c.id))).forEach((cobro: any, idx: number) => {
          const mt = cobro.monto_total || 0
          const mc = cobro.monto_cuota || 0
          const tc = cobro.total_cuotas || 1
          const montoCuotaReal = (mc > 0 && mc < mt) ? mc : Math.ceil(mt / tc)
          detallesSimulados.push({
            id: `det-cobro-${facturacion.conductor_id}-${idx}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'P010',
            concepto_descripcion: cobro.descripcion || `Cuota ${cobro.numero_cuota} de ${cobro.total_cuotas}`,
            cantidad: 1, precio_unitario: montoCuotaReal, subtotal: montoCuotaReal, total: montoCuotaReal,
            es_descuento: false, referencia_id: cobro.id, referencia_tipo: 'cobro_fraccionado'
          })
        })
      }

      // P008 - Multas de tránsito (por patente del conductor)
      if (facturacion.vehiculo_patente) {
        const patenteNorm = facturacion.vehiculo_patente.toUpperCase().replace(/\s+/g, '')
        const fechaInicioMul = periodo?.fecha_inicio || format(semanaActual.inicio, 'yyyy-MM-dd')
        const fechaFinMul = periodo?.fecha_fin || format(semanaActual.fin, 'yyyy-MM-dd')
        const { data: multasDet } = await (supabase
          .from('multas') as any)
          .select('id, monto, fecha')
          .ilike('patente', patenteNorm)
          .gte('fecha', fechaInicioMul)
          .lte('fecha', fechaFinMul)
          .eq('aplicado', false)
        if (multasDet && multasDet.length > 0) {
          const montoMultasDet = multasDet.reduce((s: number, m: any) => s + (m.monto || 0), 0)
          detallesSimulados.push({
            id: `det-multas-${facturacion.conductor_id}`,
            facturacion_id: facturacion.id,
            concepto_codigo: 'P008',
            concepto_descripcion: `Multas de Tránsito (${multasDet.length})`,
            cantidad: multasDet.length,
            precio_unitario: Math.round(montoMultasDet / multasDet.length),
            subtotal: montoMultasDet, total: montoMultasDet,
            es_descuento: false, referencia_id: null, referencia_tipo: null
          })
        }
      }

      // === DESCUENTOS ===

      // P004 - Tickets a Favor
      if (facturacion.subtotal_descuentos > 0) {
        detallesSimulados.push({
          id: `det-tickets-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'P004',
          concepto_descripcion: 'Tickets a Favor',
          cantidad: 1, precio_unitario: facturacion.subtotal_descuentos,
          subtotal: facturacion.subtotal_descuentos, total: facturacion.subtotal_descuentos,
          es_descuento: true, referencia_id: null, referencia_tipo: null
        })
      }

      // Saldo anterior (deuda pendiente)
      if (facturacion.saldo_anterior > 0) {
        detallesSimulados.push({
          id: `det-saldo-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo Anterior (deuda)',
          cantidad: 1, precio_unitario: facturacion.saldo_anterior,
          subtotal: facturacion.saldo_anterior, total: facturacion.saldo_anterior,
          es_descuento: false, referencia_id: null, referencia_tipo: null
        })
      } else if (facturacion.saldo_anterior < 0) {
        detallesSimulados.push({
          id: `det-saldo-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo a Favor',
          cantidad: 1, precio_unitario: Math.abs(facturacion.saldo_anterior),
          subtotal: Math.abs(facturacion.saldo_anterior), total: Math.abs(facturacion.saldo_anterior),
          es_descuento: true, referencia_id: null, referencia_tipo: null
        })
      }

      // Mora (1% diario)
      if (facturacion.monto_mora > 0) {
        detallesSimulados.push({
          id: `det-mora-${facturacion.conductor_id}`,
          facturacion_id: facturacion.id,
          concepto_codigo: 'MORA',
          concepto_descripcion: `Mora (${facturacion.dias_mora} días al 1%)`,
          cantidad: facturacion.dias_mora, precio_unitario: Math.round(facturacion.monto_mora / facturacion.dias_mora),
          subtotal: facturacion.monto_mora, total: facturacion.monto_mora,
          es_descuento: false, referencia_id: null, referencia_tipo: null
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

      // Usar directamente los detalles de facturacion_detalle sin modificar
      // Las penalidades ya están guardadas correctamente en facturacion_detalle cuando se generó el periodo
      setDetalleItems((detalles || []) as FacturacionDetalle[])

      // Cargar pagos registrados para esta facturación
      const { data: pagos } = await (supabase.from('pagos_conductores') as any)
        .select('id, monto, referencia, semana, anio, fecha_pago, tipo_cobro')
        .eq('referencia_id', facturacion.id)
        .eq('tipo_cobro', 'facturacion_semanal')
        .order('fecha_pago', { ascending: false })
      setDetallePagos(pagos || [])
    } catch {
      Swal.fire('Error', 'No se pudo cargar el detalle', 'error')
      setShowDetalle(false)
    } finally {
      setLoadingDetalle(false)
    }
  }

  // ==========================================
  // ELIMINAR PAGO REGISTRADO
  // ==========================================
  async function eliminarPago(pagoId: string, monto: number, conductorId: string, facturacionId: string) {
    const confirm = await Swal.fire({
      title: 'Eliminar Pago',
      html: `<p style="font-size:13px;">Se eliminará el pago de <strong>${formatCurrency(monto)}</strong> y se revertirá el saldo.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    })
    if (!confirm.isConfirmed) return

    try {
      // 1. Eliminar el pago
      const { error: errPago } = await (supabase.from('pagos_conductores') as any)
        .delete().eq('id', pagoId)
      if (errPago) throw errPago

      // 2. Revertir saldo (restar el monto del pago)
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual').eq('conductor_id', conductorId).maybeSingle()
      if (saldoExistente) {
        await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: (saldoExistente.saldo_actual || 0) - monto,
            ultima_actualizacion: new Date().toISOString()
          }).eq('id', saldoExistente.id)
      }

      // 3. Eliminar abono correspondiente (mismo monto, misma fecha aprox)
      const { data: abonos } = await (supabase.from('abonos_conductores') as any)
        .select('id').eq('conductor_id', conductorId).eq('tipo', 'abono').eq('monto', monto)
        .limit(1)
      if (abonos && abonos.length > 0) {
        await (supabase.from('abonos_conductores') as any).delete().eq('id', abonos[0].id)
      }

      // 4. Recalcular estado: verificar si queda algún pago que cubra el total
      const { data: pagosRestantes } = await (supabase.from('pagos_conductores') as any)
        .select('monto').eq('referencia_id', facturacionId).eq('tipo_cobro', 'facturacion_semanal')
      const totalCobrado = (pagosRestantes || []).reduce((s: number, p: { monto: number }) => s + p.monto, 0)
      const { data: factData } = await (supabase.from('facturacion_conductores') as any)
        .select('total_a_pagar').eq('id', facturacionId).single()
      const totalAPagar = Math.abs(factData?.total_a_pagar || 0)

      const nuevoEstado = totalCobrado >= totalAPagar ? 'pagado' : 'cerrado'
      await (supabase.from('facturacion_conductores') as any)
        .update({ estado: nuevoEstado }).eq('id', facturacionId)

      showSuccess('Pago Eliminado', `Se eliminó el pago de ${formatCurrency(monto)}`)
      // Recargar datos
      await cargarFacturacion()
      setShowDetalle(false)
      setDetalleFacturacion(null)
      setDetalleItems([])
      setDetallePagos([])
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar el pago', 'error')
    }
  }

  // ==========================================
  // EDITAR MONTO DE PAGO REGISTRADO
  // ==========================================
  async function editarMontoPago(pagoId: string, montoActual: number, conductorId: string, facturacionId: string) {
    const { value: nuevoMonto } = await Swal.fire({
      title: 'Editar Monto',
      input: 'number',
      inputValue: montoActual,
      inputLabel: `Monto actual: ${formatCurrency(montoActual)}`,
      inputAttributes: { step: '0.01', min: '0.01' },
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7C3AED',
      preConfirm: (val) => {
        if (!val || parseFloat(val) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        return parseFloat(val)
      }
    })
    if (!nuevoMonto) return

    const diferencia = nuevoMonto - montoActual

    try {
      // 1. Actualizar monto del pago
      const { error: errPago } = await (supabase.from('pagos_conductores') as any)
        .update({ monto: nuevoMonto }).eq('id', pagoId)
      if (errPago) throw errPago

      // 2. Ajustar saldo (sumar la diferencia)
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual').eq('conductor_id', conductorId).maybeSingle()
      if (saldoExistente) {
        await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: (saldoExistente.saldo_actual || 0) + diferencia,
            ultima_actualizacion: new Date().toISOString()
          }).eq('id', saldoExistente.id)
      }

      // 3. Actualizar abono correspondiente
      const { data: abonos } = await (supabase.from('abonos_conductores') as any)
        .select('id').eq('conductor_id', conductorId).eq('tipo', 'abono').eq('monto', montoActual)
        .limit(1)
      if (abonos && abonos.length > 0) {
        await (supabase.from('abonos_conductores') as any)
          .update({ monto: nuevoMonto }).eq('id', abonos[0].id)
      }

      // 4. Recalcular estado
      const { data: pagosRestantes } = await (supabase.from('pagos_conductores') as any)
        .select('monto').eq('referencia_id', facturacionId).eq('tipo_cobro', 'facturacion_semanal')
      const totalCobrado = (pagosRestantes || []).reduce((s: number, p: { monto: number }) => s + p.monto, 0)
      const { data: factData } = await (supabase.from('facturacion_conductores') as any)
        .select('total_a_pagar').eq('id', facturacionId).single()
      const totalAPagar = Math.abs(factData?.total_a_pagar || 0)

      const nuevoEstado = totalCobrado >= totalAPagar ? 'pagado' : 'cerrado'
      await (supabase.from('facturacion_conductores') as any)
        .update({ estado: nuevoEstado }).eq('id', facturacionId)

      showSuccess('Pago Editado', `Monto actualizado a ${formatCurrency(nuevoMonto)}`)
      await cargarFacturacion()
      setShowDetalle(false)
      setDetalleFacturacion(null)
      setDetalleItems([])
      setDetallePagos([])
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo editar el pago', 'error')
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

    // Cargar conceptos individuales de facturacion_detalle
    const { data: detalles } = await supabase
      .from('facturacion_detalle')
      .select('*')
      .eq('facturacion_id', facturacion.id)
      .order('es_descuento')
      .order('concepto_codigo')

    // Labels para códigos de concepto
    const conceptoLabels: Record<string, string> = {
      'P001': 'Alquiler a Cargo', 'P002': 'Alquiler Turno', 'P003': 'Cuota de Garantía',
      'P004': 'Tickets/Descuentos', 'P005': 'Telepeajes', 'P006': 'Exceso KM',
      'P007': 'Penalidades', 'P008': 'Multas de Tránsito', 'P009': 'Mora', 'P010': 'Plan de Pagos',
    }

    const formatDesc = (codigo: string, desc: string) => {
      const label = conceptoLabels[codigo]
      if (!label) return desc
      if (desc.includes('Alquiler') || desc.includes('Garantía') || desc.includes('Telepeaje') ||
          desc.includes('Ticket') || desc.includes('Exceso') || desc.includes('Penalidad') ||
          desc.includes('Multa') || desc.includes('Mora') || desc.includes('Cuota') ||
          desc.includes('Comisión') || desc.includes('Descuento')) return desc
      return desc ? `${label} (${desc})` : label
    }

    // Construir HTML de conceptos con checkboxes
    const cargos = (detalles || []).filter((d: { es_descuento: boolean }) => !d.es_descuento)
    const descuentos = (detalles || []).filter((d: { es_descuento: boolean }) => d.es_descuento)

    // Estilo base para indicadores
    const indStyle = 'width:18px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;'

    let conceptosHtml = ''
    for (const det of cargos) {
      const d = det as { id: string; concepto_codigo: string; concepto_descripcion: string; total: number; es_descuento: boolean }
      conceptosHtml += `
        <div class="pago-row" data-monto="${d.total}" data-type="cargo" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span class="pago-ind" style="${indStyle}background:#16a34a;color:white;">✓</span>
          <span style="flex:1;font-size:12px;">${formatDesc(d.concepto_codigo, d.concepto_descripcion)}</span>
          <span style="font-size:12px;font-weight:600;">${formatCurrency(d.total)}</span>
        </div>`
    }
    for (const det of descuentos) {
      const d = det as { id: string; concepto_codigo: string; concepto_descripcion: string; total: number; es_descuento: boolean }
      conceptosHtml += `
        <div class="pago-row" data-monto="${d.total}" data-type="descuento" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span class="pago-ind" style="${indStyle}background:#16a34a;color:white;">✓</span>
          <span style="flex:1;font-size:12px;color:#16a34a;">${formatDesc(d.concepto_codigo, d.concepto_descripcion)}</span>
          <span style="font-size:12px;font-weight:600;color:#16a34a;">-${formatCurrency(d.total)}</span>
        </div>`
    }

    // Saldo anterior
    let saldoHtml = ''
    if (facturacion.saldo_anterior !== 0) {
      const saldoColor = facturacion.saldo_anterior > 0 ? '#ff0033' : '#16a34a'
      const saldoPrefix = facturacion.saldo_anterior > 0 ? '' : '-'
      const saldoType = facturacion.saldo_anterior > 0 ? 'cargo' : 'descuento'
      saldoHtml = `
        <div class="pago-row" data-monto="${Math.abs(facturacion.saldo_anterior)}" data-type="${saldoType}" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span class="pago-ind" style="${indStyle}background:#16a34a;color:white;">✓</span>
          <span style="flex:1;font-size:12px;color:${saldoColor};">Saldo Anterior</span>
          <span style="font-size:12px;font-weight:600;color:${saldoColor};">${saldoPrefix}${formatCurrency(Math.abs(facturacion.saldo_anterior))}</span>
        </div>`
    }

    // Mora - solo mostrar si no existe P009 en los detalles (evitar duplicado)
    const tieneP009Detalle = cargos.some((d: { concepto_codigo: string }) => d.concepto_codigo === 'P009')
    let moraHtml = ''
    if (facturacion.monto_mora > 0 && !tieneP009Detalle) {
      moraHtml = `
        <div class="pago-row" data-monto="${facturacion.monto_mora}" data-type="cargo" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span class="pago-ind" style="${indStyle}background:#16a34a;color:white;">✓</span>
          <span style="flex:1;font-size:12px;">Mora (${facturacion.dias_mora} días)</span>
          <span style="font-size:12px;font-weight:600;">${formatCurrency(facturacion.monto_mora)}</span>
        </div>`
    }

    const totalAbsoluto = Math.abs(facturacion.total_a_pagar)
    const yaCobrado = facturacion.monto_cobrado || 0
    const montoPendiente = Math.max(0, totalAbsoluto - yaCobrado)

    let semanaOptionsHtml = ''
    for (let s = 1; s <= 52; s++) {
      const selected = s === semanaHoy ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

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
          </div>
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: 600; color: #374151; display: block; margin-bottom: 6px;">Detalle de conceptos:</label>
            <div id="swal-conceptos" style="padding: 6px 8px; background: white; border-radius: 4px; border: 1px solid #E5E7EB; max-height: 200px; overflow-y: auto;">
              ${conceptosHtml}
              ${moraHtml}
              ${saldoHtml}
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; margin-top: 6px; padding: 6px 8px; background: #F3F4F6; border-radius: 4px;">
               <span>TOTAL:</span>
               <span>${formatCurrency(totalAbsoluto)}</span>
            </div>
            ${yaCobrado > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; padding: 6px 8px; background: #F0FDF4; border-radius: 4px; border: 1px solid #BBF7D0;">
              <span style="color: #166534; font-weight: 600;">Ya cobrado:</span>
              <span style="color: #16a34a; font-weight: 700;">${formatCurrency(yaCobrado)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; padding: 6px 8px; background: #FEF2F2; border-radius: 4px; border: 1px solid #FECACA;">
              <span style="color: #991B1B; font-weight: 600;">Resta cobrar:</span>
              <span style="color: #dc2626; font-weight: 700;">${formatCurrency(montoPendiente)}</span>
            </div>` : ''}
           </div>
           <div style="margin-bottom: 12px;">
             <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto a pagar:</label>
             <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${montoPendiente.toFixed(2)}">
          </div>
          <div id="swal-saldo-pendiente-row" style="display: none; padding: 6px 8px; background: #FEF2F2; border-radius: 4px; margin-bottom: 12px; border: 1px solid #FECACA;">
            <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 12px;">
              <span style="color: #991B1B;">Saldo pendiente (se genera como deuda):</span>
              <span id="swal-saldo-pendiente" style="color: #dc2626;">$0</span>
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
      width: 480,
      didOpen: () => {
        const montoInput = document.getElementById('swal-monto') as HTMLInputElement
        const saldoRow = document.getElementById('swal-saldo-pendiente-row') as HTMLElement
        const saldoEl = document.getElementById('swal-saldo-pendiente') as HTMLElement
        const totalFull = montoPendiente

        const updateIndicators = () => {
          const montoVal = parseFloat(montoInput?.value) || 0
          let restante = montoVal
          const rows = document.querySelectorAll('.pago-row') as NodeListOf<HTMLElement>

          rows.forEach(row => {
            const amount = parseFloat(row.dataset.monto || '0')
            const type = row.dataset.type
            const ind = row.querySelector('.pago-ind') as HTMLElement
            if (!ind) return

            if (type === 'descuento') {
              ind.textContent = '✓'
              ind.style.background = '#16a34a'
              ind.style.color = 'white'
              restante += amount
              return
            }

            if (restante >= amount) {
              ind.textContent = '✓'
              ind.style.background = '#16a34a'
              ind.style.color = 'white'
              restante -= amount
            } else if (restante > 0) {
              ind.textContent = '—'
              ind.style.background = '#f59e0b'
              ind.style.color = 'white'
              restante = 0
            } else {
              ind.textContent = '✗'
              ind.style.background = '#e5e7eb'
              ind.style.color = '#9ca3af'
            }
          })

          const pendiente = totalFull - montoVal
          if (pendiente > 0) {
            saldoRow.style.display = 'block'
            saldoEl.textContent = '$ ' + Math.round(pendiente).toLocaleString('en-US')
          } else {
            saldoRow.style.display = 'none'
          }
        }

        montoInput?.addEventListener('input', updateIndicators)
        updateIndicators()
      },
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
      // La deuda ya fue registrada al GENERAR (saldo -= total_a_pagar)
      // El pago simplemente suma al saldo
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual')
        .eq('conductor_id', facturacion.conductor_id)
        .maybeSingle()

      if (saldoExistente) {
        const saldoAcumulado = (saldoExistente.saldo_actual || 0) + formValues.monto
        const { error: errorSaldo } = await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: saldoAcumulado,
            dias_mora: 0,
            ultima_actualizacion: new Date().toISOString()
          })
          .eq('id', saldoExistente.id)
        if (errorSaldo) throw errorSaldo
      } else {
        // Crear entrada de saldo si no existe (edge case: pago sin GENERAR previo)
        const { error: errorSaldo } = await (supabase.from('saldos_conductores') as any)
          .insert({
            conductor_id: facturacion.conductor_id,
            conductor_nombre: facturacion.conductor_nombre,
            conductor_dni: facturacion.conductor_dni,
            conductor_cuit: facturacion.conductor_cuit || null,
            saldo_actual: formValues.monto,
            dias_mora: 0,
            ultima_actualizacion: new Date().toISOString()
          })
        if (errorSaldo) throw errorSaldo
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

      // 4. Si el total cobrado (previo + este pago) cubre el total, marcar como pagada
      if ((yaCobrado + formValues.monto) >= totalAbsoluto && !facturacion.id.startsWith('preview-')) {
        await (supabase.from('facturacion_conductores') as any)
          .update({ estado: 'pagado' })
          .eq('id', facturacion.id)
      }

      // 5. Registrar pagos individuales para cobros_fraccionados y penalidades_cuotas
      // Recorrer conceptos en orden y marcar como pagados los que cubre el monto
      const todosDetalles = detalles || []
      let restantePago = formValues.monto
      for (const det of todosDetalles) {
        const d = det as { referencia_id: string | null; referencia_tipo: string | null; total: number; es_descuento: boolean; concepto_descripcion: string }
        if (!d.referencia_id) continue
        if (d.referencia_tipo !== 'cobro_fraccionado' && d.referencia_tipo !== 'penalidad_cuota') continue

        if (d.es_descuento) {
          restantePago += d.total
          continue
        }

        if (restantePago >= d.total) {
          restantePago -= d.total
          const tipoCobro = d.referencia_tipo === 'cobro_fraccionado' ? 'cobro_fraccionado' : 'penalidad_cuota'
          const refTabla = d.referencia_tipo === 'cobro_fraccionado' ? 'cobros_fraccionados' : 'penalidades_cuotas'

          // Registrar pago individual
          await (supabase.from('pagos_conductores') as any)
            .insert({
              conductor_id: facturacion.conductor_id,
              tipo_cobro: tipoCobro,
              referencia_id: d.referencia_id,
              referencia_tabla: refTabla,
              numero_cuota: null,
              monto: d.total,
              fecha_pago: new Date().toISOString(),
              referencia: `Pago via facturación S${semanaNum}/${anioNum}`,
              semana: formValues.semana,
              anio: formValues.anio,
              conductor_nombre: facturacion.conductor_nombre
            })

          // Marcar como aplicado en la tabla origen
          await (supabase.from(refTabla) as any)
            .update({ aplicado: true })
            .eq('id', d.referencia_id)
        } else {
          break
        }
      }

      showSuccess('Pago Registrado', `${facturacion.conductor_nombre} - ${formatCurrency(formValues.monto)}`)

      // Recargar datos para reflejar el pago en la tabla principal
      await cargarFacturacion()
      // Cerrar modal de detalle si está abierto
      setShowDetalle(false)
      setDetalleFacturacion(null)
      setDetalleItems([])
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  // ==========================================
  // CARGAR PAGOS CABIFY DESDE EXCEL
  // ==========================================
  async function handleCabifyFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input para poder subir el mismo archivo de nuevo
    e.target.value = ''

    setLoadingCabifyPagos(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      // Leer como array de arrays (raw) para acceder por índice de columna
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })

      // Parsear filas del Excel (saltear header - fila 0)
      // Col E (4) = Nombre, Col G (6) = Patente, Col H (7) = DNI
      // Col I (8) = Importe Contrato, Col P (15) = Disponible, Col Q (16) = Importe Descontado, Col R (17) = Saldo
      const excelData: { nombre: string; dni: string; patente: string; importe_contrato: number; disponible: number; importe_descontar: number; saldo_adeudado: number }[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const dniRaw = String(row[7] || '').replace(/[.,\s]/g, '').trim()
        if (!dniRaw || dniRaw === '0' || dniRaw === '') continue
        const dni = dniRaw

        const disponible = parseFloat(row[15]) || 0
        const importeDescontar = parseFloat(row[16]) || 0
        // Solo incluir filas donde hay algo para descontar
        if (importeDescontar <= 0) continue

        excelData.push({
          nombre: String(row[4] || '').trim(),
          dni,
          patente: String(row[6] || '').trim(),
          importe_contrato: parseFloat(row[8]) || 0,
          disponible,
          importe_descontar: importeDescontar,
          saldo_adeudado: parseFloat(row[17]) || 0,
        })
      }

      if (excelData.length === 0) {
        Swal.fire('Sin datos', 'No se encontraron conductores con importes a descontar en el Excel', 'warning')
        setLoadingCabifyPagos(false)
        return
      }

      // Match con facturaciones del período actual por DNI
      const matched: typeof cabifyPagosData = []
      const noMatch: string[] = []

      for (const exRow of excelData) {
        const fact = facturaciones.find(f => String(f.conductor_dni || '').replace(/[.,\s]/g, '').trim() === exRow.dni)
        if (!fact) {
          noMatch.push(`${exRow.nombre} (DNI: ${exRow.dni})`)
          continue
        }

        // Solo incluir si tiene total_a_pagar > 0 y no está ya pagado
        if (fact.total_a_pagar <= 0 || fact.estado === 'pagado') continue

        const yaCobrado = fact.monto_cobrado || 0
        const pendiente = Math.abs(fact.total_a_pagar) - yaCobrado
        if (pendiente <= 0) continue

        matched.push({
          conductor_nombre: fact.conductor_nombre,
          conductor_dni: exRow.dni,
          patente: exRow.patente || fact.vehiculo_patente || '',
          importe_contrato: exRow.importe_contrato,
          disponible: exRow.disponible,
          importe_descontar: Math.min(exRow.importe_descontar, pendiente), // No pagar más de lo que se debe
          saldo_adeudado: exRow.saldo_adeudado,
          total_a_pagar: Math.abs(fact.total_a_pagar),
          facturacion_id: fact.id,
          conductor_id: fact.conductor_id,
          conductor_cuit: fact.conductor_cuit || '',
          monto_cobrado: yaCobrado,
        })
      }

      if (matched.length === 0) {
        Swal.fire('Sin coincidencias', 'Ningún conductor del Excel coincide con las facturaciones del período actual', 'warning')
        setLoadingCabifyPagos(false)
        return
      }

      setCabifyPagosData(matched)
      setShowCabifyPagosPreview(true)

      if (noMatch.length > 0) {
        Swal.fire({
          title: 'Conductores no encontrados',
          html: `<div style="text-align:left;font-size:12px;max-height:200px;overflow-y:auto;">${noMatch.map(n => `<div>- ${n}</div>`).join('')}</div>`,
          icon: 'info',
          confirmButtonText: 'Entendido',
          width: 400,
        })
      }
    } catch (error: any) {
      Swal.fire('Error', `No se pudo leer el archivo Excel: ${error.message || error}`, 'error')
    } finally {
      setLoadingCabifyPagos(false)
    }
  }

  async function procesarPagosCabifyBatch() {
    if (cabifyPagosData.length === 0) return

    const semanaNum = periodo?.semana || getWeek(semanaActual.inicio, { weekStartsOn: 1 })
    const anioNum = periodo?.anio || getYear(semanaActual.inicio)
    const hoy = new Date()
    const semanaHoy = Math.ceil(
      (hoy.getTime() - new Date(hoy.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    const anioHoy = hoy.getFullYear()

    const confirm = await Swal.fire({
      title: 'Confirmar Pagos Cabify',
      html: `<div style="text-align:left;font-size:13px;">
        <p>Se registrarán <strong>${cabifyPagosData.length} pagos</strong> por un total de <strong>${formatCurrency(cabifyPagosData.reduce((s, d) => s + d.importe_descontar, 0))}</strong></p>
        <p style="color:#6B7280;font-size:12px;margin-top:8px;">Referencia: Pago Cabify S${semanaNum}/${anioNum}</p>
      </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Registrar Pagos',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7C3AED',
    })

    if (!confirm.isConfirmed) return

    setProcesandoCabifyPagos(true)
    let exitosos = 0
    let fallidos = 0
    const errores: string[] = []

    for (const pago of cabifyPagosData) {
      try {
        const monto = pago.importe_descontar
        const yaCobrado = pago.monto_cobrado
        const totalAbsoluto = pago.total_a_pagar

        // 1. Registrar pago en pagos_conductores
        const { error: errorPago } = await (supabase.from('pagos_conductores') as any)
          .insert({
            conductor_id: pago.conductor_id,
            tipo_cobro: 'facturacion_semanal',
            referencia_id: pago.facturacion_id,
            referencia_tabla: 'facturacion_conductores',
            numero_cuota: null,
            monto,
            fecha_pago: hoy.toISOString(),
            referencia: `Pago Cabify S${semanaNum}/${anioNum}`,
            semana: semanaHoy,
            anio: anioHoy,
            conductor_nombre: pago.conductor_nombre
          })

        if (errorPago) throw errorPago

        // 2. Actualizar saldo en saldos_conductores
        // La deuda ya fue registrada al GENERAR — el pago simplemente suma al saldo
        const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
          .select('id, saldo_actual')
          .eq('conductor_id', pago.conductor_id)
          .maybeSingle()

        if (saldoExistente) {
          const saldoAcumulado = (saldoExistente.saldo_actual || 0) + monto
          const { error: errorSaldo } = await (supabase.from('saldos_conductores') as any)
            .update({
              saldo_actual: saldoAcumulado,
              dias_mora: 0,
              ultima_actualizacion: hoy.toISOString()
            })
            .eq('id', saldoExistente.id)
          if (errorSaldo) throw errorSaldo
        } else {
          const { error: errorSaldo } = await (supabase.from('saldos_conductores') as any)
            .insert({
              conductor_id: pago.conductor_id,
              conductor_nombre: pago.conductor_nombre,
              conductor_dni: pago.conductor_dni,
              conductor_cuit: pago.conductor_cuit || null,
              saldo_actual: monto,
              dias_mora: 0,
              ultima_actualizacion: hoy.toISOString()
            })
          if (errorSaldo) throw errorSaldo
        }

        // 3. Registrar en abonos_conductores como audit trail
        await (supabase.from('abonos_conductores') as any).insert({
          conductor_id: pago.conductor_id,
          tipo: 'abono',
          monto,
          concepto: `Pago Cabify S${semanaNum}/${anioNum}`,
          referencia: `Pago Cabify S${semanaNum}/${anioNum}`,
          semana: semanaHoy,
          anio: anioHoy,
          fecha_abono: hoy.toISOString()
        })

        // 4. Si el total cobrado cubre el total, marcar como pagado
        if ((yaCobrado + monto) >= totalAbsoluto) {
          await (supabase.from('facturacion_conductores') as any)
            .update({ estado: 'pagado' })
            .eq('id', pago.facturacion_id)
        }

        // 5. Registrar pagos individuales para cobros_fraccionados y penalidades
        const { data: detalles } = await supabase
          .from('facturacion_detalle')
          .select('*')
          .eq('facturacion_id', pago.facturacion_id)
          .order('es_descuento')
          .order('concepto_codigo')

        let restantePago = monto
        for (const det of (detalles || [])) {
          const d = det as { referencia_id: string | null; referencia_tipo: string | null; total: number; es_descuento: boolean }
          if (!d.referencia_id) continue
          if (d.referencia_tipo !== 'cobro_fraccionado' && d.referencia_tipo !== 'penalidad_cuota') continue

          if (d.es_descuento) {
            restantePago += d.total
            continue
          }

          if (restantePago >= d.total) {
            restantePago -= d.total
            const tipoCobro = d.referencia_tipo === 'cobro_fraccionado' ? 'cobro_fraccionado' : 'penalidad_cuota'
            const refTabla = d.referencia_tipo === 'cobro_fraccionado' ? 'cobros_fraccionados' : 'penalidades_cuotas'

            await (supabase.from('pagos_conductores') as any)
              .insert({
                conductor_id: pago.conductor_id,
                tipo_cobro: tipoCobro,
                referencia_id: d.referencia_id,
                referencia_tabla: refTabla,
                numero_cuota: null,
                monto: d.total,
                fecha_pago: hoy.toISOString(),
                referencia: `Pago via Cabify S${semanaNum}/${anioNum}`,
                semana: semanaHoy,
                anio: anioHoy,
                conductor_nombre: pago.conductor_nombre
              })

            await (supabase.from(refTabla) as any)
              .update({ aplicado: true })
              .eq('id', d.referencia_id)
          } else {
            break
          }
        }

        exitosos++
      } catch (error: any) {
        fallidos++
        errores.push(`${pago.conductor_nombre}: ${error.message || error}`)
      }
    }

    setProcesandoCabifyPagos(false)
    setShowCabifyPagosPreview(false)
    setCabifyPagosData([])

    // Recargar facturaciones
    await cargarFacturacion()

    if (fallidos === 0) {
      showSuccess('Pagos Registrados', `${exitosos} pagos procesados exitosamente`)
    } else {
      Swal.fire({
        title: 'Resultado',
        html: `<div style="text-align:left;font-size:13px;">
          <p style="color:#16a34a;">Exitosos: ${exitosos}</p>
          <p style="color:#dc2626;">Fallidos: ${fallidos}</p>
          ${errores.length > 0 ? `<div style="margin-top:8px;font-size:12px;max-height:150px;overflow-y:auto;">${errores.map(e => `<div style="color:#dc2626;">- ${e}</div>`).join('')}</div>` : ''}
        </div>`,
        icon: fallidos === 0 ? 'success' : 'warning',
      })
    }
  }

  // Navegación de semanas
  function semanaAnterior() {
    const nuevaFecha = subWeeks(semanaActual.inicio, 1)
    setSemanaActual(getSemanaArgentina(nuevaFecha))
  }

  function semanaSiguiente() {
    // No avanzar más allá de la semana en curso
    const hoyNav = new Date()
    if (hoyNav >= semanaActual.inicio && hoyNav <= semanaActual.fin) return
    const nuevaFecha = addWeeks(semanaActual.inicio, 1)
    // No avanzar si la nueva semana sería futura
    const nuevaSemana = getSemanaArgentina(nuevaFecha)
    if (nuevaSemana.inicio > hoyNav) return
    setSemanaActual(nuevaSemana)
  }

  // function irASemanaActual() {
  //   setSemanaActual(getSemanaArgentina(new Date()))
  // }

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

      const tieneP009 = detalleItems.some(d => d.concepto_codigo === 'P009' && !d.es_descuento)
      if (detalleFacturacion.monto_mora > 0 && !tieneP009) {
        pdf.text(`Mora (${detalleFacturacion.dias_mora} días)`, margin, y)
        pdf.text(formatCurrency(detalleFacturacion.monto_mora), pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      y += 3
      pdf.setFont('helvetica', 'bold')
      pdf.text('SUBTOTAL CARGOS', margin, y)
      const moraExtra = tieneP009 ? 0 : detalleFacturacion.monto_mora
      pdf.text(formatCurrency(detalleFacturacion.subtotal_cargos + detalleFacturacion.saldo_anterior + moraExtra), pageWidth - margin, y, { align: 'right' })
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

      // 2b. Penalidades con categoria NULL (sin tipo asignado) - incluir TODAS, sin importar aplicado
      // Estas fueron marcadas como aplicado por el código viejo, pero nunca tuvieron categoria asignada
      const { data: penalidadesSinTipo } = await (supabase
        .from('penalidades') as any)
        .select('*, conductor:conductores(nombres, apellidos), tipos_cobro_descuento!left(nombre, categoria)')
        .in('conductor_id', conductorIds)
        .eq('rechazado', false)
        .eq('fraccionado', false)
        .eq('semana', periodo.semana)

      for (const p of (penalidadesSinTipo || []) as any[]) {
        // Solo incluir las que NO tienen categoria (null o el tipo no existe)
        const categoria = p.tipos_cobro_descuento?.categoria
        if (categoria) continue
        // Evitar duplicados con los pendientes ya cargados en sección 2
        if (pendientes.some(pend => pend.id === p.id)) continue
        if (!detallesReferencias.has(p.id)) {
          pendientes.push({
            id: p.id,
            tipo: 'penalidad',
            conductorId: p.conductor_id,
            conductorNombre: p.conductor?.nombres && p.conductor?.apellidos 
              ? `${p.conductor.nombres} ${p.conductor.apellidos}` 
              : p.conductor_nombre || 'Sin nombre',
            monto: p.monto || 0,
            descripcion: `[Sin tipo asignado] ${p.detalle || p.tipos_cobro_descuento?.nombre || 'Penalidad'}`,
            tabla: 'penalidades',
            fechaCreacion: p.created_at,
            creadoPor: p.created_by_name,
            origenDetalle: `Penalidad SIN TIPO ASIGNADO - ${p.tipos_cobro_descuento?.nombre || 'Sin tipo'} - Creado ${p.created_at ? format(parseISO(p.created_at), 'dd/MM/yyyy', { locale: es }) : ''}`,
            penalidadId: p.id,
            tipoPenalidad: p.tipos_cobro_descuento?.nombre,
            motivoPenalidad: p.motivo,
            notasPenalidad: p.notas,
            fechaPenalidad: p.fecha,
            siniestroId: p.siniestro_id
          })
        }
      }

      // 3. Cobros fraccionados hasta esta semana — cruzar con pagos
      const [cobrosResPend, pagosCobrosResPend] = await Promise.all([
        (supabase
          .from('cobros_fraccionados') as any)
          .select('*, conductor:conductores(nombres, apellidos)')
          .in('conductor_id', conductorIds)
          .lte('semana', periodo.semana)
          .eq('anio', periodo.anio),
        (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .eq('tipo_cobro', 'cobro_fraccionado')
      ])
      const cobrosPagadosPendIds = new Set(
        (pagosCobrosResPend.data || []).map((p: any) => p.referencia_id).filter(Boolean)
      )
      const cobrosPendientes = (cobrosResPend.data || []).filter((c: any) => c.aplicado !== true && !cobrosPagadosPendIds.has(c.id))

      for (const c of (cobrosPendientes || []) as any[]) {
        if (!detallesReferencias.has(c.id)) {
          pendientes.push({
            id: c.id,
            tipo: 'cobro_fraccionado',
            conductorId: c.conductor_id,
            conductorNombre: c.conductor?.nombres && c.conductor?.apellidos 
              ? `${c.conductor.nombres} ${c.conductor.apellidos}` 
              : 'Sin nombre',
            monto: (c.monto_cuota > 0 && c.monto_cuota < c.monto_total) ? c.monto_cuota : Math.ceil((c.monto_total || 0) / (c.total_cuotas || 1)),
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

      // 4. Penalidades cuotas (fraccionadas) hasta esta semana — cruzar con pagos
      const [penCuotasResPend, pagosPenCuotasResPend] = await Promise.all([
        (supabase
          .from('penalidades_cuotas') as any)
          .select('*, penalidad:penalidades(id, conductor_id, conductor_nombre, detalle, monto, notas, fecha, motivo, siniestro_id, created_at, created_by_name, conductor:conductores(nombres, apellidos))')
          .lte('semana', periodo.semana),
        (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .eq('tipo_cobro', 'penalidad_cuota')
      ])
      const penCuotasPagadasPendIds = new Set(
        (pagosPenCuotasResPend.data || []).map((p: any) => p.referencia_id).filter(Boolean)
      )
      const penalidadesCuotasPendientes = (penCuotasResPend.data || []).filter((pc: any) => pc.aplicado !== true && !penCuotasPagadasPendIds.has(pc.id))

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
      const { data: todasPenalidadesData } = await (supabase
        .from('penalidades') as any)
        .select('*, tipos_cobro_descuento(nombre, categoria, es_a_favor), conductor:conductores(nombres, apellidos)')
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

      // 5. Cargar cobros fraccionados hasta esta semana — cruzar con pagos
      const [cobrosCloseRes, pagosCloseRes] = await Promise.all([
        (supabase
          .from('cobros_fraccionados') as any)
          .select('*')
          .in('conductor_id', conductorIds)
          .lte('semana', semana)
          .eq('anio', anio),
        (supabase
          .from('pagos_conductores') as any)
          .select('referencia_id')
          .in('tipo_cobro', ['cobro_fraccionado', 'penalidad_cuota'])
      ])
      const pagosFraccionadosIds = new Set(
        (pagosCloseRes.data || []).map((p: any) => p.referencia_id).filter(Boolean)
      )
      const cobrosData = (cobrosCloseRes.data || []).filter((c: any) => c.aplicado !== true && !pagosFraccionadosIds.has(c.id))
      
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

      // 7. Cargar penalidades_cuotas hasta esta semana — ya tenemos pagos en pagosFraccionadosIds
      const { data: penalidadesCuotasData } = await (supabase
        .from('penalidades_cuotas') as any)
        .select('*, penalidad:penalidades(conductor_id, conductor_nombre, conductor:conductores(nombres, apellidos))')
        .lte('semana', semana)
      
      // Filtrar por año correcto o sin año, y excluir pagadas (aplicado=true O en pagos_conductores)
      const penalidadesCuotasFiltradas = (penalidadesCuotasData || []).filter((pc: any) =>
        (!pc.anio || pc.anio <= anio) && pc.aplicado !== true && !pagosFraccionadosIds.has(pc.id)
      )
      
      // Identificar penalidades_cuotas no incluidas (de conductores fuera de Vista Previa)
      const penalidadesCuotasNoIncluidas = penalidadesCuotasFiltradas.filter(
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

      // 9. Cargar cobros fraccionados de conductores NO en Vista Previa (hasta esta semana) — ya tenemos pagosFraccionadosIds
      const { data: todosCobrosData } = await (supabase
        .from('cobros_fraccionados') as any)
        .select('*, conductor:conductores(nombres, apellidos)')
        .lte('semana', semana)
        .eq('anio', anio)
      
      const cobrosNoIncluidos = ((todosCobrosData || []).filter(
        (c: any) => !conductorIds.includes(c.conductor_id) && c.aplicado !== true && !pagosFraccionadosIds.has(c.id)
      ))

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
          monto: (c.monto_cuota > 0 && c.monto_cuota < c.monto_total) ? c.monto_cuota : Math.ceil((c.monto_total || 0) / (c.total_cuotas || 1)),
          descripcion: `[NO EN PREVIEW] Cuota ${c.numero_cuota} de ${c.total_cuotas}`,
          tabla: 'cobros_fraccionados'
        })
      }

      // Penalidades con categoria NULL (sin tipo asignado) - TODAS, sin importar aplicado
      // Incluye las que el código viejo marcó como aplicado pero nunca tuvieron categoria
      const { data: penalidadesSinTipoData } = await (supabase
        .from('penalidades') as any)
        .select('*, conductor:conductores(nombres, apellidos), tipos_cobro_descuento!left(nombre, categoria)')
        .eq('rechazado', false)
        .eq('fraccionado', false)
        .eq('semana', semana)

      for (const p of (penalidadesSinTipoData || []) as any[]) {
        const categoria = p.tipos_cobro_descuento?.categoria
        if (categoria) continue
        // Evitar duplicados
        if (pendientes.some(pend => pend.id === p.id)) continue
        const enPreview = conductorIds.includes(p.conductor_id)
        const conductorNombre = p.conductor?.nombres && p.conductor?.apellidos
          ? `${p.conductor.nombres} ${p.conductor.apellidos}`
          : p.conductor_nombre || 'Sin nombre'
        pendientes.push({
          id: p.id,
          tipo: 'penalidad',
          conductorId: p.conductor_id,
          conductorNombre,
          monto: p.monto || 0,
          descripcion: `[Sin tipo asignado${!enPreview ? ' - NO EN PREVIEW' : ''}] ${p.detalle || p.tipos_cobro_descuento?.nombre || 'Penalidad'}`,
          tabla: 'penalidades'
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
      ;penalidadesCuotasFiltradas.forEach((pc: any) => {
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

        // Penalidades segmentadas por categoría (P004, P006, P007)
        const penalidades = penalidadesMap.get(fact.conductor_id) || []
        for (const penalidad of penalidades) {
          const categoria = penalidad.tipos_cobro_descuento?.categoria
          // NULL categoria = pendiente, mostrar como tal
          if (!categoria) {
            filasPreview.push(crearFilaPreview(
              numeroFactura++,
              fact,
              penalidad.monto,
              'PEND',
              `[PENDIENTE] ${penalidad.detalle || penalidad.tipos_cobro_descuento?.nombre || 'Sin tipo asignado'}`
            ))
            continue
          }
          const tipoNombre = penalidad.tipos_cobro_descuento?.nombre || penalidad.detalle || 'Sin detalle'
          const descripcion = categoria === 'P004'
            ? `Ticket: ${tipoNombre}`
            : categoria === 'P006'
              ? `Exceso KM: ${tipoNombre}`
              : `Penalidad: ${tipoNombre}`
          
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            penalidad.monto,
            categoria,
            descripcion
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
          
          const montoCuotaCabify = (cobro.monto_cuota > 0 && cobro.monto_cuota < cobro.monto_total) ? cobro.monto_cuota : Math.ceil((cobro.monto_total || 0) / (cobro.total_cuotas || 1))
          filasPreview.push(crearFilaPreview(
            numeroFactura++,
            fact,
            montoCuotaCabify,
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

  // Sincronizar cambios del preview RIT con la BD (deshabilitado - previews son solo lectura)
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
          // Buscar en TODAS las facturaciones (no filtradas por UI)
          const facturacion = facturaciones.find(f => f.conductor_id === row.conductorId)
          if (facturacion) {
            row.facturacionId = facturacion.id
          } else if (periodo && row.conductorId) {
            // Verificar si ya existe un registro (por si un sync previo creó uno parcialmente)
            const { data: existente } = await (supabase
              .from('facturacion_conductores') as any)
              .select('id')
              .eq('periodo_id', periodo.id)
              .eq('conductor_id', row.conductorId)
              .maybeSingle()

            if (existente) {
              row.facturacionId = existente.id
            } else {
              // Conductor nuevo: crear facturacion_conductores
              const montoTotal = Math.abs(row.total)
              const { data: newFact, error: errNewFact } = await (supabase
                .from('facturacion_conductores') as any)
                .insert({
                  periodo_id: periodo.id,
                  conductor_id: row.conductorId,
                  conductor_nombre: row.razonSocial,
                  conductor_dni: row.numeroDni,
                  conductor_cuit: row.numeroCuil || null,
                  vehiculo_id: null,
                  vehiculo_patente: null,
                  tipo_alquiler: 'CARGO',
                  turnos_base: 0,
                  turnos_cobrados: 0,
                  factor_proporcional: 0,
                  subtotal_alquiler: 0,
                  subtotal_garantia: 0,
                  subtotal_cargos: montoTotal,
                  subtotal_descuentos: 0,
                  subtotal_neto: montoTotal,
                  saldo_anterior: 0,
                  dias_mora: 0,
                  monto_mora: 0,
                  total_a_pagar: montoTotal,
                  estado: 'calculado'
                })
                .select('id')
                .single()

              if (errNewFact) throw errNewFact
              row.facturacionId = newFact.id
            }
          } else {
            continue
          }
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

      // 3. Actualizar filas existentes modificadas (solo las que fueron editadas y tienen detalleId)
      const existingRows = updatedData.filter(row => !row.isNew && !row.isDeleted && row.detalleId && row.isModified)
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
    } catch (err: unknown) {
      let msg = 'Error desconocido'
      if (err instanceof Error) {
        msg = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        msg = String((err as { message: string }).message)
      } else if (err && typeof err === 'object' && 'details' in err) {
        msg = String((err as { details: string }).details)
      } else if (typeof err === 'string') {
        msg = err
      } else {
        try { msg = JSON.stringify(err) } catch { msg = String(err) }
      }
      Swal.fire('Error', `No se pudieron guardar los cambios: ${msg}`, 'error')
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

  // Exportar Vista Previa a Excel - Formato RIT (deshabilitado en Vista Previa)
  /* async function exportarVistaPreviaExcel() {
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
  } */

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
        
        // Importe Contrato = Solo alquiler (P001/P002/P013)
        const importeContrato = f.subtotal_alquiler || 0
        
        // EXCEDENTES = resto de productos (sin alquiler) + saldo pendiente
        // Cobros (garantía, peajes, excesos, penalidades) suman, montos a favor (tickets) restan
        const saldoPendiente = f.saldo_anterior || 0
        const excedentes = (f.subtotal_cargos || 0) - (f.subtotal_descuentos || 0) - importeContrato + saldoPendiente

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
        
        // Importe Contrato = Solo alquiler (P001/P002/P013)
        const importeContrato = f.subtotal_alquiler || 0
        
        // EXCEDENTES = resto de productos (sin alquiler) + saldo pendiente
        const saldoPendiente = f.saldo_anterior || 0
        const excedentes = (f.subtotal_cargos || 0) - (f.subtotal_descuentos || 0) - importeContrato + saldoPendiente

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

      // Agregar conductores de facturacion_cabify que no están en facturaciones
      const idsEnPreview = new Set(previewRows.map(r => r.conductorId))
      const conductoresExtras = (savedCabifyData || [])
        .filter((record: any) => record.conductor_id && !idsEnPreview.has(record.conductor_id))
      
      for (const record of conductoresExtras) {
        previewRows.push({
          anio: periodo.anio,
          semana: periodo.semana,
          fechaInicial: fechaInicio,
          fechaFinal: fechaFin,
          conductor: record.conductor_nombre || '',
          email: record.conductor_email || '',
          patente: record.vehiculo_patente || '',
          dni: record.conductor_dni || '',
          importeContrato: Number(record.importe_contrato) || 0,
          excedentes: Number(record.excedentes) || 0,
          conductorId: record.conductor_id,
          horasConexion: Number(record.horas_conexion) || 0,
          importeGenerado: Number(record.importe_generado) || 0,
          importeGeneradoConBonos: Number(record.importe_generado_bonos) || 0,
          generadoEfectivo: Number(record.generado_efectivo) || 0,
          id: record.id
        })
      }

      // Ordenar alfabéticamente
      previewRows.sort((a, b) => a.conductor.localeCompare(b.conductor, 'es'))

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <strong
            style={{ fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', color: 'var(--color-primary)' }}
            onClick={() => cargarHistorialAsignaciones(
              row.original.conductor_id,
              row.original.conductor_nombre,
              row.original.conductor_dni || ''
            )}
          >
            {row.original.conductor_nombre}
          </strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {row.original.vehiculo_patente || '-'}
            </span>
            {(() => {
              const o = row.original
              if (o.tipo_alquiler === 'CARGO') {
                return <span className="dt-badge dt-badge-solid-blue" style={{ fontSize: '9px', padding: '1px 5px' }}>CARGO</span>
              }
              // TURNO: determinar si es diurno, nocturno o mixto usando prorrateo
              const diurno = o.prorrateo_diurno_dias || 0
              const nocturno = o.prorrateo_nocturno_dias || 0
              let label = 'TURNO'
              if (diurno > 0 && nocturno === 0) label = 'DIURNO'
              else if (nocturno > 0 && diurno === 0) label = 'NOCTURNO'
              else if (diurno > 0 && nocturno > 0) label = 'D+N'
              return <span className="dt-badge dt-badge-solid-gray" style={{ fontSize: '9px', padding: '1px 5px' }}>{label}</span>
            })()}
          </div>
        </div>
      ),
      enableSorting: true,
      size: 160,
    },
    {
      id: 'dias_trabajados',
      accessorFn: (row) => row.turnos_cobrados,
      header: 'Días',
      enableSorting: true,
      size: 45,
      cell: ({ row }) => {
        const cobrados = row.original.turnos_cobrados ?? 0
        return (
          <span
            style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => cargarDesgloseDias(
              row.original.conductor_id,
              row.original.conductor_nombre,
              row.original.conductor_dni || '',
              cobrados
            )}
          >
            {cobrados}
          </span>
        )
      }
    },
    {
      id: 'alquiler_desglose',
      accessorFn: (row) => row.subtotal_alquiler,
      header: 'Alquiler',
      enableSorting: true,
      size: 110,
      cell: ({ row }) => {
        const alquiler = row.original.subtotal_alquiler
        const ganancia = row.original.ganancia_cabify || 0
        // Porcentaje de cobertura: cuánto de su alquiler cubrió con ganancia Cabify
        const porcentajeCubierto = alquiler > 0 ? Math.min(100, Math.round((ganancia / alquiler) * 100)) : 0
        const cubreCuota = ganancia >= alquiler && ganancia > 0

        return (
          <div style={{ fontSize: '11px', minWidth: '80px' }}>
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
      accessorFn: (row) => row.subtotal_garantia,
      header: 'Garantía',
      enableSorting: true,
      size: 100,
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
          <div style={{ fontSize: '11px', minWidth: '70px' }}>
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
      id: 'monto_cobrado',
      accessorFn: (row) => row.monto_cobrado || 0,
      header: 'Cobrado',
      enableSorting: true,
      size: 90,
      cell: ({ row }) => {
        const cobrado = row.original.monto_cobrado || 0
        const total = Math.abs(row.original.total_a_pagar || 0)

        if (modoVistaPrevia) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
        }

        if (cobrado === 0) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
        }

        const esPagoCompleto = cobrado >= total
        return (
          <div style={{ fontSize: '11px' }}>
            <span style={{
              fontWeight: 600,
              color: esPagoCompleto ? '#10b981' : '#f59e0b'
            }}>
              {formatCurrency(cobrado)}
            </span>
            {!esPagoCompleto && total > 0 && (
              <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>
                {Math.round((cobrado / total) * 100)}% del total
              </div>
            )}
          </div>
        )
      }
    },
    {
      id: 'peajes',
      header: 'Peajes',
      size: 85,
      accessorFn: (row) => row.monto_peajes || 0,
      cell: ({ row }) => {
        const peajes = row.original.monto_peajes || 0
        if (peajes === 0) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
        }
        return (
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {formatCurrency(peajes)}
          </span>
        )
      },
      enableSorting: true,
    },
    {
      id: 'incidencias',
      header: 'Incidencias',
      size: 110,
      accessorFn: (row) => row.monto_penalidades || 0,
      cell: ({ row }) => {
        const penalidades = row.original.penalidades_detalle || []
        const montoPen = row.original.monto_penalidades || 0

        if (penalidades.length === 0 && montoPen === 0) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
        }

        const count = penalidades.length || (montoPen > 0 ? 1 : 0)

        return (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const html = penalidades.length > 0
                ? `<table style="width:100%;text-align:left;font-size:13px;border-collapse:collapse;">
                    <thead><tr style="border-bottom:2px solid var(--border-primary);">
                      <th style="padding:8px;">Detalle</th>
                      <th style="padding:8px;text-align:right;">Monto</th>
                    </tr></thead>
                    <tbody>${penalidades.map((p: any) => `<tr style="border-bottom:1px solid var(--border-secondary);"><td style="padding:8px;">${p.detalle}</td><td style="padding:8px;text-align:right;font-weight:600;">${formatCurrency(p.monto)}</td></tr>`).join('')}</tbody>
                    <tfoot><tr style="border-top:2px solid var(--border-primary);font-weight:700;">
                      <td style="padding:8px;">Total</td>
                      <td style="padding:8px;text-align:right;">${formatCurrency(montoPen)}</td>
                    </tr></tfoot>
                  </table>`
                : `<p>Total penalidades: <strong>${formatCurrency(montoPen)}</strong></p>`

              Swal.fire({
                title: `Incidencias - ${row.original.conductor_nombre}`,
                html,
                width: 500,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#6B7280',
                customClass: { popup: 'fact-modal' }
              })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
            }}
            title="Ver detalle de incidencias"
          >
            {count}
            <span style={{ fontSize: '10px', fontWeight: 400 }}>
              ({formatCurrency(montoPen)})
            </span>
          </button>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: 'saldo_anterior',
      header: 'Saldo Ant.',
      size: 85,
      cell: ({ row }) => (
        <span style={{
          fontSize: '11px',
          fontWeight: row.original.saldo_anterior !== 0 ? 600 : 400,
          color: row.original.saldo_anterior > 0 ? 'var(--badge-red-text)' : row.original.saldo_anterior < 0 ? 'var(--badge-green-text)' : 'var(--text-muted)'
        }}>
          {row.original.saldo_anterior !== 0 ? formatCurrency(row.original.saldo_anterior) : '-'}
        </span>
      ),
      enableSorting: true,
    },

    {
      accessorKey: 'total_a_pagar',
      header: 'TOTAL',
      size: 100,
      cell: ({ row }) => {
        const total = row.original.total_a_pagar
        return (
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 6px',
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
    {
      id: 'estado_billing',
      header: 'Estado',
      size: 70,
      accessorFn: (row) => row.estado_billing || '',
      cell: ({ row }) => {
        const estado = row.original.estado_billing
        if (!estado) return '-'
        const estilos: Record<string, { bg: string; text: string }> = {
          'Activo': { bg: 'var(--badge-green-bg)', text: 'var(--badge-green-text)' },
          'Pausa': { bg: 'var(--badge-yellow-bg, #fef3c7)', text: 'var(--badge-yellow-text, #92400e)' },
          'De baja': { bg: 'var(--badge-red-bg)', text: 'var(--badge-red-text)' },
        }
        const estilo = estilos[estado] || { bg: '#f3f4f6', text: '#6b7280' }
        return (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '10px',
            background: estilo.bg,
            color: estilo.text,
            whiteSpace: 'nowrap',
          }}>
            {estado}
          </span>
        )
      },
      enableSorting: true,
      filterFn: 'equals',
    },
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
          {!modoVistaPrevia && row.original.total_a_pagar > 0 && (
            <button
              className="dt-btn-action"
              onClick={(e) => { e.stopPropagation(); registrarPagoFacturacion(row.original) }}
              data-tooltip="Registrar pago"
              style={{ padding: '6px', color: '#16a34a' }}
            >
              <Banknote size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [excesos, modoVistaPrevia, conductorFilter, conductorSearch, conductoresFiltrados, tipoFilter, patenteFilter, openColumnFilter])

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

    return (
      <FacturacionPreviewTable
        data={siFacturaPreviewData}
        conceptos={conceptosNomina}
        semana={semanaNum}
        anio={anioNum}
        fechaInicio={fechaInicioStr}
        fechaFin={fechaFinStr}
        periodoAbierto={false}
        conceptosPendientes={[]}
        onEnlazarConcepto={undefined}
        onClose={() => {
          setShowSiFacturaPreview(false)
          setSiFacturaPreviewData([])
          setConceptosPendientes([])
        }}
        onExport={exportarSiFacturaExcel}
        exporting={exportingSiFactura}
        onSync={undefined}
      />
    )
  }

  // Si estamos en modo RIT Preview, mostrar el componente de preview
  if (showRITPreview && periodo) {
    return (
      <RITPreviewTable
        data={ritPreviewData}
        semana={periodo.semana}
        anio={periodo.anio}
        fechaInicio={format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')}
        fechaFin={format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}
        periodoAbierto={false}
        onClose={() => {
          setShowRITPreview(false)
          setRitPreviewData([])
        }}
        onSync={undefined}
      />
    )
  }

  // Si estamos en modo Cargar Pagos Cabify, mostrar preview de pagos
  if (showCabifyPagosPreview && cabifyPagosData.length > 0) {
    const semanaNum = periodo?.semana || infoSemana.semana
    const anioNum = periodo?.anio || infoSemana.anio
    const totalDescontar = cabifyPagosData.reduce((s, d) => s + d.importe_descontar, 0)
    const totalDeuda = cabifyPagosData.reduce((s, d) => s + d.total_a_pagar, 0)
    const totalSaldo = cabifyPagosData.reduce((s, d) => s + (d.total_a_pagar - d.monto_cobrado - d.importe_descontar), 0)
    const totalYaCobrado = cabifyPagosData.reduce((s, d) => s + d.monto_cobrado, 0)
    const totalDisponible = cabifyPagosData.reduce((s, d) => s + d.disponible, 0)

    return (
      <div className="fact-preview-container">
        {/* Header */}
        <div className="fact-preview-header">
          <div className="fact-preview-header-left">
            <button className="fact-preview-back-btn" onClick={() => { setShowCabifyPagosPreview(false); setCabifyPagosData([]) }}>
              <X size={14} /> Volver
            </button>
            <div className="fact-preview-title">
              <h2>Cargar Pagos Cabify - S{semanaNum}/{anioNum}</h2>
              <span className="fact-preview-subtitle">{cabifyPagosData.length} conductores con pagos a registrar</span>
            </div>
            <div className="fact-preview-stats-inline">
              <span className="fact-stat-inline">Deuda: <strong>{formatCurrency(totalDeuda)}</strong></span>
              <span className="fact-stat-inline cabify-pagos-highlight">Descontar: <strong>{formatCurrency(totalDescontar)}</strong></span>
              <span className="fact-stat-inline">Saldo: <strong>{formatCurrency(Math.max(0, totalSaldo))}</strong></span>
            </div>
          </div>
          <div className="fact-preview-header-right">
            <button
              className="fact-preview-btn sync"
              onClick={procesarPagosCabifyBatch}
              disabled={procesandoCabifyPagos}
            >
              {procesandoCabifyPagos ? <Loader2 size={14} className="spinning" /> : <Banknote size={14} />}
              {procesandoCabifyPagos ? 'Procesando...' : 'Confirmar Pagos'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="fact-preview-table-wrapper">
          <table className="fact-preview-table cabify-pagos-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Conductor</th>
                <th className="col-center">DNI</th>
                <th className="col-center">Patente</th>
                <th className="col-money">Total a Pagar</th>
                <th className="col-money">Ya Cobrado</th>
                <th className="col-money">Disponible</th>
                <th className="col-money cabify-pagos-col-th">Importe a Descontar</th>
                <th className="col-money">Saldo Adeudado</th>
              </tr>
            </thead>
            <tbody>
              {cabifyPagosData.map((row, idx) => {
                const pendiente = row.total_a_pagar - row.monto_cobrado
                const saldoRestante = Math.max(0, pendiente - row.importe_descontar)
                const cubreTotal = row.importe_descontar >= pendiente

                return (
                  <tr key={row.facturacion_id} className={cubreTotal ? '' : 'cabify-pagos-saldo-row'}>
                    <td className="col-center cabify-pagos-row-num">{idx + 1}</td>
                    <td className="col-nombre">{row.conductor_nombre}</td>
                    <td className="col-center">{row.conductor_dni}</td>
                    <td className="col-center">{row.patente}</td>
                    <td className="col-money">{formatCurrency(row.total_a_pagar)}</td>
                    <td className={`col-money ${row.monto_cobrado > 0 ? 'cabify-pagos-cobrado' : 'cabify-pagos-muted'}`}>
                      {row.monto_cobrado > 0 ? formatCurrency(row.monto_cobrado) : '-'}
                    </td>
                    <td className="col-money">{formatCurrency(row.disponible)}</td>
                    <td className="col-money cabify-pagos-col cabify-pagos-importe">{formatCurrency(row.importe_descontar)}</td>
                    <td className={`col-money ${cubreTotal ? 'cabify-pagos-pagado' : 'cabify-pagos-saldo'}`}>
                      {cubreTotal ? 'PAGADO' : formatCurrency(saldoRestante)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} className="col-right">TOTALES:</td>
                <td className="col-money">{formatCurrency(totalDeuda)}</td>
                <td className="col-money cabify-pagos-cobrado">{formatCurrency(totalYaCobrado)}</td>
                <td className="col-money">{formatCurrency(totalDisponible)}</td>
                <td className="col-money cabify-pagos-col cabify-pagos-importe">{formatCurrency(totalDescontar)}</td>
                <td className="col-money cabify-pagos-saldo">{formatCurrency(Math.max(0, totalSaldo))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <style>{`
          .fact-preview-container { background: var(--bg-primary); border-radius: 8px; padding: 16px; }
          .fact-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; }
          .fact-preview-header-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
          .fact-preview-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
          .fact-preview-back-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; cursor: pointer; }
          .fact-preview-back-btn:hover { background: var(--bg-tertiary); }
          .fact-preview-title h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
          .fact-preview-subtitle { font-size: 11px; color: var(--text-secondary); }
          .fact-preview-stats-inline { display: flex; align-items: center; gap: 8px; margin-left: 12px; padding-left: 12px; border-left: 1px solid var(--border-color); flex-wrap: wrap; }
          .fact-stat-inline { display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
          .fact-stat-inline strong { color: var(--text-primary); }
          .cabify-pagos-highlight { background: rgba(124, 58, 237, 0.12) !important; }
          .cabify-pagos-highlight strong { color: #7C3AED !important; }
          .fact-preview-btn { display: flex; align-items: center; gap: 4px; padding: 8px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
          .fact-preview-btn.sync { background: #7C3AED; color: white; }
          .fact-preview-btn:disabled { opacity: 0.6; cursor: not-allowed; }
          .fact-preview-table-wrapper { overflow: auto; border: 1px solid var(--border-color); border-radius: 6px; max-height: 65vh; }
          .fact-preview-table-wrapper::-webkit-scrollbar { height: 12px; width: 12px; }
          .fact-preview-table-wrapper::-webkit-scrollbar-track { background: var(--bg-tertiary); }
          .fact-preview-table-wrapper::-webkit-scrollbar-thumb { background: #7C3AED; border-radius: 6px; border: 2px solid var(--bg-tertiary); }
          .fact-preview-table-wrapper::-webkit-scrollbar-thumb:hover { background: #6D28D9; }
          .cabify-pagos-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .cabify-pagos-table th { padding: 10px 8px; text-align: left; background: var(--bg-secondary); border-bottom: 2px solid var(--border-color); font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 10px; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
          .cabify-pagos-table td { padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); white-space: nowrap; }
          .cabify-pagos-table tbody tr:hover { background: var(--bg-secondary); }
          .col-center { text-align: center; }
          .col-money { text-align: center; font-family: monospace; }
          .col-right { text-align: right; }
          .cabify-pagos-table th.col-money { text-align: center; }
          .col-nombre { max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
          .cabify-pagos-col-th { background: rgba(124, 58, 237, 0.08) !important; border-left: 2px solid rgba(124, 58, 237, 0.25) !important; color: #7C3AED !important; }
          .cabify-pagos-col { background: rgba(124, 58, 237, 0.04); border-left: 2px solid rgba(124, 58, 237, 0.25); }
          .cabify-pagos-importe { font-weight: 700; color: #7C3AED; }
          .cabify-pagos-row-num { color: var(--text-muted); }
          .cabify-pagos-cobrado { color: #16a34a; }
          .cabify-pagos-muted { color: var(--text-muted); }
          .cabify-pagos-pagado { color: #16a34a; font-weight: 600; }
          .cabify-pagos-saldo { color: #DC2626; font-weight: 700; background: rgba(220, 38, 38, 0.08); border-radius: 4px; }
          .cabify-pagos-saldo-row { background: #fef2f2 !important; }
          .cabify-pagos-saldo-row:hover { background: #fee2e2 !important; }
          [data-theme="dark"] .cabify-pagos-saldo-row { background: rgba(220, 38, 38, 0.06) !important; }
          [data-theme="dark"] .cabify-pagos-saldo-row:hover { background: rgba(220, 38, 38, 0.12) !important; }
          [data-theme="dark"] .cabify-pagos-saldo { background: rgba(220, 38, 38, 0.15); }
          .totals-row { background: var(--bg-secondary) !important; font-weight: 600; }
          .totals-row td { border-top: 2px solid var(--border-color); position: sticky; bottom: 0; background: var(--bg-secondary); padding: 10px 8px; }
          .spinning { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          [data-theme="dark"] .cabify-pagos-col-th { background: rgba(124, 58, 237, 0.15) !important; border-left-color: rgba(124, 58, 237, 0.4) !important; }
          [data-theme="dark"] .cabify-pagos-col { background: rgba(124, 58, 237, 0.08); }
          [data-theme="dark"] .cabify-pagos-highlight { background: rgba(124, 58, 237, 0.2) !important; }
          [data-theme="dark"] .cabify-pagos-highlight strong { color: #a78bfa !important; }
        `}</style>
      </div>
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
    
    return (
      <CabifyPreviewTable
        data={cabifyPreviewData}
        semana={semanaNum}
        anio={anioNum}
        fechaInicio={fechaInicioStr}
        fechaFin={fechaFinStr}
        periodoId={undefined}
        onClose={() => {
          setShowCabifyPreview(false)
          setCabifyPreviewData([])
        }}
        onExport={exportarCabifyExcel}
        exporting={exportingCabify}
        onSync={undefined}
      />
    )
  }

  // Funciones de sync deshabilitadas temporalmente - previews son solo vista previa (read-only)
  void syncRITChanges; void syncFacturacionChanges; void enlazarConceptoPendiente; void syncCabifyChanges; void conceptosPendientes

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
          <button
            className="fact-nav-btn"
            onClick={semanaSiguiente}
            title={new Date() >= semanaActual.inicio && new Date() <= semanaActual.fin ? 'Estás en la semana actual' : 'Semana siguiente'}
            disabled={new Date() >= semanaActual.inicio && new Date() <= semanaActual.fin}
            style={new Date() >= semanaActual.inicio && new Date() <= semanaActual.fin ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="fact-semana-actions">
          {/* Botón Generar - solo cuando NO existe período Y la semana anterior está cerrada */}
          {!periodo && !loading && periodoAnteriorCerrado && (
            <button
              className="fact-btn-primary"
              onClick={generarNuevoPeriodo}
              disabled={generando || recalculando}
              title="Generar facturación para esta semana"
            >
              {generando ? (
                <Loader2 size={14} className="spinning" />
              ) : (
                <Play size={14} />
              )}
              {generando ? 'Generando...' : 'Generar'}
            </button>
          )}
          {/* Mensaje si la semana anterior no está cerrada */}
          {!periodo && !loading && !periodoAnteriorCerrado && (
            <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 500 }}>
              Cierre la semana anterior primero
            </span>
          )}
          {/* Botón Recalcular - solo cuando período está abierto/procesando */}
          {(periodo?.estado === 'abierto' || periodo?.estado === 'procesando') && (
            <button
              className="fact-btn-primary"
              onClick={() => recalcularPeriodoAbierto()}
              disabled={recalculando || loading || periodo?.estado === 'procesando' || cerrando}
              title="Recalcular incorporando excesos, tickets y penalidades"
            >
              <Calculator size={14} className={recalculando || periodo?.estado === 'procesando' ? 'spinning' : ''} />
              {recalculando && recalculandoProgreso.total > 0
                ? `Recalculando ${recalculandoProgreso.actual}/${recalculandoProgreso.total}...`
                : recalculando || periodo?.estado === 'procesando'
                  ? 'Recalculando...'
                  : 'Recalcular'}
            </button>
          )}
          {/* Botón Cerrar Período - SOLO cuando hay período abierto */}
          {periodo?.estado === 'abierto' && (
            <button
              className="fact-btn-primary"
              onClick={cerrarPeriodo}
              disabled={recalculando || loading || cerrando}
              title="Cerrar período y copiar conductores a la siguiente semana"
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
            >
              <Lock size={14} className={cerrando ? 'spinning' : ''} />
              {cerrando ? 'Cerrando...' : 'Cerrar Período'}
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
                   Cálculo en tiempo real desde conductores de la semana. No guardado en BD.
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
              {buscarConductor && (
                <button
                  className="fact-filtro-limpiar"
                  onClick={() => {
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
              return true
            })}
            columns={columns}
            loading={loadingVistaPrevia}
            searchPlaceholder="Buscar..."
            emptyIcon={<Calculator size={48} />}
             emptyTitle="Sin conductores registrados"
             emptyDescription="No hay conductores en la tabla de control para esta semana"
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

          {/* Acciones */}
          <div className="fact-filtros-columna">
            <div className="fact-filtros-grupo">
            </div>

            <div className="fact-export-btn-group">
              <button
                className="fact-btn-export"
                onClick={prepararSiFacturaPreview}
                disabled={loadingSiFacturaPreview || facturacionesFiltradas.length === 0 || periodo?.estado === 'procesando'}
                style={{ backgroundColor: '#059669' }}
              >
                {loadingSiFacturaPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingSiFacturaPreview ? 'Cargando...' : 'Preview Facturación'}
              </button>
              <button
                className="fact-btn-export"
                onClick={prepararCabifyPreviewDesdeFacturacion}
                disabled={loadingCabifyPreview || facturacionesFiltradas.length === 0 || periodo?.estado === 'procesando'}
                style={{ backgroundColor: '#7C3AED' }}
              >
                {loadingCabifyPreview ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />}
                {loadingCabifyPreview ? 'Cargando...' : 'Preview Cabify'}
              </button>
              {periodo?.estado === 'cerrado' && (
                <>
                  <input
                    type="file"
                    ref={cabifyFileInputRef}
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={handleCabifyFileUpload}
                  />
                  <button
                    className="fact-btn-export"
                    onClick={() => cabifyFileInputRef.current?.click()}
                    disabled={loadingCabifyPagos || facturacionesFiltradas.length === 0}
                    style={{ backgroundColor: '#7C3AED' }}
                  >
                    {loadingCabifyPagos ? <Loader2 size={14} className="spinning" /> : <Upload size={14} />}
                    {loadingCabifyPagos ? 'Leyendo...' : 'Cargar Pagos Cabify'}
                  </button>
                </>
              )}
              {/* Botones ocultos para mantener funciones */}
              <button style={{ display: 'none' }} onClick={exportarExcel} disabled={exportingExcel}>Excel</button>
              <button style={{ display: 'none' }} onClick={prepareRITPreview} disabled={loadingRITPreview}>RIT</button>
            </div>
          </div>

          {/* DataTable */}
          <div style={{ position: 'relative' }}>
            {(periodo?.estado === 'procesando' || recalculando) && (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: 'var(--bg-overlay, rgba(255,255,255,0.85))',
                borderRadius: '8px',
                minHeight: '200px',
              }}>
                <Loader2 size={32} className="spinning" style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {recalculandoProgreso.total > 0
                    ? `Recalculando ${recalculandoProgreso.actual} de ${recalculandoProgreso.total} conductores...`
                    : 'Recalculando facturacion...'}
                </span>
              </div>
            )}
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
          </div>
        </>
      )}

      {/* Modal de desglose de días */}
      {showDiasModal && (
        <div className="fact-modal-overlay" onClick={() => setShowDiasModal(false)}>
          <div className="fact-modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Desglose de Días</h2>
              <button className="fact-modal-close" onClick={() => setShowDiasModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="fact-modal-body">
              {loadingDias ? (
                <div className="fact-loading-detalle">
                  <Loader2 size={32} className="spinning" />
                  <span>Cargando...</span>
                </div>
              ) : diasModalData ? (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{diasModalData.conductorNombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DNI: {diasModalData.conductorDni}</div>
                    </div>
                    <div style={{
                      fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)',
                      lineHeight: 1,
                    }}>
                      {diasModalData.totalDias}<span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-secondary)' }}>/7</span>
                    </div>
                  </div>

                  {/* Día por día */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {diasModalData.dias.map((d, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '6px',
                        background: d.trabajado ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                        border: `1px solid ${d.trabajado ? 'rgba(16, 185, 129, 0.15)' : 'var(--border-primary)'}`,
                      }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: d.trabajado ? '#10b981' : '#d1d5db', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', width: '80px' }}>
                          {d.diaSemana}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
                          {d.fecha}
                        </span>
                        {d.trabajado ? (
                          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>{d.horario}</span>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>-</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Botón historial completo */}
                  <div style={{ marginTop: '12px', textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        if (diasModalData) {
                          cargarHistorialAsignaciones(diasModalData.conductorId, diasModalData.conductorNombre, diasModalData.conductorDni)
                        }
                      }}
                      style={{
                        background: 'none', border: '1px solid var(--border-primary)', borderRadius: '6px',
                        padding: '6px 14px', fontSize: '11px', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      Ver historial de asignaciones
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal de historial de asignaciones */}
      {showHistorialModal && (
        <div className="fact-modal-overlay" onClick={() => setShowHistorialModal(false)}>
          <div className="fact-modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Historial de Asignaciones</h2>
              <button className="fact-modal-close" onClick={() => setShowHistorialModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="fact-modal-body">
              {loadingHistorial ? (
                <div className="fact-loading-detalle">
                  <Loader2 size={32} className="spinning" />
                  <span>Cargando historial...</span>
                </div>
              ) : historialModalData ? (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{historialModalData.conductorNombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DNI: {historialModalData.conductorDni}</div>
                    </div>
                    <div style={{
                      fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)',
                      lineHeight: 1,
                    }}>
                      {historialModalData.asignaciones.length}
                      <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '4px' }}>
                        {historialModalData.asignaciones.length === 1 ? 'asignacion' : 'asignaciones'}
                      </span>
                    </div>
                  </div>

                  {historialModalData.asignaciones.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Sin asignaciones registradas
                    </div>
                  ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {historialModalData.asignaciones.map((a) => {
                          const esActiva = a.padreEstado.toLowerCase().includes('activ')
                          const esFinalizada = a.padreEstado.toLowerCase().includes('finaliz')
                          const esCancelada = a.padreEstado.toLowerCase().includes('cancel')
                          const esProgramada = a.padreEstado.toLowerCase().includes('program')

                          const bgColor = esActiva ? 'rgba(16, 185, 129, 0.06)'
                            : esFinalizada ? 'rgba(107, 114, 128, 0.04)'
                            : esCancelada ? 'rgba(239, 68, 68, 0.04)'
                            : 'transparent'

                          const borderColor = esActiva ? 'rgba(16, 185, 129, 0.15)'
                            : esCancelada ? 'rgba(239, 68, 68, 0.12)'
                            : 'var(--border-primary)'

                          const estadoColor = esActiva ? '#10b981'
                            : esCancelada ? '#ef4444'
                            : esProgramada ? '#3b82f6'
                            : '#6b7280'

                          const estadoBg = esActiva ? 'rgba(16,185,129,0.1)'
                            : esCancelada ? 'rgba(239,68,68,0.1)'
                            : esProgramada ? 'rgba(59,130,246,0.1)'
                            : 'rgba(107,114,128,0.1)'

                          return (
                            <div key={a.id} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 12px', borderRadius: '6px',
                              background: bgColor,
                              border: `1px solid ${borderColor}`,
                            }}>
                              {/* Indicador */}
                              <div style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: estadoColor, flexShrink: 0,
                              }} />

                              {/* Patente */}
                              <span style={{
                                fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)',
                                width: '70px', flexShrink: 0,
                                fontFamily: 'monospace',
                              }}>
                                {a.vehiculoPatente}
                              </span>

                              {/* Fechas */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
                                  {a.fechaInicio !== '-' ? formatDate(a.fechaInicio) : '-'}
                                  <span style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>&rarr;</span>
                                  {a.fechaFin ? formatDate(a.fechaFin) : <span style={{ color: '#10b981', fontWeight: 500 }}>vigente</span>}
                                </div>
                              </div>

                              {/* Horario */}
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '55px', textAlign: 'center' }}>
                                {a.horario}
                              </span>

                              {/* Estado badge */}
                              <span style={{
                                padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 500,
                                background: estadoBg, color: estadoColor,
                                whiteSpace: 'nowrap',
                              }}>
                                {a.padreEstado}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {showDetalle && (
        <div className="fact-modal-overlay" onClick={() => { setShowDetalle(false); setDetallePagos([]) }}>
          <div className="fact-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Detalle de Facturación</h2>
              <button className="fact-modal-close" onClick={() => { setShowDetalle(false); setDetallePagos([]) }}>
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
                      {detalleCargos.map(item => {
                        // Asegurar que la descripción incluya el nombre del concepto
                        const conceptoLabels: Record<string, string> = {
                          'P001': 'Alquiler a Cargo',
                          'P002': 'Alquiler Turno',
                          'P003': 'Cuota de Garantía',
                          'P005': 'Telepeajes',
                        }
                        const label = conceptoLabels[item.concepto_codigo]
                        let desc = item.concepto_descripcion
                        if (label && !desc.includes('Alquiler') && !desc.includes('Garantía') && !desc.includes('Telepeaje')) {
                          desc = desc ? `${label} (${desc})` : label
                        }
                        return (
                        <div key={item.id} className="fact-item">
                          <span className="fact-item-desc">
                            {desc}
                            {item.cantidad > 1 && <small> x{item.cantidad}</small>}
                          </span>
                          <span className="fact-item-monto">{formatCurrency(item.total)}</span>
                        </div>
                        )
                      })}

                      {/* Saldo anterior positivo = debe pagar */}
                      {detalleFacturacion.saldo_anterior > 0 && (
                        <div className="fact-item" style={{ background: '#FEF3C7', padding: '6px 8px', borderRadius: '4px', marginTop: '4px' }}>
                          <span className="fact-item-desc" style={{ color: '#92400E' }}>Saldo Anterior (Deuda)</span>
                          <span className="fact-item-monto" style={{ color: '#ff0033' }}>{formatCurrency(detalleFacturacion.saldo_anterior)}</span>
                        </div>
                      )}

                      {/* Mora: solo mostrar como línea separada si NO existe P009 en los detalles (evitar duplicado) */}
                      {detalleFacturacion.monto_mora > 0 && !detalleCargos.some(d => d.concepto_codigo === 'P009') && (
                        <div className="fact-item">
                          <span className="fact-item-desc">Mora ({detalleFacturacion.dias_mora} días al 1%)</span>
                          <span className="fact-item-monto">{formatCurrency(detalleFacturacion.monto_mora)}</span>
                        </div>
                      )}

                      <div className="fact-item total">
                        <span className="fact-item-desc">SUBTOTAL CARGOS</span>
                        <span className="fact-item-monto">
                          {formatCurrency(
                            detalleFacturacion.subtotal_cargos
                            + Math.max(0, detalleFacturacion.saldo_anterior)
                            + (detalleCargos.some(d => d.concepto_codigo === 'P009') ? 0 : detalleFacturacion.monto_mora)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sección de Descuentos / Créditos */}
                  {(detalleDescuentos.length > 0 || detalleFacturacion.saldo_anterior < 0) && (
                    <div className="fact-detalle-seccion">
                      <h4 className="fact-seccion-titulo creditos">Descuentos / Créditos (A Favor)</h4>
                      <div className="fact-detalle-items">
                        {detalleDescuentos.map(item => {
                          const conceptoLabels: Record<string, string> = {
                            'P004': 'Tickets/Descuentos',
                          }
                          const label = conceptoLabels[item.concepto_codigo]
                          let desc = item.concepto_descripcion
                          if (label && !desc.includes('Ticket') && !desc.includes('Descuento') && !desc.includes('Comisión')) {
                            desc = desc ? `${label} (${desc})` : label
                          }
                          return (
                          <div key={item.id} className="fact-item">
                            <span className="fact-item-desc">{desc}</span>
                            <span className="fact-item-monto credito">-{formatCurrency(item.total)}</span>
                          </div>
                          )
                        })}

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

                  {/* Pago registrado (solo visual, no se exporta en PDF) */}
                  {!modoVistaPrevia && (detalleFacturacion.monto_cobrado || 0) > 0 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: (detalleFacturacion.monto_cobrado || 0) >= Math.abs(detalleFacturacion.total_a_pagar) ? '#F0FDF4' : '#FEF3C7',
                      border: `1px solid ${(detalleFacturacion.monto_cobrado || 0) >= Math.abs(detalleFacturacion.total_a_pagar) ? '#BBF7D0' : '#FDE68A'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>COBRADO</span>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: (detalleFacturacion.monto_cobrado || 0) >= Math.abs(detalleFacturacion.total_a_pagar) ? '#16a34a' : '#d97706'
                        }}>
                          {formatCurrency(detalleFacturacion.monto_cobrado || 0)}
                        </span>
                      </div>
                      {(detalleFacturacion.monto_cobrado || 0) < Math.abs(detalleFacturacion.total_a_pagar) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#991B1B' }}>Saldo pendiente</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>
                            {formatCurrency(Math.abs(detalleFacturacion.total_a_pagar) - (detalleFacturacion.monto_cobrado || 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalle de pagos registrados - editar/eliminar */}
                  {!modoVistaPrevia && detallePagos.length > 0 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Pagos Registrados ({detallePagos.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {detallePagos.map((pago) => (
                          <div key={pago.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            background: 'var(--bg-primary)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-primary)'
                          }}>
                            <div style={{ flex: 1, fontSize: '12px' }}>
                              <span style={{ fontWeight: 600, color: '#16a34a' }}>{formatCurrency(pago.monto)}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                S{pago.semana}/{pago.anio}
                              </span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '11px' }}>
                                {formatDate(pago.fecha_pago)}
                              </span>
                              {pago.referencia && (
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '11px', fontStyle: 'italic' }}>
                                  {pago.referencia}
                                </span>
                              )}
                            </div>
                            <button
                              className="fact-table-btn fact-table-btn-edit"
                              title="Editar monto"
                              onClick={() => editarMontoPago(pago.id, pago.monto, detalleFacturacion.conductor_id, detalleFacturacion.id)}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              className="fact-table-btn fact-table-btn-delete"
                              title="Eliminar pago"
                              onClick={() => eliminarPago(pago.id, pago.monto, detalleFacturacion.conductor_id, detalleFacturacion.id)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="fact-no-data">No se encontró información</div>
              )}
            </div>

            <div className="fact-modal-footer">
              <button className="fact-btn-secondary" onClick={() => { setShowDetalle(false); setDetallePagos([]) }}>
                Cerrar
              </button>
              {detalleFacturacion && detalleFacturacion.total_a_pagar > 0 && (
                <button
                  className="fact-btn-primary"
                  onClick={() => { setShowDetalle(false); registrarPagoFacturacion(detalleFacturacion) }}
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                >
                  <Banknote size={16} />
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
