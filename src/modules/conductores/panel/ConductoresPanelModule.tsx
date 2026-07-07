// Sub-modulo "Panel de Conductores" (dentro de Conductores).
// Mismo formato que el resto de modulos: tarjetas de metricas (stat-cards) arriba
// y DataTable compartido abajo (buscador + paginacion + filtros de columna).
//
// Acumulado por conductor: estado, auto asignado ahora mismo, y sus multas
// (cantidad, vehiculos, monto total, pagadas/pendientes y montos). Por defecto se
// muestran solo los conductores con auto asignado; las stat-cards actuan de filtro.
// Cada fila tiene "Ver mis datos" (portal Mi Espacio embebido).

import { useState, useEffect, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye, Car, UserX, AlertTriangle, Clock, Users } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { formatCurrency } from '../../../types/facturacion.types'
import { DataTable } from '../../../components/ui/DataTable'
import { cargarPanelConductores, type ConductorPanelRow } from './conductoresPanelService'
import { ConductorDetalleModal } from './ConductorDetalleModal'
import '../ConductoresModule.css'
import './ConductoresPanelModule.css'

type CardKey = 'conAuto' | 'sinAuto' | 'conMultas' | 'pendientes'

const CARD_LABELS: Record<CardKey, string> = {
  conAuto: 'Con Auto Asignado',
  sinAuto: 'Sin Auto',
  conMultas: 'Con Multas',
  pendientes: 'Con Multas Pendientes',
}

export function ConductoresPanelModule() {
  const { sedeActualId } = useSede()

  const [rows, setRows] = useState<ConductorPanelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Por defecto: solo conductores con auto asignado ahora mismo.
  const [activeCard, setActiveCard] = useState<CardKey | null>('conAuto')
  const [reloadKey, setReloadKey] = useState(0)
  const [detalle, setDetalle] = useState<ConductorPanelRow | null>(null)

  useEffect(() => {
    let activo = true
    setLoading(true)
    setError('')
    cargarPanelConductores(sedeActualId)
      .then(data => { if (activo) setRows(data) })
      .catch(e => { if (activo) setError(e?.message || 'Error al cargar el panel') })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [sedeActualId, reloadKey])

  const stats = useMemo(() => ({
    conAuto: rows.filter(c => c.tieneAsignacion).length,
    sinAuto: rows.filter(c => !c.tieneAsignacion).length,
    conMultas: rows.filter(c => c.cantidadMultas > 0).length,
    pendientes: rows.filter(c => c.sinFacturar + c.impagas > 0).length,
  }), [rows])

  const filteredRows = useMemo(() => {
    switch (activeCard) {
      case 'conAuto': return rows.filter(c => c.tieneAsignacion)
      case 'sinAuto': return rows.filter(c => !c.tieneAsignacion)
      case 'conMultas': return rows.filter(c => c.cantidadMultas > 0)
      case 'pendientes': return rows.filter(c => c.sinFacturar + c.impagas > 0)
      default: return rows
    }
  }, [rows, activeCard])

  const handleCard = (card: CardKey) => setActiveCard(prev => prev === card ? null : card)

  const externalFilters = useMemo(() => {
    if (!activeCard) return []
    return [{
      id: 'statCard',
      label: CARD_LABELS[activeCard],
      onClear: () => setActiveCard(null),
    }]
  }, [activeCard])

  const columns = useMemo<ColumnDef<ConductorPanelRow, unknown>[]>(() => [
    {
      id: 'conductor',
      accessorFn: (r) => `${r.nombre} ${r.dni || ''}`,
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{row.original.nombre || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>{row.original.dni || '—'}</div>
        </div>
      ),
    },
    {
      id: 'asignacion',
      accessorFn: (r) => r.vehiculoAsignado || '',
      header: 'Asignación',
      cell: ({ row }) => row.original.vehiculoAsignado
        ? <span className="cpanel-badge asig">{row.original.vehiculoAsignado}</span>
        : <span className="cpanel-badge noasig">Sin asignación</span>,
    },
    {
      id: 'estado',
      accessorFn: (r) => (r.activo ? 'Activo' : (r.estadoCodigo || 'Inactivo')),
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`cpanel-badge ${row.original.activo ? 'ok' : 'off'}`}>
          {row.original.activo ? 'Activo' : (row.original.estadoCodigo || 'Inactivo')}
        </span>
      ),
    },
    { accessorKey: 'cantidadMultas', header: 'Multas', cell: ({ getValue }) => <span className="cpanel-num">{getValue() as number}</span> },
    {
      id: 'vehiculos',
      accessorFn: (r) => r.vehiculos.length,
      header: 'Vehículos',
      cell: ({ row }) => <span className="cpanel-num" title={row.original.vehiculos.join(', ')}>{row.original.vehiculos.length}</span>,
    },
    { accessorKey: 'montoTotalMultas', header: 'Monto Total', cell: ({ getValue }) => <span className="cpanel-num">{formatCurrency(getValue() as number)}</span> },
    { accessorKey: 'montoFacturado', header: 'Monto Facturado', cell: ({ getValue }) => <span className="cpanel-num">{formatCurrency(getValue() as number)}</span> },
    { accessorKey: 'montoSinFacturar', header: 'Monto Sin Facturar', cell: ({ getValue }) => <span className="cpanel-num">{formatCurrency(getValue() as number)}</span> },
    { accessorKey: 'sinFacturar', header: 'Sin Facturar', cell: ({ getValue }) => <span className="cpanel-num">{getValue() as number}</span> },
    { accessorKey: 'impagas', header: 'Impagas', cell: ({ getValue }) => <span className="cpanel-num">{getValue() as number}</span> },
    { accessorKey: 'pagadas', header: 'Pagadas', cell: ({ getValue }) => <span className="cpanel-num">{getValue() as number}</span> },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <button className="cpanel-ver" onClick={() => setDetalle(row.original)}>
          <Eye size={14} /> Ver detalle
        </button>
      ),
    },
  ], [])

  return (
    <div className="cond-module">
      {/* Stats Cards */}
      <div className="cond-stats">
        <div className="cond-stats-grid">
          <div className={`stat-card stat-card-clickable ${activeCard === 'conAuto' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('conAuto')} title="Conductores con auto asignado ahora mismo">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.conAuto}</span>
              <span className="stat-label">Con Auto Asignado</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'sinAuto' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('sinAuto')} title="Conductores sin auto asignado">
            <UserX size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.sinAuto}</span>
              <span className="stat-label">Sin Auto</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'conMultas' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('conMultas')} title="Conductores con al menos una multa atribuida">
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.conMultas}</span>
              <span className="stat-label">Con Multas</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'pendientes' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('pendientes')} title="Conductores con multas pendientes de pago">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.pendientes}</span>
              <span className="stat-label">Con Multas Pendientes</span>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        loading={loading}
        error={error}
        stickyLeftColumns={3}
        searchPlaceholder="Buscar por nombre o DNI..."
        emptyIcon={<Users size={64} />}
        emptyTitle="No hay conductores para mostrar"
        emptyDescription="Probá quitar el filtro activo o cambiar la sede."
        externalFilters={externalFilters}
        onClearAllFilters={() => setActiveCard(null)}
        headerAction={
          <button className="btn-secondary" onClick={() => setReloadKey(k => k + 1)} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Recargar
          </button>
        }
      />

      {detalle && (
        <ConductorDetalleModal conductor={detalle} onClose={() => setDetalle(null)} />
      )}
    </div>
  )
}
