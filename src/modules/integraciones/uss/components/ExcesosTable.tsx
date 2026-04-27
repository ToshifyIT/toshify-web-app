// src/modules/integraciones/uss/components/ExcesosTable.tsx
/**
 * Tabla de excesos de velocidad usando DataTable con filtros automáticos
 * Toda la data viene del servidor, DataTable maneja paginación/filtros/sorting del cliente
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../../../components/ui/DataTable/DataTable'
import { Search, MapPin, Gauge } from 'lucide-react'
import type { ExcesoVelocidad } from '../types/uss.types'
import { normalizePatente } from '../../../../utils/normalizeDocuments'
import {
  formatDateTime,
  formatDuration,
  formatSpeed,
  extractConductorName,
  truncateLocation,
  getSeverityColor,
} from '../utils/uss.utils'

interface ExcesosTableProps {
  readonly excesos: ExcesoVelocidad[]
  readonly totalCount: number
  readonly isLoading: boolean
  readonly searchTerm: string
  readonly onSearchChange: (term: string) => void
  readonly headerControls?: React.ReactNode
  readonly onVelocidadRangeChange?: (min: number | undefined, max: number | undefined) => void
  readonly onFilteredDataChange?: (data: ExcesoVelocidad[]) => void
}

export function ExcesosTable({
  excesos,
  totalCount,
  isLoading,
  searchTerm,
  onSearchChange,
  headerControls,
  onVelocidadRangeChange,
  onFilteredDataChange,
}: ExcesosTableProps) {

  // Observar datos filtrados del DataTable para actualizar stats
  const tableRef = useRef<Table<ExcesoVelocidad> | null>(null)
  const lastFilteredKeyRef = useRef<string>('')
  const onFilteredDataChangeRef = useRef(onFilteredDataChange)
  onFilteredDataChangeRef.current = onFilteredDataChange

  const handleTableReady = useCallback((table: Table<ExcesoVelocidad>) => {
    tableRef.current = table
  }, [])

  // Polling: verificar cada 300ms si los datos filtrados del DataTable cambiaron
  // Necesario porque los filtros internos del DataTable no disparan re-renders en este componente
  useEffect(() => {
    const checkFiltered = () => {
      if (!tableRef.current || !onFilteredDataChangeRef.current) return
      const filteredRows = tableRef.current.getFilteredRowModel().rows
      const key = filteredRows.length + '_' + (filteredRows.length > 0 ? filteredRows[0].id + '_' + filteredRows[filteredRows.length - 1].id : '')
      if (key !== lastFilteredKeyRef.current) {
        lastFilteredKeyRef.current = key
        onFilteredDataChangeRef.current(filteredRows.map(r => r.original))
      }
    }
    // Check inmediato al montar
    checkFiltered()
    const interval = setInterval(checkFiltered, 300)
    return () => clearInterval(interval)
  }, [excesos])

  // Estado para filtro de rango de velocidad (servidor)
  const [velMin, setVelMin] = useState('')
  const [velMax, setVelMax] = useState('')
  const [showVelFilter, setShowVelFilter] = useState(false)
  const velFilterActive = velMin !== '' || velMax !== ''

  const applyVelocidadFilter = () => {
    const min = velMin !== '' ? Number(velMin) : undefined
    const max = velMax !== '' ? Number(velMax) : undefined
    onVelocidadRangeChange?.(min, max)
    setShowVelFilter(false)
  }

  const clearVelocidadFilter = () => {
    setVelMin('')
    setVelMax('')
    onVelocidadRangeChange?.(undefined, undefined)
    setShowVelFilter(false)
  }

  // Columnas — headers como texto plano para que DataTable aplique filtros automáticos
  const columns = useMemo<ColumnDef<ExcesoVelocidad, unknown>[]>(() => [
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha/Hora',
      cell: ({ row }) => formatDateTime(row.original.fecha_evento),
    },
    {
      accessorKey: 'patente',
      header: 'Patente',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {normalizePatente(row.original.patente)}
        </span>
      ),
    },
    {
      accessorKey: 'ibutton',
      header: 'iButton',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          {row.original.ibutton || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'conductor_wialon',
      header: 'Conductor',
      cell: ({ row }) => extractConductorName(row.original.conductor_wialon) || '-',
    },
    {
      accessorKey: 'velocidad_maxima',
      header: 'Velocidad',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
          {formatSpeed(row.original.velocidad_maxima)}
        </span>
      ),
    },
    {
      accessorKey: 'limite_velocidad',
      header: 'Limite',
      cell: ({ row }) => formatSpeed(row.original.limite_velocidad),
    },
    {
      accessorKey: 'exceso',
      header: 'Exceso',
      cell: ({ row }) => {
        const severityColor = getSeverityColor(row.original.exceso)
        return (
          <span
            className="dt-badge"
            style={{
              backgroundColor: severityColor,
              color: 'white',
              fontWeight: 600,
            }}
          >
            +{Math.round(row.original.exceso)} km/h
          </span>
        )
      },
    },
    {
      accessorKey: 'duracion_segundos',
      header: 'Duracion',
      cell: ({ row }) => formatDuration(row.original.duracion_segundos),
    },
    {
      accessorKey: 'localizacion',
      header: 'Ubicacion',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <MapPin size={14} />
          <span title={row.original.localizacion}>
            {truncateLocation(row.original.localizacion, 30)}
          </span>
        </div>
      ),
      enableSorting: false,
    },
  ], [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toolbar con búsqueda y controles */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input
            type="text"
            placeholder="Buscar por patente, conductor o ubicación..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dt-search-input"
          />
          {searchTerm && (
            <span style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '11px',
              color: 'var(--text-tertiary)'
            }}>
              {totalCount.toLocaleString()} registros cargados
            </span>
          )}
        </div>

        {/* Filtro de rango de velocidad (servidor) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowVelFilter(!showVelFilter)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: velFilterActive ? 'var(--color-primary, #ef4444)' : 'var(--bg-secondary, #f3f4f6)',
              color: velFilterActive ? 'white' : 'var(--text-secondary)',
              border: velFilterActive ? 'none' : '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Gauge size={15} />
            {velFilterActive ? `${velMin || '0'} - ${velMax || '∞'} km/h` : 'Rango velocidad'}
          </button>
          {showVelFilter && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: '6px',
              background: 'var(--bg-primary, white)', border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '10px', padding: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '220px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: 'var(--text-primary)' }}>Filtrar por velocidad (km/h)</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={velMin}
                  onChange={(e) => setVelMin(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', background: 'var(--bg-secondary, #f9fafb)', outline: 'none' }}
                />
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px', fontWeight: 600 }}>—</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={velMax}
                  onChange={(e) => setVelMax(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', background: 'var(--bg-secondary, #f9fafb)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={applyVelocidadFilter}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, background: 'var(--color-primary, #ef4444)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Aplicar
                </button>
                <button
                  onClick={clearVelocidadFilter}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, background: 'var(--bg-secondary, #f3f4f6)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}
        </div>

        {headerControls}
      </div>

      {/* DataTable — maneja paginación, filtros y sorting sobre toda la data */}
      <DataTable
        data={excesos}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        pageSize={50}
        onTableReady={handleTableReady}
        emptyIcon={<Gauge size={48}
      />}
        emptyTitle="Sin excesos"
        emptyDescription="No se encontraron excesos de velocidad para el período seleccionado"
      />
    </div>
  )
}
