import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Shield,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  Plus,
  DollarSign,
  Filter
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { GarantiaConductor } from '../../../types/facturacion.types'
import { formatCurrency, formatDate, FACTURACION_CONFIG } from '../../../types/facturacion.types'

export function GarantiasTab() {
  const [garantias, setGarantias] = useState<GarantiaConductor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  useEffect(() => {
    cargarGarantias()
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!openColumnFilter) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.dt-column-filter-dropdown') && !target.closest('.dt-column-filter-btn')) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openColumnFilter])

  // Listas únicas para filtros
  const conductoresUnicos = useMemo(() =>
    [...new Set(garantias.map(g => g.conductor_nombre).filter(Boolean) as string[])].sort()
  , [garantias])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleTipoFilter = (val: string) => setTipoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleEstadoFilter = (val: string) => setEstadoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

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
      const { error: errorPago } = await (supabase
        .from('garantias_pagos') as any)
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

      const { error: errorUpdate } = await (supabase
        .from('garantias_conductores') as any)
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
        ? (pagos as any[]).map((p: any) => `
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
                className="dt-column-filter-input"
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
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div className="text-xs text-gray-500">{row.original.conductor_cuit || row.original.conductor_dni}</div>
        </div>
      )
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
      header: () => (
        <div className="dt-column-filter">
          <span>Estado {estadoFilter.length > 0 && `(${estadoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${estadoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'estado' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'completada', label: 'Completada' },
                  { value: 'en_curso', label: 'En Curso' },
                  { value: 'pendiente', label: 'Pendiente' }
                ].map(e => (
                  <label key={e.value} className={`dt-column-filter-checkbox ${estadoFilter.includes(e.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={estadoFilter.includes(e.value)} onChange={() => toggleEstadoFilter(e.value)} />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
              {estadoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setEstadoFilter([])}>
                  Limpiar ({estadoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
  ], [conductorFilter, conductorSearch, conductoresFiltrados, tipoFilter, estadoFilter, openColumnFilter])

  const garantiasFiltradas = useMemo(() => {
    return garantias.filter(g => {
      // Filtro legacy de header
      if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false
      // Filtros Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(g.conductor_nombre || '')) return false
      if (tipoFilter.length > 0 && !tipoFilter.includes(g.tipo_alquiler)) return false
      if (estadoFilter.length > 0 && !estadoFilter.includes(g.estado)) return false
      return true
    })
  }, [garantias, filtroEstado, conductorFilter, tipoFilter, estadoFilter])

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
