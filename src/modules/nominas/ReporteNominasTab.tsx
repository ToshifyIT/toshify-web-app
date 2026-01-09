import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
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
  AlertTriangle,
  Car,
  FileText,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Filter
} from 'lucide-react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import type {
  NominaResumen,
  NominaConductor,
  ReporteNominasStats,
  ConceptoNomina,
  DetalleDiario,
  PenalidadNomina,
  SiniestroNomina
} from '../../types/nominas.types'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, eachDayOfInterval, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// Tipos internos para datos de Supabase
interface AsignacionDB {
  id: string
  codigo: string
  horario: string | null
  modalidad: string
  vehiculo_id: string | null
  conductor_id: string | null
  conductores: { id: string; nombres: string; apellidos: string; numero_dni: string; numero_cuit: string | null; email: string | null } | null
  vehiculos: { id: string; patente: string } | null
}

interface PenalidadDB {
  id: string
  fecha: string
  monto: number | null
  detalle: string | null
  aplicado: boolean
  conductor_id: string
  tipos_penalidad: { codigo: string; nombre: string } | null
}

interface SiniestroDB {
  id: string
  fecha_siniestro: string
  presupuesto_real: number | null
  responsable: string
  conductor_id: string
  siniestros_categorias: { nombre: string } | null
  vehiculos: { patente: string } | null
}

interface CabifyDB {
  dni: string
  cobro_efectivo: number | null
  peajes: number | null
  ganancia_total: number | null
  viajes_finalizados?: number | null
  fecha_inicio?: string
}

// Función para obtener el inicio de semana en Argentina (lunes)
function getSemanaArgentina(date: Date) {
  const inicio = startOfWeek(date, { weekStartsOn: 1 }) // Lunes
  const fin = endOfWeek(date, { weekStartsOn: 1 }) // Domingo
  return { inicio, fin }
}

// Nombres de los días
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function ReporteNominasTab() {
  // Estados principales
  const [nominas, setNominas] = useState<NominaResumen[]>([])
  const [stats, setStats] = useState<ReporteNominasStats | null>(null)
  const [conceptos, setConceptos] = useState<ConceptoNomina[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // Estado de semana seleccionada
  const [semanaActual, setSemanaActual] = useState(() => {
    const hoy = new Date()
    return getSemanaArgentina(hoy)
  })

  // Modal de detalle
  const [showDetalle, setShowDetalle] = useState(false)
  const [nominaDetalle, setNominaDetalle] = useState<NominaConductor | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Table instance and filters
  const [tableInstance, setTableInstance] = useState<Table<NominaResumen> | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroPenalidades, setFiltroPenalidades] = useState<string>('todos')
  const [filtroSiniestros, setFiltroSiniestros] = useState<string>('todos')
  const [filtroSaldo, setFiltroSaldo] = useState<string>('todos')
  const [exportingExcel, setExportingExcel] = useState(false)

  // Filtros tipo Excel por columna
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoDocFilter, setTipoDocFilter] = useState<string[]>([])
  const [vehiculoFilter, setVehiculoFilter] = useState<string[]>([])
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [tipoHorarioFilter, setTipoHorarioFilter] = useState<string[]>([])

  // Cargar conceptos al montar
  useEffect(() => {
    cargarConceptos()
  }, [])

  // Cargar nóminas cuando cambia la semana
  useEffect(() => {
    cargarNominas()
  }, [semanaActual])

  async function cargarConceptos() {
    try {
      const { data, error } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .eq('activo', true)
        .order('orden')

      if (error) throw error
      setConceptos(data || [])
    } catch (error) {
      console.error('Error cargando conceptos:', error)
    }
  }

  async function cargarNominas() {
    setLoading(true)
    try {
      const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
      const fechaFin = format(semanaActual.fin, 'yyyy-MM-dd')

      // 1. Obtener asignaciones activas con sus conductores
      const { data: asignacionesRaw, error: errAsig } = await supabase
        .from('asignaciones')
        .select(`
          id,
          codigo,
          horario,
          modalidad,
          vehiculo_id,
          conductor_id,
          conductores:conductor_id(id, nombres, apellidos, numero_dni, numero_cuit, email),
          vehiculos:vehiculo_id(id, patente)
        `)
        .eq('estado', 'activa')

      if (errAsig) throw errAsig
      const asignaciones = asignacionesRaw as unknown as AsignacionDB[]

      if (!asignaciones || asignaciones.length === 0) {
        setNominas([])
        setStats({
          total_conductores: 0,
          total_cargos: 0,
          total_creditos: 0,
          saldo_total: 0,
          conductores_a_favor: 0,
          conductores_deben: 0
        })
        setLoading(false)
        return
      }

      // 2. Obtener IDs de conductores y DNIs
      const conductorIds = asignaciones
        .map(a => a.conductores?.id)
        .filter((id): id is string => !!id)

      const dnis = asignaciones
        .map(a => a.conductores?.numero_dni)
        .filter((dni): dni is string => !!dni)

      // 3. Ejecutar consultas en PARALELO para mejor performance
      const [penalidadesResult, siniestrosResult, cabifyResult] = await Promise.all([
        // Penalidades del período
        supabase
          .from('penalidades')
          .select(`
            id,
            fecha,
            monto,
            detalle,
            aplicado,
            conductor_id,
            tipos_penalidad:tipo_penalidad_id(codigo, nombre)
          `)
          .in('conductor_id', conductorIds)
          .gte('fecha', fechaInicio)
          .lte('fecha', fechaFin),

        // Siniestros del período
        supabase
          .from('siniestros')
          .select(`
            id,
            fecha_siniestro,
            presupuesto_real,
            responsable,
            conductor_id,
            siniestros_categorias:categoria_id(nombre),
            vehiculos:vehiculo_id(patente)
          `)
          .in('conductor_id', conductorIds)
          .gte('fecha_siniestro', fechaInicio + 'T00:00:00')
          .lte('fecha_siniestro', fechaFin + 'T23:59:59')
          .in('responsable', ['conductor', 'compartida']),

        // Datos de Cabify del período
        supabase
          .from('cabify_historico')
          .select('dni, cobro_efectivo, peajes, ganancia_total')
          .in('dni', dnis)
          .gte('fecha_inicio', fechaInicio + 'T00:00:00')
          .lte('fecha_inicio', fechaFin + 'T23:59:59')
      ])

      if (penalidadesResult.error) throw penalidadesResult.error
      if (siniestrosResult.error) throw siniestrosResult.error
      if (cabifyResult.error) throw cabifyResult.error

      const penalidades = penalidadesResult.data as unknown as PenalidadDB[]
      const siniestros = siniestrosResult.data as unknown as SiniestroDB[]
      const cabifyData = cabifyResult.data as unknown as CabifyDB[]

      // 6. Obtener precios de alquiler
      const precioTurno = conceptos.find(c => c.codigo === 'P001')?.precio_final || 35000
      const precioCargo = conceptos.find(c => c.codigo === 'P002')?.precio_final || 51428.57

      // 7. Procesar nóminas por conductor
      const nominasCalculadas: NominaResumen[] = asignaciones.map(asig => {
        const conductor = asig.conductores
        const vehiculo = asig.vehiculos

        if (!conductor) {
          return null
        }

        // Calcular alquiler según tipo de horario
        const tipoHorario = asig.horario || 'TURNO'
        const alquilerSemanal = tipoHorario === 'CARGO' ? precioCargo : precioTurno

        // Sumar penalidades del conductor
        const penConductor = (penalidades || []).filter(p => p.conductor_id === conductor.id)
        const totalPenalidades = penConductor.reduce((sum, p) => sum + (parseFloat(String(p.monto)) || 0), 0)

        // Sumar siniestros del conductor (solo si es responsable)
        const sinConductor = (siniestros || []).filter(s => s.conductor_id === conductor.id)
        const totalSiniestros = sinConductor.reduce((sum, s) => {
          const presupuesto = parseFloat(String(s.presupuesto_real)) || 0
          // Si es compartida, solo 50%
          return sum + (s.responsable === 'compartida' ? presupuesto * 0.5 : presupuesto)
        }, 0)

        // Datos de Cabify
        const cabConductor = (cabifyData || []).filter(c => c.dni === conductor.numero_dni)
        const efectivoCabify = cabConductor.reduce((sum, c) => sum + (parseFloat(String(c.cobro_efectivo)) || 0), 0)
        const peajesCabify = cabConductor.reduce((sum, c) => sum + (parseFloat(String(c.peajes)) || 0), 0)

        // Totales
        const totalCargos = alquilerSemanal + totalPenalidades + totalSiniestros + peajesCabify
        const totalCreditos = efectivoCabify
        const saldo = totalCargos - totalCreditos

        return {
          conductor_id: conductor.id,
          conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
          conductor_dni: conductor.numero_dni || '',
          conductor_cuit: conductor.numero_cuit || null,
          vehiculo_patente: vehiculo?.patente || null,
          tipo_horario: tipoHorario,
          total_cargos: totalCargos,
          total_creditos: totalCreditos,
          saldo: saldo,
          dias_trabajados: 7, // Por defecto toda la semana
          tiene_penalidades: penConductor.length > 0,
          tiene_siniestros: sinConductor.length > 0
        }
      }).filter(Boolean) as NominaResumen[]

      // Ordenar por nombre
      nominasCalculadas.sort((a, b) => a.conductor_nombre.localeCompare(b.conductor_nombre))

      setNominas(nominasCalculadas)

      // Calcular estadísticas
      const statsCalc: ReporteNominasStats = {
        total_conductores: nominasCalculadas.length,
        total_cargos: nominasCalculadas.reduce((sum, n) => sum + n.total_cargos, 0),
        total_creditos: nominasCalculadas.reduce((sum, n) => sum + n.total_creditos, 0),
        saldo_total: nominasCalculadas.reduce((sum, n) => sum + n.saldo, 0),
        conductores_a_favor: nominasCalculadas.filter(n => n.saldo < 0).length,
        conductores_deben: nominasCalculadas.filter(n => n.saldo > 0).length
      }
      setStats(statsCalc)

    } catch (error) {
      console.error('Error cargando nóminas:', error)
      Swal.fire('Error', 'No se pudo cargar la facturación', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Ver detalle de nómina
  async function verDetalle(nomina: NominaResumen) {
    setLoadingDetalle(true)
    setShowDetalle(true)

    try {
      const fechaInicio = format(semanaActual.inicio, 'yyyy-MM-dd')
      const fechaFin = format(semanaActual.fin, 'yyyy-MM-dd')

      // Ejecutar TODAS las consultas en PARALELO para mejor performance
      const [asignacionResult, penalidadesResult, siniestrosResult, cabifyResult] = await Promise.all([
        // Asignación del conductor
        supabase
          .from('asignaciones')
          .select(`
            id,
            codigo,
            horario,
            vehiculos:vehiculo_id(patente)
          `)
          .eq('conductor_id', nomina.conductor_id)
          .eq('estado', 'activa')
          .single(),

        // Penalidades detalladas
        supabase
          .from('penalidades')
          .select(`
            id,
            fecha,
            monto,
            detalle,
            aplicado,
            tipos_penalidad:tipo_penalidad_id(codigo, nombre)
          `)
          .eq('conductor_id', nomina.conductor_id)
          .gte('fecha', fechaInicio)
          .lte('fecha', fechaFin)
          .order('fecha'),

        // Siniestros detallados
        supabase
          .from('siniestros')
          .select(`
            id,
            fecha_siniestro,
            presupuesto_real,
            responsable,
            siniestros_categorias:categoria_id(nombre),
            vehiculos:vehiculo_id(patente)
          `)
          .eq('conductor_id', nomina.conductor_id)
          .gte('fecha_siniestro', fechaInicio + 'T00:00:00')
          .lte('fecha_siniestro', fechaFin + 'T23:59:59')
          .in('responsable', ['conductor', 'compartida'])
          .order('fecha_siniestro'),

        // Datos de Cabify
        supabase
          .from('cabify_historico')
          .select('cobro_efectivo, peajes, ganancia_total, viajes_finalizados, fecha_inicio, dni')
          .eq('dni', nomina.conductor_dni)
          .gte('fecha_inicio', fechaInicio + 'T00:00:00')
          .lte('fecha_inicio', fechaFin + 'T23:59:59')
      ])

      const asignacion = asignacionResult.data as { id: string; codigo: string; horario: string | null; vehiculos: { patente: string } | null } | null
      const penalidades = penalidadesResult.data as unknown as PenalidadDB[]
      const siniestros = siniestrosResult.data as unknown as SiniestroDB[]
      const cabifyData = cabifyResult.data as unknown as CabifyDB[]

      // Precios
      const precioTurno = conceptos.find(c => c.codigo === 'P001')?.precio_final || 35000
      const precioCargo = conceptos.find(c => c.codigo === 'P002')?.precio_final || 51428.57
      const tipoHorario = asignacion?.horario || 'TURNO'
      const precioSemanal = tipoHorario === 'CARGO' ? precioCargo : precioTurno
      const precioDia = precioSemanal / 7

      // Generar detalle diario
      const diasSemana = eachDayOfInterval({
        start: semanaActual.inicio,
        end: semanaActual.fin
      })

      const detalleDiario: DetalleDiario[] = diasSemana.map((dia: Date, idx: number) => ({
        fecha: format(dia, 'yyyy-MM-dd'),
        dia_semana: DIAS_SEMANA[idx],
        tipo_horario: tipoHorario as 'TURNO' | 'CARGO',
        precio_dia: precioDia,
        asignacion_id: asignacion?.id || null,
        vehiculo_patente: asignacion?.vehiculos?.patente || null
      }))

      // Mapear penalidades
      const penalidadesDetalle: PenalidadNomina[] = (penalidades || []).map(p => ({
        id: p.id,
        fecha: p.fecha,
        tipo: p.tipos_penalidad?.codigo || '',
        tipo_nombre: p.tipos_penalidad?.nombre || 'Sin tipo',
        monto: parseFloat(String(p.monto)) || 0,
        detalle: p.detalle,
        aplicado: p.aplicado
      }))

      // Mapear siniestros
      const siniestrosDetalle: SiniestroNomina[] = (siniestros || []).map(s => ({
        id: s.id,
        fecha: s.fecha_siniestro,
        categoria: s.siniestros_categorias?.nombre || 'Sin categoría',
        presupuesto: parseFloat(String(s.presupuesto_real)) || 0,
        responsable: s.responsable,
        vehiculo_patente: s.vehiculos?.patente || null
      }))

      // Totales Cabify
      const efectivoCabify = (cabifyData || []).reduce((sum, c) => sum + (parseFloat(String(c.cobro_efectivo)) || 0), 0)
      const peajesCabify = (cabifyData || []).reduce((sum, c) => sum + (parseFloat(String(c.peajes)) || 0), 0)

      // Totales penalidades y siniestros
      const totalPenalidades = penalidadesDetalle.reduce((sum, p) => sum + p.monto, 0)
      const totalSiniestros = siniestrosDetalle.reduce((sum, s) => {
        return sum + (s.responsable === 'compartida' ? s.presupuesto * 0.5 : s.presupuesto)
      }, 0)

      // Construir objeto de detalle
      const detalle: NominaConductor = {
        conductor_id: nomina.conductor_id,
        conductor_nombre: nomina.conductor_nombre,
        conductor_dni: nomina.conductor_dni,
        conductor_email: null,

        semana: getWeek(semanaActual.inicio, { weekStartsOn: 1 }),
        anio: getYear(semanaActual.inicio),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,

        asignacion_codigo: asignacion?.codigo || null,
        vehiculo_patente: nomina.vehiculo_patente,
        tipo_horario_predominante: tipoHorario as 'TURNO' | 'CARGO' | 'MIXTO',

        alquiler_total: precioSemanal,
        alquiler_detalle: detalleDiario,
        penalidades_total: totalPenalidades,
        penalidades: penalidadesDetalle,
        siniestros_total: totalSiniestros,
        siniestros: siniestrosDetalle,
        otros_cargos: 0,

        efectivo_cabify: efectivoCabify,
        peajes_cabify: peajesCabify,
        bonos_total: 0,
        otros_creditos: 0,

        total_cargos: precioSemanal + totalPenalidades + totalSiniestros + peajesCabify,
        total_creditos: efectivoCabify,
        saldo: (precioSemanal + totalPenalidades + totalSiniestros + peajesCabify) - efectivoCabify,

        dias_trabajados: 7,
        dias_turno: tipoHorario === 'TURNO' ? 7 : 0,
        dias_cargo: tipoHorario === 'CARGO' ? 7 : 0
      }

      setNominaDetalle(detalle)
    } catch (error) {
      console.error('Error cargando detalle:', error)
      Swal.fire('Error', 'No se pudo cargar el detalle de facturación', 'error')
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
    if (!nominaDetalle) return

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

      // Header con logo (texto por ahora, luego se puede agregar imagen)
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
      pdf.text(`Semana ${nominaDetalle.semana} / ${nominaDetalle.anio}`, pageWidth - margin, y + 6, { align: 'right' })

      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${format(parseISO(nominaDetalle.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(nominaDetalle.fecha_fin), 'dd/MM/yyyy')}`, pageWidth - margin, y + 11, { align: 'right' })

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
      pdf.text(`Nombre: ${nominaDetalle.conductor_nombre}`, margin, y)
      pdf.text(`DNI: ${nominaDetalle.conductor_dni}`, pageWidth / 2, y)
      y += 5
      pdf.text(`Asignación: ${nominaDetalle.asignacion_codigo || '-'}`, margin, y)
      pdf.text(`Vehículo: ${nominaDetalle.vehiculo_patente || '-'}`, pageWidth / 2, y)
      y += 5
      pdf.text(`Tipo: ${nominaDetalle.tipo_horario_predominante}`, margin, y)
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

      // Alquiler
      pdf.text(`Alquiler Semanal (${nominaDetalle.tipo_horario_predominante})`, margin, y)
      pdf.text(formatCurrency(nominaDetalle.alquiler_total), pageWidth - margin, y, { align: 'right' })
      y += 5

      // Peajes
      if (nominaDetalle.peajes_cabify > 0) {
        pdf.text('Peajes (Cabify)', margin, y)
        pdf.text(formatCurrency(nominaDetalle.peajes_cabify), pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      // Penalidades
      if (nominaDetalle.penalidades.length > 0) {
        pdf.text(`Penalidades (${nominaDetalle.penalidades.length})`, margin, y)
        pdf.text(formatCurrency(nominaDetalle.penalidades_total), pageWidth - margin, y, { align: 'right' })
        y += 4
        pdf.setFontSize(8)
        pdf.setTextColor(gris)
        nominaDetalle.penalidades.forEach(p => {
          pdf.text(`  - ${p.tipo_nombre}: ${formatCurrency(p.monto)}`, margin + 5, y)
          y += 3.5
        })
        pdf.setFontSize(10)
        pdf.setTextColor(negro)
      }

      // Siniestros
      if (nominaDetalle.siniestros.length > 0) {
        pdf.text(`Siniestros (${nominaDetalle.siniestros.length})`, margin, y)
        pdf.text(formatCurrency(nominaDetalle.siniestros_total), pageWidth - margin, y, { align: 'right' })
        y += 4
        pdf.setFontSize(8)
        pdf.setTextColor(gris)
        nominaDetalle.siniestros.forEach(s => {
          const monto = s.responsable === 'compartida' ? s.presupuesto * 0.5 : s.presupuesto
          pdf.text(`  - ${s.categoria}: ${formatCurrency(monto)}`, margin + 5, y)
          y += 3.5
        })
        pdf.setFontSize(10)
        pdf.setTextColor(negro)
      }

      y += 3
      pdf.setFont('helvetica', 'bold')
      pdf.text('SUBTOTAL CARGOS', margin, y)
      pdf.text(formatCurrency(nominaDetalle.total_cargos), pageWidth - margin, y, { align: 'right' })
      y += 10

      // CRÉDITOS
      pdf.setFontSize(11)
      pdf.setTextColor(verde)
      pdf.text('CRÉDITOS (A FAVOR)', margin, y)
      y += 7

      pdf.setFontSize(10)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'normal')

      if (nominaDetalle.efectivo_cabify > 0) {
        pdf.text('Efectivo Recaudado (Cabify)', margin, y)
        pdf.text(`-${formatCurrency(nominaDetalle.efectivo_cabify)}`, pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      if (nominaDetalle.bonos_total > 0) {
        pdf.text('Bonos', margin, y)
        pdf.text(`-${formatCurrency(nominaDetalle.bonos_total)}`, pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      y += 3
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(verde)
      pdf.text('SUBTOTAL CRÉDITOS', margin, y)
      pdf.text(`-${formatCurrency(nominaDetalle.total_creditos)}`, pageWidth - margin, y, { align: 'right' })
      y += 15

      // SALDO FINAL
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y - 5, pageWidth - margin, y - 5)

      const saldoColor = nominaDetalle.saldo > 0 ? rojo : verde
      const saldoTexto = nominaDetalle.saldo > 0 ? 'DEBE PAGAR' : 'A FAVOR'

      pdf.setFontSize(14)
      pdf.setTextColor(saldoColor)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SALDO FINAL', margin, y + 5)

      const saldoStr = nominaDetalle.saldo > 0
        ? formatCurrency(nominaDetalle.saldo)
        : `-${formatCurrency(Math.abs(nominaDetalle.saldo))}`
      pdf.text(saldoStr, pageWidth - margin, y + 5, { align: 'right' })

      pdf.setFontSize(10)
      pdf.text(saldoTexto, pageWidth - margin, y + 11, { align: 'right' })

      y += 25

      // Detalle por día
      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('DETALLE POR DÍA', margin, y)
      y += 6

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')

      const diasPorFila = 7
      const anchoColumna = (pageWidth - 2 * margin) / diasPorFila

      nominaDetalle.alquiler_detalle.forEach((dia, index) => {
        const x = margin + (index % diasPorFila) * anchoColumna
        pdf.setTextColor(gris)
        pdf.text(dia.dia_semana.substring(0, 3).toUpperCase(), x, y)
        pdf.setTextColor(negro)
        pdf.text(format(parseISO(dia.fecha), 'dd/MM'), x, y + 4)
        pdf.setTextColor(dia.tipo_horario === 'CARGO' ? '#1D4ED8' : gris)
        pdf.text(dia.tipo_horario || '-', x, y + 8)
        pdf.setTextColor(negro)
        pdf.text(formatCurrency(dia.precio_dia), x, y + 12)
      })

      y += 25

      // Pie de página
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, pdf.internal.pageSize.getHeight() - 10)
      pdf.text('TOSHIFY - Sistema de Gestión de Flota', pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: 'right' })

      // Guardar PDF
      const nombreArchivo = `Facturacion_${nominaDetalle.conductor_nombre.replace(/\s+/g, '_')}_Semana${nominaDetalle.semana}_${nominaDetalle.anio}.pdf`
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

  // Formatear moneda
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Valores únicos para filtros tipo Excel
  const conductoresUnicos = useMemo(() => {
    return [...new Set(nominas.map(n => n.conductor_nombre))].sort()
  }, [nominas])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  const vehiculosUnicos = useMemo(() => {
    return [...new Set(nominas.map(n => n.vehiculo_patente).filter(Boolean))].sort() as string[]
  }, [nominas])

  const vehiculosFiltrados = useMemo(() => {
    if (!vehiculoSearch) return vehiculosUnicos
    return vehiculosUnicos.filter(v => v.toLowerCase().includes(vehiculoSearch.toLowerCase()))
  }, [vehiculosUnicos, vehiculoSearch])

  const tiposDocUnicos = ['CUIL', 'DNI']
  const tiposHorarioUnicos = ['TURNO', 'CARGO']

  // Funciones toggle para filtros
  const toggleConductorFilter = (conductor: string) => {
    setConductorFilter(prev =>
      prev.includes(conductor)
        ? prev.filter(c => c !== conductor)
        : [...prev, conductor]
    )
  }

  const toggleTipoDocFilter = (tipo: string) => {
    setTipoDocFilter(prev =>
      prev.includes(tipo)
        ? prev.filter(t => t !== tipo)
        : [...prev, tipo]
    )
  }

  const toggleVehiculoFilter = (vehiculo: string) => {
    setVehiculoFilter(prev =>
      prev.includes(vehiculo)
        ? prev.filter(v => v !== vehiculo)
        : [...prev, vehiculo]
    )
  }

  const toggleTipoHorarioFilter = (tipo: string) => {
    setTipoHorarioFilter(prev =>
      prev.includes(tipo)
        ? prev.filter(t => t !== tipo)
        : [...prev, tipo]
    )
  }

  // Filtrar datos según los filtros seleccionados
  const nominasFiltradas = useMemo(() => {
    return nominas.filter(n => {
      // Filtro por tipo de horario (select)
      if (filtroTipo !== 'todos' && n.tipo_horario !== filtroTipo) return false
      // Filtro por penalidades
      if (filtroPenalidades === 'con' && !n.tiene_penalidades) return false
      if (filtroPenalidades === 'sin' && n.tiene_penalidades) return false
      // Filtro por siniestros
      if (filtroSiniestros === 'con' && !n.tiene_siniestros) return false
      if (filtroSiniestros === 'sin' && n.tiene_siniestros) return false
      // Filtro por saldo
      if (filtroSaldo === 'a_favor' && n.saldo >= 0) return false
      if (filtroSaldo === 'deben' && n.saldo < 0) return false
      // Filtros tipo Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(n.conductor_nombre)) return false
      if (tipoDocFilter.length > 0) {
        const tipoDoc = n.conductor_cuit ? 'CUIL' : 'DNI'
        if (!tipoDocFilter.includes(tipoDoc)) return false
      }
      if (vehiculoFilter.length > 0 && n.vehiculo_patente && !vehiculoFilter.includes(n.vehiculo_patente)) return false
      if (tipoHorarioFilter.length > 0 && !tipoHorarioFilter.includes(n.tipo_horario)) return false
      return true
    })
  }, [nominas, filtroTipo, filtroPenalidades, filtroSiniestros, filtroSaldo, conductorFilter, tipoDocFilter, vehiculoFilter, tipoHorarioFilter])

  // Exportar a Excel - Formato de Reporte de Facturación
  async function exportarExcel() {
    setExportingExcel(true)
    try {
      // Obtener datos filtrados de la tabla
      const dataToExport = tableInstance
        ? tableInstance.getFilteredRowModel().rows.map(row => row.original)
        : nominasFiltradas

      if (dataToExport.length === 0) {
        Swal.fire('Sin datos', 'No hay datos para exportar', 'warning')
        setExportingExcel(false)
        return
      }

      const semana = getWeek(semanaActual.inicio, { weekStartsOn: 1 })
      const anio = getYear(semanaActual.inicio)
      const fechaInicio = format(semanaActual.inicio, 'dd/MM/yyyy')
      const fechaFin = format(semanaActual.fin, 'dd/MM/yyyy')

      // Crear workbook
      const wb = XLSX.utils.book_new()

      // ========== HOJA 1: RESUMEN ==========
      const resumenData: (string | number)[][] = [
        ['TOSHIFY - REPORTE DE FACTURACIÓN'],
        [`Semana ${semana} del ${anio}`],
        [`Período: ${fechaInicio} al ${fechaFin}`],
        [''],
        ['RESUMEN GENERAL'],
        [''],
        ['Concepto', 'Cantidad/Monto'],
        ['Total Conductores', dataToExport.length],
        ['Total Cargos', stats?.total_cargos || 0],
        ['Total Créditos', stats?.total_creditos || 0],
        ['Saldo Total', stats?.saldo_total || 0],
        ['Conductores a Favor', stats?.conductores_a_favor || 0],
        ['Conductores que Deben', stats?.conductores_deben || 0],
        [''],
        [''],
        ['DETALLE POR CONDUCTOR'],
        [''],
        ['Conductor', 'Tipo Doc', 'Nro Doc', 'Vehículo', 'Tipo', 'Alquiler', 'Peajes', 'Penalidades', 'Siniestros', 'Total Cargos', 'Efectivo Cabify', 'Total Créditos', 'Saldo', 'Estado']
      ]

      // Agregar datos de cada conductor
      dataToExport.forEach(n => {
        // Calcular componentes (aproximados basados en el total)
        const precioAlquiler = n.tipo_horario === 'CARGO'
          ? (conceptos.find(c => c.codigo === 'P002')?.precio_final || 51428.57)
          : (conceptos.find(c => c.codigo === 'P001')?.precio_final || 35000)

        resumenData.push([
          n.conductor_nombre,
          n.conductor_cuit ? 'CUIL' : 'DNI',
          n.conductor_cuit || n.conductor_dni || '-',
          n.vehiculo_patente || '-',
          n.tipo_horario,
          precioAlquiler,
          0, // Peajes - se calcula en detalle
          n.tiene_penalidades ? 'Sí' : 0,
          n.tiene_siniestros ? 'Sí' : 0,
          n.total_cargos,
          n.total_creditos,
          n.total_creditos,
          n.saldo,
          n.saldo > 0 ? 'DEBE' : 'A FAVOR'
        ])
      })

      // Agregar totales
      resumenData.push([''])
      resumenData.push([
        'TOTALES',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        dataToExport.reduce((sum, n) => sum + n.total_cargos, 0),
        dataToExport.reduce((sum, n) => sum + n.total_creditos, 0),
        dataToExport.reduce((sum, n) => sum + n.total_creditos, 0),
        dataToExport.reduce((sum, n) => sum + n.saldo, 0),
        ''
      ])

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)

      // Ajustar anchos de columna
      wsResumen['!cols'] = [
        { wch: 35 }, // Conductor
        { wch: 10 }, // Tipo Doc
        { wch: 15 }, // Nro Doc
        { wch: 10 }, // Vehículo
        { wch: 8 },  // Tipo
        { wch: 12 }, // Alquiler
        { wch: 10 }, // Peajes
        { wch: 12 }, // Penalidades
        { wch: 12 }, // Siniestros
        { wch: 14 }, // Total Cargos
        { wch: 14 }, // Efectivo Cabify
        { wch: 14 }, // Total Créditos
        { wch: 14 }, // Saldo
        { wch: 10 }, // Estado
      ]

      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      // ========== HOJA 2: CONCEPTOS DE FACTURACIÓN ==========
      const conceptosData: (string | number)[][] = [
        ['CONCEPTOS DE FACTURACIÓN'],
        [''],
        ['Código', 'Descripción', 'Precio Base', 'IVA %', 'Precio Final', 'Tipo', 'Aplica Turno', 'Aplica Cargo']
      ]

      conceptos.forEach(c => {
        conceptosData.push([
          c.codigo,
          c.descripcion,
          c.precio_base,
          c.iva_porcentaje,
          c.precio_final,
          c.tipo,
          c.aplica_turno ? 'Sí' : 'No',
          c.aplica_cargo ? 'Sí' : 'No'
        ])
      })

      const wsConceptos = XLSX.utils.aoa_to_sheet(conceptosData)
      wsConceptos['!cols'] = [
        { wch: 10 }, // Código
        { wch: 40 }, // Descripción
        { wch: 12 }, // Precio Base
        { wch: 8 },  // IVA %
        { wch: 12 }, // Precio Final
        { wch: 12 }, // Tipo
        { wch: 12 }, // Aplica Turno
        { wch: 12 }, // Aplica Cargo
      ]

      XLSX.utils.book_append_sheet(wb, wsConceptos, 'Conceptos')

      // ========== HOJA 3: DATOS PARA FACTURACIÓN ==========
      const facturacionData: (string | number)[][] = [
        ['DATOS PARA FACTURACIÓN - LIQUIDACIÓN SEMANAL'],
        [`Semana ${semana} - ${anio}`],
        [`Período: ${fechaInicio} al ${fechaFin}`],
        [''],
        ['N°', 'Conductor', 'Tipo Doc', 'Nro Doc', 'Concepto', 'Descripción', 'Cantidad', 'Precio Unit.', 'Subtotal', 'IVA', 'Total']
      ]

      let nro = 1
      dataToExport.forEach(n => {
        const precioAlquiler = n.tipo_horario === 'CARGO'
          ? (conceptos.find(c => c.codigo === 'P002')?.precio_final || 51428.57)
          : (conceptos.find(c => c.codigo === 'P001')?.precio_final || 35000)
        const codigoAlquiler = n.tipo_horario === 'CARGO' ? 'P002' : 'P001'
        const descAlquiler = n.tipo_horario === 'CARGO' ? 'Alquiler Semanal Cargo' : 'Alquiler Semanal Turno'

        // Línea de alquiler
        facturacionData.push([
          nro,
          n.conductor_nombre,
          n.conductor_cuit ? 'CUIL' : 'DNI',
          n.conductor_cuit || n.conductor_dni || '-',
          codigoAlquiler,
          descAlquiler,
          1,
          precioAlquiler,
          precioAlquiler,
          0,
          precioAlquiler
        ])
        nro++

        // Línea de efectivo (crédito)
        if (n.total_creditos > 0) {
          facturacionData.push([
            nro,
            n.conductor_nombre,
            n.conductor_cuit ? 'CUIL' : 'DNI',
            n.conductor_cuit || n.conductor_dni || '-',
            'E001',
            'Efectivo Recaudado (Descuento)',
            1,
            -n.total_creditos,
            -n.total_creditos,
            0,
            -n.total_creditos
          ])
          nro++
        }
      })

      facturacionData.push([''])
      facturacionData.push(['', '', '', '', '', '', '', '', 'TOTAL GENERAL:', '', dataToExport.reduce((sum, n) => sum + n.saldo, 0)])

      const wsFacturacion = XLSX.utils.aoa_to_sheet(facturacionData)
      wsFacturacion['!cols'] = [
        { wch: 5 },  // N°
        { wch: 30 }, // Conductor
        { wch: 10 }, // Tipo Doc
        { wch: 15 }, // Nro Doc
        { wch: 8 },  // Concepto
        { wch: 35 }, // Descripción
        { wch: 8 },  // Cantidad
        { wch: 12 }, // Precio Unit.
        { wch: 12 }, // Subtotal
        { wch: 8 },  // IVA
        { wch: 12 }, // Total
      ]

      XLSX.utils.book_append_sheet(wb, wsFacturacion, 'Facturación')

      // Generar nombre del archivo
      const nombreArchivo = `Reporte_Facturacion_Semana${semana}_${anio}.xlsx`

      // Descargar
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

  // Columnas de la tabla
  const columns = useMemo<ColumnDef<NominaResumen>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {conductorFilter.length > 0 && `(${conductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${conductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor')
            }}
            title="Filtrar por conductor"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar..."
                value={conductorSearch}
                onChange={(e) => setConductorSearch(e.target.value)}
                className="dt-column-filter-input"
                autoFocus
              />
              <div className="dt-excel-filter-list">
                {conductoresFiltrados.length === 0 ? (
                  <div className="dt-excel-filter-empty">Sin resultados</div>
                ) : (
                  conductoresFiltrados.slice(0, 50).map(conductor => (
                    <label key={conductor} className={`dt-column-filter-checkbox ${conductorFilter.includes(conductor) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={conductorFilter.includes(conductor)}
                        onChange={() => toggleConductorFilter(conductor)}
                      />
                      <span>{conductor}</span>
                    </label>
                  ))
                )}
              </div>
              {conductorFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => { setConductorFilter([]); setConductorSearch('') }}
                >
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <strong>{row.original.conductor_nombre}</strong>
      ),
      enableSorting: true,
    },
    {
      id: 'tipo_doc',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo Doc {tipoDocFilter.length > 0 && `(${tipoDocFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoDocFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'tipoDoc' ? null : 'tipoDoc')
            }}
            title="Filtrar por tipo de documento"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipoDoc' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {tiposDocUnicos.map(tipo => (
                  <label key={tipo} className={`dt-column-filter-checkbox ${tipoDocFilter.includes(tipo) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={tipoDocFilter.includes(tipo)}
                      onChange={() => toggleTipoDocFilter(tipo)}
                    />
                    <span>{tipo}</span>
                  </label>
                ))}
              </div>
              {tipoDocFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => setTipoDocFilter([])}
                >
                  Limpiar ({tipoDocFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.conductor_cuit ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`}>
          {row.original.conductor_cuit ? 'CUIL' : 'DNI'}
        </span>
      )
    },
    {
      id: 'nro_doc',
      header: 'Nro Doc',
      cell: ({ row }) => (
        <span className="nom-conductor-doc">
          {row.original.conductor_cuit || row.original.conductor_dni || '-'}
        </span>
      )
    },
    {
      accessorKey: 'vehiculo_patente',
      header: () => (
        <div className="dt-column-filter">
          <span>Vehículo {vehiculoFilter.length > 0 && `(${vehiculoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${vehiculoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'vehiculo' ? null : 'vehiculo')
            }}
            title="Filtrar por vehículo"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'vehiculo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar..."
                value={vehiculoSearch}
                onChange={(e) => setVehiculoSearch(e.target.value)}
                className="dt-column-filter-input"
                autoFocus
              />
              <div className="dt-excel-filter-list">
                {vehiculosFiltrados.length === 0 ? (
                  <div className="dt-excel-filter-empty">Sin resultados</div>
                ) : (
                  vehiculosFiltrados.slice(0, 50).map(vehiculo => (
                    <label key={vehiculo} className={`dt-column-filter-checkbox ${vehiculoFilter.includes(vehiculo) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={vehiculoFilter.includes(vehiculo)}
                        onChange={() => toggleVehiculoFilter(vehiculo)}
                      />
                      <span>{vehiculo}</span>
                    </label>
                  ))
                )}
              </div>
              {vehiculoFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => { setVehiculoFilter([]); setVehiculoSearch('') }}
                >
                  Limpiar ({vehiculoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className="patente-badge">
          {row.original.vehiculo_patente || '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'tipo_horario',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoHorarioFilter.length > 0 && `(${tipoHorarioFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoHorarioFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'tipoHorario' ? null : 'tipoHorario')
            }}
            title="Filtrar por tipo de horario"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipoHorario' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {tiposHorarioUnicos.map(tipo => (
                  <label key={tipo} className={`dt-column-filter-checkbox ${tipoHorarioFilter.includes(tipo) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={tipoHorarioFilter.includes(tipo)}
                      onChange={() => toggleTipoHorarioFilter(tipo)}
                    />
                    <span>{tipo}</span>
                  </label>
                ))}
              </div>
              {tipoHorarioFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => setTipoHorarioFilter([])}
                >
                  Limpiar ({tipoHorarioFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.tipo_horario === 'CARGO' ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`}>
          {row.original.tipo_horario}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'total_cargos',
      header: 'Cargos',
      cell: ({ row }) => (
        <span className="nom-monto nom-cargo">{formatCurrency(row.original.total_cargos)}</span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'total_creditos',
      header: 'Créditos',
      cell: ({ row }) => (
        <span className="nom-monto nom-credito">{formatCurrency(row.original.total_creditos)}</span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'saldo',
      header: 'Saldo',
      cell: ({ row }) => {
        const saldo = row.original.saldo
        const esPositivo = saldo > 0
        return (
          <span className={`nom-saldo ${esPositivo ? 'debe' : 'favor'}`}>
            {esPositivo ? '' : '-'}{formatCurrency(Math.abs(saldo))}
          </span>
        )
      },
      enableSorting: true,
    },
    {
      id: 'alertas',
      header: 'Alertas',
      cell: ({ row }) => (
        <div className="nom-alertas">
          {row.original.tiene_penalidades && (
            <span className="nom-alerta penalidad" title="Tiene penalidades">
              <AlertTriangle size={14} />
            </span>
          )}
          {row.original.tiene_siniestros && (
            <span className="nom-alerta siniestro" title="Tiene siniestros">
              <Car size={14} />
            </span>
          )}
        </div>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button
            className="dt-btn-action dt-btn-view"
            onClick={(e) => { e.stopPropagation(); verDetalle(row.original) }}
            title="Ver detalle"
          >
            <Eye size={14} />
          </button>
        </div>
      )
    }
  ], [openColumnFilter, conductorFilter, conductorSearch, conductoresFiltrados, tipoDocFilter, tiposDocUnicos, vehiculoFilter, vehiculoSearch, vehiculosFiltrados, tipoHorarioFilter, tiposHorarioUnicos])

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
      <div className="nom-semana-selector">
        <div className="nom-semana-nav">
          <button className="nom-nav-btn" onClick={semanaAnterior} title="Semana anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="nom-semana-info">
            <span className="nom-semana-titulo">Semana {infoSemana.semana}</span>
            <span className="nom-semana-fecha">{infoSemana.inicio} - {infoSemana.fin} / {infoSemana.anio}</span>
          </div>
          <button className="nom-nav-btn" onClick={semanaSiguiente} title="Semana siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="nom-semana-actions">
          <button className="nom-btn-secondary" onClick={irASemanaActual}>
            <Calendar size={14} />
            Semana Actual
          </button>
          <button className="nom-btn-secondary" onClick={cargarNominas} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="nom-stats">
        <div className="nom-stats-grid six-cols">
          <button className={`stat-card${filtroSaldo === 'todos' ? ' active' : ''}`} onClick={() => setFiltroSaldo('todos')}>
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.total_conductores || 0}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFiltroSaldo('todos')}>
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.total_cargos || 0)}</span>
              <span className="stat-label">Total Cargos</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFiltroSaldo('todos')}>
            <TrendingDown size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.total_creditos || 0)}</span>
              <span className="stat-label">Total Créditos</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFiltroSaldo('todos')}>
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.saldo_total || 0)}</span>
              <span className="stat-label">Saldo Total</span>
            </div>
          </button>
          <button className={`stat-card${filtroSaldo === 'a_favor' ? ' active' : ''}`} onClick={() => setFiltroSaldo('a_favor')}>
            <TrendingDown size={18} className="stat-icon green" />
            <div className="stat-content">
              <span className="stat-value">{stats?.conductores_a_favor || 0}</span>
              <span className="stat-label">A Favor</span>
            </div>
          </button>
          <button className={`stat-card${filtroSaldo === 'deben' ? ' active' : ''}`} onClick={() => setFiltroSaldo('deben')}>
            <TrendingUp size={18} className="stat-icon red" />
            <div className="stat-content">
              <span className="stat-value">{stats?.conductores_deben || 0}</span>
              <span className="stat-label">Deben</span>
            </div>
          </button>
        </div>
      </div>

      {/* Filtros de columna */}
      <div className="nom-filtros-columna">
        <div className="nom-filtros-grupo">
          <Filter size={14} />
          <span className="nom-filtros-label">Filtros:</span>

          <select
            className="nom-filtro-select"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="todos">Todos los tipos</option>
            <option value="TURNO">Solo TURNO</option>
            <option value="CARGO">Solo CARGO</option>
          </select>

          <select
            className="nom-filtro-select"
            value={filtroPenalidades}
            onChange={(e) => setFiltroPenalidades(e.target.value)}
          >
            <option value="todos">Todas las penalidades</option>
            <option value="con">Con penalidades</option>
            <option value="sin">Sin penalidades</option>
          </select>

          <select
            className="nom-filtro-select"
            value={filtroSiniestros}
            onChange={(e) => setFiltroSiniestros(e.target.value)}
          >
            <option value="todos">Todos los siniestros</option>
            <option value="con">Con siniestros</option>
            <option value="sin">Sin siniestros</option>
          </select>

          {(filtroTipo !== 'todos' || filtroPenalidades !== 'todos' || filtroSiniestros !== 'todos') && (
            <button
              className="nom-filtro-limpiar"
              onClick={() => {
                setFiltroTipo('todos')
                setFiltroPenalidades('todos')
                setFiltroSiniestros('todos')
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="nom-export-btn-group">
          <button
            className="nom-btn-export"
            onClick={exportarExcel}
            disabled={exportingExcel || nominasFiltradas.length === 0}
          >
            {exportingExcel ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
            {exportingExcel ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={nominasFiltradas}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por conductor, DNI, patente..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="No hay facturación"
        emptyDescription="No hay conductores con asignaciones activas para esta semana"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        onTableReady={setTableInstance}
      />

      {/* Modal de detalle */}
      {showDetalle && (
        <div className="nom-modal-overlay" onClick={() => setShowDetalle(false)}>
          <div className="nom-modal-content nom-modal-detalle" onClick={(e) => e.stopPropagation()}>
            <div className="nom-modal-header">
              <h2>Facturación</h2>
              <button className="nom-modal-close" onClick={() => setShowDetalle(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="nom-modal-body">
              {loadingDetalle ? (
                <div className="nom-loading-detalle">
                  <Loader2 size={32} className="spinning" />
                  <span>Cargando detalle...</span>
                </div>
              ) : nominaDetalle ? (
                <div className="nom-detalle">
                  {/* Encabezado */}
                  <div className="nom-detalle-header">
                    <div className="nom-detalle-conductor">
                      <h3>{nominaDetalle.conductor_nombre}</h3>
                      <span>DNI: {nominaDetalle.conductor_dni}</span>
                    </div>
                    <div className="nom-detalle-periodo">
                      <span className="nom-detalle-semana">Semana {nominaDetalle.semana}</span>
                      <span className="nom-detalle-fechas">
                        {format(parseISO(nominaDetalle.fecha_inicio), 'dd/MM/yyyy')} - {format(parseISO(nominaDetalle.fecha_fin), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* Info de asignación */}
                  <div className="nom-detalle-asignacion">
                    <div className="nom-info-item">
                      <span className="label">Asignación:</span>
                      <span className="value">{nominaDetalle.asignacion_codigo || '-'}</span>
                    </div>
                    <div className="nom-info-item">
                      <span className="label">Vehículo:</span>
                      <span className="value">{nominaDetalle.vehiculo_patente || '-'}</span>
                    </div>
                    <div className="nom-info-item">
                      <span className="label">Tipo:</span>
                      <span className={`dt-badge ${nominaDetalle.tipo_horario_predominante === 'CARGO' ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`}>
                        {nominaDetalle.tipo_horario_predominante}
                      </span>
                    </div>
                  </div>

                  {/* Sección de Cargos */}
                  <div className="nom-detalle-seccion">
                    <h4 className="nom-seccion-titulo cargos">Cargos (A Pagar)</h4>
                    <div className="nom-detalle-items">
                      <div className="nom-item">
                        <span className="nom-item-desc">Alquiler Semanal ({nominaDetalle.tipo_horario_predominante})</span>
                        <span className="nom-item-monto">{formatCurrency(nominaDetalle.alquiler_total)}</span>
                      </div>

                      {nominaDetalle.peajes_cabify > 0 && (
                        <div className="nom-item">
                          <span className="nom-item-desc">Peajes (Cabify)</span>
                          <span className="nom-item-monto">{formatCurrency(nominaDetalle.peajes_cabify)}</span>
                        </div>
                      )}

                      {nominaDetalle.penalidades.length > 0 && (
                        <div className="nom-item-group">
                          <div className="nom-item-group-header">
                            <span>Penalidades ({nominaDetalle.penalidades.length})</span>
                            <span>{formatCurrency(nominaDetalle.penalidades_total)}</span>
                          </div>
                          {nominaDetalle.penalidades.map(p => (
                            <div key={p.id} className="nom-item sub">
                              <span className="nom-item-desc">
                                {p.tipo_nombre}
                                {p.detalle && <small> - {p.detalle}</small>}
                              </span>
                              <span className="nom-item-monto">{formatCurrency(p.monto)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {nominaDetalle.siniestros.length > 0 && (
                        <div className="nom-item-group">
                          <div className="nom-item-group-header">
                            <span>Siniestros ({nominaDetalle.siniestros.length})</span>
                            <span>{formatCurrency(nominaDetalle.siniestros_total)}</span>
                          </div>
                          {nominaDetalle.siniestros.map(s => (
                            <div key={s.id} className="nom-item sub">
                              <span className="nom-item-desc">
                                {s.categoria}
                                {s.responsable === 'compartida' && <small> (50%)</small>}
                              </span>
                              <span className="nom-item-monto">
                                {formatCurrency(s.responsable === 'compartida' ? s.presupuesto * 0.5 : s.presupuesto)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="nom-item total">
                        <span className="nom-item-desc">SUBTOTAL CARGOS</span>
                        <span className="nom-item-monto">{formatCurrency(nominaDetalle.total_cargos)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sección de Créditos */}
                  <div className="nom-detalle-seccion">
                    <h4 className="nom-seccion-titulo creditos">Créditos (A Favor)</h4>
                    <div className="nom-detalle-items">
                      {nominaDetalle.efectivo_cabify > 0 && (
                        <div className="nom-item">
                          <span className="nom-item-desc">Efectivo Recaudado (Cabify)</span>
                          <span className="nom-item-monto credito">-{formatCurrency(nominaDetalle.efectivo_cabify)}</span>
                        </div>
                      )}

                      {nominaDetalle.bonos_total > 0 && (
                        <div className="nom-item">
                          <span className="nom-item-desc">Bonos</span>
                          <span className="nom-item-monto credito">-{formatCurrency(nominaDetalle.bonos_total)}</span>
                        </div>
                      )}

                      <div className="nom-item total">
                        <span className="nom-item-desc">SUBTOTAL CRÉDITOS</span>
                        <span className="nom-item-monto credito">-{formatCurrency(nominaDetalle.total_creditos)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Saldo Final */}
                  <div className="nom-detalle-saldo">
                    <span className="nom-saldo-label">SALDO FINAL</span>
                    <span className={`nom-saldo-valor ${nominaDetalle.saldo > 0 ? 'debe' : 'favor'}`}>
                      {nominaDetalle.saldo > 0 ? '' : '-'}{formatCurrency(Math.abs(nominaDetalle.saldo))}
                    </span>
                    <span className="nom-saldo-estado">
                      {nominaDetalle.saldo > 0 ? 'Debe pagar' : 'A favor del conductor'}
                    </span>
                  </div>

                  {/* Detalle por día */}
                  <div className="nom-detalle-seccion">
                    <h4 className="nom-seccion-titulo">Detalle por Día</h4>
                    <div className="nom-detalle-dias">
                      {nominaDetalle.alquiler_detalle.map((dia) => (
                        <div key={dia.fecha} className="nom-dia-item">
                          <span className="nom-dia-nombre">{dia.dia_semana}</span>
                          <span className="nom-dia-fecha">{format(parseISO(dia.fecha), 'dd/MM')}</span>
                          <span className={`nom-dia-tipo ${dia.tipo_horario?.toLowerCase()}`}>
                            {dia.tipo_horario}
                          </span>
                          <span className="nom-dia-precio">{formatCurrency(dia.precio_dia)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="nom-no-data">No se encontró información</div>
              )}
            </div>

            <div className="nom-modal-footer">
              <button className="nom-btn-secondary" onClick={() => setShowDetalle(false)}>
                Cerrar
              </button>
              <button
                className="nom-btn-primary"
                onClick={exportarPDF}
                disabled={exportingPdf || !nominaDetalle}
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
