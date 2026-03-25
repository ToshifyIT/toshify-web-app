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
  RotateCcw,
  UserPlus,
  Info,
  Eye
} from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'

// Detalle del cálculo por conductor
export interface CabifyPreviewRowDetalle {
  diasTrabajados: number
  prorrateoCargoDias: number
  prorrateoCargoMonto: number
  prorrateoDiurnoDias: number
  prorrateoDiurnoMonto: number
  prorrateoNocturnoDias: number
  prorrateoNocturnoMonto: number
  subtotalAlquiler: number
  subtotalGarantia: number
  cuotaGarantia: string
  montoPeajes: number
  montoExcesos: number
  montoPenalidades: number
  ticketsFavor: number
  subtotalCargos: number
  subtotalDescuentos: number
  saldoAnterior: number
  totalAPagar: number
}

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
  // Detalle del cálculo (opcional)
  detalle?: CabifyPreviewRowDetalle
}

interface CabifyPreviewTableProps {
  data: CabifyPreviewRow[]
  semana: number
  anio: number
  fechaInicio: string
  fechaFin: string
  periodoId?: string
  proyectadoA?: string // Fecha hasta la cual se proyectan importes (solo Vista Previa)
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
  proyectadoA,
  onClose,
  onExport,
  exporting,
  onSync
}: CabifyPreviewTableProps) {
  const { aplicarFiltroSede } = useSede()
  const [data, setData] = useState<CabifyPreviewRow[]>(initialData)
  const [originalData] = useState<CabifyPreviewRow[]>(initialData)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [hasChanges, setHasChanges] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Campos editables
  const editableFields = ['importeContrato', 'excedentes', 'patente']
  const textFields = ['patente']

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

  // Map O(1) para lookup de índice real en data (evita .findIndex() O(n) por cada fila en render)
  const dataIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    data.forEach((d, i) => m.set(d.conductorId, i))
    return m
  }, [data])

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
  const startEdit = useCallback((rowIdx: number, field: string, currentValue: number | string) => {
    if (!editableFields.includes(field)) return
    setEditingCell({ rowIdx, field })
    if (textFields.includes(field)) {
      setEditValue(String(currentValue))
    } else {
      setEditValue(String(Math.round((currentValue as number) * 100) / 100))
    }
  }, [])

  // Guardar edición
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const { rowIdx, field } = editingCell
    const newData = [...data]
    const row = { ...newData[rowIdx] }

    if (textFields.includes(field)) {
      (row as Record<string, unknown>)[field] = editValue.trim().toUpperCase()
    } else {
      const numValue = Math.round((parseFloat(editValue) || 0) * 100) / 100
      ;(row as Record<string, unknown>)[field] = numValue
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

  // Agregar conductor manualmente
  const agregarConductor = useCallback(async () => {
    // Traer todos los conductores de la BD
    const { data: todosLosCondutores } = await aplicarFiltroSede(supabase
      .from('conductores')
      .select('id, nombres, apellidos, numero_dni, email'))
      .order('apellidos')

    // Traer asignaciones activas para obtener patente
    const { data: asignacionesActivas } = await aplicarFiltroSede(supabase
      .from('asignaciones')
      .select('conductor_id, vehiculos:vehiculo_id(patente)')
      .eq('estado', 'activa'))

    const patenteMap = new Map<string, string>()
    for (const a of (asignacionesActivas || []) as unknown as { conductor_id: string; vehiculos: { patente: string } | null }[]) {
      const patente = a.vehiculos?.patente
      if (patente && a.conductor_id) {
        patenteMap.set(a.conductor_id, patente)
      }
    }

    const idsExistentes = new Set(data.map(d => d.conductorId))
    const disponibles = (todosLosCondutores || []).map((c: { id: string; nombres: string; apellidos: string; numero_dni: string; email: string | null }) => ({
      id: c.id,
      nombre: `${(c.nombres || '').toUpperCase()} ${(c.apellidos || '').toUpperCase()}`.trim(),
      dni: c.numero_dni || '',
      email: c.email || '',
      patente: patenteMap.get(c.id) || ''
    })).filter(c => !idsExistentes.has(c.id))

    const { value: formValues } = await Swal.fire({
      title: 'Agregar Conductor',
      html: `
        <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Conductor</label>
            <input type="hidden" id="swal-conductor-id" value="">
            <input type="text" id="swal-conductor-search" placeholder="Buscar por nombre o DNI..." autocomplete="off"
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
            <div id="swal-conductor-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; margin-top: 4px; display: none; background: white;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Importe Contrato</label>
            <input id="swal-contrato" type="text" inputmode="decimal" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;" placeholder="0.00">
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px;">Excedentes</label>
            <input id="swal-excedentes" type="text" inputmode="decimal" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box;" placeholder="0.00">
          </div>
        </div>
      `,
      width: 420,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7C3AED',
      focusConfirm: false,
      didOpen: () => {
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const hiddenInput = document.getElementById('swal-conductor-id') as HTMLInputElement
        const listContainer = document.getElementById('swal-conductor-list') as HTMLDivElement

        const renderList = (filter: string) => {
          const filtered = filter
            ? disponibles.filter(c =>
                c.nombre.toLowerCase().includes(filter.toLowerCase()) ||
                c.dni.includes(filter)
              )
            : disponibles

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 8px 12px; color: #888; font-size: 12px;">No se encontraron conductores</div>'
          } else {
            listContainer.innerHTML = filtered.slice(0, 50).map(c => `
              <div data-id="${c.id}" data-nombre="${c.nombre}" data-dni="${c.dni}" data-email="${c.email}" data-patente="${c.patente}"
                style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #eee;"
                class="conductor-option">${c.nombre} (${c.dni})${c.patente ? ' - ' + c.patente : ''}</div>
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
            hiddenInput.dataset.nombre = target.dataset.nombre || ''
            hiddenInput.dataset.dni = target.dataset.dni || ''
            hiddenInput.dataset.email = target.dataset.email || ''
            hiddenInput.dataset.patente = target.dataset.patente || ''
            searchInput.value = `${target.dataset.nombre} (${target.dataset.dni})`
            listContainer.style.display = 'none'
          }
        })

        listContainer.addEventListener('mouseover', (e) => {
          const target = e.target as HTMLElement
          if (target.classList.contains('conductor-option')) target.style.backgroundColor = '#f3f4f6'
        })
        listContainer.addEventListener('mouseout', (e) => {
          const target = e.target as HTMLElement
          if (target.classList.contains('conductor-option')) target.style.backgroundColor = ''
        })

        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target as Node) && !listContainer.contains(e.target as Node)) {
            listContainer.style.display = 'none'
          }
        })
      },
      preConfirm: () => {
        const hiddenInput = document.getElementById('swal-conductor-id') as HTMLInputElement
        const conductorId = hiddenInput.value
        const importeContrato = Math.round((parseFloat((document.getElementById('swal-contrato') as HTMLInputElement).value) || 0) * 100) / 100
        const excedentes = Math.round((parseFloat((document.getElementById('swal-excedentes') as HTMLInputElement).value) || 0) * 100) / 100

        if (!conductorId) {
          Swal.showValidationMessage('Selecciona un conductor')
          return false
        }
        if (importeContrato === 0) {
          Swal.showValidationMessage('El importe contrato no puede ser 0')
          return false
        }

        return {
          conductorId,
          nombre: hiddenInput.dataset.nombre || '',
          dni: hiddenInput.dataset.dni || '',
          email: hiddenInput.dataset.email || '',
          patente: hiddenInput.dataset.patente || '',
          importeContrato,
          excedentes
        }
      }
    })

    if (!formValues) return

    const fechaInicial = data.length > 0 ? data[0].fechaInicial : new Date()
    const fechaFinal = data.length > 0 ? data[0].fechaFinal : new Date()

    const newRow: CabifyPreviewRow = {
      anio: semana > 0 ? anio : new Date().getFullYear(),
      semana,
      fechaInicial,
      fechaFinal,
      conductor: formValues.nombre,
      email: formValues.email,
      patente: formValues.patente,
      dni: formValues.dni,
      importeContrato: formValues.importeContrato,
      excedentes: formValues.excedentes,
      conductorId: formValues.conductorId,
      horasConexion: 0,
      importeGenerado: 0,
      importeGeneradoConBonos: 0,
      generadoEfectivo: 0,
      isModified: true
    }

    setData(prev => [...prev, newRow].sort((a, b) => a.conductor.localeCompare(b.conductor)))
    setHasChanges(true)
    showSuccess('Conductor agregado', `${formValues.nombre} fue agregado al reporte`)
  }, [data, semana, anio])

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

  // Render celda editable de texto
  const renderEditableTextCell = (row: CabifyPreviewRow, rowIdx: number, field: string, value: string) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field
    const canEdit = editableFields.includes(field)

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
          autoFocus
          className="edit-input edit-input-text"
        />
      )
    }

    return (
      <span
        onClick={() => canEdit && startEdit(rowIdx, field, value)}
        className={`editable-cell ${canEdit ? 'can-edit' : ''} ${row.isModified ? 'modified' : ''}`}
        title={canEdit ? 'Click para editar' : ''}
      >
        {value || '-'}
      </span>
    )
  }

  // Render celda editable numérica
  const renderEditableCell = (row: CabifyPreviewRow, rowIdx: number, field: string, value: number, isHours = false) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field
    const canEdit = editableFields.includes(field)

    if (isEditing) {
      return (
        <input
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => {
            const val = e.target.value
            if (val === '' || val === '-' || /^-?\d{1,10}(\.\d{0,2})?$/.test(val)) setEditValue(val)
          }}
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

  // Mostrar info general de cómo se calcula
  const showInfoGeneral = useCallback(() => {
    Swal.fire({
      title: 'Cómo se calcula el Preview',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.7; color: var(--text-primary, #333);">
          <p style="margin-bottom: 12px;">Cada fila muestra dos valores principales:</p>
          <div style="background: rgba(124,58,237,0.08); border-left: 3px solid #7C3AED; padding: 10px 14px; border-radius: 4px; margin-bottom: 12px;">
            <strong>Importe Contrato</strong> = Alquiler proyectado a semana completa (7 días). Si la semana está en curso, se escala proporcionalmente el valor actual.
          </div>
          <div style="background: rgba(124,58,237,0.08); border-left: 3px solid #7C3AED; padding: 10px 14px; border-radius: 4px; margin-bottom: 12px;">
            <strong>Excedentes</strong> = Garantía + Peajes + Excesos KM + Penalidades − Tickets a favor + Saldo anterior.
          </div>
          <p style="margin-bottom: 8px; font-size: 12px; color: #666;">Detalle de componentes:</p>
          <ul style="font-size: 12px; color: #555; padding-left: 18px; margin: 0;">
            <li><strong>Alquiler</strong>: precio diario × 7 días (proyectado a semana completa)</li>
            <li><strong>Garantía</strong>: cuota semanal fija ($50.000)</li>
            <li><strong>Peajes</strong>: telepeajes de la semana anterior</li>
            <li><strong>Excesos KM</strong>: km excedidos sobre el límite</li>
            <li><strong>Penalidades</strong>: multas internas por incumplimiento</li>
            <li><strong>Tickets a favor</strong>: descuentos a favor del conductor</li>
            <li><strong>Saldo anterior</strong>: saldo pendiente de semanas previas</li>
          </ul>
          <p style="margin-top: 12px; font-size: 11px; color: #888;">
            Hacé click en el ícono <strong>👁</strong> de cada fila para ver el desglose individual.
          </p>
        </div>
      `,
      width: 520,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#7C3AED',
    });
  }, []);

  // Mostrar detalle de un conductor - carga datos reales de BD
  const showDetalleRow = useCallback(async (row: CabifyPreviewRow) => {
    const d = row.detalle;
    if (!d) {
      Swal.fire('Sin detalle', 'No hay información de cálculo disponible para este conductor.', 'info');
      return;
    }

    // Pre-cargar datos reales del conductor
    const conductorId = row.conductorId
    const [ticketsRes, penalidadesRes, excesosRes, garantiaRes] = await Promise.all([
      supabase.from('tickets_favor').select('id, tipo, descripcion, monto, estado').eq('conductor_id', conductorId).in('estado', ['aprobado', 'aplicado']),
      supabase.from('penalidades').select('id, detalle, monto, fecha, area_responsable').eq('conductor_id', conductorId).eq('estado', 'aplicada'),
      supabase.from('excesos_kilometraje').select('id, km_exceso, monto_total, semana').eq('conductor_id', conductorId),
      supabase.from('garantias_conductores').select('cuotas_pagadas, total_cuotas, monto_cuota').eq('conductor_id', conductorId).eq('estado', 'en_curso').single(),
    ])

    const tickets = (ticketsRes.data || []) as any[]
    const penalidades = (penalidadesRes.data || []) as any[]
    const excesos = (excesosRes.data || []) as any[]
    const garantia = garantiaRes.data as any

    // Helpers
    const fmt = (n: number) => formatCurrency(n);
    const total = row.importeContrato + row.excedentes;
    const iBtn = (id: string) => `<span onclick="var b=document.getElementById('cbf-info-box');var t=document.getElementById('${id}');if(t){b.innerHTML=t.innerHTML;b.style.display=b.style.display==='none'?'block':'none';}else{b.style.display='none';}" style="cursor:pointer;color:#7C3AED;font-size:10px;border:1px solid #7C3AED;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:2px;">i</span>`

    // Generar HTML de detalles ocultos
    const garantiaDetalle = garantia ? `Cuota ${garantia.cuotas_pagadas || '?'} de ${garantia.total_cuotas || 20} · ${fmt(garantia.monto_cuota || 50000)}/cuota` : 'Sin garantía activa'
    const ticketsDetalle = tickets.length > 0
      ? tickets.map(t => `• ${t.tipo || 'Ticket'}: ${t.descripcion || 'Sin descripción'} → ${fmt(t.monto)}`).join('<br/>')
      : 'Sin tickets a favor'
    const penalidadesDetalle = penalidades.length > 0
      ? penalidades.map(p => `• ${p.detalle || 'Penalidad'} (${p.fecha || ''}) → ${fmt(p.monto)}`).join('<br/>')
      : 'Sin penalidades'
    const excesosDetalle = excesos.length > 0
      ? excesos.map(e => `• S${e.semana || '?'}: +${e.km_exceso || 0} km → ${fmt(e.monto_total)}`).join('<br/>')
      : 'Sin excesos de KM'

    Swal.fire({
      title: row.conductor,
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.6; color: var(--text-primary, #333);">
          <div style="font-size: 11px; color: #888; margin-bottom: 10px;">${row.dni} · ${row.patente || 'Sin patente'} · ${row.email || 'Sin email'}</div>

          <div style="background: rgba(124,58,237,0.06); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; color: #7C3AED; margin-bottom: 8px;">Días trabajados: ${d.diasTrabajados}</div>
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
              <tbody>
                ${d.prorrateoCargoDias > 0 ? `<tr><td style="padding: 3px 0;">Cargo</td><td style="text-align: center;">${d.prorrateoCargoDias} días</td><td style="text-align: right; font-family: monospace;">${fmt(d.prorrateoCargoMonto)}</td></tr>` : ''}
                ${d.prorrateoDiurnoDias > 0 ? `<tr><td style="padding: 3px 0;">Diurno</td><td style="text-align: center;">${d.prorrateoDiurnoDias} días</td><td style="text-align: right; font-family: monospace;">${fmt(d.prorrateoDiurnoMonto)}</td></tr>` : ''}
                ${d.prorrateoNocturnoDias > 0 ? `<tr><td style="padding: 3px 0;">Nocturno</td><td style="text-align: center;">${d.prorrateoNocturnoDias} días</td><td style="text-align: right; font-family: monospace;">${fmt(d.prorrateoNocturnoMonto)}</td></tr>` : ''}
                <tr style="border-top: 1px solid rgba(124,58,237,0.2);"><td style="padding: 5px 0; font-weight: 600;" colspan="2">Subtotal Alquiler</td><td style="text-align: right; font-family: monospace; font-weight: 600;">${fmt(d.subtotalAlquiler)}</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Detalles ocultos para los (i) -->
          <div style="display:none"><div id="det-garantia">${garantiaDetalle}</div><div id="det-peajes">Telepeajes Cabify semana anterior${d.montoPeajes === 0 ? ' (telepase propio = $0)' : ''}</div><div id="det-excesos">${excesosDetalle}</div><div id="det-penalidades">${penalidadesDetalle}</div><div id="det-tickets">${ticketsDetalle}</div><div id="det-subtotal">Alquiler ${fmt(d.subtotalAlquiler)} + Garantía ${fmt(d.subtotalGarantia)} + Peajes ${fmt(d.montoPeajes)} + Excesos ${fmt(d.montoExcesos)} + Penalidades ${fmt(d.montoPenalidades)}</div><div id="det-descuentos">${ticketsDetalle}</div><div id="det-saldo">Saldo acumulado de semanas anteriores</div><div id="det-contrato">Precio diario × 7 días = ${fmt(row.importeContrato)}</div><div id="det-excedentes">Garantía ${fmt(d.subtotalGarantia)} + Peajes ${fmt(d.montoPeajes)} + Excesos ${fmt(d.montoExcesos)} + Penalidades ${fmt(d.montoPenalidades)} − Tickets ${fmt(d.ticketsFavor)} + Saldo ${fmt(d.saldoAnterior)}</div></div>

          <div id="cbf-info-box" style="display:none;background:#1e1e2e;color:#fff;padding:8px 12px;border-radius:6px;font-size:11px;line-height:1.4;margin-bottom:8px;"></div>
          <table style="width: 100%; font-size: 12px; border-collapse: collapse; margin-bottom: 12px;">
            <tbody>
              <tr><td style="padding: 4px 0;">Garantía <span style="color: #888; font-size: 11px;">(${d.cuotaGarantia})</span> ${iBtn('det-garantia')}</td><td style="text-align: right; font-family: monospace;">${fmt(d.subtotalGarantia)}</td></tr>
              <tr><td style="padding: 4px 0;">Peajes ${iBtn('det-peajes')}</td><td style="text-align: right; font-family: monospace;">${fmt(d.montoPeajes)}</td></tr>
              <tr><td style="padding: 4px 0;">Excesos KM ${iBtn('det-excesos')}</td><td style="text-align: right; font-family: monospace;">${fmt(d.montoExcesos)}</td></tr>
              <tr><td style="padding: 4px 0;">Penalidades ${iBtn('det-penalidades')}</td><td style="text-align: right; font-family: monospace;">${fmt(d.montoPenalidades)}</td></tr>
              <tr><td style="padding: 4px 0; color: #16a34a;">Tickets a favor ${iBtn('det-tickets')}</td><td style="text-align: right; font-family: monospace; color: #16a34a;">-${fmt(d.ticketsFavor)}</td></tr>
              <tr style="border-top: 1px solid #ddd;"><td style="padding: 4px 0;">Subtotal Cargos ${iBtn('det-subtotal')}</td><td style="text-align: right; font-family: monospace;">${fmt(d.subtotalCargos)}</td></tr>
              <tr><td style="padding: 4px 0;">Subtotal Descuentos ${iBtn('det-descuentos')}</td><td style="text-align: right; font-family: monospace; color: #16a34a;">-${fmt(d.subtotalDescuentos)}</td></tr>
              <tr><td style="padding: 4px 0;">Saldo anterior ${iBtn('det-saldo')}</td><td style="text-align: right; font-family: monospace; ${d.saldoAnterior > 0 ? 'color: #16a34a;' : d.saldoAnterior < 0 ? 'color: #dc2626;' : ''}">${d.saldoAnterior > 0 ? '-' : ''}${fmt(Math.abs(d.saldoAnterior))}</td></tr>
            </tbody>
          </table>

          <div style="background: var(--bg-secondary, #f8f9fa); border-radius: 6px; padding: 12px; border: 1px solid var(--border-color, #e5e7eb);">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tbody>
                <tr><td style="padding: 4px 0; font-weight: 700;">Importe Contrato ${iBtn('det-contrato')}</td><td style="text-align: right; font-family: monospace; font-weight: 700;">${fmt(row.importeContrato)}</td></tr>
                <tr><td style="padding: 4px 0; font-weight: 700;">Excedentes ${iBtn('det-excedentes')}</td><td style="text-align: right; font-family: monospace; font-weight: 700;">${fmt(row.excedentes)}</td></tr>
                <tr style="border-top: 2px solid #7C3AED;"><td style="padding: 6px 0; font-weight: 700; font-size: 14px; color: #7C3AED;">TOTAL</td><td style="text-align: right; font-family: monospace; font-weight: 700; font-size: 14px; color: #7C3AED;">${fmt(total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `,
      width: 480,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#7C3AED',
    });
  }, []);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2>Preview Facturación Cabify</h2>
              <button
                className="cabify-info-btn"
                onClick={showInfoGeneral}
                title="Cómo se calcula"
              >
                <Info size={16} />
              </button>
            </div>
            <span className="fact-preview-subtitle">
              Semana {semana}/{anio} - {fechaInicio} al {fechaFin}
              {proyectadoA && (
                <span style={{
                  marginLeft: '10px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: 'var(--color-warning, #f59e0b)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  Proyectado a {proyectadoA}
                </span>
              )}
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
          {periodoId && (
            <button
              className="fact-preview-btn secondary"
              onClick={agregarConductor}
            >
              <UserPlus size={14} />
              Agregar Conductor
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
          Click en cualquier celda numérica para editarla. Los cambios se guardan al sincronizar con la BD.
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
              <th className="col-center col-detalle"></th>
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
              <th className="cabify-col-th">Horas Conexión<span className="cabify-tag">Cabify</span></th>
              <th className="col-money cabify-col-th">Importe Generado<span className="cabify-tag">Cabify</span></th>
              <th className="col-money cabify-col-th">Generado (con bonos)<span className="cabify-tag">Cabify</span></th>
              <th className="col-money cabify-col-th">Generado Efectivo<span className="cabify-tag">Cabify</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => {
              // O(1) lookup del índice real en data
              const realIdx = dataIndexMap.get(row.conductorId) ?? -1
              return (
                <tr key={row.conductorId || idx} className={row.isModified ? 'row-modified' : ''}>
                  <td className="col-center col-detalle">
                    {row.detalle && (
                      <button
                        className="cabify-eye-btn"
                        onClick={() => showDetalleRow(row)}
                        title="Ver detalle del cálculo"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </td>
                  <td className="col-center">{row.anio}</td>
                  <td className="col-center">{row.semana}</td>
                  <td className="col-center">{row.fechaInicial.toLocaleDateString('es-AR')}</td>
                  <td className="col-center">{row.fechaFinal.toLocaleDateString('es-AR')}</td>
                  <td className="col-nombre">{row.conductor}</td>
                  <td className="col-email">{row.email || '-'}</td>
                  <td className="col-center">{renderEditableTextCell(row, realIdx, 'patente', row.patente)}</td>
                  <td className="col-center">{row.dni || '-'}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'importeContrato', row.importeContrato)}</td>
                  <td className="col-money">{renderEditableCell(row, realIdx, 'excedentes', row.excedentes)}</td>
                  <td className="col-center">-</td>
                  <td className="col-center cabify-col">-</td>
                  <td className="col-money cabify-col">-</td>
                  <td className="col-money cabify-col">-</td>
                  <td className="col-money cabify-col">-</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={9} className="col-right"><strong>TOTALES:</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.importeContrato)}</strong></td>
              <td className="col-money"><strong>{formatCurrency(totales.excedentes)}</strong></td>
              <td></td>
              <td className="col-center cabify-col">-</td>
              <td className="col-money cabify-col">-</td>
              <td className="col-money cabify-col">-</td>
              <td className="col-money cabify-col">-</td>
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
        .cabify-col-th { background: rgba(124, 58, 237, 0.08) !important; border-left: 2px solid rgba(124, 58, 237, 0.25) !important; }
        .cabify-tag { display: block; font-size: 8px; font-weight: 700; color: #7C3AED; letter-spacing: 0.5px; margin-top: 2px; text-transform: uppercase; }
        .cabify-col { background: rgba(124, 58, 237, 0.04); }
        .cabify-col:first-of-type, td.cabify-col:first-of-type { border-left: 2px solid rgba(124, 58, 237, 0.25); }
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
        .edit-input-text { width: 80px; text-align: center; text-transform: uppercase; }
        
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* Info & Eye buttons */
        .cabify-info-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(124, 58, 237, 0.3); background: rgba(124, 58, 237, 0.08); color: #7C3AED; cursor: pointer; transition: all 0.15s; }
        .cabify-info-btn:hover { background: rgba(124, 58, 237, 0.2); border-color: #7C3AED; }
        .col-detalle { width: 32px; min-width: 32px; max-width: 32px; padding: 0 4px !important; }
        .cabify-eye-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 4px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
        .cabify-eye-btn:hover { background: rgba(124, 58, 237, 0.15); color: #7C3AED; }
        
        /* Dark Mode */
        [data-theme="dark"] .cabify-col-th { background: rgba(124, 58, 237, 0.15) !important; border-left-color: rgba(124, 58, 237, 0.4) !important; }
        [data-theme="dark"] .cabify-col { background: rgba(124, 58, 237, 0.08); }
        [data-theme="dark"] .cabify-tag { color: #a78bfa; }
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
