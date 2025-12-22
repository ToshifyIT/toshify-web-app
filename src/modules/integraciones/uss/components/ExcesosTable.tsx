// src/modules/integraciones/uss/components/ExcesosTable.tsx
/**
 * Tabla de excesos de velocidad
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, MapPin, Search, Filter } from 'lucide-react'
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

type SortField = 'fecha_evento' | 'patente' | 'conductor_wialon' | 'velocidad_maxima' | 'limite_velocidad' | 'exceso' | 'duracion_segundos'
type SortDirection = 'asc' | 'desc'

interface ColumnFilters {
  patente: string
  conductor: string
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
  const [sortField, setSortField] = useState<SortField>('fecha_evento')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    patente: '',
    conductor: '',
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const handleColumnFilterChange = (column: keyof ColumnFilters, value: string) => {
    setColumnFilters(prev => ({ ...prev, [column]: value }))
  }

  // Filtrar y ordenar
  const sortedExcesos = useMemo(() => {
    let filtered = [...excesos]

    // Aplicar filtros de columna
    if (columnFilters.patente) {
      filtered = filtered.filter(e =>
        e.patente.toLowerCase().includes(columnFilters.patente.toLowerCase())
      )
    }
    if (columnFilters.conductor) {
      filtered = filtered.filter(e =>
        (e.conductor_wialon || '').toLowerCase().includes(columnFilters.conductor.toLowerCase())
      )
    }

    // Ordenar
    return filtered.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      const aStr = String(aValue || '')
      const bStr = String(bValue || '')
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr)
    })
  }, [excesos, sortField, sortDirection, columnFilters])

  const displayCount = totalCount
  const totalPages = Math.ceil(displayCount / pageSize)

  if (isLoading && excesos.length === 0) {
    return <TableLoading />
  }

  if (excesos.length === 0) {
    return (
      <div className="uss-table-empty">
        <p>No se encontraron excesos de velocidad para el período seleccionado.</p>
      </div>
    )
  }

  return (
    <div className="uss-table-container">
      {/* Barra de controles: buscador + filtros de fecha */}
      <div className="uss-table-toolbar">
        <div className="uss-table-search">
          <Search size={18} className="uss-search-icon" />
          <input
            type="text"
            placeholder="Buscar por patente, conductor o ubicación..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="uss-search-input"
          />
          {searchTerm && (
            <span className="uss-search-results">
              {excesos.length} resultado{excesos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {headerControls}
      </div>

      <table className="uss-table">
        <thead>
          <tr>
            <SortableHeader
              field="fecha_evento"
              label="Fecha/Hora"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <FilterableHeader
              field="patente"
              label="Patente"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
              filterValue={columnFilters.patente}
              onFilterChange={(val) => handleColumnFilterChange('patente', val)}
            />
            <th>iButton</th>
            <FilterableHeader
              field="conductor_wialon"
              label="Conductor"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
              filterValue={columnFilters.conductor}
              onFilterChange={(val) => handleColumnFilterChange('conductor', val)}
            />
            <SortableHeader
              field="velocidad_maxima"
              label="Velocidad"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              field="limite_velocidad"
              label="Límite"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              field="exceso"
              label="Exceso"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              field="duracion_segundos"
              label="Duración"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th>Ubicación</th>
          </tr>
        </thead>
        <tbody>
          {sortedExcesos.map((exceso) => (
            <ExcesoRow key={exceso.id} exceso={exceso} />
          ))}
        </tbody>
      </table>

      <Pagination
        page={page}
        pageSize={pageSize}
        totalCount={displayCount}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  )
}

interface SortableHeaderProps {
  readonly field: SortField
  readonly label: string
  readonly currentField: SortField
  readonly direction: SortDirection
  readonly onSort: (field: SortField) => void
}

function SortableHeader({
  field,
  label,
  currentField,
  direction,
  onSort,
}: SortableHeaderProps) {
  const isActive = field === currentField

  return (
    <th onClick={() => onSort(field)} className="uss-sortable">
      <span className="uss-sortable-content">
        {label}
        {isActive && (
          direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </span>
    </th>
  )
}

interface FilterableHeaderProps extends SortableHeaderProps {
  readonly filterValue: string
  readonly onFilterChange: (value: string) => void
}

function FilterableHeader({
  field,
  label,
  currentField,
  direction,
  onSort,
  filterValue,
  onFilterChange,
}: FilterableHeaderProps) {
  const isActive = field === currentField
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <th className="uss-sortable uss-filterable">
      <div className="uss-header-with-filter">
        <span className="uss-sortable-content" onClick={() => onSort(field)}>
          {label}
          {isActive && (
            direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
          )}
        </span>
        <div className="uss-column-filter" ref={dropdownRef}>
          <button
            type="button"
            className={`uss-column-filter-btn ${filterValue ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
          >
            <Filter size={12} />
          </button>
          {isOpen && (
            <div className="uss-column-filter-dropdown">
              <input
                type="text"
                value={filterValue}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder={`Filtrar ${label.toLowerCase()}...`}
                className="uss-column-filter-input"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              {filterValue && (
                <button
                  type="button"
                  className="uss-column-filter-clear"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFilterChange('')
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </th>
  )
}

interface ExcesoRowProps {
  readonly exceso: ExcesoVelocidad
}

function ExcesoRow({ exceso }: ExcesoRowProps) {
  const severityColor = getSeverityColor(exceso.exceso)

  return (
    <tr>
      <td>{formatDateTime(exceso.fecha_evento)}</td>
      <td className="uss-patente">{exceso.patente.replace(/\s/g, '')}</td>
      <td className="uss-ibutton">{exceso.ibutton || '-'}</td>
      <td>{extractConductorName(exceso.conductor_wialon)}</td>
      <td className="uss-velocidad">{formatSpeed(exceso.velocidad_maxima)}</td>
      <td>{formatSpeed(exceso.limite_velocidad)}</td>
      <td>
        <span
          className="uss-exceso-badge"
          style={{ backgroundColor: severityColor }}
        >
          +{Math.round(exceso.exceso)} km/h
        </span>
      </td>
      <td>{formatDuration(exceso.duracion_segundos)}</td>
      <td className="uss-ubicacion">
        <MapPin size={14} />
        <span title={exceso.localizacion}>
          {truncateLocation(exceso.localizacion, 30)}
        </span>
      </td>
    </tr>
  )
}

interface PaginationProps {
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
  readonly totalPages: number
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (size: number) => void
}

function Pagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  return (
    <div className="uss-pagination">
      <div className="uss-pagination-info">
        Mostrando {startItem}-{endItem} de {totalCount.toLocaleString()} registros
      </div>

      <div className="uss-pagination-controls">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="uss-page-size-select"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} por página
            </option>
          ))}
        </select>

        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="uss-page-btn"
        >
          ««
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="uss-page-btn"
        >
          «
        </button>

        <span className="uss-page-indicator">
          Página {page} de {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="uss-page-btn"
        >
          »
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="uss-page-btn"
        >
          »»
        </button>
      </div>
    </div>
  )
}

function TableLoading() {
  return (
    <div className="uss-table-loading">
      <div className="uss-loading-spinner" />
      <p>Cargando excesos de velocidad...</p>
    </div>
  )
}
