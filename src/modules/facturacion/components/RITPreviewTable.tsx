/**
 * RITPreviewTable - Componente de preview editable para exportación RIT
 * Formato basado en "Reporte Bruno Timoteo"
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Search,
  RotateCcw,
  Filter,
  X,
  RefreshCw
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import { formatCurrency } from '../../../types/facturacion.types'

// Tipo para cada fila del preview
export interface RITPreviewRow {
  id: string
  semana: string
  corte: string // Fecha inicio - fecha fin
  conductor: string
  dni: string
  cuit: string
  patente: string
  tipo: string // CARGO/TURNO
  valorAlquiler: number
  detalleTurno: number // Días trabajados
  cuotaGarantia: number
  numeroCuota: string // ej: "15 de 20" o "NA"
  valorPeaje: number
  excesoKm: number
  valorMultas: number
  descuentoRepuestos: number
  interes5: number // Mora
  ticketsFavor: number
  comisionReferido: number
  totalPagar: number
  // Campos auxiliares para cálculos
  conductorId: string
  tipoAlquiler: 'CARGO' | 'TURNO'
  saldoAnterior: number
}

interface ConceptoIva {
  codigo: string
  iva_porcentaje: number
}

interface RITPreviewTableProps {
  data: RITPreviewRow[]
  semana: number
  anio: number
  fechaInicio: string
  fechaFin: string
  periodoAbierto: boolean // true si el período está abierto y se puede editar
  onClose: () => void
  onSync?: (data: RITPreviewRow[]) => Promise<boolean>
  conceptos?: ConceptoIva[]
}

export function RITPreviewTable({
  data: initialData,
  semana,
  anio,
  fechaInicio,
  fechaFin,
  periodoAbierto,
  onClose,
  onSync,
  conceptos = []
}: RITPreviewTableProps) {
  const [data, setData] = useState<RITPreviewRow[]>(initialData)
  const [originalData] = useState<RITPreviewRow[]>(initialData)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof RITPreviewRow } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'CARGO' | 'TURNO'>('todos')
  const [hasChanges, setHasChanges] = useState(false)

  // Campos editables numéricamente
  const editableNumericFields: (keyof RITPreviewRow)[] = [
    'valorAlquiler',
    'detalleTurno',
    'cuotaGarantia',
    'valorPeaje',
    'excesoKm',
    'valorMultas',
    'descuentoRepuestos',
    'interes5',
    'ticketsFavor',
    'comisionReferido'
  ]

  // Campos de texto editables
  const editableTextFields: (keyof RITPreviewRow)[] = [
    'numeroCuota'
  ]

  // Filtrar datos
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Filtro por búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        if (!row.conductor.toLowerCase().includes(search) &&
            !row.dni.toLowerCase().includes(search) &&
            !row.patente.toLowerCase().includes(search)) {
          return false
        }
      }
      // Filtro por tipo
      if (filtroTipo !== 'todos' && row.tipo !== filtroTipo) {
        return false
      }
      return true
    })
  }, [data, searchTerm, filtroTipo])

  // Calcular totales
  const totales = useMemo(() => {
    return filteredData.reduce((acc, row) => ({
      valorAlquiler: acc.valorAlquiler + row.valorAlquiler,
      cuotaGarantia: acc.cuotaGarantia + row.cuotaGarantia,
      valorPeaje: acc.valorPeaje + row.valorPeaje,
      excesoKm: acc.excesoKm + row.excesoKm,
      valorMultas: acc.valorMultas + row.valorMultas,
      descuentoRepuestos: acc.descuentoRepuestos + row.descuentoRepuestos,
      interes5: acc.interes5 + row.interes5,
      ticketsFavor: acc.ticketsFavor + row.ticketsFavor,
      comisionReferido: acc.comisionReferido + row.comisionReferido,
      totalPagar: acc.totalPagar + row.totalPagar
    }), {
      valorAlquiler: 0,
      cuotaGarantia: 0,
      valorPeaje: 0,
      excesoKm: 0,
      valorMultas: 0,
      descuentoRepuestos: 0,
      interes5: 0,
      ticketsFavor: 0,
      comisionReferido: 0,
      totalPagar: 0
    })
  }, [filteredData])

  // Iniciar edición de celda
  const startEditing = useCallback((rowId: string, field: keyof RITPreviewRow, currentValue: string | number) => {
    setEditingCell({ rowId, field })
    setEditValue(String(currentValue))
  }, [])

  // Guardar edición
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const { rowId, field } = editingCell
    const isNumeric = editableNumericFields.includes(field)

    setData(prevData => {
      return prevData.map(row => {
        if (row.id !== rowId) return row

        const updatedRow = { ...row }

        if (isNumeric) {
          const numValue = parseFloat(editValue) || 0
          ;(updatedRow as any)[field] = numValue
        } else {
          ;(updatedRow as any)[field] = editValue
        }

        // Recalcular total a pagar
        updatedRow.totalPagar =
          updatedRow.valorAlquiler +
          updatedRow.cuotaGarantia +
          updatedRow.valorPeaje +
          updatedRow.excesoKm +
          updatedRow.valorMultas +
          updatedRow.interes5 +
          updatedRow.saldoAnterior -
          updatedRow.descuentoRepuestos -
          updatedRow.ticketsFavor -
          updatedRow.comisionReferido

        return updatedRow
      })
    })

    setHasChanges(true)
    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue, editableNumericFields])

  // Cancelar edición
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // Manejar teclas en input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }, [saveEdit, cancelEdit])

  // Restaurar datos originales
  const resetData = useCallback(() => {
    Swal.fire({
      title: 'Restaurar datos',
      text: 'Se perderán todos los cambios realizados',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Restaurar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) {
        setData(originalData)
        setHasChanges(false)
      }
    })
  }, [originalData])

  // Sincronizar cambios con la BD
  const syncData = useCallback(async () => {
    if (!onSync || !hasChanges) return

    const result = await Swal.fire({
      title: 'Sincronizar cambios',
      html: `
        <p>Se guardarán los cambios en la base de datos.</p>
        <p><strong>${data.length}</strong> registros serán actualizados.</p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sincronizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#3B82F6'
    })

    if (!result.isConfirmed) return

    setSyncing(true)
    try {
      const success = await onSync(data)
      if (success) {
        setHasChanges(false)
        showSuccess('Sincronizado', 'Los cambios se guardaron correctamente')
      }
    } catch (error) {
      console.error('Error sincronizando:', error)
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error')
    } finally {
      setSyncing(false)
    }
  }, [onSync, hasChanges, data])

  // Exportar a Excel
  const exportarExcel = useCallback(async () => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()

      // HOJA 1: Formato Bruno Timoteo
      const excelData: (string | number)[][] = [
        ['TOSHIFY - REPORTE DE FACTURACIÓN'],
        [`Semana ${semana} del ${anio}`],
        [`Período: ${fechaInicio} al ${fechaFin}`],
        [''],
        [
          'Semana',
          'Corte de la semana',
          'Conductor',
          'DNI',
          'CUIT',
          'Patente',
          'Turno',
          'Valor Alquiler',
          'Detalle/Turno',
          'Cuota de Garantía',
          'Número de cuota',
          'Valor Peaje',
          'Exceso de Km',
          'Valor de multas',
          'Descuento repuestos',
          'Interés 5%',
          'Tickets a favor',
          'Comisión por Referido',
          'Total a pagar'
        ]
      ]

      filteredData.forEach(row => {
        excelData.push([
          row.semana,
          row.corte,
          row.conductor,
          row.dni,
          row.cuit || '-',
          row.patente || '-',
          row.tipo,
          row.valorAlquiler,
          row.detalleTurno,
          row.cuotaGarantia,
          row.numeroCuota,
          row.valorPeaje,
          row.excesoKm,
          row.valorMultas,
          row.descuentoRepuestos,
          row.interes5,
          row.ticketsFavor,
          row.comisionReferido,
          row.totalPagar
        ])
      })

      // Fila de totales
      excelData.push([''])
      excelData.push([
        '', '', '', '', '', '', 'TOTALES:',
        totales.valorAlquiler,
        '',
        totales.cuotaGarantia,
        '',
        totales.valorPeaje,
        totales.excesoKm,
        totales.valorMultas,
        totales.descuentoRepuestos,
        totales.interes5,
        totales.ticketsFavor,
        totales.comisionReferido,
        totales.totalPagar
      ])

      const ws = XLSX.utils.aoa_to_sheet(excelData)
      ws['!cols'] = [
        { wch: 10 }, // Semana
        { wch: 22 }, // Corte
        { wch: 30 }, // Conductor
        { wch: 12 }, // DNI
        { wch: 14 }, // CUIT
        { wch: 10 }, // Patente
        { wch: 8 },  // Turno
        { wch: 14 }, // Valor Alquiler
        { wch: 12 }, // Detalle/Turno
        { wch: 14 }, // Cuota Garantía
        { wch: 12 }, // Número cuota
        { wch: 12 }, // Valor Peaje
        { wch: 12 }, // Exceso Km
        { wch: 12 }, // Valor multas
        { wch: 14 }, // Desc repuestos
        { wch: 10 }, // Interés 5%
        { wch: 14 }, // Tickets favor
        { wch: 16 }, // Comisión Referido
        { wch: 14 }  // Total a pagar
      ]
      XLSX.utils.book_append_sheet(wb, ws, 'Facturación')

      // HOJA 2: Formato RIT para contabilidad
      const ritData: (string | number)[][] = [
        [
          'Tipo Comprobante', 'Tipo Factura', 'CUIT/DNI', 'Nombre',
          'Fecha', 'Código Concepto', 'Descripción',
          'Neto', 'IVA', 'Total'
        ]
      ]

      // Helper para IVA dinámico desde conceptos_nomina
      const getIvaPct = (codigo: string) => conceptos.find(c => c.codigo === codigo)?.iva_porcentaje || 0
      const extraerNeto = (total: number, ivaPct: number) => ivaPct > 0 ? Math.round((total / (1 + ivaPct / 100)) * 100) / 100 : total

      filteredData.forEach(row => {
        const tieneCuit = !!row.cuit
        const tipoFactura = tieneCuit ? 'A' : 'B'

        // Alquiler (P002=Cargo, P001=Turno Diurno)
        if (row.valorAlquiler > 0) {
          const codigo = row.tipo === 'CARGO' ? 'P002' : 'P001'
          const desc = row.tipo === 'CARGO' ? 'Alquiler a Cargo' : 'Alquiler a Turno'
          const ivaPctAlq = getIvaPct(codigo)
          const neto = extraerNeto(row.valorAlquiler, ivaPctAlq)
          const iva = Math.round((row.valorAlquiler - neto) * 100) / 100
          ritData.push([
            'ND', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, codigo, `${desc} (${row.detalleTurno}/7 días)`,
            neto, iva, row.valorAlquiler
          ])
        }

        // Garantía (P003)
        if (row.cuotaGarantia > 0) {
          ritData.push([
            'ND', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, 'P003', `Cuota de Garantía ${row.numeroCuota}`,
            row.cuotaGarantia, 0, row.cuotaGarantia
          ])
        }

        // Exceso KM (P006)
        if (row.excesoKm > 0) {
          const ivaPctExc = getIvaPct('P006')
          const neto = extraerNeto(row.excesoKm, ivaPctExc)
          const iva = Math.round((row.excesoKm - neto) * 100) / 100
          ritData.push([
            'ND', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, 'P006', 'Exceso de Kilometraje',
            neto, iva, row.excesoKm
          ])
        }

        // Multas (P007)
        if (row.valorMultas > 0) {
          ritData.push([
            'ND', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, 'P007', 'Valor de Multas',
            row.valorMultas, 0, row.valorMultas
          ])
        }

        // Interés/Mora (P009)
        if (row.interes5 > 0) {
          ritData.push([
            'ND', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, 'P009', 'Interés por Mora',
            row.interes5, 0, row.interes5
          ])
        }

        // Tickets a favor (P004) - NOTA CRÉDITO
        if (row.ticketsFavor > 0) {
          ritData.push([
            'NC', tipoFactura, row.cuit || row.dni, row.conductor,
            fechaInicio, 'P004', 'Tickets a Favor',
            row.ticketsFavor, 0, row.ticketsFavor
          ])
        }
      })

      const wsRIT = XLSX.utils.aoa_to_sheet(ritData)
      wsRIT['!cols'] = [
        { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 30 },
        { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 12 },
        { wch: 10 }, { wch: 12 }
      ]
      XLSX.utils.book_append_sheet(wb, wsRIT, 'RIT')

      const nombreArchivo = `Facturacion_Semana${semana}_${anio}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)

      showSuccess('Exportación exitosa', `Se descargó: ${nombreArchivo}`)
    } catch (error) {
      console.error('Error exportando:', error)
      Swal.fire('Error', 'No se pudo exportar el archivo', 'error')
    } finally {
      setExporting(false)
    }
  }, [filteredData, totales, semana, anio, fechaInicio, fechaFin])

  // Campos que NO deben usar formato moneda (solo mostrar número)
  const nonCurrencyFields: (keyof RITPreviewRow)[] = ['detalleTurno']

  // Renderizar celda editable (solo si período abierto)
  const renderEditableCell = (row: RITPreviewRow, field: keyof RITPreviewRow, value: string | number, isNumeric: boolean) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const canEdit = periodoAbierto && (editableNumericFields.includes(field) || editableTextFields.includes(field))

    if (isEditing && canEdit) {
      return (
        <input
          type={isNumeric ? 'number' : 'text'}
          className="rit-preview-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={saveEdit}
          autoFocus
        />
      )
    }

    // Determinar cómo mostrar el valor
    let displayValue: string | number = value
    if (isNumeric && typeof value === 'number') {
      // Para campos que no son moneda, mostrar solo el número
      if (nonCurrencyFields.includes(field)) {
        displayValue = value
      } else {
        displayValue = formatCurrency(value)
      }
    }

    return (
      <span
        className={`rit-preview-cell ${canEdit ? 'editable' : ''}`}
        onClick={() => canEdit && startEditing(row.id, field, value)}
        title={canEdit ? 'Click para editar' : ''}
      >
        {displayValue}
      </span>
    )
  }

  return (
    <div className="rit-preview-container">
      {/* Header */}
      <div className="rit-preview-header">
        <div className="rit-preview-header-left">
          <button className="rit-preview-back-btn" onClick={onClose}>
            <ArrowLeft size={18} />
            Volver al Reporte
          </button>
          <div className="rit-preview-title">
            <h2>Preview de Exportación RIT</h2>
            <span className="rit-preview-subtitle">
              Semana {semana}/{anio} - {fechaInicio} al {fechaFin}
            </span>
          </div>
        </div>
        <div className="rit-preview-header-right">
          {/* Mostrar estado del período */}
          {!periodoAbierto && (
            <span className="rit-preview-badge closed">Período Cerrado</span>
          )}
          {periodoAbierto && (
            <span className="rit-preview-badge open">Período Abierto</span>
          )}

          {/* Botones de acción - solo si hay cambios Y período abierto */}
          {hasChanges && periodoAbierto && (
            <>
              <button className="rit-preview-btn secondary" onClick={resetData}>
                <RotateCcw size={14} />
                Restaurar
              </button>
              {onSync && (
                <button
                  className="rit-preview-btn sync"
                  onClick={syncData}
                  disabled={syncing}
                >
                  {syncing ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />}
                  {syncing ? 'Sincronizando...' : 'Sincronizar BD'}
                </button>
              )}
            </>
          )}
          <button
            className="rit-preview-btn primary"
            onClick={exportarExcel}
            disabled={exporting}
          >
            {exporting ? <Loader2 size={14} className="spinning" /> : <FileSpreadsheet size={14} />}
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rit-preview-filters">
        <div className="rit-preview-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar conductor, DNI, patente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="rit-preview-filter-group">
          <Filter size={14} />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'todos' | 'CARGO' | 'TURNO')}
          >
            <option value="todos">Todos los tipos</option>
            <option value="CARGO">Solo CARGO</option>
            <option value="TURNO">Solo TURNO</option>
          </select>
        </div>
        <div className="rit-preview-stats">
          <span>{filteredData.length} conductores</span>
          {hasChanges && <span className="rit-preview-modified">Datos modificados</span>}
        </div>
      </div>

      {/* Info de edición */}
      <div className={`rit-preview-edit-info ${!periodoAbierto ? 'readonly' : ''}`}>
        {periodoAbierto ? (
          <span>Haz click en los valores para editarlos. Luego sincroniza con BD o exporta a Excel.</span>
        ) : (
          <span>Período cerrado - Solo lectura. Puedes exportar a Excel pero no editar valores.</span>
        )}
      </div>

      {/* Tabla */}
      <div className="rit-preview-table-wrapper">
        <table className="rit-preview-table">
          <thead>
            <tr>
              <th className="sticky-col">Conductor</th>
              <th>DNI</th>
              <th>CUIT</th>
              <th>Patente</th>
              <th>Tipo</th>
              <th className="numeric">
                <span className="th-code">P001/P002</span>
                Alquiler
              </th>
              <th className="numeric">Días</th>
              <th className="numeric">
                <span className="th-code">P003</span>
                Garantía
              </th>
              <th>N° Cuota</th>
              <th className="numeric">
                <span className="th-code">P005</span>
                Peajes
              </th>
              <th className="numeric">
                <span className="th-code">P006</span>
                Exc. KM
              </th>
              <th className="numeric">
                <span className="th-code">P007</span>
                Multas
              </th>
              <th className="numeric">
                <span className="th-code">P008</span>
                Desc. Rep.
              </th>
              <th className="numeric">
                <span className="th-code">P009</span>
                Int. 5%
              </th>
              <th className="numeric credit-header">
                <span className="th-code">P004</span>
                Tickets
              </th>
              <th className="numeric credit-header">
                <span className="th-code">P004</span>
                Ref.
              </th>
              <th className="numeric total">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map(row => (
              <tr key={row.id} className={row.totalPagar < 0 ? 'row-favor' : ''}>
                <td className="sticky-col">{row.conductor}</td>
                <td>{row.dni}</td>
                <td>{row.cuit || '-'}</td>
                <td>{row.patente || '-'}</td>
                <td>
                  <span className={`badge ${row.tipo === 'CARGO' ? 'badge-blue' : 'badge-gray'}`}>
                    {row.tipo}
                  </span>
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'valorAlquiler', row.valorAlquiler, true)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'detalleTurno', row.detalleTurno, true)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'cuotaGarantia', row.cuotaGarantia, true)}
                </td>
                <td>
                  {renderEditableCell(row, 'numeroCuota', row.numeroCuota, false)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'valorPeaje', row.valorPeaje, true)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'excesoKm', row.excesoKm, true)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'valorMultas', row.valorMultas, true)}
                </td>
                <td className="numeric credit">
                  {renderEditableCell(row, 'descuentoRepuestos', row.descuentoRepuestos, true)}
                </td>
                <td className="numeric">
                  {renderEditableCell(row, 'interes5', row.interes5, true)}
                </td>
                <td className="numeric credit">
                  {renderEditableCell(row, 'ticketsFavor', row.ticketsFavor, true)}
                </td>
                <td className="numeric credit">
                  {renderEditableCell(row, 'comisionReferido', row.comisionReferido, true)}
                </td>
                <td className={`numeric total ${row.totalPagar < 0 ? 'favor' : 'debe'}`}>
                  {formatCurrency(row.totalPagar)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td className="sticky-col"><strong>TOTALES</strong></td>
              <td colSpan={4}></td>
              <td className="numeric"><strong>{formatCurrency(totales.valorAlquiler)}</strong></td>
              <td></td>
              <td className="numeric"><strong>{formatCurrency(totales.cuotaGarantia)}</strong></td>
              <td></td>
              <td className="numeric"><strong>{formatCurrency(totales.valorPeaje)}</strong></td>
              <td className="numeric"><strong>{formatCurrency(totales.excesoKm)}</strong></td>
              <td className="numeric"><strong>{formatCurrency(totales.valorMultas)}</strong></td>
              <td className="numeric credit"><strong>{formatCurrency(totales.descuentoRepuestos)}</strong></td>
              <td className="numeric"><strong>{formatCurrency(totales.interes5)}</strong></td>
              <td className="numeric credit"><strong>{formatCurrency(totales.ticketsFavor)}</strong></td>
              <td className="numeric credit"><strong>{formatCurrency(totales.comisionReferido)}</strong></td>
              <td className={`numeric total ${totales.totalPagar < 0 ? 'favor' : 'debe'}`}>
                <strong>{formatCurrency(totales.totalPagar)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
