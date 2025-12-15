// src/modules/integraciones/uss/components/ExcesosTable.tsx
/**
 * Tabla de excesos de velocidad
 */

import { useState } from 'react'
import { ChevronUp, ChevronDown, MapPin } from 'lucide-react'
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
}

type SortField = 'fecha_evento' | 'patente' | 'velocidad_maxima' | 'exceso' | 'duracion_segundos'
type SortDirection = 'asc' | 'desc'

export function ExcesosTable({
  excesos,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ExcesosTableProps) {
  const [sortField, setSortField] = useState<SortField>('fecha_evento')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedExcesos = [...excesos].sort((a, b) => {
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

  const totalPages = Math.ceil(totalCount / pageSize)

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
            <SortableHeader
              field="patente"
              label="Patente"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th>Conductor</th>
            <SortableHeader
              field="velocidad_maxima"
              label="Velocidad"
              currentField={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th>Límite</th>
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
        totalCount={totalCount}
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
    <th onClick={() => onSort(field)} className="uss-sortable-header">
      <span>{label}</span>
      {isActive && (
        direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      )}
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
      <td className="uss-patente">{exceso.patente}</td>
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
