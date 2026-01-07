import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Users,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  Eye,
  Calculator,
  Download,
  RefreshCw
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { PeriodoFacturacion, FacturacionConductor } from '../../../types/facturacion.types'
import { formatCurrency, FACTURACION_CONFIG } from '../../../types/facturacion.types'

export function FacturacionSemanalTab() {
  const [periodos, setPeriodos] = useState<PeriodoFacturacion[]>([])
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>('')
  const [facturaciones, setFacturaciones] = useState<FacturacionConductor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingFacturacion, setLoadingFacturacion] = useState(false)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    cargarPeriodos()
  }, [])

  useEffect(() => {
    if (periodoSeleccionado) {
      cargarFacturacion(periodoSeleccionado)
    }
  }, [periodoSeleccionado])

  async function cargarPeriodos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('periodos_facturacion')
        .select('*')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })
        .limit(20)

      if (error) throw error
      setPeriodos(data || [])

      const periodoAbierto = data?.find(p => p.estado === 'abierto')
      if (periodoAbierto) {
        setPeriodoSeleccionado(periodoAbierto.id)
      } else if (data && data.length > 0) {
        setPeriodoSeleccionado(data[0].id)
      }
    } catch (error) {
      console.error('Error cargando períodos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function cargarFacturacion(periodoId: string) {
    setLoadingFacturacion(true)
    try {
      const { data, error } = await supabase
        .from('facturacion_conductores')
        .select('*')
        .eq('periodo_id', periodoId)
        .order('conductor_nombre')

      if (error) throw error
      setFacturaciones(data || [])
    } catch (error) {
      console.error('Error cargando facturación:', error)
    } finally {
      setLoadingFacturacion(false)
    }
  }

  async function generarFacturacion() {
    if (!periodoSeleccionado) {
      Swal.fire('Error', 'Seleccione un período', 'error')
      return
    }

    const periodo = periodos.find(p => p.id === periodoSeleccionado)
    if (!periodo || periodo.estado === 'cerrado') {
      Swal.fire('Error', 'No se puede generar facturación en un período cerrado', 'error')
      return
    }

    const result = await Swal.fire({
      title: 'Generar Facturación',
      html: `<p>Se generará la facturación para todos los conductores activos.</p><p><strong>Semana ${periodo.semana} - ${periodo.anio}</strong></p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setGenerando(true)
    try {
      const { data: estadoActivo } = await supabase
        .from('conductores_estados')
        .select('id')
        .eq('codigo', 'ACTIVO')
        .single()

      const { data: conductores, error: errorConductores } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit')
        .eq('estado_id', estadoActivo?.id)

      if (errorConductores) throw errorConductores

      if (!conductores || conductores.length === 0) {
        Swal.fire('Aviso', 'No hay conductores activos para facturar', 'warning')
        return
      }

      const facturacionesToInsert = []

      for (const conductor of conductores) {
        const { data: asignacion } = await supabase
          .from('asignaciones_conductores')
          .select(`asignacion_id, asignaciones!inner (id, horario, vehiculo_id, vehiculos (id, patente))`)
          .eq('conductor_id', conductor.id)
          .eq('estado', 'activo')
          .single()

        const tipoAlquiler = asignacion?.asignaciones?.horario === 'CARGO' ? 'CARGO' : 'TURNO'
        const vehiculoPatente = asignacion?.asignaciones?.vehiculos?.patente || null
        const vehiculoId = asignacion?.asignaciones?.vehiculo_id || null

        const alquiler = tipoAlquiler === 'CARGO' ? FACTURACION_CONFIG.ALQUILER_CARGO : FACTURACION_CONFIG.ALQUILER_TURNO
        const garantia = FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL

        facturacionesToInsert.push({
          periodo_id: periodoSeleccionado,
          conductor_id: conductor.id,
          conductor_nombre: `${conductor.apellidos}, ${conductor.nombres}`,
          conductor_dni: conductor.numero_dni,
          conductor_cuit: conductor.numero_cuit,
          vehiculo_id: vehiculoId,
          vehiculo_patente: vehiculoPatente,
          tipo_alquiler: tipoAlquiler,
          turnos_base: 7,
          turnos_cobrados: 7,
          factor_proporcional: 1,
          subtotal_alquiler: alquiler,
          subtotal_garantia: garantia,
          subtotal_cargos: alquiler + garantia,
          subtotal_descuentos: 0,
          subtotal_neto: alquiler + garantia,
          saldo_anterior: 0,
          dias_mora: 0,
          monto_mora: 0,
          total_a_pagar: alquiler + garantia,
          estado: 'calculado'
        })
      }

      await supabase.from('facturacion_conductores').delete().eq('periodo_id', periodoSeleccionado)
      const { error: errorInsert } = await supabase.from('facturacion_conductores').insert(facturacionesToInsert)
      if (errorInsert) throw errorInsert

      const totalCargos = facturacionesToInsert.reduce((sum, f) => sum + f.subtotal_cargos, 0)
      await supabase.from('periodos_facturacion').update({
        total_conductores: facturacionesToInsert.length,
        total_cargos: totalCargos,
        total_descuentos: 0,
        total_neto: totalCargos
      }).eq('id', periodoSeleccionado)

      Swal.fire({ icon: 'success', title: 'Facturación Generada', text: `${facturacionesToInsert.length} conductores`, timer: 2000, showConfirmButton: false })
      cargarFacturacion(periodoSeleccionado)
      cargarPeriodos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo generar', 'error')
    } finally {
      setGenerando(false)
    }
  }

  const columns = useMemo<ColumnDef<FacturacionConductor>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div className="text-xs text-gray-500">{row.original.conductor_cuit || row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'vehiculo_patente',
      header: 'Vehículo',
      cell: ({ row }) => row.original.vehiculo_patente || '-'
    },
    {
      accessorKey: 'tipo_alquiler',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.tipo_alquiler === 'CARGO' ? 'fact-badge-blue' : 'fact-badge-purple'}`}>
          {row.original.tipo_alquiler}
        </span>
      )
    },
    {
      accessorKey: 'turnos_cobrados',
      header: 'Turnos',
      cell: ({ row }) => `${row.original.turnos_cobrados}/${row.original.turnos_base}`
    },
    {
      accessorKey: 'subtotal_cargos',
      header: 'Cargos',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.subtotal_cargos)}</span>
    },
    {
      accessorKey: 'subtotal_descuentos',
      header: 'Descuentos',
      cell: ({ row }) => (
        <span className="fact-precio fact-precio-negative">
          {row.original.subtotal_descuentos > 0 ? `-${formatCurrency(row.original.subtotal_descuentos)}` : '$0'}
        </span>
      )
    },
    {
      accessorKey: 'total_a_pagar',
      header: 'Total',
      cell: ({ row }) => <span className="fact-precio" style={{ fontWeight: 700 }}>{formatCurrency(row.original.total_a_pagar)}</span>
    },
    {
      id: 'acciones',
      header: '',
      cell: () => (
        <button className="fact-table-btn fact-table-btn-view"><Eye size={14} /></button>
      )
    }
  ], [])

  const stats = useMemo(() => {
    const totalConductores = facturaciones.length
    const conductoresCargo = facturaciones.filter(f => f.tipo_alquiler === 'CARGO').length
    const conductoresTurno = facturaciones.filter(f => f.tipo_alquiler === 'TURNO').length
    const totalCargos = facturaciones.reduce((sum, f) => sum + f.subtotal_cargos, 0)
    const totalDescuentos = facturaciones.reduce((sum, f) => sum + f.subtotal_descuentos, 0)
    const totalNeto = facturaciones.reduce((sum, f) => sum + f.total_a_pagar, 0)
    return { totalConductores, conductoresCargo, conductoresTurno, totalCargos, totalDescuentos, totalNeto }
  }, [facturaciones])

  const periodoActual = periodos.find(p => p.id === periodoSeleccionado)

  if (loading) {
    return <div className="fact-loading"><Loader2 size={32} className="fact-spinner" /></div>
  }

  return (
    <>
      {/* Header con selector y botones */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Período:</span>
          <select
            className="fact-select"
            value={periodoSeleccionado}
            onChange={(e) => setPeriodoSeleccionado(e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {periodos.map(p => (
              <option key={p.id} value={p.id}>
                Sem {p.semana} - {p.anio} ({p.estado === 'abierto' ? 'Abierto' : 'Cerrado'})
              </option>
            ))}
          </select>
        </div>
        <div className="fact-header-right">
          <button
            className="fact-btn fact-btn-secondary"
            onClick={() => cargarFacturacion(periodoSeleccionado)}
            disabled={!periodoSeleccionado || loadingFacturacion}
          >
            <RefreshCw size={14} className={loadingFacturacion ? 'fact-spinner' : ''} />
            Actualizar
          </button>
          <button
            className="fact-btn fact-btn-primary"
            onClick={generarFacturacion}
            disabled={!periodoSeleccionado || generando || periodoActual?.estado === 'cerrado'}
          >
            {generando ? <Loader2 size={14} className="fact-spinner" /> : <Calculator size={14} />}
            {generando ? 'Generando...' : 'Generar'}
          </button>
          <button
            className="fact-btn fact-btn-success"
            onClick={() => {}}
            disabled={facturaciones.length === 0}
          >
            <Download size={14} />
            Exportar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.totalConductores}</span>
              <span className="fact-stat-label">Conductores</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <FileText size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.conductoresCargo} / {stats.conductoresTurno}</span>
              <span className="fact-stat-label">Cargo / Turno</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <TrendingUp size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalCargos)}</span>
              <span className="fact-stat-label">Cargos</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <TrendingDown size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalDescuentos)}</span>
              <span className="fact-stat-label">Descuentos</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalNeto)}</span>
              <span className="fact-stat-label">Total Neto</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={facturaciones}
        columns={columns}
        loading={loadingFacturacion}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="No hay facturación"
        emptyDescription={periodoSeleccionado ? "Genere la facturación del período" : "Seleccione un período"}
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
