/**
 * FacturacionPreviewTable - Preview del Reporte de Facturación
 * Formato exacto del Excel con las 30 columnas para cargar en el sistema
 * Cada concepto (P001, P002, P003, etc) es una fila separada
 * EDITABLE: Click en los valores para editarlos, luego sincroniza con BD
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Search,
  Filter,
  X,
  AlertTriangle,
  Save,
  RotateCcw,
  Link2
} from 'lucide-react'
import { format } from 'date-fns'
import { formatCurrency } from '../../../types/facturacion.types'
import Swal from 'sweetalert2'

// Tipo para conceptos pendientes de enlazar
export interface ConceptoPendiente {
  id: string
  tipo: 'ticket' | 'penalidad' | 'cobro_fraccionado'
  conductorId: string
  conductorNombre: string
  monto: number
  descripcion: string
  conceptoCodigo?: string // null si no tiene código asignado
  tabla: string
}

// Tipo para cada fila del preview (igual al formato Excel)
export interface FacturacionPreviewRow {
  numero: number
  fechaEmision: Date
  fechaVencimiento: Date
  puntoVenta: number
  tipoFactura: string
  tipoDocumento: string
  numeroCuil: string
  numeroDni: string
  total: number
  cobrado: number
  condicionIva: string
  condicionVenta: string
  razonSocial: string
  domicilio: string
  codigoProducto: string
  descripcionAdicional: string
  email: string
  nota: string
  moneda: string
  tipoCambio: number
  netoGravado: number
  ivaAmount: number
  exento: number
  totalRepetido: number
  ivaPorcentaje: string
  generarAsiento: string
  cuentaDebito: number
  cuentaCredito: number
  referencia: string
  check: string
  conductorId: string
  tieneError: boolean
  errorMsg?: string
  // Para edición
  facturacionId?: string
  detalleId?: string
  // Indicador de saldos pendientes
  tieneSaldosPendientes?: boolean
}

interface FacturacionPreviewTableProps {
  data: FacturacionPreviewRow[]
  semana: number
  anio: number
  fechaInicio: string
  fechaFin: string
  periodoAbierto?: boolean
  conceptosPendientes?: ConceptoPendiente[]
  onEnlazarConcepto?: (pendiente: ConceptoPendiente, codigoProducto: string) => Promise<boolean>
  onClose: () => void
  onExport: () => void
  exporting: boolean
  onSync?: (data: FacturacionPreviewRow[]) => Promise<boolean>
}

export function FacturacionPreviewTable({
  data: initialData,
  semana,
  anio,
  fechaInicio,
  fechaFin,
  periodoAbierto = false,
  conceptosPendientes = [],
  onEnlazarConcepto,
  onClose,
  onExport,
  exporting,
  onSync
}: FacturacionPreviewTableProps) {
  const [data, setData] = useState<FacturacionPreviewRow[]>(initialData)
  const [originalData] = useState<FacturacionPreviewRow[]>(initialData)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroProducto, setFiltroProducto] = useState<string>('todos')
  const [filtroTipoFactura, setFiltroTipoFactura] = useState<string>('todos')
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [hasChanges, setHasChanges] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showPendientes, setShowPendientes] = useState(false)
  const [enlazando, setEnlazando] = useState(false)

  // Campos editables
  const editableFields = ['total', 'netoGravado', 'ivaAmount', 'exento', 'descripcionAdicional']

  // Productos únicos
  const productosUnicos = useMemo(() => {
    return [...new Set(data.map(r => r.codigoProducto))].sort()
  }, [data])

  // Filtrar datos
  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        if (!row.razonSocial.toLowerCase().includes(search) &&
            !row.numeroCuil.includes(search) &&
            !row.numeroDni.includes(search)) {
          return false
        }
      }
      if (filtroProducto !== 'todos' && row.codigoProducto !== filtroProducto) {
        return false
      }
      if (filtroTipoFactura !== 'todos' && row.tipoFactura !== filtroTipoFactura) {
        return false
      }
      return true
    })
  }, [data, searchTerm, filtroProducto, filtroTipoFactura])

  // Totales
  const totales = useMemo(() => {
    return filteredData.reduce((acc, row) => ({
      total: acc.total + row.total,
      netoGravado: acc.netoGravado + row.netoGravado,
      ivaAmount: acc.ivaAmount + row.ivaAmount,
      exento: acc.exento + row.exento
    }), { total: 0, netoGravado: 0, ivaAmount: 0, exento: 0 })
  }, [filteredData])

  // Stats
  const stats = useMemo(() => {
    const facturaA = data.filter(r => r.tipoFactura === 'FACTURA_A').length
    const facturaB = data.filter(r => r.tipoFactura === 'FACTURA_B').length
    const conErrores = data.filter(r => r.tieneError).length
    const conductoresUnicos = new Set(data.map(r => r.conductorId || r.razonSocial)).size
    const porProducto: Record<string, number> = {}
    data.forEach(r => {
      porProducto[r.codigoProducto] = (porProducto[r.codigoProducto] || 0) + 1
    })
    return { facturaA, facturaB, conErrores, conductoresUnicos, porProducto }
  }, [data])

  const nombreProducto: Record<string, string> = {
    'P001': 'Alquiler TURNO',
    'P002': 'Alquiler CARGO',
    'P003': 'Garantía',
    'P004': 'Tickets/Telepases',
    'P005': 'Peajes',
    'P006': 'Exceso KM',
    'P007': 'Penalidades',
    'P009': 'Mora',
    'P010': 'Plan Pagos'
  }

  // Iniciar edición
  const startEdit = useCallback((rowIdx: number, field: string, currentValue: number | string) => {
    if (!periodoAbierto || !editableFields.includes(field)) return
    setEditingCell({ rowIdx, field })
    setEditValue(String(currentValue))
  }, [periodoAbierto])

  // Guardar edición
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const { rowIdx, field } = editingCell
    const newData = [...data]
    const row = { ...newData[rowIdx] }

    if (field === 'descripcionAdicional') {
      row.descripcionAdicional = editValue
    } else {
      const numValue = parseFloat(editValue) || 0
      if (field === 'total') {
        row.total = numValue
        row.totalRepetido = numValue
        // Recalcular IVA si aplica
        if (row.ivaPorcentaje === 'IVA_21') {
          row.netoGravado = Math.round((numValue / 1.21) * 100) / 100
          row.ivaAmount = Math.round((numValue - row.netoGravado) * 100) / 100
          row.exento = 0
        } else {
          row.netoGravado = 0
          row.ivaAmount = 0
          row.exento = numValue
        }
      } else if (field === 'netoGravado') {
        row.netoGravado = numValue
        row.ivaAmount = Math.round(numValue * 0.21 * 100) / 100
        row.total = numValue + row.ivaAmount
        row.totalRepetido = row.total
      } else if (field === 'exento') {
        row.exento = numValue
        row.total = numValue
        row.totalRepetido = numValue
        row.netoGravado = 0
        row.ivaAmount = 0
      }
    }

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
      confirmButtonColor: '#059669',
      confirmButtonText: 'Sincronizar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setSyncing(true)
    try {
      const success = await onSync(data)
      if (success) {
        setHasChanges(false)
        Swal.fire({
          icon: 'success',
          title: 'Sincronizado',
          text: 'Los cambios se guardaron correctamente',
          timer: 2000,
          showConfirmButton: false
        })
      }
    } catch (error) {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
    } finally {
      setSyncing(false)
    }
  }, [onSync, hasChanges, data])

  // Render celda editable
  const renderEditableCell = (_row: FacturacionPreviewRow, rowIdx: number, field: string, value: number | string, isNumber = true) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field
    const canEdit = periodoAbierto && editableFields.includes(field)

    if (isEditing) {
      return (
        <input
          type={isNumber ? 'number' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
          autoFocus
          style={{
            width: '80px',
            padding: '2px 4px',
            fontSize: '11px',
            border: '2px solid #059669',
            borderRadius: '3px',
            textAlign: isNumber ? 'right' : 'left'
          }}
        />
      )
    }

    return (
      <span
        onClick={() => canEdit && startEdit(rowIdx, field, value)}
        style={{
          cursor: canEdit ? 'pointer' : 'default',
          padding: '2px 4px',
          borderRadius: '3px',
          background: canEdit ? 'rgba(5, 150, 105, 0.1)' : 'transparent'
        }}
        title={canEdit ? 'Click para editar' : ''}
      >
        {isNumber ? value : value || '-'}
      </span>
    )
  }

  return (
    <div className="fact-preview-container">
      {/* Header con Stats */}
      <div className="fact-preview-header">
        <div className="fact-preview-header-left">
          <button className="fact-preview-back-btn" onClick={onClose}>
            <ArrowLeft size={18} />
            Volver
          </button>
          <div className="fact-preview-title">
            <h2>Preview Facturación</h2>
            <span className="fact-preview-subtitle">
              Semana {semana}/{anio} - {fechaInicio} al {fechaFin}
            </span>
          </div>
          {/* Stats inline */}
          <div className="fact-preview-stats-inline">
            <span className="fact-stat-inline"><strong>{stats.conductoresUnicos}</strong> cond</span>
            <span className="fact-stat-inline"><strong>{data.length}</strong> líneas</span>
            <span className="fact-stat-inline"><strong>{stats.facturaA}</strong> A</span>
            <span className="fact-stat-inline"><strong>{stats.facturaB}</strong> B</span>
            <span className="fact-stat-inline total"><strong>{formatCurrency(totales.total)}</strong></span>
            {conceptosPendientes.length > 0 && (
              <span 
                className="fact-stat-inline pendientes" 
                onClick={() => setShowPendientes(!showPendientes)}
              >
                <AlertTriangle size={12} />
                <strong>{conceptosPendientes.length}</strong> pendientes
              </span>
            )}
          </div>
        </div>
        <div className="fact-preview-header-right">
          {periodoAbierto && (
            <span className="fact-preview-badge open">
              PERÍODO ABIERTO
            </span>
          )}
          {stats.conErrores > 0 && (
            <span className="fact-preview-badge error">
              <AlertTriangle size={14} />
              {stats.conErrores} errores
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
          >
            {exporting ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Panel de Conceptos Pendientes */}
      {showPendientes && conceptosPendientes.length > 0 && (
        <div className="fact-pendientes-panel">
          <div className="fact-pendientes-header">
            <h3><Link2 size={16} /> Conceptos Pendientes de Enlazar</h3>
            <button onClick={() => setShowPendientes(false)}><X size={16} /></button>
          </div>
          <div className="fact-pendientes-list">
            {conceptosPendientes.map((p) => (
              <div key={p.id} className="fact-pendiente-item">
                <div className="fact-pendiente-info">
                  <span className="fact-pendiente-tipo">{p.tipo.replace('_', ' ')}</span>
                  <span className="fact-pendiente-conductor">{p.conductorNombre}</span>
                  <span className="fact-pendiente-desc">{p.descripcion}</span>
                  <span className="fact-pendiente-monto">{formatCurrency(p.monto)}</span>
                </div>
                <div className="fact-pendiente-actions">
                  <select 
                    onChange={async (e) => {
                      if (!e.target.value || !onEnlazarConcepto) return
                      setEnlazando(true)
                      const ok = await onEnlazarConcepto(p, e.target.value)
                      setEnlazando(false)
                      if (ok) {
                        Swal.fire({
                          icon: 'success',
                          title: 'Enlazado',
                          text: `Concepto enlazado como ${e.target.value}`,
                          timer: 1500,
                          showConfirmButton: false
                        })
                      }
                    }}
                    disabled={enlazando}
                    defaultValue=""
                  >
                    <option value="">Enlazar con...</option>
                    <option value="P004">P004 - Tickets/Telepases</option>
                    <option value="P005">P005 - Peajes</option>
                    <option value="P006">P006 - Exceso KM</option>
                    <option value="P007">P007 - Penalidades</option>
                    <option value="P009">P009 - Mora</option>
                    <option value="P010">P010 - Plan Pagos</option>
                  </select>
                  {enlazando && <Loader2 size={14} className="spinning" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen por producto */}
      <div className="fact-preview-productos">
        {Object.entries(stats.porProducto).map(([codigo, cantidad]) => (
          <span key={codigo} className="fact-producto-badge">
            <strong>{codigo}</strong>: {cantidad}
            <span className="fact-producto-nombre">{nombreProducto[codigo] || ''}</span>
          </span>
        ))}
      </div>

      {/* Filtros */}
      <div className="fact-preview-filters">
        <div className="fact-preview-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}><X size={14} /></button>
          )}
        </div>
        <div className="fact-preview-filter-group">
          <Filter size={14} />
          <select value={filtroProducto} onChange={(e) => setFiltroProducto(e.target.value)}>
            <option value="todos">Todos</option>
            {productosUnicos.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={filtroTipoFactura} onChange={(e) => setFiltroTipoFactura(e.target.value)}>
            <option value="todos">A y B</option>
            <option value="FACTURA_A">Fact. A</option>
            <option value="FACTURA_B">Fact. B</option>
          </select>
        </div>
        <span className="fact-preview-count">{filteredData.length} líneas</span>
      </div>

      {/* Tabla con TODAS las 30 columnas del formato Excel */}
      <div className="fact-preview-table-wrapper">
        <table className="fact-preview-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Emisión</th>
              <th>Vto</th>
              <th>PV</th>
              <th>Tipo Fact</th>
              <th>Tipo Doc</th>
              <th>CUIL (DNI)</th>
              <th>DNI (CUIT)</th>
              <th className="col-money">Total</th>
              <th>Cobrado</th>
              <th>Cond IVA</th>
              <th>Cond Vta</th>
              <th>Razón Social</th>
              <th>Domicilio</th>
              <th>Producto</th>
              <th>Descripción</th>
              <th>Email</th>
              <th>Nota</th>
              <th>Moneda</th>
              <th>T.Cambio</th>
              <th className="col-money">Neto Gravado</th>
              <th className="col-money">IVA 21%</th>
              <th className="col-money">Exento</th>
              <th className="col-money">Total</th>
              <th>%IVA</th>
              <th>Asiento</th>
              <th>Cta Déb</th>
              <th>Cta Créd</th>
              <th>Ref</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => {
              const realIdx = data.findIndex(d => d.numero === row.numero && d.conductorId === row.conductorId && d.codigoProducto === row.codigoProducto)
              const rowClasses = [
                row.tieneError ? 'row-error' : '',
                row.tieneSaldosPendientes ? 'row-saldos-pendientes' : ''
              ].filter(Boolean).join(' ')
              return (
                <tr key={`${row.numero}-${row.codigoProducto}-${idx}`} className={rowClasses}>
                  <td>{row.numero}</td>
                  <td>{format(row.fechaEmision, 'dd/MM')}</td>
                  <td>{format(row.fechaVencimiento, 'dd/MM')}</td>
                  <td>{row.puntoVenta}</td>
                  <td><span className={`badge-tipo ${row.tipoFactura === 'FACTURA_A' ? 'tipo-a' : 'tipo-b'}`}>{row.tipoFactura === 'FACTURA_A' ? 'A' : 'B'}</span></td>
                  <td>{row.tipoDocumento}</td>
                  <td className="col-mono">{row.numeroCuil || ''}</td>
                  <td className="col-mono">{row.numeroDni || ''}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'total', row.total)}</td>
                  <td>{row.cobrado}</td>
                  <td className="col-small">{row.condicionIva === 'RESPONSABLE_INSCRIPTO' ? 'RI' : 'CF'}</td>
                  <td className="col-small">{row.condicionVenta === 'CTA_CTE' ? 'CC' : row.condicionVenta}</td>
                  <td className="col-nombre" title={row.razonSocial}>{row.razonSocial}</td>
                  <td className="col-small">{row.domicilio || ''}</td>
                  <td><span className="badge-prod">{row.codigoProducto}</span></td>
                  <td className="col-desc">{renderEditableCell(row, realIdx, 'descripcionAdicional', row.descripcionAdicional || '', false)}</td>
                  <td className="col-email" title={row.email}>{row.email || ''}</td>
                  <td className="col-small">{row.nota || ''}</td>
                  <td>{row.moneda}</td>
                  <td>{row.tipoCambio}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'netoGravado', row.netoGravado || 0)}</td>
                  <td className="col-money">{row.ivaAmount || ''}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'exento', row.exento || 0)}</td>
                  <td className="col-money col-total">{row.total}</td>
                  <td><span className={`badge-iva ${row.ivaPorcentaje === 'IVA_21' ? 'iva-21' : 'iva-ex'}`}>{row.ivaPorcentaje === 'IVA_21' ? '21%' : 'EX'}</span></td>
                  <td>{row.generarAsiento}</td>
                  <td className="col-mono">{row.cuentaDebito}</td>
                  <td className="col-mono">{row.cuentaCredito}</td>
                  <td>{row.referencia}</td>
                  <td>{row.check || ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={8}><strong>TOTALES</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.total)}</strong></td>
              <td colSpan={11}></td>
              <td className="col-money"><strong>{formatCurrency(totales.netoGravado)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.ivaAmount)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.exento)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.total)}</strong></td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <style>{`
        .fact-preview-container { background: var(--bg-primary); border-radius: 8px; padding: 16px; }
        .fact-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
        .fact-preview-header-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .fact-preview-stats-inline { display: flex; align-items: center; gap: 8px; margin-left: 12px; padding-left: 12px; border-left: 1px solid var(--border-color); }
        .fact-stat-inline { display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
        .fact-stat-inline strong { color: var(--text-primary); }
        .fact-stat-inline.total { background: var(--badge-blue-bg); }
        .fact-stat-inline.total strong { color: var(--badge-blue-text); }
        .fact-stat-inline.pendientes { background: #fef3c7; color: #b45309; cursor: pointer; }
        .fact-stat-inline.pendientes:hover { background: #fde68a; }
        .fact-stat-inline.pendientes strong { color: #b45309; }
        .fact-preview-back-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; cursor: pointer; }
        .fact-preview-back-btn:hover { background: var(--bg-tertiary); }
        .fact-preview-title h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .fact-preview-subtitle { font-size: 11px; color: var(--text-secondary); }
        .fact-preview-header-right { display: flex; align-items: center; gap: 10px; }
        .fact-preview-badge { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .fact-preview-badge.error { background: var(--badge-red-bg); color: var(--badge-red-text); }
        .fact-preview-badge.open { background: #dcfce7; color: #166534; }
        .fact-preview-btn { display: flex; align-items: center; gap: 4px; padding: 8px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .fact-preview-btn.primary { background: var(--color-primary); color: white; }
        .fact-preview-btn.secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); }
        .fact-preview-btn.sync { background: #059669; color: white; }
        .fact-preview-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .fact-preview-edit-hint { padding: 6px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; margin-bottom: 8px; font-size: 11px; color: #065f46; }
        
        .fact-pendientes-panel { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
        .fact-pendientes-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .fact-pendientes-header h3 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; color: #b45309; }
        .fact-pendientes-header button { background: none; border: none; cursor: pointer; color: #b45309; }
        .fact-pendientes-list { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .fact-pendiente-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: white; border-radius: 6px; border: 1px solid #fcd34d; }
        .fact-pendiente-info { display: flex; align-items: center; gap: 12px; flex: 1; }
        .fact-pendiente-tipo { background: #fef3c7; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #b45309; text-transform: uppercase; }
        .fact-pendiente-conductor { font-weight: 600; font-size: 12px; color: var(--text-primary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fact-pendiente-desc { font-size: 11px; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fact-pendiente-monto { font-family: monospace; font-weight: 600; font-size: 12px; color: #b45309; }
        .fact-pendiente-actions { display: flex; align-items: center; gap: 8px; }
        .fact-pendiente-actions select { padding: 4px 8px; border: 1px solid #fcd34d; border-radius: 4px; font-size: 11px; background: white; }
        .fact-preview-productos { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .fact-producto-badge { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 11px; }
        .fact-producto-nombre { font-size: 10px; color: var(--text-muted); }
        .fact-preview-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .fact-preview-search { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; flex: 1; max-width: 200px; }
        .fact-preview-search input { border: none; background: transparent; outline: none; flex: 1; font-size: 12px; color: var(--text-primary); }
        .fact-preview-search button { background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); }
        .fact-preview-filter-group { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
        .fact-preview-filter-group select { padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 11px; }
        .fact-preview-count { font-size: 11px; color: var(--text-secondary); margin-left: auto; }
        .fact-preview-table-wrapper { overflow: scroll !important; border: 1px solid var(--border-color); border-radius: 6px; max-height: 60vh; width: 100%; }
        .fact-preview-table-wrapper::-webkit-scrollbar { height: 16px; width: 16px; display: block !important; }
        .fact-preview-table-wrapper::-webkit-scrollbar-track { background: #d1d5db; }
        .fact-preview-table-wrapper::-webkit-scrollbar-thumb { background: #059669; border-radius: 8px; border: 3px solid #d1d5db; min-height: 40px; min-width: 40px; }
        .fact-preview-table-wrapper::-webkit-scrollbar-thumb:hover { background: #047857; }
        .fact-preview-table-wrapper::-webkit-scrollbar-corner { background: #d1d5db; }
        .fact-preview-table { min-width: 2400px; border-collapse: collapse; font-size: 11px; }
        .fact-preview-table th { padding: 8px 6px; text-align: left; background: var(--bg-secondary); border-bottom: 2px solid var(--border-color); font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 9px; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
        .fact-preview-table td { padding: 4px 6px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); white-space: nowrap; }
        .fact-preview-table tr:hover { background: var(--bg-secondary); }
        .fact-preview-table tr.row-error { background: var(--badge-red-bg); }
        .fact-preview-table tr.row-saldos-pendientes { background: #fef3c7; }
        .fact-preview-table tr.row-saldos-pendientes:hover { background: #fde68a; }
        .col-mono { font-family: monospace; font-size: 10px; }
        .col-money { text-align: right; font-family: monospace; }
        .col-total { font-weight: 600; color: var(--badge-blue-text); }
        .col-nombre { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
        .col-desc { max-width: 100px; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
        .col-email { max-width: 80px; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
        .col-small { font-size: 9px; }
        .badge-tipo { display: inline-block; padding: 2px 6px; border-radius: 3px; font-weight: 700; font-size: 10px; }
        .badge-tipo.tipo-a { background: var(--badge-blue-bg); color: var(--badge-blue-text); }
        .badge-tipo.tipo-b { background: var(--badge-gray-bg); color: var(--badge-gray-text); }
        .badge-prod { display: inline-block; padding: 2px 4px; background: var(--bg-tertiary); border-radius: 3px; font-weight: 600; font-size: 9px; }
        .badge-iva { display: inline-block; padding: 2px 4px; border-radius: 3px; font-size: 9px; font-weight: 600; }
        .badge-iva.iva-21 { background: var(--badge-green-bg); color: var(--badge-green-text); }
        .badge-iva.iva-ex { background: var(--badge-gray-bg); color: var(--badge-gray-text); }
        .totals-row { background: var(--bg-secondary) !important; }
        .totals-row td { border-top: 2px solid var(--border-color); position: sticky; bottom: 0; background: var(--bg-secondary); }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
