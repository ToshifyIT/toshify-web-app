import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Shield,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  Plus,
  DollarSign
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { GarantiaConductor } from '../../../types/facturacion.types'
import { formatCurrency, formatDate, FACTURACION_CONFIG } from '../../../types/facturacion.types'

export function GarantiasTab() {
  const [garantias, setGarantias] = useState<GarantiaConductor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  useEffect(() => {
    cargarGarantias()
  }, [])

  async function cargarGarantias() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('garantias_conductores')
        .select('*')
        .order('conductor_nombre')

      if (error) throw error
      setGarantias(data || [])
    } catch (error) {
      console.error('Error cargando garantías:', error)
    } finally {
      setLoading(false)
    }
  }

  async function registrarPago(garantia: GarantiaConductor) {
    const { value: formValues } = await Swal.fire({
      title: 'Registrar Pago de Garantía',
      html: `
        <div style="text-align: left; margin-bottom: 15px;">
          <p><strong>Conductor:</strong> ${garantia.conductor_nombre}</p>
          <p><strong>Tipo:</strong> ${garantia.tipo_alquiler}</p>
          <p><strong>Monto pendiente:</strong> ${formatCurrency(garantia.monto_total - garantia.monto_pagado)}</p>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px;">Monto a pagar:</label>
          <input id="swal-monto" type="number" class="swal2-input" placeholder="Monto" value="${FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL}">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px;">Referencia (opcional):</label>
          <input id="swal-ref" type="text" class="swal2-input" placeholder="Ej: Semana 2">
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value
        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        return { monto: parseFloat(monto), referencia }
      }
    })

    if (!formValues) return

    try {
      const { error: errorPago } = await supabase
        .from('garantias_pagos')
        .insert({
          garantia_id: garantia.id,
          conductor_id: garantia.conductor_id,
          numero_cuota: garantia.cuotas_pagadas + 1,
          monto: formValues.monto,
          fecha_pago: new Date().toISOString(),
          referencia: formValues.referencia || null
        })

      if (errorPago) throw errorPago

      const nuevoMontoPagado = garantia.monto_pagado + formValues.monto
      const nuevasCuotasPagadas = garantia.cuotas_pagadas + 1
      const completada = nuevoMontoPagado >= garantia.monto_total

      const { error: errorUpdate } = await supabase
        .from('garantias_conductores')
        .update({
          monto_pagado: nuevoMontoPagado,
          cuotas_pagadas: nuevasCuotasPagadas,
          estado: completada ? 'completada' : 'en_curso'
        })
        .eq('id', garantia.id)

      if (errorUpdate) throw errorUpdate

      Swal.fire({
        icon: 'success',
        title: 'Pago Registrado',
        text: completada ? '¡Garantía completada!' : `Cuota ${nuevasCuotasPagadas} registrada`,
        timer: 2000,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  async function verHistorial(garantia: GarantiaConductor) {
    try {
      const { data: pagos, error } = await supabase
        .from('garantias_pagos')
        .select('*')
        .eq('garantia_id', garantia.id)
        .order('numero_cuota', { ascending: true })

      if (error) throw error

      const pagosHtml = pagos && pagos.length > 0
        ? pagos.map(p => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.numero_cuota}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(p.fecha_pago)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(p.monto)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.referencia || '-'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4" style="padding: 20px; text-align: center;">Sin pagos registrados</td></tr>'

      Swal.fire({
        title: 'Historial de Garantía',
        html: `
          <div style="text-align: left; margin-bottom: 15px;">
            <p><strong>Conductor:</strong> ${garantia.conductor_nombre}</p>
            <p><strong>Progreso:</strong> ${formatCurrency(garantia.monto_pagado)} / ${formatCurrency(garantia.monto_total)}</p>
          </div>
          <div style="max-height: 300px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 8px; text-align: left;">Cuota</th>
                  <th style="padding: 8px; text-align: left;">Fecha</th>
                  <th style="padding: 8px; text-align: left;">Monto</th>
                  <th style="padding: 8px; text-align: left;">Ref.</th>
                </tr>
              </thead>
              <tbody>${pagosHtml}</tbody>
            </table>
          </div>
        `,
        width: 600,
        confirmButtonText: 'Cerrar'
      })
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  const columns = useMemo<ColumnDef<GarantiaConductor>[]>(() => [
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
      accessorKey: 'tipo_alquiler',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.tipo_alquiler === 'CARGO' ? 'fact-badge-blue' : 'fact-badge-purple'}`}>
          {row.original.tipo_alquiler}
        </span>
      )
    },
    {
      accessorKey: 'monto_total',
      header: 'Total',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.monto_total)}</span>
    },
    {
      accessorKey: 'monto_pagado',
      header: 'Pagado',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.monto_pagado)}</span>
    },
    {
      id: 'pendiente',
      header: 'Pendiente',
      cell: ({ row }) => {
        const pendiente = row.original.monto_total - row.original.monto_pagado
        return <span className={`fact-precio ${pendiente > 0 ? 'fact-precio-negative' : ''}`}>{formatCurrency(pendiente)}</span>
      }
    },
    {
      accessorKey: 'cuotas_pagadas',
      header: 'Cuotas',
      cell: ({ row }) => `${row.original.cuotas_pagadas}/${row.original.cuotas_totales}`
    },
    {
      id: 'progreso',
      header: 'Progreso',
      cell: ({ row }) => {
        const porcentaje = (row.original.monto_pagado / row.original.monto_total) * 100
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="fact-progress-bar">
              <div className="fact-progress-fill" style={{ width: `${Math.min(porcentaje, 100)}%` }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{porcentaje.toFixed(0)}%</span>
          </div>
        )
      }
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const estado = row.original.estado
        const config: Record<string, { class: string; label: string }> = {
          completada: { class: 'fact-badge-green', label: 'Completada' },
          en_curso: { class: 'fact-badge-yellow', label: 'En Curso' },
          pendiente: { class: 'fact-badge-gray', label: 'Pendiente' }
        }
        const { class: badgeClass, label } = config[estado] || { class: 'fact-badge-gray', label: estado }
        return <span className={`fact-badge ${badgeClass}`}>{label}</span>
      }
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button className="fact-table-btn fact-table-btn-view" onClick={() => verHistorial(row.original)} title="Ver historial">
            <Eye size={14} />
          </button>
          {row.original.estado !== 'completada' && (
            <button className="fact-table-btn fact-table-btn-success" onClick={() => registrarPago(row.original)} title="Registrar pago">
              <Plus size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [])

  const garantiasFiltradas = useMemo(() => {
    if (filtroEstado === 'todos') return garantias
    return garantias.filter(g => g.estado === filtroEstado)
  }, [garantias, filtroEstado])

  const stats = useMemo(() => {
    const total = garantias.length
    const completadas = garantias.filter(g => g.estado === 'completada').length
    const enCurso = garantias.filter(g => g.estado === 'en_curso').length
    const totalRecaudado = garantias.reduce((sum, g) => sum + g.monto_pagado, 0)
    const totalPorRecaudar = garantias.reduce((sum, g) => sum + (g.monto_total - g.monto_pagado), 0)
    return { total, completadas, enCurso, totalRecaudado, totalPorRecaudar }
  }, [garantias])

  return (
    <>
      {/* Header con filtro */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Estado:</span>
          <select className="fact-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="en_curso">En Curso</option>
            <option value="completada">Completadas</option>
            <option value="pendiente">Pendientes</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Total</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Clock size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.enCurso}</span>
              <span className="fact-stat-label">En Curso</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <CheckCircle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.completadas}</span>
              <span className="fact-stat-label">Completadas</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalRecaudado)}</span>
              <span className="fact-stat-label">Recaudado</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <AlertTriangle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalPorRecaudar)}</span>
              <span className="fact-stat-label">Por Recaudar</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={garantiasFiltradas}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<Shield size={48} />}
        emptyTitle="Sin garantías"
        emptyDescription="No hay garantías registradas"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
