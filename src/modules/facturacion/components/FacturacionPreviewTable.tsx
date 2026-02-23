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
  Link2,
  Plus,
  Trash2,
  Eye
} from 'lucide-react'
import { format } from 'date-fns'
import { formatCurrency } from '../../../types/facturacion.types'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'

// Tipo para conceptos pendientes de enlazar
export interface ConceptoPendiente {
  id: string
  tipo: 'ticket' | 'penalidad' | 'cobro_fraccionado'
  conductorId: string
  conductorNombre: string
  monto: number
  descripcion: string
  conceptoCodigo?: string
  tabla: string
  fechaCreacion?: string
  creadoPor?: string
  montoTotal?: number
  cuotaActual?: number
  totalCuotas?: number
  origenDetalle?: string
  penalidadId?: string
  tipoPenalidad?: string
  motivoPenalidad?: string
  notasPenalidad?: string
  fechaPenalidad?: string
  siniestroId?: string
  siniestroCodigo?: string
  incidenciaId?: string
  esFraccionado?: boolean
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
  // Para filas nuevas agregadas manualmente
  isNew?: boolean
  // Para eliminar filas
  isDeleted?: boolean
  // Para tracking de modificaciones a filas existentes
  isModified?: boolean
}

// Tipo para conceptos de la BD
export interface ConceptoNomina {
  id: string
  codigo: string
  descripcion: string
  tipo: string
  es_variable: boolean
  iva_porcentaje: number
}

interface FacturacionPreviewTableProps {
  data: FacturacionPreviewRow[]
  conceptos?: ConceptoNomina[]  // Conceptos de la BD
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
  conceptos = [],
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
  const { aplicarFiltroSede } = useSede()
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

  // Formateador de números: separador de miles y 2 decimales
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

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
    'P010': 'Plan Pagos',
    'P011': 'Ajuste Manual'
  }



  // Conductores únicos de los datos actuales
  const conductoresUnicos = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; cuit: string; dni: string; tipoFactura: string; condicionIva: string; email: string; facturacionId?: string }>()
    data.forEach(row => {
      if (row.conductorId && !map.has(row.conductorId)) {
        map.set(row.conductorId, {
          id: row.conductorId,
          nombre: row.razonSocial,
          cuit: row.numeroCuil,
          dni: row.numeroDni,
          tipoFactura: row.tipoFactura,
          condicionIva: row.condicionIva,
          email: row.email,
          facturacionId: row.facturacionId
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [data])

  // Función para agregar nueva fila (ajuste manual)
  const agregarAjuste = useCallback(async () => {
    // Construir options de conceptos desde la BD (solo activos)
    const conceptoOptions = conceptos
      .filter(c => c.codigo) // Solo los que tienen código
      .map(c => `<option value="${c.codigo}" data-iva="${c.iva_porcentaje}" data-tipo="${c.tipo}">${c.codigo} - ${c.descripcion}</option>`)
      .join('')

    // Traer TODOS los conductores de la BD
    const { data: todosLosConductores } = await aplicarFiltroSede(supabase
      .from('conductores')
      .select('id, nombres, apellidos, numero_dni, numero_cuit, email'))
      .order('apellidos')
      .limit(2000)

    // Mapear conductores de la BD
    const conductoresBD = (todosLosConductores || []).map((c: { id: string; nombres: string; apellidos: string; numero_dni: string; numero_cuit: string | null; email: string | null }) => ({
      id: c.id,
      nombre: `${(c.nombres || '').toUpperCase()} ${(c.apellidos || '').toUpperCase()}`.trim(),
      dni: c.numero_dni || '',
      cuit: c.numero_cuit || '',
      email: c.email || '',
      display: `${(c.nombres || '').toUpperCase()} ${(c.apellidos || '').toUpperCase()}`.trim() + ` (${c.numero_dni || ''})`
    }))

    // Merge: BD + los del preview que no estén en BD (por si acaso)
    const idsBD = new Set(conductoresBD.map(c => c.id))
    const conductoresDelPreview = conductoresUnicos
      .filter(c => !idsBD.has(c.id))
      .map(c => ({
        id: c.id,
        nombre: c.nombre,
        dni: c.dni,
        cuit: c.cuit,
        email: c.email,
        display: `${c.nombre} (${c.dni})`
      }))

    const conductoresList = [...conductoresBD, ...conductoresDelPreview]

    const { value: formValues } = await Swal.fire({
      title: 'Agregar Ajuste',
      html: `
        <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Conductor</label>
            <input type="hidden" id="swal-conductor" value="">
            <input 
              type="text" 
              id="swal-conductor-search" 
              placeholder="Buscar conductor..."
              autocomplete="off"
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;"
            >
            <div id="swal-conductor-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; margin-top: 4px; display: none; background: white;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Concepto</label>
            <select id="swal-concepto" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
              <option value="">Seleccionar concepto...</option>
              ${conceptoOptions}
            </select>
          </div>
          <div id="swal-exceso-fields" style="display: none;">
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Modalidad</label>
                <select id="swal-modalidad" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                  <option value="">Seleccionar...</option>
                  <option value="TURNO">Turno</option>
                  <option value="CARGO">A Cargo</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">KM Excedidos</label>
                <input id="swal-km" type="number" min="0" step="1" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;" placeholder="0">
              </div>
            </div>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Monto Total</label>
            <input id="swal-monto" type="number" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;" placeholder="0.00">
            <span style="font-size: 10px; color: #888;">Usa número negativo para descuentos/créditos</span>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Descripción</label>
            <input id="swal-descripcion" type="text" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;" placeholder="Motivo del ajuste...">
          </div>
        </div>
      `,
      width: 420,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      focusConfirm: false,
      didOpen: () => {
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const hiddenInput = document.getElementById('swal-conductor') as HTMLInputElement
        const listContainer = document.getElementById('swal-conductor-list') as HTMLDivElement

        const renderList = (filter: string) => {
          const filtered = filter 
            ? conductoresList.filter(c => 
                c.nombre.toLowerCase().includes(filter.toLowerCase()) ||
                c.dni.includes(filter)
              )
            : conductoresList

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 8px 12px; color: #888; font-size: 12px;">No se encontraron conductores</div>'
          } else {
            listContainer.innerHTML = filtered.slice(0, 50).map(c => `
              <div 
                data-id="${c.id}" 
                data-display="${c.display}"
                style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #eee;"
                class="conductor-option"
              >${c.display}</div>
            `).join('')
          }
          listContainer.style.display = 'block'
        }

        searchInput.addEventListener('focus', () => renderList(searchInput.value))
        searchInput.addEventListener('input', () => renderList(searchInput.value))
        
        listContainer.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          if (target.classList.contains('conductor-option')) {
            hiddenInput.value = target.dataset.id || ''
            searchInput.value = target.dataset.display || ''
            listContainer.style.display = 'none'
          }
        })

        // Hover styles
        listContainer.addEventListener('mouseover', (e) => {
          const target = e.target as HTMLElement
          if (target.classList.contains('conductor-option')) {
            target.style.backgroundColor = '#f3f4f6'
          }
        })
        listContainer.addEventListener('mouseout', (e) => {
          const target = e.target as HTMLElement
          if (target.classList.contains('conductor-option')) {
            target.style.backgroundColor = ''
          }
        })

        // Close on click outside
        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target as Node) && !listContainer.contains(e.target as Node)) {
            listContainer.style.display = 'none'
          }
        })

        // P006 - Exceso KM: mostrar campos de modalidad y KM, auto-calcular monto
        const conceptoSelect = document.getElementById('swal-concepto') as HTMLSelectElement
        const excesoFields = document.getElementById('swal-exceso-fields') as HTMLDivElement
        const modalidadSelect = document.getElementById('swal-modalidad') as HTMLSelectElement
        const kmInput = document.getElementById('swal-km') as HTMLInputElement
        const montoInput = document.getElementById('swal-monto') as HTMLInputElement

        const ALQUILER_CARGO = Number(import.meta.env.VITE_ALQUILER_A_CARGO) || 360000
        const ALQUILER_TURNO = Number(import.meta.env.VITE_ALQUILER_TURNO) || 245000

        const calcularExceso = () => {
          const km = parseInt(kmInput.value) || 0
          const modalidad = modalidadSelect.value
          if (km <= 0 || !modalidad) return
          const valorAlquiler = modalidad === 'CARGO' ? ALQUILER_CARGO : ALQUILER_TURNO
          let porcentaje = 15
          if (km > 150) porcentaje = 35
          else if (km > 100) porcentaje = 25
          else if (km > 50) porcentaje = 20
          const montoBase = valorAlquiler * (porcentaje / 100)
          const iva = montoBase * 0.21
          montoInput.value = String(Math.round(montoBase + iva))
        }

        conceptoSelect.addEventListener('change', () => {
          excesoFields.style.display = conceptoSelect.value === 'P006' ? 'block' : 'none'
          if (conceptoSelect.value !== 'P006') {
            modalidadSelect.value = ''
            kmInput.value = ''
          }
        })
        modalidadSelect.addEventListener('change', calcularExceso)
        kmInput.addEventListener('input', calcularExceso)
      },
      preConfirm: () => {
        const conductorId = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const conceptoEl = document.getElementById('swal-concepto') as HTMLSelectElement
        const concepto = conceptoEl.value
        const selectedOption = conceptoEl.options[conceptoEl.selectedIndex]
        const ivaPorcentaje = parseFloat(selectedOption?.dataset.iva || '0')
        const tipoConcepto = selectedOption?.dataset.tipo || ''
        const monto = parseFloat((document.getElementById('swal-monto') as HTMLInputElement).value) || 0
        const descripcion = (document.getElementById('swal-descripcion') as HTMLInputElement).value

        if (!conductorId) {
          Swal.showValidationMessage('Selecciona un conductor')
          return false
        }
        if (!concepto) {
          Swal.showValidationMessage('Selecciona un concepto')
          return false
        }
        if (monto === 0) {
          Swal.showValidationMessage('El monto no puede ser 0')
          return false
        }
        if (!descripcion.trim()) {
          Swal.showValidationMessage('Ingresa una descripción')
          return false
        }

        const esDescuento = monto < 0 || tipoConcepto === 'descuento'
        const tieneIva = ivaPorcentaje > 0

        return { conductorId, concepto, monto: Math.abs(monto), descripcion, esDescuento, tieneIva, ivaPorcentaje }
      }
    })

    if (!formValues) return

    // Buscar datos del conductor: primero en los existentes, sino en los de la BD
    let conductor = conductoresUnicos.find(c => c.id === formValues.conductorId)
    if (!conductor) {
      // Conductor no existe en el preview — usar datos de la BD
      const conductorBD = conductoresList.find(c => c.id === formValues.conductorId)
      if (!conductorBD) return
      conductor = {
        id: conductorBD.id,
        nombre: conductorBD.nombre,
        cuit: conductorBD.cuit,
        dni: conductorBD.dni,
        tipoFactura: conductorBD.cuit ? 'FACTURA_A' : 'FACTURA_B',
        condicionIva: conductorBD.cuit ? 'RI' : 'CF',
        email: conductorBD.email,
        facturacionId: undefined
      }
    }

    // Calcular valores IVA (precio ya incluye IVA, extraer dinámicamente)
    let netoGravado = 0
    let ivaAmount = 0
    let exento = 0
    const total = formValues.monto
    const ivaPct = formValues.ivaPorcentaje || 0

    if (formValues.tieneIva && ivaPct > 0) {
      netoGravado = Math.round((total / (1 + ivaPct / 100)) * 100) / 100
      ivaAmount = Math.round((total - netoGravado) * 100) / 100
    } else {
      exento = total
    }

    // Crear nueva fila
    const maxNumero = Math.max(...data.map(r => r.numero), 0)
    const newRow: FacturacionPreviewRow = {
      numero: maxNumero + 1,
      fechaEmision: new Date(),
      fechaVencimiento: new Date(),
      puntoVenta: 1,
      tipoFactura: conductor.tipoFactura,
      tipoDocumento: conductor.tipoFactura === 'FACTURA_A' ? 'CUIT' : 'DNI',
      numeroCuil: conductor.cuit,
      numeroDni: conductor.dni,
      total: formValues.esDescuento ? -total : total,
      cobrado: 0,
      condicionIva: conductor.condicionIva,
      condicionVenta: 'CTA_CTE',
      razonSocial: conductor.nombre,
      domicilio: '',
      codigoProducto: formValues.concepto,
      descripcionAdicional: formValues.descripcion,
      email: conductor.email,
      nota: '',
      moneda: 'ARS',
      tipoCambio: 1,
      netoGravado: formValues.esDescuento ? -netoGravado : netoGravado,
      ivaAmount: formValues.esDescuento ? -ivaAmount : ivaAmount,
      exento: formValues.esDescuento ? -exento : exento,
      totalRepetido: formValues.esDescuento ? -total : total,
      ivaPorcentaje: formValues.tieneIva ? `IVA_${formValues.ivaPorcentaje}` : 'EXENTO',
      generarAsiento: 'NO',
      cuentaDebito: 0,
      cuentaCredito: 0,
      referencia: '',
      check: '',
      conductorId: formValues.conductorId,
      tieneError: false,
      facturacionId: conductor.facturacionId,
      isNew: true
    }

    setData(prev => {
      const updated = [...prev, newRow]
      updated.sort((a, b) => {
        const nameCompare = (a.razonSocial || '').localeCompare(b.razonSocial || '', 'es')
        if (nameCompare !== 0) return nameCompare
        return (a.codigoProducto || '').localeCompare(b.codigoProducto || '', 'es')
      })
      // Re-numerar filas después de ordenar
      updated.forEach((row, idx) => {
        row.numero = idx + 1
      })
      return updated
    })
    setHasChanges(true)

    const signo = formValues.esDescuento ? '-' : ''
    showSuccess('Ajuste agregado', `${formValues.concepto} - ${signo}${formatCurrency(total)} para ${conductor.nombre}`)
  }, [conductoresUnicos, conceptos, data])

  // Función para eliminar una fila nueva
  const eliminarFila = useCallback((rowIdx: number) => {
    const row = data[rowIdx]
    if (!row.isNew) {
      // Si no es nueva, marcar como eliminada (para sincronizar)
      const newData = [...data]
      newData[rowIdx] = { ...row, isDeleted: true }
      setData(newData)
    } else {
      // Si es nueva, simplemente quitar del array
      setData(prev => prev.filter((_, idx) => idx !== rowIdx))
    }
    setHasChanges(true)
  }, [data])

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
        // Recalcular IVA dinámicamente según el porcentaje del concepto
        const ivaPctMatch = row.ivaPorcentaje?.match(/IVA_(\d+\.?\d*)/)
        const rowIvaPct = ivaPctMatch ? parseFloat(ivaPctMatch[1]) : 0
        if (rowIvaPct > 0) {
          row.netoGravado = Math.round((numValue / (1 + rowIvaPct / 100)) * 100) / 100
          row.ivaAmount = Math.round((numValue - row.netoGravado) * 100) / 100
          row.exento = 0
        } else {
          row.netoGravado = 0
          row.ivaAmount = 0
          row.exento = numValue
        }
      } else if (field === 'netoGravado') {
        // Extraer IVA % del campo ivaPorcentaje para recalcular
        const ivaPctMatch2 = row.ivaPorcentaje?.match(/IVA_(\d+\.?\d*)/)
        const rowIvaPct2 = ivaPctMatch2 ? parseFloat(ivaPctMatch2[1]) : 21
        row.netoGravado = numValue
        row.ivaAmount = Math.round(numValue * (rowIvaPct2 / 100) * 100) / 100
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
      confirmButtonColor: '#059669',
      confirmButtonText: 'Sincronizar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setSyncing(true)

    // Mostrar progreso bloqueante
    Swal.fire({
      title: 'Sincronizando...',
      html: '<div id="sync-progress" style="font-size: 14px; color: #666;">Preparando datos...</div><div style="margin-top: 12px; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;"><div id="sync-bar" style="height: 100%; width: 0%; background: #059669; border-radius: 3px; transition: width 0.3s;"></div></div>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => { Swal.showLoading() }
    })

    try {
      const changedRows = data.filter(r => r.isNew || r.isDeleted)
      const total = changedRows.length || 1

      // Actualizar progreso periódicamente
      let step = 0
      const updateProgress = () => {
        step++
        const pct = Math.min(Math.round((step / total) * 80), 80)
        const progressEl = document.getElementById('sync-progress')
        const barEl = document.getElementById('sync-bar')
        if (progressEl) progressEl.textContent = `Procesando ${step} de ${total} cambios...`
        if (barEl) barEl.style.width = `${pct}%`
      }

      // Simular progreso mientras onSync ejecuta
      const interval = setInterval(updateProgress, 300)

      const success = await onSync(data)

      clearInterval(interval)

      // Completar barra
      const barEl = document.getElementById('sync-bar')
      const progressEl = document.getElementById('sync-progress')
      if (barEl) barEl.style.width = '100%'
      if (progressEl) progressEl.textContent = 'Finalizando...'

      await new Promise(r => setTimeout(r, 400))
      Swal.close()

      if (success) {
        setHasChanges(false)
        showSuccess('Sincronizado', 'Los cambios se guardaron correctamente')
      }
    } catch {
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
        {isNumber ? (typeof value === 'number' ? fmtNum(value) : value) : value || '-'}
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
            <>
              <span className="fact-preview-badge open">
                PERÍODO ABIERTO
              </span>
              <button
                className="fact-preview-btn add"
                onClick={agregarAjuste}
                title="Agregar ajuste manual"
                disabled={syncing}
              >
                <Plus size={14} />
                Agregar Ajuste
              </button>
            </>
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
              disabled={syncing}
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
            disabled={exporting || syncing}
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
            <h3><Link2 size={16} /> Conceptos Pendientes de Enlazar ({conceptosPendientes.length})</h3>
            <button onClick={() => setShowPendientes(false)}><X size={16} /></button>
          </div>
          <div className="fact-pendientes-table-wrapper">
            <table className="fact-pendientes-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th style={{ width: '40px' }}></th>
                  <th>Conductor</th>
                  <th>Descripción</th>
                  <th>Origen</th>
                  <th className="col-right">Monto</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {conceptosPendientes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={`fact-pendiente-tipo tipo-${p.tipo}`}>
                        {p.tipo === 'cobro_fraccionado' ? 'CUOTA' : p.tipo === 'penalidad' ? 'PENALIDAD' : 'TICKET'}
                      </span>
                    </td>
                    <td className="col-ver">
                      <button
                        className="btn-ver-detalle"
                        onClick={() => {
                          const origen = p.siniestroId ? 'Siniestro' : p.incidenciaId ? 'Incidencia' : 'Penalidad directa'
                          Swal.fire({
                            title: 'Detalle del Concepto',
                            html: `
                              <div style="text-align: left; font-size: 13px;">
                                <div style="display: grid; grid-template-columns: 140px 1fr; gap: 10px; line-height: 1.8;">
                                  <strong>Conductor:</strong>
                                  <span style="font-weight: 600;">${p.conductorNombre}</span>
                                  
                                  <strong>Monto a cobrar:</strong>
                                  <span style="color: #dc2626; font-weight: 700; font-size: 16px;">${formatCurrency(p.monto)}</span>
                                  
                                  <strong>Descripcion:</strong>
                                  <span>${p.descripcion || '-'}</span>
                                  
                                  ${p.esFraccionado || p.cuotaActual ? `
                                    <strong>Fraccionado:</strong>
                                    <span style="color: #1e40af; font-weight: 600;">Si - Cuota ${p.cuotaActual || 1} de ${p.totalCuotas || '?'}</span>
                                    
                                    <strong>Deuda total:</strong>
                                    <span>${formatCurrency(p.montoTotal || 0)}</span>
                                  ` : ''}
                                  
                                  <strong style="border-top: 1px solid #e5e7eb; padding-top: 8px;">Origen:</strong>
                                  <span style="border-top: 1px solid #e5e7eb; padding-top: 8px; font-weight: 600;">${origen}</span>
                                  
                                  ${p.siniestroCodigo ? `
                                    <strong>Codigo siniestro:</strong>
                                    <span style="color: #dc2626; font-weight: 600;">${p.siniestroCodigo}</span>
                                  ` : ''}
                                  
                                  ${p.fechaPenalidad ? `
                                    <strong>Fecha penalidad:</strong>
                                    <span>${new Date(p.fechaPenalidad).toLocaleDateString('es-AR')}</span>
                                  ` : ''}
                                  
                                  <strong style="border-top: 1px solid #e5e7eb; padding-top: 8px;">Registrado por:</strong>
                                  <span style="border-top: 1px solid #e5e7eb; padding-top: 8px;">${p.creadoPor || '-'}</span>
                                  
                                  <strong>Fecha registro:</strong>
                                  <span>${p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleString('es-AR') : '-'}</span>
                                </div>
                              </div>
                            `,
                            width: 480,
                            confirmButtonText: 'Cerrar',
                            confirmButtonColor: '#6b7280'
                          })
                        }}
                        title="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                    <td className="col-conductor">{p.conductorNombre}</td>
                    <td className="col-desc">
                      <div className="desc-main">{p.descripcion}</div>
                      {p.cuotaActual && p.totalCuotas && (
                        <div className="desc-cuota">Cuota {p.cuotaActual} de {p.totalCuotas}</div>
                      )}
                    </td>
                    <td className="col-origen">
                      <div className="origen-tabla">{p.tabla.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="col-right col-monto">{formatCurrency(p.monto)}</td>
                    <td className="col-action">
                      <select 
                        onChange={async (e) => {
                          if (!e.target.value || !onEnlazarConcepto) return
                          setEnlazando(true)
                          const ok = await onEnlazarConcepto(p, e.target.value)
                          setEnlazando(false)
                          if (ok) {
                            showSuccess('Enlazado', `Concepto enlazado como ${e.target.value}`)
                          }
                        }}
                        disabled={enlazando}
                        defaultValue=""
                      >
                        <option value="">Enlazar con...</option>
                        <option value="P004">P004 - Tickets</option>
                        <option value="P005">P005 - Peajes</option>
                        <option value="P006">P006 - Exceso KM</option>
                        <option value="P007">P007 - Penalidades</option>
                        <option value="P009">P009 - Mora</option>
                        <option value="P010">P010 - Plan Pagos</option>
                      </select>
                      {enlazando && <Loader2 size={14} className="spinning" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <th>DNI</th>
              <th>CUIT</th>
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
              {periodoAbierto && <th className="col-actions"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredData.filter(r => !r.isDeleted).map((row, idx) => {
              const realIdx = data.findIndex(d => d.numero === row.numero && d.conductorId === row.conductorId && d.codigoProducto === row.codigoProducto)
              const rowClasses = [
                row.tieneError ? 'row-error' : '',
                row.tieneSaldosPendientes ? 'row-saldos-pendientes' : '',
                row.isNew ? 'row-new' : ''
              ].filter(Boolean).join(' ')
              return (
                <tr key={`${row.numero}-${row.codigoProducto}-${idx}`} className={rowClasses}>
                  <td>{row.isNew ? <span className="badge-new">NUEVO</span> : row.numero}</td>
                  <td>{format(row.fechaEmision, 'dd/MM')}</td>
                  <td>{format(row.fechaVencimiento, 'dd/MM')}</td>
                  <td>{row.puntoVenta}</td>
                  <td><span className={`badge-tipo ${row.tipoFactura === 'FACTURA_A' ? 'tipo-a' : 'tipo-b'}`}>{row.tipoFactura === 'FACTURA_A' ? 'A' : 'B'}</span></td>
                  <td>{row.tipoDocumento}</td>
                  <td className="col-mono">{row.numeroCuil || ''}</td>
                  <td className="col-mono">{row.numeroDni || ''}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'total', row.total)}</td>
                  <td>{row.cobrado}</td>
                  <td className="col-small">{row.condicionIva === 'RESPONSABLE_INSCRIPTO' ? 'Responsable Inscripto' : 'Consumidor Final'}</td>
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
                  <td className="col-money">{row.ivaAmount ? fmtNum(row.ivaAmount) : ''}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'exento', row.exento || 0)}</td>
                  <td className="col-money col-total">{fmtNum(row.total)}</td>
                  <td><span className={`badge-iva ${row.ivaPorcentaje !== 'IVA_EXENTO' ? 'iva-21' : 'iva-ex'}`}>{row.ivaPorcentaje !== 'IVA_EXENTO' ? row.ivaPorcentaje.replace('IVA_', '') + '%' : 'EX'}</span></td>
                  <td>{row.generarAsiento}</td>
                  <td className="col-mono">{row.cuentaDebito}</td>
                  <td className="col-mono">{row.cuentaCredito}</td>
                  <td>{row.referencia}</td>
                  <td>{row.check || ''}</td>
                  {periodoAbierto && (
                    <td className="col-actions">
                      <button
                        className="btn-delete-row"
                        onClick={() => eliminarFila(realIdx)}
                        title="Eliminar fila"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
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
              <td colSpan={periodoAbierto ? 7 : 6}></td>
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
        .fact-pendientes-table-wrapper { max-height: 250px; overflow-y: auto; border: 1px solid #fcd34d; border-radius: 6px; }
        .fact-pendientes-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .fact-pendientes-table th { position: sticky; top: 0; background: #fef3c7; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; color: #92400e; border-bottom: 1px solid #fcd34d; white-space: nowrap; }
        .fact-pendientes-table td { padding: 8px 10px; border-bottom: 1px solid #fef3c7; vertical-align: top; }
        .fact-pendientes-table tr:hover { background: #fffbeb; }
        .fact-pendiente-tipo { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
        .fact-pendiente-tipo.tipo-cobro_fraccionado { background: #dbeafe; color: #1e40af; }
        .fact-pendiente-tipo.tipo-penalidad { background: #fee2e2; color: #991b1b; }
        .fact-pendiente-tipo.tipo-ticket { background: #d1fae5; color: #065f46; }
        .col-conductor { font-weight: 600; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .col-desc .desc-main { color: var(--text-primary); }
        .col-desc .desc-cuota { font-size: 10px; color: #1e40af; font-weight: 600; margin-top: 2px; }
        .col-origen { font-size: 10px; color: var(--text-secondary); }
        .col-origen .origen-tabla { font-weight: 600; color: #6b7280; text-transform: capitalize; }
        .col-origen .origen-creador { color: #9ca3af; }
        .col-origen .origen-fecha { color: #9ca3af; }
        .col-origen .origen-total { color: #dc2626; font-weight: 600; }
        .col-right { text-align: right; }
        .col-monto { font-family: monospace; font-weight: 700; font-size: 13px; color: #dc2626; white-space: nowrap; }
        .col-action { white-space: nowrap; }
        .col-action select { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 11px; background: white; cursor: pointer; }
        .col-action select:hover { border-color: #fbbf24; }
        .col-ver { width: 40px; text-align: center; }
        .btn-ver-detalle { background: none; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; cursor: pointer; color: #6b7280; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; }
        .btn-ver-detalle:hover { background: #f3f4f6; border-color: #9ca3af; color: #374151; }
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
        
        /* Botón agregar ajuste */
        .fact-preview-btn.add { background: #059669; color: white; }
        .fact-preview-btn.add:hover { background: #047857; }
        
        /* Filas nuevas */
        .fact-preview-table tr.row-new { background: #ecfdf5 !important; }
        .fact-preview-table tr.row-new:hover { background: #d1fae5 !important; }
        .badge-new { display: inline-block; padding: 2px 6px; background: #059669; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; }
        
        /* Columna de acciones */
        .col-actions { width: 40px; text-align: center; position: sticky; right: 0; background: inherit; }
        .btn-delete-row { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: #fee2e2; color: #dc2626; border-radius: 4px; cursor: pointer; margin: 0 auto; }
        .btn-delete-row:hover { background: #fecaca; }
        .fact-preview-table tr.row-new .col-actions { background: #ecfdf5; }
        .fact-preview-table tr.row-new:hover .col-actions { background: #d1fae5; }
        
        /* Dark Mode */
        [data-theme="dark"] .fact-stat-inline.pendientes { background: rgba(251, 191, 36, 0.15); color: #fcd34d; }
        [data-theme="dark"] .fact-stat-inline.pendientes:hover { background: rgba(251, 191, 36, 0.25); }
        [data-theme="dark"] .fact-stat-inline.pendientes strong { color: #fde68a; }
        [data-theme="dark"] .fact-preview-badge.open { background: rgba(34, 197, 94, 0.15); color: #86efac; }
        [data-theme="dark"] .fact-preview-edit-hint { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #6ee7b7; }
        [data-theme="dark"] .fact-pendientes-panel { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.3); }
        [data-theme="dark"] .fact-pendientes-header h3 { color: #fcd34d; }
        [data-theme="dark"] .fact-pendientes-header button { color: #fcd34d; }
        [data-theme="dark"] .fact-pendiente-item { background: var(--bg-secondary); border-color: rgba(251, 191, 36, 0.3); }
        [data-theme="dark"] .fact-pendientes-table-wrapper { border-color: rgba(251, 191, 36, 0.3); }
        [data-theme="dark"] .fact-pendientes-table th { background: rgba(251, 191, 36, 0.15); color: #fcd34d; border-color: rgba(251, 191, 36, 0.3); }
        [data-theme="dark"] .fact-pendientes-table td { border-color: var(--border-primary); }
        [data-theme="dark"] .fact-pendientes-table tr:hover { background: rgba(251, 191, 36, 0.1); }
        [data-theme="dark"] .fact-pendiente-tipo.tipo-cobro_fraccionado { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
        [data-theme="dark"] .fact-pendiente-tipo.tipo-penalidad { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
        [data-theme="dark"] .fact-pendiente-tipo.tipo-ticket { background: rgba(34, 197, 94, 0.2); color: #86efac; }
        [data-theme="dark"] .col-monto { color: #fca5a5; }
        [data-theme="dark"] .col-action select { background: var(--bg-secondary); border-color: var(--border-primary); color: var(--text-primary); }
        [data-theme="dark"] .col-action select:hover { border-color: #fbbf24; }
        [data-theme="dark"] .btn-ver-detalle { border-color: var(--border-primary); color: var(--text-secondary); }
        [data-theme="dark"] .btn-ver-detalle:hover { background: var(--bg-tertiary); border-color: var(--text-tertiary); color: var(--text-primary); }
        [data-theme="dark"] .fact-preview-table-wrapper::-webkit-scrollbar-track { background: var(--bg-tertiary); }
        [data-theme="dark"] .fact-preview-table-wrapper::-webkit-scrollbar-thumb { border-color: var(--bg-tertiary); }
        [data-theme="dark"] .fact-preview-table tr.row-saldos-pendientes { background: rgba(251, 191, 36, 0.1); }
        [data-theme="dark"] .fact-preview-table tr.row-saldos-pendientes:hover { background: rgba(251, 191, 36, 0.2); }
        [data-theme="dark"] .fact-preview-table tr.row-new { background: rgba(16, 185, 129, 0.1) !important; }
        [data-theme="dark"] .fact-preview-table tr.row-new:hover { background: rgba(16, 185, 129, 0.2) !important; }
        [data-theme="dark"] .btn-delete-row { background: rgba(220, 53, 69, 0.2); color: #f87171; }
        [data-theme="dark"] .btn-delete-row:hover { background: rgba(220, 53, 69, 0.3); }
        [data-theme="dark"] .fact-preview-table tr.row-new .col-actions { background: rgba(16, 185, 129, 0.1); }
        [data-theme="dark"] .fact-preview-table tr.row-new:hover .col-actions { background: rgba(16, 185, 129, 0.2); }
        [data-theme="dark"] .col-origen .origen-tabla { color: var(--text-secondary); }
        [data-theme="dark"] .col-origen .origen-creador { color: var(--text-tertiary); }
        [data-theme="dark"] .col-origen .origen-fecha { color: var(--text-tertiary); }
        [data-theme="dark"] .col-origen .origen-total { color: #f87171; }
      `}</style>
    </div>
  )
}
