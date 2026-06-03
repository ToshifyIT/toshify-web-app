import { useState, useEffect, useMemo } from 'react'
import { Users, Building2, Plus, Edit, Trash2, X, CheckCircle, XCircle } from 'lucide-react'
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
  valor_vehiculo: string | null
  valor_propietario: string | null
  valor_socio: string | null
  drive_folder_contratos: string | null
  drive_folder_ofertas: string | null
  prefijo_oferta: string | null
  activo: boolean
  sede_id: string | null
  created_at: string
  updated_at: string
}

const EMPTY_FORM: Omit<GrupoFlota, 'id' | 'created_at' | 'updated_at'> = {
  codigo: '',
  nombre_comercial: '',
  razon_social: '',
  cuit: '',
  representante_nombre: '',
  representante_dni: '',
  email: '',
  telefono: '',
  prioridad: 99,
  valor_vehiculo: '',
  valor_propietario: '',
  valor_socio: '',
  drive_folder_contratos: '',
  drive_folder_ofertas: '',
  prefijo_oferta: '',
  activo: true,
  sede_id: null,
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

  useEffect(() => {
    loadGrupos()
  }, [])

  async function loadGrupos() {
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await (supabase.from('grupos_flota') as any)
        .select('*')
        .order('prioridad', { ascending: true })
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
      codigo: grupo.codigo,
      nombre_comercial: grupo.nombre_comercial,
      razon_social: grupo.razon_social,
      cuit: grupo.cuit,
      representante_nombre: grupo.representante_nombre,
      representante_dni: grupo.representante_dni,
      email: grupo.email || '',
      telefono: grupo.telefono || '',
      prioridad: grupo.prioridad,
      valor_vehiculo: grupo.valor_vehiculo || '',
      valor_propietario: grupo.valor_propietario || '',
      valor_socio: grupo.valor_socio || '',
      drive_folder_contratos: grupo.drive_folder_contratos || '',
      drive_folder_ofertas: grupo.drive_folder_ofertas || '',
      prefijo_oferta: grupo.prefijo_oferta || '',
      activo: grupo.activo,
      sede_id: grupo.sede_id,
    })
    setModalMode('edit')
    setShowModal(true)
  }

  async function handleSave() {
    // Validaciones obligatorias
    if (!formData.codigo.trim()) {
      Swal.fire('Error', 'El codigo es obligatorio', 'warning')
      return
    }
    if (!formData.nombre_comercial.trim()) {
      Swal.fire('Error', 'El nombre comercial es obligatorio', 'warning')
      return
    }
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
      const payload = {
        codigo: formData.codigo.trim().toLowerCase().replace(/\s+/g, '_'),
        nombre_comercial: formData.nombre_comercial.trim(),
        razon_social: formData.razon_social.trim(),
        cuit: formData.cuit.trim(),
        representante_nombre: formData.representante_nombre.trim(),
        representante_dni: formData.representante_dni.trim(),
        email: formData.email?.trim() || null,
        telefono: formData.telefono?.trim() || null,
        prioridad: formData.prioridad || 99,
        valor_vehiculo: formData.valor_vehiculo?.trim() || null,
        valor_propietario: formData.valor_propietario?.trim() || null,
        valor_socio: formData.valor_socio?.trim() || null,
        drive_folder_contratos: formData.drive_folder_contratos?.trim() || null,
        drive_folder_ofertas: formData.drive_folder_ofertas?.trim() || null,
        prefijo_oferta: formData.prefijo_oferta?.trim() || null,
        activo: formData.activo,
        sede_id: formData.sede_id || null,
        updated_at: new Date().toISOString(),
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
      accessorKey: 'nombre_comercial',
      header: 'Nombre',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{row.original.nombre_comercial}</span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'razon_social',
      header: 'Razon Social',
      cell: ({ getValue }) => <span style={{ fontSize: '12px' }}>{getValue() as string}</span>,
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
      accessorKey: 'prioridad',
      header: 'Prioridad',
      cell: ({ getValue }) => <span style={{ fontSize: '12px', fontWeight: 600 }}>{getValue() as number}</span>,
      enableSorting: true,
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
                  <label>Codigo <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.codigo}
                    onChange={(e) => updateField('codigo', e.target.value)}
                    placeholder="ej: grupo_cg"
                    disabled={modalMode === 'edit'}
                  />
                </div>
                <div className="form-group">
                  <label>Nombre Comercial <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.nombre_comercial}
                    onChange={(e) => updateField('nombre_comercial', e.target.value)}
                    placeholder="ej: GRUPO CG"
                  />
                </div>
              </div>
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
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label>Prioridad</label>
                  <input
                    type="number"
                    value={formData.prioridad}
                    onChange={(e) => updateField('prioridad', parseInt(e.target.value) || 99)}
                    min={1}
                    max={99}
                  />
                  <span className="gf-help-text">Menor = mayor prioridad en facturacion</span>
                </div>
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
                <div className="form-group">
                  <label>Prefijo Oferta</label>
                  <input
                    type="text"
                    value={formData.prefijo_oferta || ''}
                    onChange={(e) => updateField('prefijo_oferta', e.target.value)}
                    placeholder="Oferta de Locacion"
                  />
                </div>
              </div>

              {/* Valores legacy (mapeo) */}
              <h3 className="gf-section-title" style={{ marginTop: '24px' }}>
                Mapeo Legacy
                <span className="gf-help-text" style={{ marginLeft: '8px', fontWeight: 400 }}>Valores usados en tablas existentes</span>
              </h3>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label>Valor Vehiculo</label>
                  <input
                    type="text"
                    value={formData.valor_vehiculo || ''}
                    onChange={(e) => updateField('valor_vehiculo', e.target.value)}
                    placeholder="ej: GRUPO CG SAS"
                  />
                </div>
                <div className="form-group">
                  <label>Valor Propietario</label>
                  <input
                    type="text"
                    value={formData.valor_propietario || ''}
                    onChange={(e) => updateField('valor_propietario', e.target.value)}
                    placeholder="ej: grupo_cg"
                  />
                </div>
                <div className="form-group">
                  <label>Valor Socio</label>
                  <input
                    type="text"
                    value={formData.valor_socio || ''}
                    onChange={(e) => updateField('valor_socio', e.target.value)}
                    placeholder="ej: grupocg"
                  />
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
    </div>
  )
}
