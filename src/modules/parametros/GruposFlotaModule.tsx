import { useState, useEffect, useMemo } from 'react'
import { Users, Building2, Plus, Edit, Trash2, X, CheckCircle, XCircle, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DataTable } from '../../components/ui/DataTable'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import '../../styles/modules.css'
import './GruposFlotaModule.css'

interface GrupoFlota {
  id: string
  codigo: string
  nombre_comercial: string
  razon_social: string
  cuit: string
  representante_nombre: string
  representante_dni: string
  email: string | null
  telefono: string | null
  prioridad: number
  drive_folder_contratos: string | null
  drive_folder_ofertas: string | null
  prefijo_oferta: string | null
  activo: boolean
  sede_id: string | null
  created_at: string
  updated_at: string
}

const EMPTY_FORM = {
  razon_social: '',
  cuit: '',
  representante_nombre: '',
  representante_dni: '',
  email: '',
  telefono: '',
  drive_folder_contratos: '',
  drive_folder_ofertas: '',
  activo: true,
  sede_id: null as string | null,
}

export function GruposFlotaModule() {
  const [grupos, setGrupos] = useState<GrupoFlota[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoFlota | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [detailGrupo, setDetailGrupo] = useState<GrupoFlota | null>(null)

  useEffect(() => {
    loadGrupos()
  }, [])

  async function loadGrupos() {
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await (supabase.from('grupos_flota') as any)
        .select('*')
        .order('nombre_comercial', { ascending: true })
      if (fetchError) throw fetchError
      setGrupos(data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar grupos de flota')
    } finally {
      setLoading(false)
    }
  }

  // Stats
  const stats = useMemo(() => {
    const total = grupos.length
    const activos = grupos.filter(g => g.activo).length
    const inactivos = total - activos
    return { total, activos, inactivos }
  }, [grupos])

  // Filtro por stat card
  const filteredGrupos = useMemo(() => {
    if (activeStatCard === 'activos') return grupos.filter(g => g.activo)
    if (activeStatCard === 'inactivos') return grupos.filter(g => !g.activo)
    return grupos
  }, [grupos, activeStatCard])

  function handleStatCardClick(card: string) {
    setActiveStatCard(prev => prev === card ? null : card)
  }

  function openCreateModal() {
    setFormData({ ...EMPTY_FORM })
    setSelectedGrupo(null)
    setModalMode('create')
    setShowModal(true)
  }

  function openEditModal(grupo: GrupoFlota) {
    setSelectedGrupo(grupo)
    setFormData({
      razon_social: grupo.razon_social,
      cuit: grupo.cuit,
      representante_nombre: grupo.representante_nombre,
      representante_dni: grupo.representante_dni,
      email: grupo.email || '',
      telefono: grupo.telefono || '',
      drive_folder_contratos: grupo.drive_folder_contratos || '',
      drive_folder_ofertas: grupo.drive_folder_ofertas || '',
      activo: grupo.activo,
      sede_id: grupo.sede_id,
    })
    setModalMode('edit')
    setShowModal(true)
  }

  async function handleSave() {
    // Validaciones obligatorias
    if (!formData.razon_social.trim()) {
      Swal.fire('Error', 'La razon social es obligatoria', 'warning')
      return
    }
    if (!formData.cuit.trim()) {
      Swal.fire('Error', 'El CUIT es obligatorio', 'warning')
      return
    }
    if (!formData.representante_nombre.trim()) {
      Swal.fire('Error', 'El nombre del representante es obligatorio', 'warning')
      return
    }
    if (!formData.representante_dni.trim()) {
      Swal.fire('Error', 'El DNI del representante es obligatorio', 'warning')
      return
    }

    setSaving(true)
    try {
      const razonTrimmed = formData.razon_social.trim()
      const codigoAuto = razonTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const payload: Record<string, unknown> = {
        razon_social: razonTrimmed,
        cuit: formData.cuit.trim(),
        representante_nombre: formData.representante_nombre.trim(),
        representante_dni: formData.representante_dni.trim(),
        email: formData.email?.trim() || null,
        telefono: formData.telefono?.trim() || null,
        drive_folder_contratos: formData.drive_folder_contratos?.trim() || null,
        drive_folder_ofertas: formData.drive_folder_ofertas?.trim() || null,
        activo: formData.activo,
        sede_id: formData.sede_id || null,
        updated_at: new Date().toISOString(),
      }
      // Auto-generar codigo y nombre_comercial solo al crear
      if (modalMode === 'create') {
        payload.codigo = codigoAuto
        payload.nombre_comercial = razonTrimmed
      }

      if (modalMode === 'edit' && selectedGrupo) {
        const { error: updateError } = await (supabase.from('grupos_flota') as any)
          .update(payload)
          .eq('id', selectedGrupo.id)
        if (updateError) throw updateError
        showSuccess('Grupo actualizado')
      } else {
        const { error: insertError } = await (supabase.from('grupos_flota') as any)
          .insert(payload)
        if (insertError) throw insertError
        showSuccess('Grupo creado')
      }

      setShowModal(false)
      loadGrupos()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(grupo: GrupoFlota) {
    const result = await Swal.fire({
      title: 'Eliminar grupo',
      html: `Esta seguro de eliminar <strong>${grupo.nombre_comercial}</strong>?<br/>Esta accion no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    })
    if (!result.isConfirmed) return

    try {
      const { error: deleteError } = await (supabase.from('grupos_flota') as any)
        .delete()
        .eq('id', grupo.id)
      if (deleteError) throw deleteError
      showSuccess('Grupo eliminado')
      loadGrupos()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo eliminar', 'error')
    }
  }

  const columns = useMemo<ColumnDef<GrupoFlota>[]>(() => [
    {
      accessorKey: 'razon_social',
      header: 'Razon Social',
      cell: ({ getValue }) => <span style={{ fontWeight: 600, fontSize: '13px' }}>{getValue() as string}</span>,
      enableSorting: true,
    },
    {
      accessorKey: 'cuit',
      header: 'CUIT',
      cell: ({ getValue }) => <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{getValue() as string}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'representante_nombre',
      header: 'Representante',
      cell: ({ getValue }) => <span style={{ fontSize: '12px' }}>{getValue() as string}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'representante_dni',
      header: 'DNI Rep.',
      cell: ({ getValue }) => <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{getValue() as string}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`gf-status-badge ${row.original.activo ? 'gf-status-active' : 'gf-status-inactive'}`}>
          {row.original.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="gf-action-btn" onClick={() => { setDetailGrupo(row.original); setShowDetail(true) }} title="Ver detalle">
            <Eye size={15} />
          </button>
          <button className="gf-action-btn" onClick={() => openEditModal(row.original)} title="Editar">
            <Edit size={15} />
          </button>
          <button className="gf-action-btn gf-action-delete" onClick={() => handleDelete(row.original)} title="Eliminar">
            <Trash2 size={15} />
          </button>
        </div>
      ),
      enableSorting: false,
    },
  ], [])

  function updateField(field: string, value: unknown) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="module-container">
      {/* Stats */}
      <div className="gf-stats">
        <div className="gf-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'total' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('total')}
          >
            <Building2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Grupos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'activos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('activos')}
          >
            <CheckCircle size={18} className="stat-icon" style={{ color: '#16a34a' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.activos}</span>
              <span className="stat-label">Activos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'inactivos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('inactivos')}
          >
            <XCircle size={18} className="stat-icon" style={{ color: '#9ca3af' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.inactivos}</span>
              <span className="stat-label">Inactivos</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredGrupos}
        columns={columns}
        loading={loading}
        error={error}
        pageSize={50}
        searchPlaceholder="Buscar por nombre, razon social, CUIT..."
        emptyTitle="No hay grupos de flota"
        emptyDescription="Crea el primer grupo de flota para comenzar"
        headerAction={
          <button className="btn-primary-action" onClick={openCreateModal}>
            <Plus size={16} />
            Nuevo Grupo
          </button>
        }
      />

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Nuevo Grupo de Flota' : 'Editar Grupo de Flota'}</h2>
              <button className="modal-close" onClick={() => !saving && setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Datos principales */}
              <h3 className="gf-section-title">
                <Users size={16} />
                Datos del Socio
              </h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Razon Social <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.razon_social}
                    onChange={(e) => updateField('razon_social', e.target.value)}
                    placeholder="ej: GRUPO CG S.A.S."
                  />
                </div>
                <div className="form-group">
                  <label>CUIT <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.cuit}
                    onChange={(e) => updateField('cuit', e.target.value)}
                    placeholder="ej: 30-71834000-0"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Representante Legal <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.representante_nombre}
                    onChange={(e) => updateField('representante_nombre', e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="form-group">
                  <label>DNI Representante <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.representante_dni}
                    onChange={(e) => updateField('representante_dni', e.target.value)}
                    placeholder="ej: 36.802.416"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div className="form-group">
                  <label>Telefono</label>
                  <input
                    type="text"
                    value={formData.telefono || ''}
                    onChange={(e) => updateField('telefono', e.target.value)}
                    placeholder="+54 11 ..."
                  />
                </div>
              </div>

              {/* Configuracion */}
              <h3 className="gf-section-title" style={{ marginTop: '24px' }}>
                <Building2 size={16} />
                Configuracion
              </h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Estado</label>
                  <select
                    value={formData.activo ? 'true' : 'false'}
                    onChange={(e) => updateField('activo', e.target.value === 'true')}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              {/* Drive folders */}
              <div className="form-row">
                <div className="form-group">
                  <label>Drive Folder Contratos</label>
                  <input
                    type="text"
                    value={formData.drive_folder_contratos || ''}
                    onChange={(e) => updateField('drive_folder_contratos', e.target.value)}
                    placeholder="ID de carpeta Google Drive"
                  />
                </div>
                <div className="form-group">
                  <label>Drive Folder Ofertas</label>
                  <input
                    type="text"
                    value={formData.drive_folder_ofertas || ''}
                    onChange={(e) => updateField('drive_folder_ofertas', e.target.value)}
                    placeholder="ID de carpeta Google Drive"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : (modalMode === 'create' ? 'Crear Grupo' : 'Guardar Cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle */}
      {showDetail && detailGrupo && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalle del Grupo</h2>
              <button className="modal-close" onClick={() => setShowDetail(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="gf-detail-grid">
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Razon Social</span>
                  <span className="gf-detail-value">{detailGrupo.razon_social}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">CUIT</span>
                  <span className="gf-detail-value" style={{ fontFamily: 'monospace' }}>{detailGrupo.cuit}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Representante Legal</span>
                  <span className="gf-detail-value">{detailGrupo.representante_nombre}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">DNI Representante</span>
                  <span className="gf-detail-value" style={{ fontFamily: 'monospace' }}>{detailGrupo.representante_dni}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Email</span>
                  <span className="gf-detail-value">{detailGrupo.email || '-'}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Telefono</span>
                  <span className="gf-detail-value">{detailGrupo.telefono || '-'}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Estado</span>
                  <span className={`gf-status-badge ${detailGrupo.activo ? 'gf-status-active' : 'gf-status-inactive'}`}>
                    {detailGrupo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Drive Contratos</span>
                  <span className="gf-detail-value" style={{ fontSize: '11px', wordBreak: 'break-all' }}>{detailGrupo.drive_folder_contratos || '-'}</span>
                </div>
                <div className="gf-detail-item">
                  <span className="gf-detail-label">Drive Ofertas</span>
                  <span className="gf-detail-value" style={{ fontSize: '11px', wordBreak: 'break-all' }}>{detailGrupo.drive_folder_ofertas || '-'}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDetail(false)}>
                Cerrar
              </button>
              <button className="btn-primary" onClick={() => { setShowDetail(false); openEditModal(detailGrupo) }}>
                <Edit size={14} style={{ marginRight: '6px' }} />
                Editar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
