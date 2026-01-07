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
  AlertTriangle,
  FileText,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Filter,
  AlertCircle
} from 'lucide-react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { formatCurrency, formatDate } from '../../../types/facturacion.types'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, parseISO } from 'date-fns'
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
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

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
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [exportingExcel, setExportingExcel] = useState(false)

  // Cargar facturaciones cuando cambia la semana
  useEffect(() => {
    cargarFacturacion()
  }, [semanaActual])

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
        // No hay período generado para esta semana
        setPeriodo(null)
        setFacturaciones([])
        setLoading(false)
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

    } catch (error) {
      console.error('Error cargando facturación:', error)
      Swal.fire('Error', 'No se pudo cargar la facturación', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Ver detalle de facturación
  async function verDetalle(facturacion: FacturacionConductor) {
    setLoadingDetalle(true)
    setShowDetalle(true)
    setDetalleFacturacion(facturacion)

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
    if (!detalleFacturacion || !periodo) return

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
      pdf.text(`Semana ${periodo.semana} / ${periodo.anio}`, pageWidth - margin, y + 6, { align: 'right' })

      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`, pageWidth - margin, y + 11, { align: 'right' })

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
      const nombreArchivo = `Facturacion_${detalleFacturacion.conductor_nombre.replace(/\s+/g, '_')}_Semana${periodo.semana}_${periodo.anio}.pdf`
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

  // Filtrar datos según los filtros seleccionados
  const facturacionesFiltradas = useMemo(() => {
    return facturaciones.filter(f => {
      if (filtroTipo !== 'todos' && f.tipo_alquiler !== filtroTipo) return false
      if (filtroEstado === 'deuda' && f.total_a_pagar <= 0) return false
      if (filtroEstado === 'favor' && f.total_a_pagar > 0) return false
      return true
    })
  }, [facturaciones, filtroTipo, filtroEstado])

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

  // Stats calculados
  const stats = useMemo(() => {
    if (!periodo) return null
    return {
      total_conductores: periodo.total_conductores,
      total_cargos: periodo.total_cargos,
      total_descuentos: periodo.total_descuentos,
      total_neto: periodo.total_neto,
      conductores_deben: facturaciones.filter(f => f.total_a_pagar > 0).length,
      conductores_favor: facturaciones.filter(f => f.total_a_pagar <= 0).length
    }
  }, [periodo, facturaciones])

  // Columnas de la tabla
  const columns = useMemo<ColumnDef<FacturacionConductor>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <strong>{row.original.conductor_nombre}</strong>
          <div className="text-xs text-gray-500">
            {row.original.conductor_cuit || `DNI: ${row.original.conductor_dni}`}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'vehiculo_patente',
      header: 'Vehículo',
      cell: ({ row }) => (
        <span className="patente-badge">
          {row.original.vehiculo_patente || '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'tipo_alquiler',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.tipo_alquiler === 'CARGO' ? 'dt-badge-solid-blue' : 'dt-badge-solid-gray'}`}>
          {row.original.tipo_alquiler}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'turnos',
      header: 'Turnos',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.turnos_cobrados}/{row.original.turnos_base}
        </span>
      )
    },
    {
      accessorKey: 'subtotal_cargos',
      header: 'Cargos',
      cell: ({ row }) => (
        <span className="fact-monto fact-cargo">{formatCurrency(row.original.subtotal_cargos)}</span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'subtotal_descuentos',
      header: 'Descuentos',
      cell: ({ row }) => (
        <span className="fact-monto fact-credito">
          {row.original.subtotal_descuentos > 0 ? `-${formatCurrency(row.original.subtotal_descuentos)}` : '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'saldo_anterior',
      header: 'Saldo Ant.',
      cell: ({ row }) => (
        <span className={row.original.saldo_anterior > 0 ? 'fact-monto fact-cargo' : 'text-gray-400'}>
          {row.original.saldo_anterior > 0 ? formatCurrency(row.original.saldo_anterior) : '-'}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'total_a_pagar',
      header: 'Total',
      cell: ({ row }) => {
        const total = row.original.total_a_pagar
        return (
          <span className={`fact-saldo ${total > 0 ? 'debe' : 'favor'}`} style={{ fontWeight: 700 }}>
            {formatCurrency(total)}
          </span>
        )
      },
      enableSorting: true,
    },
    {
      id: 'acciones',
      header: '',
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
  ], [])

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

      {/* Sin período generado */}
      {!loading && !periodo && (
        <div className="fact-empty-state" style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#F9FAFB',
          borderRadius: '12px',
          border: '2px dashed #E5E7EB'
        }}>
          <AlertTriangle size={48} style={{ color: '#D97706', marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px', color: '#374151' }}>Facturación no generada</h3>
          <p style={{ color: '#6B7280', marginBottom: '20px' }}>
            No se ha generado la facturación para la Semana {infoSemana.semana} - {infoSemana.anio}
          </p>
          <p style={{ color: '#9CA3AF', fontSize: '14px' }}>
            Ve a la pestaña <strong>"Períodos"</strong> y presiona <strong>"Generar"</strong> para crear la facturación de esta semana.
          </p>
        </div>
      )}

      {/* Con período generado */}
      {periodo && (
        <>
          {/* Stats */}
          {stats && (
            <div className="fact-stats">
              <div className="fact-stats-grid">
                <div className="stat-card">
                  <Users size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.total_conductores}</span>
                    <span className="stat-label">Conductores</span>
                  </div>
                </div>
                <div className="stat-card">
                  <TrendingUp size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_cargos)}</span>
                    <span className="stat-label">Total Cargos</span>
                  </div>
                </div>
                <div className="stat-card">
                  <TrendingDown size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_descuentos)}</span>
                    <span className="stat-label">Total Descuentos</span>
                  </div>
                </div>
                <div className="stat-card">
                  <DollarSign size={18} className="stat-icon" />
                  <div className="stat-content">
                    <span className="stat-value">{formatCurrency(stats.total_neto)}</span>
                    <span className="stat-label">Total Neto</span>
                  </div>
                </div>
                <div className="stat-card">
                  <TrendingUp size={18} className="stat-icon red" />
                  <div className="stat-content">
                    <span className="stat-value">{stats.conductores_deben}</span>
                    <span className="stat-label">Deben</span>
                  </div>
                </div>
                <div className="stat-card">
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
                      <span className="fact-detalle-semana">Semana {periodo?.semana}</span>
                      <span className="fact-detalle-fechas">
                        {periodo && `${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`}
                      </span>
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
                disabled={exportingPdf || !detalleFacturacion}
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
