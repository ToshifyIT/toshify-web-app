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
import { Eye, Car, UserX, AlertTriangle, Clock, Users, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
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

// Etiqueta legible del turno de la asignacion actual.
const TURNO_LABELS: Record<string, string> = {
  diurno: 'Diurno',
  nocturno: 'Nocturno',
  a_cargo: 'A cargo',
}
function turnoLabel(t: string | null): string {
  if (!t) return '—'
  return TURNO_LABELS[t] || t
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
  // Filas realmente visibles en la tabla: el DataTable las reporta ya pasadas por
  // TODOS sus filtros internos (columna, rangos numéricos, búsqueda global).
  // Es null hasta el primer aviso de la tabla; ahí se cae a filteredRows.
  const [visibles, setVisibles] = useState<ConductorPanelRow[] | null>(null)

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
    pendientes: rows.filter(c => c.pendientes + c.enProceso > 0).length,
  }), [rows])

  const filteredRows = useMemo(() => {
    switch (activeCard) {
      case 'conAuto': return rows.filter(c => c.tieneAsignacion)
      case 'sinAuto': return rows.filter(c => !c.tieneAsignacion)
      case 'conMultas': return rows.filter(c => c.cantidadMultas > 0)
      case 'pendientes': return rows.filter(c => c.pendientes + c.enProceso > 0)
      default: return rows
    }
  }, [rows, activeCard])

  const handleCard = (card: CardKey) => setActiveCard(prev => prev === card ? null : card)

  // Lo que se exporta = exactamente lo que el usuario está viendo: el filtro de
  // stat-card (filteredRows) más los filtros internos del DataTable (que llegan
  // por onFilteredDataChange). No es la página actual: son todas las filas que
  // pasan los filtros.
  const filasAExportar = visibles ?? filteredRows

  const handleExportar = () => {
    if (filasAExportar.length === 0) return

    // Los importes van como NÚMERO (no con formatCurrency) para que Excel pueda
    // sumarlos y filtrarlos; el formato de moneda lo pone la planilla.
    const dataExport = filasAExportar.map(c => ({
      'Conductor': c.nombre || '',
      'DNI': c.dni || '',
      'CUIT': c.ruc || '',
      'Estado': c.activo ? 'Activo' : (c.estadoCodigo || 'Inactivo'),
      'Patente Asignada': c.vehiculoAsignado || 'Sin asignación',
      'Turno': turnoLabel(c.turno),
      'Multas': c.cantidadMultas,
      'Pendientes': c.pendientes,
      'En Proceso': c.enProceso,
      'Pagadas': c.pagadas,
      'Vehículos (cant.)': c.vehiculos.length,
      'Vehículos (patentes)': c.vehiculos.join(', '),
      'Monto Pendiente': c.montoPendiente,
      'Monto En Proceso': c.montoEnProceso,
      'Monto Pagado': c.montoPagado,
      'Monto Total Multas': c.montoTotalMultas,
      'Saldo Pendiente': c.saldoPendiente,
      'Saldo A Favor': c.saldoAFavor,
      'Tiene Garantía': c.tieneGarantia ? 'Sí' : 'No',
      'Garantía Pagada': c.garantiaPagada,
      'Garantía Total': c.garantiaTotal,
      'Saldo − Garantía': c.saldoMenosGarantia,
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    ws['!cols'] = [
      { wch: 30 }, // Conductor
      { wch: 12 }, // DNI
      { wch: 14 }, // CUIT
      { wch: 12 }, // Estado
      { wch: 16 }, // Patente Asignada
      { wch: 10 }, // Turno
      { wch: 8 },  // Multas
      { wch: 11 }, // Pendientes
      { wch: 11 }, // En Proceso
      { wch: 10 }, // Pagadas
      { wch: 15 }, // Vehículos (cant.)
      { wch: 28 }, // Vehículos (patentes)
      { wch: 16 }, // Monto Pendiente
      { wch: 16 }, // Monto En Proceso
      { wch: 15 }, // Monto Pagado
      { wch: 17 }, // Monto Total Multas
      { wch: 16 }, // Saldo Pendiente
      { wch: 14 }, // Saldo A Favor
      { wch: 13 }, // Tiene Garantía
      { wch: 16 }, // Garantía Pagada
      { wch: 15 }, // Garantía Total
      { wch: 17 }, // Saldo − Garantía
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Conductores')

    // El nombre del archivo deja constancia del filtro de stat-card usado.
    const sufijoFiltro = activeCard ? `_${CARD_LABELS[activeCard].replace(/\s+/g, '')}` : ''
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Panel_Conductores${sufijoFiltro}_${fecha}.xlsx`)
  }

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
      // Solo el nombre: así el filtro de columna muestra únicamente nombres. La
      // búsqueda global sigue matcheando por DNI/CUIT porque lee los campos crudos.
      accessorFn: (r) => r.nombre || '',
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{row.original.nombre || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
            DNI: {row.original.dni || '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
            CUIT: {row.original.ruc || '—'}
          </div>
        </div>
      ),
    },
    {
      id: 'patente',
      // Sin patente -> "Sin asignación", para que aparezca como opción en el filtro.
      accessorFn: (r) => r.vehiculoAsignado || 'Sin asignación',
      header: 'Patente',
      cell: ({ row }) => row.original.vehiculoAsignado
        ? <span className="cpanel-badge asig">{row.original.vehiculoAsignado}</span>
        : <span className="cpanel-badge noasig">Sin asignación</span>,
    },
    {
      id: 'turno',
      accessorFn: (r) => turnoLabel(r.turno),
      header: 'Turno',
      cell: ({ row }) => row.original.turno
        ? <span className={`cpanel-badge turno ${row.original.turno}`}>{turnoLabel(row.original.turno)}</span>
        : <span className="cpanel-num">—</span>,
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
    // Columnas de conteo con filtro de RANGO (Desde/Hasta). Para que el DataTable las
    // detecte como numéricas, el id usa una palabra numérica ('cantidad_...') y el
    // accessor devuelve el número crudo (el filtro numérico lo lee del accessorFn).
    {
      id: 'cantidad_infracciones',
      accessorFn: (r) => r.cantidadMultas,
      header: 'Multas',
      sortingFn: (a, b) => (a.original.cantidadMultas || 0) - (b.original.cantidadMultas || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.cantidadMultas}</span>,
    },
    {
      id: 'cantidad_pendientes',
      accessorFn: (r) => r.pendientes,
      header: 'Pendientes',
      sortingFn: (a, b) => (a.original.pendientes || 0) - (b.original.pendientes || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.pendientes}</span>,
    },
    {
      id: 'cantidad_en_proceso',
      accessorFn: (r) => r.enProceso,
      header: 'En Proceso',
      sortingFn: (a, b) => (a.original.enProceso || 0) - (b.original.enProceso || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.enProceso}</span>,
    },
    {
      id: 'cantidad_pagadas',
      accessorFn: (r) => r.pagadas,
      header: 'Pagadas',
      sortingFn: (a, b) => (a.original.pagadas || 0) - (b.original.pagadas || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.pagadas}</span>,
    },
    {
      id: 'cantidad_vehiculos',
      accessorFn: (r) => r.vehiculos.length,
      header: 'Vehículos',
      sortingFn: (a, b) => a.original.vehiculos.length - b.original.vehiculos.length,
      cell: ({ row }) => <span className="cpanel-num" title={row.original.vehiculos.join(', ')}>{row.original.vehiculos.length}</span>,
    },
    // Columnas de dinero con filtro de RANGO (Desde/Hasta) y prefijo $. El id usa una
    // palabra de dinero ('monto_...') para que el DataTable las trate como money, y el
    // accessor devuelve el número crudo (el filtro numérico lo parsea directo).
    {
      id: 'monto_pendiente',
      accessorFn: (r) => r.montoPendiente,
      header: 'Multas Pendientes',
      sortingFn: (a, b) => (a.original.montoPendiente || 0) - (b.original.montoPendiente || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatCurrency(row.original.montoPendiente)}</span>,
    },
    {
      id: 'monto_en_proceso',
      accessorFn: (r) => r.montoEnProceso,
      header: 'Multas En Proceso',
      sortingFn: (a, b) => (a.original.montoEnProceso || 0) - (b.original.montoEnProceso || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatCurrency(row.original.montoEnProceso)}</span>,
    },
    {
      id: 'monto_pagado',
      accessorFn: (r) => r.montoPagado,
      header: 'Multas Pagadas',
      sortingFn: (a, b) => (a.original.montoPagado || 0) - (b.original.montoPagado || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatCurrency(row.original.montoPagado)}</span>,
    },
    {
      id: 'monto_total',
      accessorFn: (r) => r.montoTotalMultas,
      header: 'Monto Total',
      sortingFn: (a, b) => (a.original.montoTotalMultas || 0) - (b.original.montoTotalMultas || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatCurrency(row.original.montoTotalMultas)}</span>,
    },
    // --- Saldo y garantía ---
    // Saldo pendiente = deuda del último movimiento del kardex (control_saldos),
    // el mismo número que muestra la pestaña "Historial de saldo" del detalle.
    // El accessor devuelve la DEUDA en positivo para que el filtro Desde/Hasta sea
    // intuitivo; si el conductor está a favor, se muestra en verde y filtra como 0.
    {
      id: 'monto_saldo_pendiente',
      accessorFn: (r) => r.saldoPendiente,
      header: 'Saldo Pendiente',
      sortingFn: (a, b) => (a.original.saldoPendiente || 0) - (b.original.saldoPendiente || 0),
      cell: ({ row }) => {
        const r = row.original
        if (r.saldoPendiente > 0) {
          return <span className="cpanel-num cpanel-deuda">{formatCurrency(r.saldoPendiente)}</span>
        }
        if (r.saldoAFavor > 0) {
          return (
            <span className="cpanel-num cpanel-favor" title="Saldo a favor del conductor">
              {formatCurrency(r.saldoAFavor)}
              <small> a favor</small>
            </span>
          )
        }
        return <span className="cpanel-num">{formatCurrency(0)}</span>
      },
    },
    {
      id: 'monto_garantia_pagada',
      accessorFn: (r) => r.garantiaPagada,
      header: 'Garantía Pagada',
      sortingFn: (a, b) => (a.original.garantiaPagada || 0) - (b.original.garantiaPagada || 0),
      cell: ({ row }) => {
        const r = row.original
        if (!r.tieneGarantia) return <span className="cpanel-num cpanel-nulo">Sin garantía</span>
        return (
          <span className="cpanel-num">
            {formatCurrency(r.garantiaPagada)}
            {r.garantiaTotal > 0 && <small> de {formatCurrency(r.garantiaTotal)}</small>}
          </span>
        )
      },
    },
    // Diferencia = saldo pendiente − garantía pagada: cuánto de la deuda queda sin
    // cubrir si se aplica el fondo de garantía. Positivo = todavía debe.
    {
      id: 'monto_saldo_menos_garantia',
      accessorFn: (r) => r.saldoMenosGarantia,
      header: 'Saldo − Garantía',
      sortingFn: (a, b) => (a.original.saldoMenosGarantia || 0) - (b.original.saldoMenosGarantia || 0),
      cell: ({ row }) => {
        const d = row.original.saldoMenosGarantia
        if (d > 0) {
          return (
            <span className="cpanel-num cpanel-deuda" title="La garantía no alcanza a cubrir el saldo pendiente">
              {formatCurrency(d)}
              <small> sin cubrir</small>
            </span>
          )
        }
        return (
          <span className="cpanel-num cpanel-favor" title="La garantía cubre el saldo pendiente">
            {formatCurrency(d)}
            <small> cubierto</small>
          </span>
        )
      },
    },
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
        onFilteredDataChange={setVisibles}
        headerAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={handleExportar}
              disabled={loading || filasAExportar.length === 0}
              title={
                filasAExportar.length === 0
                  ? 'No hay filas para exportar'
                  : `Exporta las ${filasAExportar.length} filas que pasan los filtros actuales`
              }
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={16} />
              Exportar Excel{filasAExportar.length > 0 ? ` (${filasAExportar.length})` : ''}
            </button>
            <button className="btn-secondary" onClick={() => setReloadKey(k => k + 1)} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Recargar
            </button>
          </div>
        }
      />

      {detalle && (
        <ConductorDetalleModal conductor={detalle} onClose={() => setDetalle(null)} />
      )}
    </div>
  )
}
