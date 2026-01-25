/**
 * CabifyPreviewTable - Preview del Reporte de Facturación para Cabify
 * Formato específico con columnas editables y sincronización con BD
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Search,
  X,
  Save,
  RotateCcw
} from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'

// Tipo para cada fila del preview Cabify
export interface CabifyPreviewRow {
  anio: number
  semana: number
  fechaInicial: Date
  fechaFinal: Date
  conductor: string
  email: string
  patente: string
  dni: string
  importeContrato: number
  excedentes: number
  conductorId: string
  // Datos de Cabify
  horasConexion: number
  importeGenerado: number
  importeGeneradoConBonos: number
  generadoEfectivo: number
  // Para tracking de cambios
  id?: string // ID en facturacion_cabify si existe
  isModified?: boolean
}

interface CabifyPreviewTableProps {
  data: CabifyPreviewRow[]
  semana: number
  anio: number
  fechaInicio: string
  fechaFin: string
  periodoId?: string
  onClose: () => void
  onExport: () => void
  exporting: boolean
  onSync?: (data: CabifyPreviewRow[]) => Promise<boolean>
}

export function CabifyPreviewTable({
  data: initialData,
  semana,
  anio,
  fechaInicio,
  fechaFin,
  periodoId,
  onClose,
  onExport,
  exporting,
  onSync
}: CabifyPreviewTableProps) {
  const [data, setData] = useState<CabifyPreviewRow[]>(initialData)
  const [originalData] = useState<CabifyPreviewRow[]>(initialData)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [hasChanges, setHasChanges] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Campos editables
  const editableFields = ['importeContrato', 'excedentes', 'horasConexion', 'importeGenerado', 'importeGeneradoConBonos', 'generadoEfectivo']

  // Filtrar datos
  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const search = searchTerm.toLowerCase()
    return data.filter(row => 
      row.conductor.toLowerCase().includes(search) ||
      row.dni.includes(search) ||
      row.patente.toLowerCase().includes(search) ||
      row.email.toLowerCase().includes(search)
    )
  }, [data, searchTerm])

  // Totales
  const totales = useMemo(() => {
    return filteredData.reduce((acc, row) => ({
      importeContrato: acc.importeContrato + row.importeContrato,
      excedentes: acc.excedentes + row.excedentes,
      total: acc.total + row.importeContrato + row.excedentes,
      horasConexion: acc.horasConexion + row.horasConexion,
      importeGenerado: acc.importeGenerado + row.importeGenerado,
      importeGeneradoConBonos: acc.importeGeneradoConBonos + row.importeGeneradoConBonos,
      generadoEfectivo: acc.generadoEfectivo + row.generadoEfectivo
    }), { importeContrato: 0, excedentes: 0, total: 0, horasConexion: 0, importeGenerado: 0, importeGeneradoConBonos: 0, generadoEfectivo: 0 })
  }, [filteredData])

  // Iniciar edición
  const startEdit = useCallback((rowIdx: number, field: string, currentValue: number) => {
    if (!editableFields.includes(field)) return
    setEditingCell({ rowIdx, field })
    setEditValue(String(currentValue))
  }, [])

  // Guardar edición
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const { rowIdx, field } = editingCell
    const newData = [...data]
    const row = { ...newData[rowIdx] }
    const numValue = parseFloat(editValue) || 0

    // Actualizar el campo
    ;(row as Record<string, unknown>)[field] = numValue
    row.isModified = true

    newData[rowIdx] = row
    setData(newData)
    setEditingCell(null)
    setEditValue('')
    setHasChanges(true)
  }, [editingCell, editValue, data])

  // Cancelar edición
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // Resetear cambios
  const resetChanges = useCallback(() => {
    setData([...originalData])
    setHasChanges(false)
  }, [originalData])

  // Sincronizar con BD
  const handleSync = useCallback(async () => {
    if (!onSync || !hasChanges) return

    const result = await Swal.fire({
      title: 'Sincronizar cambios',
      text: '¿Guardar los cambios en la base de datos?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#7C3AED',
      confirmButtonText: 'Sincronizar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setSyncing(true)
    try {
      const success = await onSync(data)
      if (success) {
        setHasChanges(false)
        // Marcar todas las filas como no modificadas
        setData(prev => prev.map(row => ({ ...row, isModified: false })))
        showSuccess('Sincronizado', 'Los cambios se guardaron correctamente')
      }
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
    } finally {
      setSyncing(false)
    }
  }, [onSync, hasChanges, data])

  // Render celda editable
  const renderEditableCell = (row: CabifyPreviewRow, rowIdx: number, field: string, value: number, isHours = false) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field
    const canEdit = editableFields.includes(field)

    if (isEditing) {
      return (
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
          autoFocus
          className="edit-input"
        />
      )
    }

    const displayValue = isHours ? value.toFixed(1) : formatCurrency(value)

    return (
      <span
        onClick={() => canEdit && startEdit(rowIdx, field, value)}
        className={`editable-cell ${canEdit ? 'can-edit' : ''} ${row.isModified ? 'modified' : ''}`}
        title={canEdit ? 'Click para editar' : ''}
      >
        {displayValue}
      </span>
    )
  }

  return (
    <div className="fact-preview-container">
      {/* Header */}
      <div className="fact-preview-header">
        <div className="fact-preview-header-left">
          <button className="fact-preview-back-btn" onClick={onClose}>
            <ArrowLeft size={18} />
            Volver
          </button>
          <div className="fact-preview-title">
            <h2>Preview Facturación Cabify</h2>
            <span className="fact-preview-subtitle">
              Semana {semana}/{anio} - {fechaInicio} al {fechaFin}
            </span>
          </div>
          {/* Stats inline */}
          <div className="fact-preview-stats-inline">
            <span className="fact-stat-inline"><strong>{data.length}</strong> conductores</span>
            <span className="fact-stat-inline"><strong>{formatCurrency(totales.importeContrato)}</strong> contratos</span>
            <span className="fact-stat-inline"><strong>{formatCurrency(totales.excedentes)}</strong> excedentes</span>
            <span className="fact-stat-inline total"><strong>{formatCurrency(totales.total)}</strong> total</span>
          </div>
        </div>
        <div className="fact-preview-header-right">
          {periodoId && (
            <span className="fact-preview-badge open">
              PERÍODO ABIERTO - EDITABLE
            </span>
          )}
          {hasChanges && (
            <button
              className="fact-preview-btn secondary"
              onClick={resetChanges}
              title="Descartar cambios"
            >
              <RotateCcw size={14} />
              Resetear
            </button>
          )}
          {onSync && hasChanges && (
            <button
              className="fact-preview-btn sync"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? <Loader2 size={14} className="spinning" /> : <Save size={14} />}
              {syncing ? 'Sincronizando...' : 'Sincronizar BD'}
            </button>
          )}
          <button
            className="fact-preview-btn primary"
            onClick={onExport}
            disabled={exporting}
            style={{ backgroundColor: '#7C3AED' }}
          >
            {exporting ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Hint de edición */}
      {periodoId && (
        <div className="fact-preview-edit-hint">
          💡 Click en cualquier celda numérica para editarla. Los cambios se guardan al sincronizar con la BD.
        </div>
      )}

      {/* Filtros */}
      <div className="fact-preview-filters">
        <div className="fact-preview-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar conductor, DNI, patente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}><X size={14} /></button>
          )}
        </div>
        <span className="fact-preview-count">
          {filteredData.length} de {data.length} conductores
          {hasChanges && <span className="changes-indicator"> • Cambios sin guardar</span>}
        </span>
      </div>

      {/* Tabla */}
      <div className="fact-preview-table-wrapper">
        <table className="fact-preview-table cabify-table">
          <thead>
            <tr>
              <th>Año</th>
              <th>Semana Fact.</th>
              <th>Fecha Inicial</th>
              <th>Fecha Final</th>
              <th>Conductor</th>
              <th>Email</th>
              <th>Patente</th>
              <th>DNI</th>
              <th className="col-money">Importe Contrato</th>
              <th className="col-money">EXCEDENTES</th>
              <th>#DO</th>
              <th>Horas Conexión</th>
              <th className="col-money">Importe Generado</th>
              <th className="col-money">Generado (con bonos)</th>
              <th className="col-money">Generado Efectivo</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => {
              // Encontrar índice real en data (no filteredData)
              const realIdx = data.findIndex(d => d.conductorId === row.conductorId)
              return (
                <tr key={row.conductorId || idx} className={row.isModified ? 'row-modified' : ''}>
                  <td className="col-center">{row.anio}</td>
                  <td className="col-center">{row.semana}</td>
                  <td className="col-center">{row.fechaInicial.toLocaleDateString('es-AR')}</td>
                  <td className="col-center">{row.fechaFinal.toLocaleDateString('es-AR')}</td>
                  <td className="col-nombre">{row.conductor}</td>
                  <td className="col-email">{row.email || '-'}</td>
                  <td className="col-center">{row.patente || '-'}</td>
                  <td className="col-center">{row.dni || '-'}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'importeContrato', row.importeContrato)}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'excedentes', row.excedentes)}</td>
                  <td className="col-center">-</td>
                  <td className="col-center">{renderEditableCell(row, realIdx, 'horasConexion', row.horasConexion, true)}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'importeGenerado', row.importeGenerado)}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'importeGeneradoConBonos', row.importeGeneradoConBonos)}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'generadoEfectivo', row.generadoEfectivo)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={8} className="col-right"><strong>TOTALES:</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.importeContrato)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.excedentes)}</strong></td>
              <td></td>
              <td className="col-center"><strong>{totales.horasConexion.toFixed(1)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.importeGenerado)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.importeGeneradoConBonos)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.generadoEfectivo)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <style>{`
        .fact-preview-container { background: var(--bg-primary); border-radius: 8px; padding: 16px; }
        .fact-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; }
        .fact-preview-header-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .fact-preview-stats-inline { display: flex; align-items: center; gap: 8px; margin-left: 12px; padding-left: 12px; border-left: 1px solid var(--border-color); flex-wrap: wrap; }
        .fact-stat-inline { display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
        .fact-stat-inline strong { color: var(--text-primary); }
        .fact-stat-inline.total { background: var(--badge-blue-bg); }
        .fact-stat-inline.total strong { color: var(--badge-blue-text); }
        .fact-preview-back-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; cursor: pointer; }
        .fact-preview-back-btn:hover { background: var(--bg-tertiary); }
        .fact-preview-title h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .fact-preview-subtitle { font-size: 11px; color: var(--text-secondary); }
        .fact-preview-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .fact-preview-badge { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .fact-preview-badge.open { background: rgba(124, 58, 237, 0.15); color: #7C3AED; }
        .fact-preview-btn { display: flex; align-items: center; gap: 4px; padding: 8px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .fact-preview-btn.primary { background: var(--color-primary); color: white; }
        .fact-preview-btn.secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); }
        .fact-preview-btn.sync { background: #7C3AED; color: white; }
        .fact-preview-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .fact-preview-edit-hint { padding: 8px 12px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: #7C3AED; }
        .fact-preview-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .fact-preview-search { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; flex: 1; max-width: 280px; }
        .fact-preview-search input { border: none; background: transparent; outline: none; flex: 1; font-size: 12px; color: var(--text-primary); }
        .fact-preview-search button { background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); }
        .fact-preview-count { font-size: 11px; color: var(--text-secondary); margin-left: auto; }
        .changes-indicator { color: #f59e0b; font-weight: 600; }
        .fact-preview-table-wrapper { overflow: auto; border: 1px solid var(--border-color); border-radius: 6px; max-height: 60vh; }
        .fact-preview-table-wrapper::-webkit-scrollbar { height: 12px; width: 12px; }
        .fact-preview-table-wrapper::-webkit-scrollbar-track { background: var(--bg-tertiary); }
        .fact-preview-table-wrapper::-webkit-scrollbar-thumb { background: #7C3AED; border-radius: 6px; border: 2px solid var(--bg-tertiary); }
        .fact-preview-table-wrapper::-webkit-scrollbar-thumb:hover { background: #6D28D9; }
        .fact-preview-table.cabify-table { width: 100%; min-width: 1800px; border-collapse: collapse; font-size: 12px; }
        .fact-preview-table.cabify-table th { padding: 10px 8px; text-align: left; background: var(--bg-secondary); border-bottom: 2px solid var(--border-color); font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 10px; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
        .fact-preview-table.cabify-table td { padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); white-space: nowrap; }
        .fact-preview-table.cabify-table tr:hover { background: var(--bg-secondary); }
        .fact-preview-table.cabify-table tr.row-modified { background: rgba(124, 58, 237, 0.08); }
        .fact-preview-table.cabify-table tr.row-modified:hover { background: rgba(124, 58, 237, 0.15); }
        .col-center { text-align: center; }
        .col-money { text-align: right; font-family: monospace; }
        .col-right { text-align: right; }
        .col-nombre { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .col-email { max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
        .totals-row { background: var(--bg-secondary) !important; font-weight: 600; }
        .totals-row td { border-top: 2px solid var(--border-color); position: sticky; bottom: 0; background: var(--bg-secondary); padding: 10px 8px; }
        
        /* Edición */
        .editable-cell { padding: 2px 4px; border-radius: 3px; }
        .editable-cell.can-edit { cursor: pointer; background: rgba(124, 58, 237, 0.05); }
        .editable-cell.can-edit:hover { background: rgba(124, 58, 237, 0.15); }
        .editable-cell.modified { background: rgba(124, 58, 237, 0.2) !important; font-weight: 600; }
        .edit-input { width: 90px; padding: 4px 6px; border: 2px solid #7C3AED; border-radius: 4px; font-size: 12px; font-family: monospace; text-align: right; background: var(--bg-primary); color: var(--text-primary); }
        .edit-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.3); }
        
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* Dark Mode */
        [data-theme="dark"] .fact-preview-badge.open { background: rgba(124, 58, 237, 0.2); color: #a78bfa; }
        [data-theme="dark"] .fact-preview-edit-hint { background: rgba(124, 58, 237, 0.15); border-color: rgba(124, 58, 237, 0.4); color: #a78bfa; }
        [data-theme="dark"] .fact-preview-table-wrapper::-webkit-scrollbar-track { background: var(--bg-tertiary); }
        [data-theme="dark"] .fact-preview-table-wrapper::-webkit-scrollbar-thumb { border-color: var(--bg-tertiary); }
        [data-theme="dark"] .editable-cell.can-edit { background: rgba(124, 58, 237, 0.1); }
        [data-theme="dark"] .editable-cell.can-edit:hover { background: rgba(124, 58, 237, 0.25); }
        [data-theme="dark"] .editable-cell.modified { background: rgba(124, 58, 237, 0.3) !important; }
      `}</style>
    </div>
  )
}
