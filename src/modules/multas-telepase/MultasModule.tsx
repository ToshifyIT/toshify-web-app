// src/modules/multas-telepase/MultasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, AlertTriangle, Eye, Edit2, Trash2, Plus, X, Car, Users, DollarSign } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import './MultasTelepase.css'

interface Multa {
  id: number
  created_at: string
  patente: string
  fecha_infraccion: string | null
  importe: string
  lugar: string
  detalle: string
  fecha_anotacion: string | null
  conductor_responsable: string
  observaciones: string
  infraccion: string
  lugar_detalle: string
  ibutton: string
}

interface Vehiculo {
  id: string
  patente: string
}

function formatMoney(value: string | number | null | undefined): string {
  if (!value) return 'Gs. 0'
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value
  if (isNaN(num)) return 'Gs. 0'
  return `Gs. ${num.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function parseImporte(importe: string | number | null | undefined): number {
  if (!importe) return 0
  const num = typeof importe === 'string' ? parseFloat(importe.replace(/[^0-9.-]/g, '')) : importe
  return isNaN(num) ? 0 : num
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '-'
  try {
    return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
  } catch {
    return fecha
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('es-AR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr)
  const thursday = new Date(date)
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return weekNumber
}

export default function MultasModule() {
  const [loading, setLoading] = useState(true)
  const [multas, setMultas] = useState<Multa[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [selectedMulta, setSelectedMulta] = useState<Multa | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Filtros
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [lugarFilter, setLugarFilter] = useState<string[]>([])

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      const [multasRes, vehiculosRes] = await Promise.all([
        supabase.from('multas_historico').select('*').order('fecha_infraccion', { ascending: false }),
        supabase.from('vehiculos').select('id, patente')
      ])

      if (multasRes.error) throw multasRes.error
      setMultas((multasRes.data || []) as Multa[])
      setVehiculos((vehiculosRes.data || []) as Vehiculo[])
    } catch (error) {
      console.error('Error cargando datos:', error)
      Swal.fire('Error', 'No se pudieron cargar las multas', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Valores unicos para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(multas.map(m => m.patente).filter(Boolean))].sort()
  , [multas])

  const conductoresUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.conductor_responsable).filter(Boolean))].sort()
  , [multas])

  const lugaresUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.lugar).filter(Boolean))].sort()
  , [multas])

  // Filtrar registros
  const multasFiltradas = useMemo(() => {
    let filtered = multas

    if (patenteFilter.length > 0) {
      filtered = filtered.filter(m => patenteFilter.includes(m.patente))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(m => conductorFilter.includes(m.conductor_responsable))
    }
    if (lugarFilter.length > 0) {
      filtered = filtered.filter(m => lugarFilter.includes(m.lugar))
    }

    return filtered
  }, [multas, patenteFilter, conductorFilter, lugarFilter])

  // Estadisticas
  const totalImporte = useMemo(() =>
    multasFiltradas.reduce((sum, m) => sum + parseImporte(m.importe), 0)
  , [multasFiltradas])

  const patentesUnicasCount = useMemo(() =>
    new Set(multasFiltradas.map(m => m.patente).filter(Boolean)).size
  , [multasFiltradas])

  const conductoresUnicosCount = useMemo(() =>
    new Set(multasFiltradas.map(m => m.conductor_responsable).filter(Boolean)).size
  , [multasFiltradas])

  // Ver detalle
  function handleVerDetalle(multa: Multa) {
    setSelectedMulta(multa)
    setShowModal(true)
  }

  // Crear multa
  async function crearMulta() {
    const patentesOptions = vehiculos
      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
      .map(v => `<option value="${v.patente}">${v.patente}</option>`)
      .join('')

    const { value: formValues } = await Swal.fire({
      title: 'Registrar Multa',
      html: `
        <div class="multas-modal-form">
          <div class="multas-form-group">
            <label class="multas-form-label">Patente *</label>
            <select id="swal-patente" class="multas-form-select">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Importe (Gs.) *</label>
            <input id="swal-importe" type="number" placeholder="Ej: 500000" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Infraccion</label>
            <input id="swal-infraccion" type="text" placeholder="Tipo de infraccion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Lugar</label>
            <input id="swal-lugar" type="text" placeholder="Ubicacion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Conductor Responsable</label>
            <input id="swal-conductor" type="text" placeholder="Nombre del conductor..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Observaciones</label>
            <textarea id="swal-detalle" rows="2" placeholder="Detalles adicionales..." class="multas-form-textarea"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 480,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) { Swal.showValidationMessage('Seleccione una patente'); return false }
        if (!fecha) { Swal.showValidationMessage('Ingrese la fecha'); return false }
        if (!importe || parseFloat(importe) <= 0) { Swal.showValidationMessage('Ingrese un importe valido'); return false }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).insert({
        patente: formValues.patente,
        fecha_infraccion: formValues.fecha,
        importe: formValues.importe,
        infraccion: formValues.infraccion || null,
        lugar: formValues.lugar || null,
        conductor_responsable: formValues.conductor || null,
        detalle: formValues.detalle || null,
        observaciones: formValues.detalle || null,
        fecha_anotacion: new Date().toISOString()
      })

      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Multa Registrada', timer: 1500, showConfirmButton: false })
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  // Editar multa
  async function editarMulta(multa: Multa) {
    const patentesOptions = vehiculos
      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
      .map(v => `<option value="${v.patente}" ${v.patente === multa.patente ? 'selected' : ''}>${v.patente}</option>`)
      .join('')

    const fechaValue = multa.fecha_infraccion ? multa.fecha_infraccion.split('T')[0] : ''

    const { value: formValues } = await Swal.fire({
      title: 'Editar Multa',
      html: `
        <div class="multas-modal-form">
          <div class="multas-form-group">
            <label class="multas-form-label">Patente *</label>
            <select id="swal-patente" class="multas-form-select">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" value="${fechaValue}" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Importe (Gs.) *</label>
            <input id="swal-importe" type="number" value="${parseImporte(multa.importe)}" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Infraccion</label>
            <input id="swal-infraccion" type="text" value="${multa.infraccion || ''}" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Lugar</label>
            <input id="swal-lugar" type="text" value="${multa.lugar || ''}" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Conductor Responsable</label>
            <input id="swal-conductor" type="text" value="${multa.conductor_responsable || ''}" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Observaciones</label>
            <textarea id="swal-detalle" rows="2" class="multas-form-textarea">${multa.observaciones || multa.detalle || ''}</textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 480,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) { Swal.showValidationMessage('Seleccione una patente'); return false }
        if (!fecha) { Swal.showValidationMessage('Ingrese la fecha'); return false }
        if (!importe || parseFloat(importe) <= 0) { Swal.showValidationMessage('Ingrese un importe valido'); return false }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any)
        .update({
          patente: formValues.patente,
          fecha_infraccion: formValues.fecha,
          importe: formValues.importe,
          infraccion: formValues.infraccion || null,
          lugar: formValues.lugar || null,
          conductor_responsable: formValues.conductor || null,
          detalle: formValues.detalle || null,
          observaciones: formValues.detalle || null
        })
        .eq('id', multa.id)

      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Actualizada', timer: 1500, showConfirmButton: false })
      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  // Eliminar multa
  async function eliminarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: 'Eliminar multa?',
      text: `${multa.patente} - ${formatMoney(multa.importe)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).delete().eq('id', multa.id)
      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1500, showConfirmButton: false })
      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  // Columnas
  const columns = useMemo<ColumnDef<Multa>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Fecha Carga',
      cell: ({ row }) => formatDateTime(row.original.created_at)
    },
    {
      id: 'semana',
      header: 'Sem.',
      cell: ({ row }) => {
        if (!row.original.created_at) return '-'
        return getWeekNumber(row.original.created_at)
      }
    },
    {
      accessorKey: 'fecha_infraccion',
      header: 'Fecha Infraccion',
      cell: ({ row }) => formatFecha(row.original.fecha_infraccion)
    },
    {
      accessorKey: 'fecha_anotacion',
      header: 'Fecha Anotacion',
      cell: ({ row }) => formatFecha(row.original.fecha_anotacion)
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
        <span className="patente-badge">{row.original.patente || '-'}</span>
      )
    },
    {
      accessorKey: 'lugar',
      header: () => (
        <ExcelColumnFilter
          label="Lugar"
          options={lugaresUnicos}
          selectedValues={lugarFilter}
          onSelectionChange={setLugarFilter}
          filterId="lugar"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.lugar || '-'
    },
    {
      accessorKey: 'detalle',
      header: 'Infraccion',
      cell: ({ row }) => (
        <span style={{ fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.original.detalle || '-'}
        </span>
      )
    },
    {
      accessorKey: 'conductor_responsable',
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
      cell: ({ row }) => row.original.conductor_responsable || '-'
    },
    {
      accessorKey: 'ibutton',
      header: 'iButton',
      cell: ({ row }) => row.original.ibutton || '-'
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button
            className="dt-btn-action dt-btn-edit"
            data-tooltip="Editar"
            onClick={() => editarMulta(row.original)}
          >
            <Edit2 size={14} />
          </button>
          <button
            className="dt-btn-action dt-btn-view"
            data-tooltip="Ver detalle"
            onClick={() => handleVerDetalle(row.original)}
          >
            <Eye size={14} />
          </button>
          <button
            className="dt-btn-action dt-btn-delete"
            data-tooltip="Eliminar"
            onClick={() => eliminarMulta(row.original)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, lugaresUnicos, lugarFilter, openFilterId])

  // Exportar a Excel
  function handleExportar() {
    const dataExport = multasFiltradas.map(m => ({
      'Patente': m.patente,
      'Fecha Infraccion': formatFecha(m.fecha_infraccion),
      'Importe': parseImporte(m.importe),
      'Infraccion': m.infraccion,
      'Lugar': m.lugar,
      'Conductor': m.conductor_responsable,
      'Observaciones': m.observaciones || m.detalle
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Multas')
    XLSX.writeFile(wb, `multas_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="module-container">
        <div className="loading-container">
          <div className="spinner" />
          <p>Cargando multas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="multas-module">
      {/* Stats Cards */}
      <div className="multas-stats">
        <div className="multas-stats-grid">
          <div className="stat-card">
            <AlertTriangle size={18} className="stat-icon" style={{ color: '#EF4444' }} />
            <div className="stat-content">
              <span className="stat-value">{multasFiltradas.length}</span>
              <span className="stat-label">Total Multas</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={18} className="stat-icon" style={{ color: '#6B7280' }} />
            <div className="stat-content">
              <span className="stat-value">{patentesUnicasCount}</span>
              <span className="stat-label">Vehiculos</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" style={{ color: '#6B7280' }} />
            <div className="stat-content">
              <span className="stat-value">{conductoresUnicosCount}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" style={{ color: '#22C55E' }} />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(totalImporte)}</span>
              <span className="stat-label">Monto Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={multasFiltradas}
        columns={columns}
        searchPlaceholder="Buscar por patente, conductor, lugar..."
        disableAutoFilters={true}
        headerAction={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={handleExportar}>
              <Download size={16} />
              Exportar
            </button>
            <button className="btn-primary" onClick={crearMulta}>
              <Plus size={16} />
              Registrar Multa
            </button>
          </div>
        }
      />

      {/* Modal Detalle */}
      {showModal && selectedMulta && (
        <div className="multas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Detalle de Multa</h2>
              <button className="multas-modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              <table className="multas-detail-table">
                <tbody>
                  <tr>
                    <td className="multas-detail-label">Patente</td>
                    <td className="multas-detail-value">
                      <span className="patente-badge">{selectedMulta.patente || '-'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Fecha Infraccion</td>
                    <td className="multas-detail-value">{formatFecha(selectedMulta.fecha_infraccion)}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Importe</td>
                    <td className="multas-detail-value" style={{ fontWeight: 700, color: '#DC2626', fontSize: '18px' }}>
                      {formatMoney(selectedMulta.importe)}
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Infraccion</td>
                    <td className="multas-detail-value">{selectedMulta.infraccion || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Lugar</td>
                    <td className="multas-detail-value">{selectedMulta.lugar || '-'}</td>
                  </tr>
                  {selectedMulta.lugar_detalle && (
                    <tr>
                      <td className="multas-detail-label">Lugar Detalle</td>
                      <td className="multas-detail-value">{selectedMulta.lugar_detalle}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="multas-detail-label">Conductor</td>
                    <td className="multas-detail-value">{selectedMulta.conductor_responsable || '-'}</td>
                  </tr>
                  {selectedMulta.ibutton && (
                    <tr>
                      <td className="multas-detail-label">iButton</td>
                      <td className="multas-detail-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{selectedMulta.ibutton}</td>
                    </tr>
                  )}
                  {(selectedMulta.observaciones || selectedMulta.detalle) && (
                    <tr>
                      <td className="multas-detail-label">Observaciones</td>
                      <td className="multas-detail-value" style={{
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        {selectedMulta.observaciones || selectedMulta.detalle}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="multas-modal-footer">
              <button className="multas-btn-primary" onClick={() => editarMulta(selectedMulta)}>
                <Edit2 size={14} style={{ marginRight: '6px' }} />
                Editar
              </button>
              <button className="multas-btn-secondary" onClick={() => setShowModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
