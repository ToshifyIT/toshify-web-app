import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
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
import { formatCurrency, formatDate, FACTURACION_CONFIG, calcularMora } from '../../../types/facturacion.types'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, parseISO, differenceInDays, isAfter, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'

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

  // Cargar facturaciones cuando cambia la semana
  useEffect(() => {
    // Resetear modo vista previa al cambiar de semana
    setModoVistaPrevia(false)
    setVistaPreviaData([])
    setBuscarConductor('')
    cargarFacturacion()
  }, [semanaActual])

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

      // 2. Cargar facturaciones de conductores para este período
      const { data: facturacionesData, error: errFact } = await (supabase
        .from('facturacion_conductores') as any)
        .select('*')
        .eq('periodo_id', (periodoData as any).id)
        .order('conductor_nombre')

      if (errFact) throw errFact

      setFacturaciones((facturacionesData || []) as FacturacionConductor[])

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
      const { data: garantias } = await (supabase
        .from('garantias_conductores') as any)
        .select('conductor_id, estado, cuotas_pagadas, cuotas_totales, tipo_alquiler')

      const garantiasMap = new Map<string, {
        conductor_id: string;
        estado: string;
        cuotas_pagadas: number;
        cuotas_totales: number;
        tipo_alquiler: string;
      }>((garantias || []).map((g: any) => [g.conductor_id, g]))

      // 3.1 Cargar datos de Cabify desde la tabla cabify_historico
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('dni, ganancia_total, cobro_efectivo, peajes')
        .gte('fecha_inicio', fechaInicio + 'T00:00:00')
        .lte('fecha_inicio', fechaFin + 'T23:59:59')

      // Crear mapa de ganancias Cabify por DNI (sumar si hay múltiples registros)
      const cabifyMap = new Map<string, number>()
      ;(cabifyData || []).forEach((record: any) => {
        if (record.dni) {
          const actual = cabifyMap.get(record.dni) || 0
          const ganancia = parseFloat(String(record.ganancia_total)) || 0
          cabifyMap.set(record.dni, actual + ganancia)
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
        const garantia = garantiasMap.get(conductorId)
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
            // Tiene garantía activa en curso
            subtotalGarantia = Math.round(FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL * factorProporcional)
            cuotaGarantiaNumero = `${garantia.cuotas_pagadas + 1}/${garantia.cuotas_totales}`
          }
        } else {
          // Sin registro de garantía = conductor nuevo, empieza cuota 1
          subtotalGarantia = Math.round(FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL * factorProporcional)
          cuotaGarantiaNumero = `1/${cuotasTotales}`
        }

        // Excesos de KM
        const exceso = excesosMap.get(conductorId)
        const montoExcesos = exceso?.monto || 0

        // Subtotal cargos
        const subtotalCargos = subtotalAlquiler + subtotalGarantia + montoExcesos

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
        const dniConductor = conductor.numero_dni || ''
        const gananciaCabify = cabifyMap.get(dniConductor) || 0
        // El conductor cubre su cuota semanal si su ganancia >= alquiler + garantía
        const cuotaFijaSemanal = subtotalAlquiler + subtotalGarantia
        const cubreCuota = gananciaCabify >= cuotaFijaSemanal

        facturacionesProyectadas.push({
          id: `preview-${conductorId}`,
          periodo_id: 'preview',
          conductor_id: conductorId,
          conductor_nombre: `${conductor.apellidos}, ${conductor.nombres}`,
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
          cuota_garantia_numero: cuotaGarantiaNumero
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

  // Ver detalle de facturación
  async function verDetalle(facturacion: FacturacionConductor) {
    setLoadingDetalle(true)
    setShowDetalle(true)
    setDetalleFacturacion(facturacion)

    // En modo Vista Previa, generar detalles simulados desde los datos calculados
    if (modoVistaPrevia || facturacion.id.startsWith('preview-')) {
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

      setDetalleItems((detalles || []) as FacturacionDetalle[])
    } catch (error) {
      console.error('Error cargando detalle:', error)
      Swal.fire('Error', 'No se pudo cargar el detalle', 'error')
      setShowDetalle(false)
    } finally {
      setLoadingDetalle(false)
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
      const rojo = '#DC2626'
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

      Swal.fire({
        icon: 'success',
        title: 'PDF Exportado',
        text: `Se descargó: ${nombreArchivo}`,
        timer: 2000,
        showConfirmButton: false
      })
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

      Swal.fire({
        icon: 'success',
        title: 'Reporte Exportado',
        text: `Se descargó: ${nombreArchivo}`,
        timer: 2000,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error exportando Excel:', error)
      Swal.fire('Error', 'No se pudo exportar el reporte', 'error')
    } finally {
      setExportingExcel(false)
    }
  }

  // Exportar formato RIT (para contabilidad)
  async function exportarRIT() {
    if (!periodo) return

    setExportingExcel(true)
    try {
      // Cargar todos los detalles de facturación del período con datos del conductor
      const { data: detalles, error } = await supabase
        .from('facturacion_detalle')
        .select(`
          *,
          facturacion_conductores!inner(
            conductor_nombre,
            conductor_dni,
            conductor_cuit,
            vehiculo_patente,
            tipo_alquiler,
            periodo_id
          )
        `)

      if (error) throw error

      // Filtrar por período actual
      const detallesFiltrados = (detalles || []).filter(
        (d: any) => d.facturacion_conductores?.periodo_id === periodo.id
      )

      if (detallesFiltrados.length === 0) {
        Swal.fire('Sin datos', 'No hay detalles para exportar', 'warning')
        setExportingExcel(false)
        return
      }

      // Columnas RIT
      const ritData: (string | number)[][] = [
        ['REPORTE RIT - FACTURACIÓN TOSHIFY'],
        [`Semana ${periodo.semana} del ${periodo.anio}`],
        [`Período: ${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} al ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`],
        [''],
        [
          'Tipo Comprobante',
          'Tipo Factura',
          'CUIT/DNI',
          'Nombre',
          'Fecha',
          'Código Concepto',
          'Descripción',
          'Neto',
          'IVA',
          'Total'
        ]
      ]

      detallesFiltrados.forEach((det: any) => {
        const fc = det.facturacion_conductores
        const tieneCuit = fc?.conductor_cuit

        // P004 (Tickets a Favor) es Nota Crédito, el resto es Nota Débito
        const tipoComprobante = det.concepto_codigo === 'P004' ? 'NC' : 'ND'

        // Tipo Factura: A si tiene CUIT, B si solo DNI
        const tipoFactura = tieneCuit ? 'A' : 'B'

        ritData.push([
          tipoComprobante,
          tipoFactura,
          tieneCuit || fc?.conductor_dni || '-',
          fc?.conductor_nombre || '-',
          format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy'),
          det.concepto_codigo,
          det.concepto_descripcion,
          det.subtotal || 0,
          det.iva_monto || 0,
          det.total || 0
        ])
      })

      // Agregar totales
      const totalNeto = detallesFiltrados.reduce((sum: number, d: any) => sum + (d.subtotal || 0), 0)
      const totalIva = detallesFiltrados.reduce((sum: number, d: any) => sum + (d.iva_monto || 0), 0)
      const totalGeneral = detallesFiltrados.reduce((sum: number, d: any) => sum + (d.total || 0), 0)

      ritData.push([''])
      ritData.push(['', '', '', '', '', '', 'TOTALES:', totalNeto, totalIva, totalGeneral])

      const wb = XLSX.utils.book_new()
      const wsRIT = XLSX.utils.aoa_to_sheet(ritData)
      wsRIT['!cols'] = [
        { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 30 },
        { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }
      ]
      XLSX.utils.book_append_sheet(wb, wsRIT, 'RIT')

      const nombreArchivo = `RIT_Facturacion_Semana${periodo.semana}_${periodo.anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      Swal.fire({
        icon: 'success',
        title: 'Reporte RIT Exportado',
        text: `Se descargó: ${nombreArchivo}`,
        timer: 2000,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error exportando RIT:', error)
      Swal.fire('Error', 'No se pudo exportar el reporte RIT', 'error')
    } finally {
      setExportingExcel(false)
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
        ['Conductor', 'DNI', 'CUIT', 'Patente', 'Tipo', 'Días', 'Alquiler', 'Garantía', 'Descuentos', 'Saldo Ant.', 'Mora', 'TOTAL']
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
        dataToExport.reduce((sum, f) => sum + f.saldo_anterior, 0),
        dataToExport.reduce((sum, f) => sum + f.monto_mora, 0),
        dataToExport.reduce((sum, f) => sum + f.total_a_pagar, 0)
      ])

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
      wsResumen['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 },
        { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }
      ]
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      const nombreArchivo = `Facturacion_Semana${semana}_${anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      Swal.fire({
        icon: 'success',
        title: 'Reporte Exportado',
        text: `Se descargó: ${nombreArchivo}`,
        timer: 2000,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error exportando Excel:', error)
      Swal.fire('Error', 'No se pudo exportar el reporte', 'error')
    } finally {
      setExportingExcel(false)
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
    const { value: nuevoSaldo } = await Swal.fire({
      title: 'Ajustar Saldo',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <p style="font-size: 13px; color: #6B7280; margin-bottom: 12px;">
            <strong>${facturacion.conductor_nombre}</strong>
          </p>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Saldo Actual</label>
            <input id="swal-saldo" type="number" value="${facturacion.saldo_anterior}" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px;">
          </div>
          <p style="font-size: 11px; color: #9CA3AF;">
            Positivo = Deuda del conductor<br>
            Negativo = Saldo a favor del conductor
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
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

      Swal.fire({
        icon: 'success',
        title: 'Saldo Actualizado',
        text: 'El nuevo saldo se aplicará en la próxima generación',
        timer: 2000,
        showConfirmButton: false
      })
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
          <strong style={{ fontSize: '13px' }}>{row.original.conductor_nombre}</strong>
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
        <span style={{ fontSize: '12px', color: '#6B7280' }}>
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
        const base = row.original.tipo_alquiler === 'CARGO'
          ? FACTURACION_CONFIG.ALQUILER_CARGO
          : FACTURACION_CONFIG.ALQUILER_TURNO
        const cobrado = row.original.subtotal_alquiler
        const isProrrateo = cobrado < base

        return (
          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 600, color: '#111827' }}>
              {formatCurrency(cobrado)}
            </div>
            {isProrrateo && (
              <div style={{ fontSize: '10px', color: '#9CA3AF', textDecoration: 'line-through' }}>
                {formatCurrency(base)}
              </div>
            )}
          </div>
        )
      }
    },
    {
      id: 'garantia_desglose',
      header: 'Garantía',
      cell: ({ row }) => {
        const base = FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL
        const cobrado = row.original.subtotal_garantia
        const isProrrateo = cobrado > 0 && cobrado < base
        const cuotaNum = row.original.cuota_garantia_numero || ''
        const isCompletada = cuotaNum === 'NA'

        if (isCompletada) {
          return (
            <div style={{ fontSize: '12px' }}>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#D1FAE5',
                color: '#065F46',
                fontSize: '10px',
                fontWeight: 600
              }}>
                COMPLETADA
              </span>
            </div>
          )
        }

        return (
          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 500, color: '#374151' }}>
              {formatCurrency(cobrado)}
            </div>
            <div style={{ fontSize: '10px', color: '#6B7280' }}>
              {cuotaNum && <span>Cuota {cuotaNum}</span>}
              {isProrrateo && (
                <span style={{ marginLeft: '4px', color: '#9CA3AF', textDecoration: 'line-through' }}>
                  {formatCurrency(base)}
                </span>
              )}
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
          return <span style={{ color: '#9CA3AF', fontSize: '12px' }}>-</span>
        }

        return (
          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 600, color: '#DC2626' }}>
              {formatCurrency(totalExcesos)}
            </div>
            <div style={{ fontSize: '10px', color: '#6B7280' }}>
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
            color: row.original.saldo_anterior > 0 ? '#DC2626' : row.original.saldo_anterior < 0 ? '#059669' : '#9CA3AF'
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
              color: '#9CA3AF',
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
          color: row.original.subtotal_descuentos > 0 ? '#059669' : '#9CA3AF'
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
            background: total > 0 ? '#FEE2E2' : '#D1FAE5',
            color: total > 0 ? '#991B1B' : '#065F46'
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
          <div style={{ fontSize: '9px', color: '#9CA3AF' }}>Ganancia</div>
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
              color: cubreCuota ? '#059669' : '#DC2626',
              padding: '2px 6px',
              borderRadius: '4px',
              background: cubreCuota ? '#D1FAE5' : '#FEE2E2'
            }}>
              {formatCurrency(ganancia)}
            </div>
            <div style={{
              fontSize: '9px',
              marginTop: '2px',
              color: cubreCuota ? '#059669' : '#DC2626'
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
        <button
          className="dt-btn-action dt-btn-view"
          onClick={(e) => { e.stopPropagation(); verDetalle(row.original) }}
          title="Ver detalle completo"
          style={{ padding: '6px' }}
        >
          <Eye size={14} />
        </button>
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

  return (
    <>
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
        </div>
      </div>

      {/* Estado del período */}
      {periodo && (
        <div className="fact-periodo-estado" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: periodo.estado === 'cerrado' ? '#FEF2F2' : periodo.estado === 'abierto' ? '#F0FDF4' : '#FEF3C7',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          <AlertCircle size={16} style={{ color: periodo.estado === 'cerrado' ? '#DC2626' : periodo.estado === 'abierto' ? '#059669' : '#D97706' }} />
          <span style={{ fontSize: '13px', color: '#374151' }}>
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
            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '1px solid #93C5FD'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calculator size={20} style={{ color: '#2563EB' }} />
              <div>
                <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: '14px' }}>
                  VISTA PREVIA - Liquidación Proyectada
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#3B82F6' }}>
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
                  background: '#2563EB',
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
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: '8px'
          }}>
            <Search size={18} style={{ color: '#6B7280' }} />
            <input
              type="text"
              placeholder="Buscar conductor por nombre, DNI o patente..."
              value={buscarConductor}
              onChange={(e) => setBuscarConductor(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            {buscarConductor && (
              <button
                onClick={() => setBuscarConductor('')}
                style={{
                  padding: '6px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9CA3AF'
                }}
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
                onClick={exportarVistaPreviaExcel}
                disabled={exportingExcel || vistaPreviaData.length === 0}
              >
                {exportingExcel ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
                {exportingExcel ? 'Exportando...' : 'Exportar Excel RIT'}
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
            pageSize={20}
            pageSizeOptions={[10, 20, 50, 100]}
            onTableReady={setTableInstance}
          />
        </>
      )}

      {/* Con período generado */}
      {periodo && (
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
                onClick={exportarExcel}
                disabled={exportingExcel || facturacionesFiltradas.length === 0}
              >
                {exportingExcel ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
                {exportingExcel ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button
                className="fact-btn-export"
                onClick={exportarRIT}
                disabled={exportingExcel || facturacionesFiltradas.length === 0}
              >
                {exportingExcel ? <Loader2 size={14} className="spinning" /> : <FileText size={14} />}
                Exportar RIT
              </button>
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
            pageSize={20}
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
                      {detalleItems.filter(d => !d.es_descuento).map(item => (
                        <div key={item.id} className="fact-item">
                          <span className="fact-item-desc">
                            {item.concepto_descripcion}
                            {item.cantidad > 1 && <small> x{item.cantidad}</small>}
                          </span>
                          <span className="fact-item-monto">{formatCurrency(item.total)}</span>
                        </div>
                      ))}

                      {detalleFacturacion.saldo_anterior > 0 && (
                        <div className="fact-item">
                          <span className="fact-item-desc">Saldo Anterior</span>
                          <span className="fact-item-monto">{formatCurrency(detalleFacturacion.saldo_anterior)}</span>
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
                          {formatCurrency(detalleFacturacion.subtotal_cargos + detalleFacturacion.saldo_anterior + detalleFacturacion.monto_mora)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sección de Descuentos */}
                  {detalleItems.some(d => d.es_descuento) && (
                    <div className="fact-detalle-seccion">
                      <h4 className="fact-seccion-titulo creditos">Descuentos (A Favor)</h4>
                      <div className="fact-detalle-items">
                        {detalleItems.filter(d => d.es_descuento).map(item => (
                          <div key={item.id} className="fact-item">
                            <span className="fact-item-desc">{item.concepto_descripcion}</span>
                            <span className="fact-item-monto credito">-{formatCurrency(item.total)}</span>
                          </div>
                        ))}

                        <div className="fact-item total">
                          <span className="fact-item-desc">SUBTOTAL DESCUENTOS</span>
                          <span className="fact-item-monto credito">-{formatCurrency(detalleFacturacion.subtotal_descuentos)}</span>
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
