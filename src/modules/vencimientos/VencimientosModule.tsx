import { useEffect, useMemo, useState } from 'react'
import { Eye, Edit2, Trash2, FileText, AlertTriangle, Plus, Shield } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../../lib/supabase'
import { showSuccess } from '../../utils/toast'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import type { ColumnDef } from '@tanstack/react-table'
import './VencimientosModule.css'

interface Vencimiento {
  id: string
  titular: string
  patente: string
  documento?: string | null
  fecha_entrega?: string | null
  fecha_vencimiento: string
  fecha_iniciar_gestion?: string | null
  prioridad: 'ALTO' | 'MEDIO' | 'BAJO'
  solicitado: boolean
  observacion?: string | null
  created_at: string
}

type ModalMode = 'create' | 'edit' | 'view'

interface VencimientoFormData {
  titular: string
  patente: string
  documento?: string
  fecha_entrega?: string
  fecha_vencimiento: string
  fecha_iniciar_gestion?: string
  solicitado: boolean
  observacion?: string
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const str = String(value)
  const iso = str.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number)
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      return new Date(y, m - 1, d)
    }
  }
  const fallback = new Date(value)
  if (Number.isNaN(fallback.getTime())) return null
  return fallback
}

function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '-'
  const day = `${date.getDate()}`.padStart(2, '0')
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base)
  copy.setDate(copy.getDate() + days)
  return copy
}

function prioridadFromFecha(fecha: string | null | undefined): 'ALTO' | 'MEDIO' | 'BAJO' {
  const d = parseDate(fecha)
  if (!d) return 'BAJO'
  const today = normalizeToday()
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 14) return 'ALTO'
  if (diffDays <= 45) return 'MEDIO'
  return 'BAJO'
}

function isProximoAVencerEn5Dias(item: Vencimiento): boolean {
  const fecha = parseDate(item.fecha_vencimiento)
  if (!fecha) return false
  const hoy = normalizeToday()
  const limite = addDays(hoy, 5)
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d >= hoy && d <= limite
}

export function VencimientosModule() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Vencimiento[]>([])
  const [search, setSearch] = useState('')

  const [vehiculos, setVehiculos] = useState<Array<{ id: string; patente: string; marca: string; modelo: string; titular: string }>>([])
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [selectedItem, setSelectedItem] = useState<Vencimiento | null>(null)
  const [formData, setFormData] = useState<VencimientoFormData>({
    titular: '',
    patente: '',
    documento: '',
    fecha_entrega: '',
    fecha_vencimiento: '',
    fecha_iniciar_gestion: '',
    solicitado: false,
    observacion: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
    loadVehiculos()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vencimientos' as any)
        .select('*')
        .order('fecha_vencimiento', { ascending: true })

      if (error) throw error

      const mapped: Vencimiento[] = (data || []).map((row: any) => ({
        id: row.id,
        titular: row.titular || '',
        patente: row.patente || '',
        documento: row.documento ?? null,
        fecha_entrega: row.fecha_entrega ?? null,
        fecha_vencimiento: row.fecha_vencimiento,
        fecha_iniciar_gestion: row.fecha_iniciar_gestion ?? null,
        prioridad: (row.prioridad || 'MEDIO') as 'ALTO' | 'MEDIO' | 'BAJO',
        solicitado: !!row.solicitado,
        observacion: row.observacion ?? null,
        created_at: row.created_at
      }))

      setItems(mapped)
    } catch (error) {
      console.error('Error cargando vencimientos:', error)
      Swal.fire('Error', 'No se pudieron cargar los vencimientos', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadVehiculos() {
    try {
      const { data, error } = await supabase
        .from('vehiculos' as any)
        .select('id, patente, marca, modelo, titular')
        .order('patente', { ascending: true })

      if (error) throw error

      const mapped = (data || []).map((v: any) => ({
        id: v.id as string,
        patente: (v.patente || '') as string,
        marca: (v.marca || '') as string,
        modelo: (v.modelo || '') as string,
        titular: (v.titular || '') as string
      }))

      setVehiculos(mapped)
    } catch (error) {
      console.error('Error cargando vehiculos para vencimientos:', error)
    }
  }

  const filteredVehiculos = useMemo(() => {
    const term = vehiculoSearch.toLowerCase().trim()
    if (!term) return vehiculos.slice(0, 10)
    return vehiculos.filter(v =>
      v.patente.toLowerCase().includes(term) ||
      v.marca.toLowerCase().includes(term) ||
      v.modelo.toLowerCase().includes(term)
    ).slice(0, 10)
  }, [vehiculos, vehiculoSearch])

  const totalRegistros = useMemo(() => items.length, [items])

  const proximosAVencerEn5Dias = useMemo(
    () => items.filter(isProximoAVencerEn5Dias).length,
    [items]
  )

  const totalPrioridadAlta = useMemo(() => {
    return items.filter(item => prioridadFromFecha(item.fecha_iniciar_gestion)).filter(i => prioridadFromFecha(i.fecha_iniciar_gestion) === 'ALTO').length
  }, [items])

  const totalPrioridadMedia = useMemo(() => {
    return items.filter(item => prioridadFromFecha(item.fecha_iniciar_gestion)).filter(i => prioridadFromFecha(i.fecha_iniciar_gestion) === 'MEDIO').length
  }, [items])

  const totalPrioridadBaja = useMemo(() => {
    return items.filter(item => prioridadFromFecha(item.fecha_iniciar_gestion)).filter(i => prioridadFromFecha(i.fecha_iniciar_gestion) === 'BAJO').length
  }, [items])

  const totalSolicitadosSi = useMemo(
    () => items.filter(item => item.solicitado).length,
    [items]
  )

  const totalSolicitadosNo = useMemo(
    () => items.filter(item => !item.solicitado).length,
    [items]
  )

  const filteredItems = useMemo(() => {
    if (!search.trim()) return [...items]
    const searchLower = search.toLowerCase().trim()
    return items.filter(item => {
      const text = [
        item.titular,
        item.patente,
        item.documento || ''
      ].join(' ').toLowerCase()
      return text.includes(searchLower)
    })
  }, [items, search])

  function openCreateModal() {
    setModalMode('create')
    setSelectedItem(null)
    setFormData({
      titular: '',
      patente: '',
      documento: '',
      fecha_entrega: '',
      fecha_vencimiento: '',
      fecha_iniciar_gestion: '',
      solicitado: false,
      observacion: ''
    })
    setShowModal(true)
  }

  function openViewModal(item: Vencimiento) {
    setModalMode('view')
    setSelectedItem(item)
    setFormData({
      titular: item.titular,
      patente: item.patente,
      documento: item.documento || '',
      fecha_entrega: item.fecha_entrega || '',
      fecha_vencimiento: item.fecha_vencimiento,
      fecha_iniciar_gestion: item.fecha_iniciar_gestion || '',
      solicitado: item.solicitado,
      observacion: item.observacion || ''
    })
    setShowModal(true)
  }

  function openEditModal(item: Vencimiento) {
    setModalMode('edit')
    setSelectedItem(item)
    setFormData({
      titular: item.titular,
      patente: item.patente,
      documento: item.documento || '',
      fecha_entrega: item.fecha_entrega || '',
      fecha_vencimiento: item.fecha_vencimiento,
      fecha_iniciar_gestion: item.fecha_iniciar_gestion || '',
      solicitado: item.solicitado,
      observacion: item.observacion || ''
    })
    setShowModal(true)
  }

  async function handleDelete(item: Vencimiento) {
    const result = await Swal.fire({
      title: 'Eliminar registro',
      text: '¿Estás seguro de que deseas eliminar este vencimiento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    })
    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('vencimientos' as any)
        .delete()
        .eq('id', item.id)

      if (error) throw error

      setItems(prev => prev.filter(x => x.id !== item.id))
      showSuccess('Registro eliminado correctamente')
    } catch (error) {
      console.error('Error eliminando vencimiento:', error)
      Swal.fire('Error', 'No se pudo eliminar el registro', 'error')
    }
  }

  async function handleToggleSolicitado(item: Vencimiento) {
    const nuevoValor = !item.solicitado
    try {
      const { error } = await supabase
        .from('vencimientos' as any)
        .update({ solicitado: nuevoValor })
        .eq('id', item.id)

      if (error) throw error

      setItems(prev =>
        prev.map(x => (x.id === item.id ? { ...x, solicitado: nuevoValor } : x))
      )
      showSuccess('Estado actualizado correctamente')
    } catch (error) {
      console.error('Error actualizando solicitado:', error)
      Swal.fire('Error', 'No se pudo actualizar el estado', 'error')
    }
  }

  async function handleSubmit() {
    if (!formData.titular.trim() || !formData.patente.trim() || !formData.fecha_vencimiento) {
      Swal.fire('Campos incompletos', 'Completa los campos obligatorios', 'warning')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'create') {
        const payload = {
          titular: formData.titular.trim(),
          patente: formData.patente.trim(),
          documento: formData.documento?.trim() || null,
          fecha_entrega: formData.fecha_entrega || null,
          fecha_vencimiento: formData.fecha_vencimiento,
          fecha_iniciar_gestion: formData.fecha_iniciar_gestion || null,
          solicitado: formData.solicitado,
          observacion: formData.observacion?.trim() || null
        }

        const { data, error } = await supabase
          .from('vencimientos' as any)
          .insert(payload)
          .select()
          .single()

        if (error) throw error

        const row = data as any
        const mapped: Vencimiento = {
          id: row.id,
          titular: row.titular || '',
          patente: row.patente || '',
          documento: row.documento ?? null,
          fecha_entrega: row.fecha_entrega ?? null,
          fecha_vencimiento: row.fecha_vencimiento,
          fecha_iniciar_gestion: row.fecha_iniciar_gestion ?? null,
          prioridad: row.prioridad || 'MEDIO',
          solicitado: !!row.solicitado,
          observacion: row.observacion ?? null,
          created_at: row.created_at
        }

        setItems(prev => [mapped, ...prev])
        showSuccess('Registro creado correctamente')
      } else if (modalMode === 'edit' && selectedItem) {
        const payload = {
          titular: formData.titular.trim(),
          patente: formData.patente.trim(),
          documento: formData.documento?.trim() || null,
          fecha_entrega: formData.fecha_entrega || null,
          fecha_vencimiento: formData.fecha_vencimiento,
          fecha_iniciar_gestion: formData.fecha_iniciar_gestion || null,
          solicitado: formData.solicitado,
          observacion: formData.observacion?.trim() || null
        }

        const { error } = await supabase
          .from('vencimientos' as any)
          .update(payload)
          .eq('id', selectedItem.id)

        if (error) throw error

        setItems(prev =>
          prev.map(x =>
            x.id === selectedItem.id
              ? {
                  ...x,
                  titular: payload.titular,
                  patente: payload.patente,
                  documento: payload.documento,
                  fecha_entrega: payload.fecha_entrega,
                  fecha_vencimiento: payload.fecha_vencimiento,
                  fecha_iniciar_gestion: payload.fecha_iniciar_gestion,
                  solicitado: payload.solicitado,
                  observacion: payload.observacion
                }
              : x
          )
        )
        showSuccess('Registro actualizado correctamente')
      }
      setShowModal(false)
    } catch (error) {
      console.error('Error guardando vencimiento:', error)
      Swal.fire('Error', 'No se pudo guardar el registro', 'error')
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnDef<Vencimiento>[]>(() => [
    {
      accessorKey: 'titular',
      header: 'Titular',
      cell: ({ getValue }) => {
        const value = getValue() as string
        return (
          <div className="venc-cell">
            <span className="venc-titular">{value}</span>
          </div>
        )
      },
      enableSorting: true
    },
    {
      accessorKey: 'patente',
      header: 'Patente',
      cell: ({ getValue }) => (
        <span className="venc-patente">{(getValue() as string) || '-'}</span>
      ),
      enableSorting: true
    },
    {
      accessorKey: 'documento',
      header: 'Documento',
      cell: ({ getValue }) => (getValue() as string) || '-',
      enableSorting: false
    },
    {
      accessorKey: 'fecha_entrega',
      header: 'Fecha de Entrega',
      cell: ({ getValue }) => formatDate(getValue() as string | null | undefined),
      enableSorting: true
    },
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Fecha de Vencimiento',
      cell: ({ row, getValue }) => {
        const raw = getValue() as string | null | undefined
        const label = formatDate(raw)
        const isProximo = isProximoAVencerEn5Dias(row.original)
        const cls = isProximo ? 'venc-fecha-vencimiento-proxima' : ''
        return <span className={cls}>{label}</span>
      },
      enableSorting: true
    },
    {
      accessorKey: 'fecha_iniciar_gestion',
      header: 'Fecha para Iniciar Gestión',
      cell: ({ getValue }) => formatDate(getValue() as string | null | undefined),
      enableSorting: true
    },
    {
      accessorKey: 'prioridad',
      header: 'Prioridad',
      cell: ({ row }) => {
        const pr = prioridadFromFecha(row.original.fecha_iniciar_gestion)
        const upper = pr.toUpperCase()
        let cls = 'prioridad-badge prioridad-baja'
        if (upper === 'ALTO') cls = 'prioridad-badge prioridad-alta'
        else if (upper === 'MEDIO') cls = 'prioridad-badge prioridad-media'
        return <span className={cls}>{upper}</span>
      },
      enableSorting: true
    },
    {
      accessorKey: 'solicitado',
      header: 'Solicitado',
      cell: ({ row, getValue }) => {
        const value = !!getValue()
        const cls = value ? 'solicitado-badge solicitado-si' : 'solicitado-badge solicitado-no'
        return (
          <button
            type="button"
            className={cls}
            onClick={() => handleToggleSolicitado(row.original)}
            title="Cambiar estado"
          >
            {value ? 'Sí' : 'No'}
          </button>
        )
      },
      enableSorting: false
    },
    {
      accessorKey: 'observacion',
      header: 'Observaciones',
      cell: ({ getValue }) => {
        const value = (getValue() as string) || ''
        if (!value) return '-'
        return <span className="venc-observacion">{value}</span>
      },
      enableSorting: false
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="table-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => openViewModal(row.original)}
            title="Ver"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => openEditModal(row.original)}
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => handleDelete(row.original)}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
      enableSorting: false
    }
  ], [])

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = filteredItems.map(item => ({
        Titular: item.titular,
        Patente: item.patente,
        Documento: item.documento || '',
        Fecha_entrega: formatDate(item.fecha_entrega),
        Fecha_vencimiento: formatDate(item.fecha_vencimiento),
        Fecha_iniciar_gestion: formatDate(item.fecha_iniciar_gestion),
        Prioridad: prioridadFromFecha(item.fecha_iniciar_gestion),
        Solicitado: item.solicitado ? 'Sí' : 'No',
        Observaciones: item.observacion || ''
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Vencimientos')
      const fecha = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `Vencimientos_${fecha}.xlsx`)
    } catch (error) {
      console.error('Error exportando a Excel:', error)
      Swal.fire('Error', 'No se pudo exportar a Excel', 'error')
    }
  }

  if (loading) {
    return (
      <div className="vencimientos-module">
        <LoadingOverlay show message="Cargando vencimientos..." size="lg" />
      </div>
    )
  }

  return (
    <div className="vencimientos-module">
      <div className="vencimientos-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalRegistros}</span>
              <span className="stat-label">Total registros</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{proximosAVencerEn5Dias}</span>
              <span className="stat-label">Próximas a vencer</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadAlta}</span>
              <span className="stat-label">Prioridad alta</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadMedia}</span>
              <span className="stat-label">Prioridad media</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadBaja}</span>
              <span className="stat-label">Prioridad baja</span>
            </div>
          </div>
          <div className="stat-card">
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalSolicitadosSi}</span>
              <span className="stat-label">Solicitado "Sí"</span>
            </div>
          </div>
          <div className="stat-card">
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalSolicitadosNo}</span>
              <span className="stat-label">Solicitado "No"</span>
            </div>
          </div>
        </div>
      </div>

      <div className="vencimientos-header-row">
        <div className="vencimientos-header-left">
          <div className="vencimientos-tabs">
            <button
              type="button"
              className="vencimientos-tab active"
            >
              <FileText size={16} />
              Listado
              <span className="tab-badge">{filteredItems.length}</span>
            </button>
          </div>
        </div>
        <div className="tabs-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportToExcel}
          >
            <FileText size={16} />
            Exportar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            Nuevo Registro
          </button>
        </div>
      </div>

      {proximosAVencerEn5Dias > 0 && (
        <div className="vencimientos-alert">
          <div className="vencimientos-alert-item">
            <AlertTriangle size={16} />
            <span>
              <strong>Atención:</strong> hay {proximosAVencerEn5Dias} operación(es) que están próximas a vencer
            </span>
          </div>
        </div>
      )}

      <div className="vencimientos-search-row">
        <div className="vencimientos-search">
          <div className="vencimientos-search-wrapper">
            <svg
              className="vencimientos-search-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="vencimientos-search-input"
              placeholder="Buscar por patente o titular..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="vencimientos-table">
        <DataTable
          data={filteredItems}
          columns={columns}
          loading={false}
          showSearch={false}
          pageSize={100}
          emptyIcon={<Shield size={40} />}
          emptyTitle="No hay vencimientos para mostrar"
          emptyDescription="Los vencimientos aparecerán aquí cuando se registren."
        />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {modalMode === 'create'
                  ? 'Nuevo Registro'
                  : modalMode === 'edit'
                  ? 'Editar Registro'
                  : 'Detalle del Registro'}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !saving && setShowModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Patente
                      <span className="required">*</span>
                    </label>
                    <div className="searchable-select">
                      <input
                        type="text"
                        autoComplete="off"
                        value={formData.patente || vehiculoSearch}
                        onChange={e => {
                          const value = e.target.value
                          setVehiculoSearch(value)
                          setFormData(prev => ({ ...prev, patente: value }))
                          setShowVehiculoDropdown(true)
                        }}
                        onFocus={() => setShowVehiculoDropdown(true)}
                        onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                        placeholder="Buscar por patente..."
                        disabled={modalMode === 'view' || saving}
                      />
                      {showVehiculoDropdown && filteredVehiculos.length > 0 && (
                        <div className="searchable-dropdown">
                          {filteredVehiculos.map(v => (
                            <div
                              key={v.id}
                              className="searchable-option"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, patente: v.patente, titular: v.titular }))
                                setVehiculoSearch('')
                                setShowVehiculoDropdown(false)
                              }}
                            >
                              <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>
                      Titular
                      <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.titular}
                      disabled
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Documento</label>
                    <select
                      value={formData.documento || ''}
                      onChange={e => setFormData(prev => ({ ...prev, documento: e.target.value || undefined }))}
                      disabled={modalMode === 'view' || saving}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Patente provisoria">Patente provisoria</option>
                      <option value="Constancia de cédula">Constancia de cédula</option>
                      <option value="VTV">VTV</option>
                      <option value="GNC">GNC</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Solicitado</label>
                    <div className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={formData.solicitado}
                        onChange={e => setFormData(prev => ({ ...prev, solicitado: e.target.checked }))}
                        disabled={modalMode === 'view' || saving}
                      />
                      <span>{formData.solicitado ? 'Sí' : 'No'}</span>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha de Entrega</label>
                    <input
                      type="date"
                      value={formData.fecha_entrega || ''}
                      onChange={e => {
                        const value = e.target.value
                        setFormData(prev => {
                          let fechaVencimiento = prev.fecha_vencimiento
                          let fechaIniciarGestion = prev.fecha_iniciar_gestion

                          if (modalMode === 'create') {
                            if (value) {
                              const baseDate = parseDate(value)
                              if (baseDate) {
                                const vencimientoDate = addDays(baseDate, 60)
                                const iniciarGestionDate = addDays(vencimientoDate, -14)
                                fechaVencimiento = formatDateInput(vencimientoDate)
                                fechaIniciarGestion = formatDateInput(iniciarGestionDate)
                              } else {
                                fechaVencimiento = ''
                                fechaIniciarGestion = ''
                              }
                            } else {
                              fechaVencimiento = ''
                              fechaIniciarGestion = ''
                            }
                          }

                          return { 
                            ...prev, 
                            fecha_entrega: value, 
                            fecha_vencimiento: fechaVencimiento, 
                            fecha_iniciar_gestion: fechaIniciarGestion 
                          }
                        })
                      }}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      Fecha de Vencimiento
                      <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_vencimiento}
                      onChange={e => setFormData(prev => ({ ...prev, fecha_vencimiento: e.target.value }))}
                      disabled={modalMode !== 'edit' || saving}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha para Iniciar Gestión</label>
                    <input
                      type="date"
                      value={formData.fecha_iniciar_gestion || ''}
                      onChange={e => setFormData(prev => ({ ...prev, fecha_iniciar_gestion: e.target.value }))}
                      disabled={modalMode !== 'edit' || saving}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Observaciones</label>
                    <textarea
                      value={formData.observacion || ''}
                      onChange={e => setFormData(prev => ({ ...prev, observacion: e.target.value }))}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                </div>
              </div>
            </div>
            {modalMode !== 'view' && (
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => !saving && setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
