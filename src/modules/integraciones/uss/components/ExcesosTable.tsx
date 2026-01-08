// src/modules/integraciones/uss/components/ExcesosTable.tsx
/**
 * Tabla de excesos de velocidad usando DataTable con filtros Excel
 */

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../../../components/ui/DataTable/ExcelColumnFilter'
import { Search, MapPin, Gauge, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import type { ExcesoVelocidad } from '../types/uss.types'
import {
  formatDateTime,
  formatDuration,
  formatSpeed,
  extractConductorName,
  truncateLocation,
  getSeverityColor,
} from '../utils/uss.utils'
import { PAGE_SIZES } from '../constants/uss.constants'

interface ExcesosTableProps {
  readonly excesos: ExcesoVelocidad[]
  readonly totalCount: number
  readonly isLoading: boolean
  readonly page: number
  readonly pageSize: number
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (size: number) => void
  readonly searchTerm: string
  readonly onSearchChange: (term: string) => void
  readonly headerControls?: React.ReactNode
}

export function ExcesosTable({
  excesos,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchChange,
  headerControls,
}: ExcesosTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize)

  // Estados para filtros Excel
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])

  // Listas únicas para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(excesos.map(e => e.patente).filter(Boolean))].sort()
  , [excesos])

  const conductoresUnicos = useMemo(() =>
    [...new Set(excesos.map(e => extractConductorName(e.conductor_wialon)).filter(Boolean) as string[])].sort()
  , [excesos])

  // Datos filtrados
  const excesosFiltrados = useMemo(() => {
    return excesos.filter(e => {
      if (patenteFilter.length > 0 && !patenteFilter.includes(e.patente)) return false
      if (conductorFilter.length > 0 && !conductorFilter.includes(extractConductorName(e.conductor_wialon) || '')) return false
      return true
    })
  }, [excesos, patenteFilter, conductorFilter])

  // Columnas con filtros Excel
  const columns = useMemo<ColumnDef<ExcesoVelocidad, unknown>[]>(() => [
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha/Hora',
      cell: ({ row }) => formatDateTime(row.original.fecha_evento),
      enableSorting: true,
    },
    {
      accessorKey: 'patente',
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {row.original.patente.replace(/\s/g, '')}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'ibutton',
      header: 'iButton',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          {row.original.ibutton || '-'}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'conductor_wialon',
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => extractConductorName(row.original.conductor_wialon) || '-',
      enableSorting: false,
    },
    {
      accessorKey: 'velocidad_maxima',
      header: 'Velocidad',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
          {formatSpeed(row.original.velocidad_maxima)}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'limite_velocidad',
      header: 'Limite',
      cell: ({ row }) => formatSpeed(row.original.limite_velocidad),
      enableSorting: true,
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
      enableSorting: true,
    },
    {
      accessorKey: 'duracion_segundos',
      header: 'Duracion',
      cell: ({ row }) => formatDuration(row.original.duracion_segundos),
      enableSorting: true,
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
  ], [
    patentesUnicas, patenteFilter,
    conductoresUnicos, conductorFilter,
    openFilterId,
  ])

  // Paginación manual del servidor
  const paginationControls = (
    <div className="dt-pagination" style={{ borderTop: 'none', background: 'transparent', padding: '12px 0' }}>
      <div className="dt-pagination-info">
        Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} de {totalCount.toLocaleString()} registros
      </div>
      <div className="dt-pagination-controls">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="dt-pagination-select"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button onClick={() => onPageChange(1)} disabled={page === 1 || isLoading} className="dt-pagination-btn">
          <ChevronsLeft size={14} />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || isLoading} className="dt-pagination-btn">
          <ChevronLeft size={14} />
        </button>
        <span className="dt-pagination-text">Página {page} de {totalPages || 1}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )

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
              {excesos.length} resultado{excesos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {headerControls}
      </div>

      {/* DataTable */}
      <DataTable
        data={excesosFiltrados}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        showPagination={false}
        emptyIcon={<Gauge size={48} />}
        emptyTitle="Sin excesos"
        emptyDescription="No se encontraron excesos de velocidad para el período seleccionado"
        pageSize={pageSize}
      />

      {/* Paginación del servidor */}
      {excesosFiltrados.length > 0 && paginationControls}
    </div>
  )
}
