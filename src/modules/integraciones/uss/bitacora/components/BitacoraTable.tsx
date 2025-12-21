// src/modules/integraciones/uss/bitacora/components/BitacoraTable.tsx
import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { BitacoraRegistroTransformado } from '../../../../../services/wialonBitacoraService'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'

interface BitacoraTableProps {
  registros: BitacoraRegistroTransformado[]
  totalCount: number
  isLoading: boolean
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onChecklistChange: (
    id: string,
    field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
    value: boolean
  ) => Promise<void>
  searchTerm: string
  onSearchChange: (term: string) => void
}

export function BitacoraTable({
  registros,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onChecklistChange,
  searchTerm,
  onSearchChange,
}: BitacoraTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const totalPages = Math.ceil(totalCount / pageSize)

  const handleCheckboxChange = async (
    id: string,
    field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
    value: boolean
  ) => {
    setUpdatingId(id)
    try {
      await onChecklistChange(id, field, value)
    } finally {
      setUpdatingId(null)
    }
  }

  const formatTime = (time: string | null) => {
    if (!time) return '-'
    return time.substring(0, 5)
  }

  const formatDate = (date: string) => {
    const d = new Date(date + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }

  const getEstadoClass = (estado: string) => {
    switch (estado) {
      case 'Turno Finalizado': return 'estado-finalizado'
      case 'Poco Km': return 'estado-poco-km'
      case 'En Curso': return 'estado-en-curso'
      default: return 'estado-pendiente'
    }
  }

  return (
    <div className="bitacora-table-container">
      <div className="table-toolbar">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por patente o conductor..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>
        <span className="record-count">{totalCount} registros</span>
      </div>

      <div className="table-wrapper">
        <table className="bitacora-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Patente</th>
              <th>iButton</th>
              <th>Conductor</th>
              <th>Inicio</th>
              <th>Cierre</th>
              <th>Km</th>
              <th className="col-check">GNC</th>
              <th className="col-check">Lavado</th>
              <th className="col-check">Nafta</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="loading-row">
                  {[...Array(11)].map((_, j) => (
                    <td key={j}><div className="skeleton-cell"></div></td>
                  ))}
                </tr>
              ))
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-state">
                  No hay registros para mostrar
                </td>
              </tr>
            ) : (
              registros.map((r) => (
                <tr key={r.id} className={updatingId === r.id ? 'updating' : ''}>
                  <td>{formatDate(r.fecha_turno)}</td>
                  <td><span className="patente">{r.patente.replace(/\s/g, '')}</span></td>
                  <td className="text-muted">{r.ibutton || '-'}</td>
                  <td>{r.conductor_wialon || '-'}</td>
                  <td>{formatTime(r.hora_inicio)}</td>
                  <td>{formatTime(r.hora_cierre)}</td>
                  <td className={r.kilometraje < BITACORA_CONSTANTS.POCO_KM_THRESHOLD ? 'km-low' : ''}>
                    {r.kilometraje.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                  </td>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={r.gnc_cargado}
                      onChange={(e) => handleCheckboxChange(r.id, 'gnc_cargado', e.target.checked)}
                      disabled={updatingId === r.id}
                    />
                  </td>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={r.lavado_realizado}
                      onChange={(e) => handleCheckboxChange(r.id, 'lavado_realizado', e.target.checked)}
                      disabled={updatingId === r.id}
                    />
                  </td>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={r.nafta_cargada}
                      onChange={(e) => handleCheckboxChange(r.id, 'nafta_cargada', e.target.checked)}
                      disabled={updatingId === r.id}
                    />
                  </td>
                  <td><span className={`estado ${getEstadoClass(r.estado)}`}>{r.estado}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <div className="page-size">
          <label>Mostrar:</label>
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {BITACORA_CONSTANTS.PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        <div className="pagination">
          <button onClick={() => onPageChange(1)} disabled={page === 1 || isLoading}>
            <ChevronsLeft size={16} />
          </button>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || isLoading}>
            <ChevronLeft size={16} />
          </button>
          <span className="page-info">Página {page} de {totalPages || 1}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading}>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || isLoading}>
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
