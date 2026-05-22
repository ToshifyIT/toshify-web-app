import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Building2, UserCheck, Plus, Eye, Edit, Trash2, Car, FileText } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { DataTable } from '../../../components/ui/DataTable'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { ExcelColumnFilter, useExcelFilters } from '../../../components/ui/DataTable/ExcelColumnFilter'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import type { Titular, TitularFormData, TitularStats, VehiculoTitular } from './types/titulares.types'
import '../VehicleManagement.css'

const EMPTY_FORM: TitularFormData = {
  tipo: 'persona',
  dni_cuit: '',
  domicilio: '',
  email: '',
  telefono: '',
  nombres: '',
  apellidos: '',
  conyugue: '',
  dni_conyugue: '',
  nombre_conyugue: '',
  razon_social: '',
  representante_administrativo: '',
  dni_representante: '',
  email_representante: '',
  domicilio_fiscal: '',
}

export function TitularesModule() {
  const { user, profile } = useAuth()
  const { sedeActualId } = useSede()
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()

  const canEdit = canEditInMenu('vehiculos')
  const canCreate = canCreateInMenu('vehiculos')
  const canDelete = canDeleteInMenu('vehiculos')

  const [titulares, setTitulares] = useState<Titular[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showVehiculosModal, setShowVehiculosModal] = useState(false)
  const [selectedTitular, setSelectedTitular] = useState<Titular | null>(null)
  const [formData, setFormData] = useState<TitularFormData>({ ...EMPTY_FORM })
  const [vehiculosTitular, setVehiculosTitular] = useState<VehiculoTitular[]>([])

  // Filtros
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  const userName = (profile as any)?.full_name || user?.email || 'admin'
  const userId = user?.id || ''

  // ---------- Carga de datos ----------
  const loadTitulares = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('titulares')
        .select('*')
        .order('created_at', { ascending: false })

      if (sedeActualId) {
        query = query.or(`sede_id.eq.${sedeActualId},sede_id.is.null`)
      }

      const { data, error: err } = await query
      if (err) throw err
      setTitulares((data || []) as Titular[])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sedeActualId])

  useEffect(() => { loadTitulares() }, [loadTitulares])

  // ---------- Stats ----------
  const stats: TitularStats = useMemo(() => {
    const total = titulares.length
    const personas = titulares.filter(t => t.tipo === 'persona').length
    const empresas = titulares.filter(t => t.tipo === 'empresa').length
    const activos = titulares.filter(t => t.estado === 'activo').length
    return { total, personas, empresas, activos }
  }, [titulares])

  // ---------- Filtrado ----------
  const filteredTitulares = useMemo(() => {
    let result = titulares
    if (tipoFilter.length > 0) {
      result = result.filter(t => tipoFilter.includes(t.tipo))
    }
    if (estadoFilter.length > 0) {
      result = result.filter(t => estadoFilter.includes(t.estado))
    }
    return result
  }, [titulares, tipoFilter, estadoFilter])

  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    if (tipoFilter.length > 0) {
      filters.push({ id: 'tipo', label: `Tipo: ${tipoFilter.join(', ')}`, onClear: () => setTipoFilter([]) })
    }
    if (estadoFilter.length > 0) {
      filters.push({ id: 'estado', label: `Estado: ${estadoFilter.join(', ')}`, onClear: () => setEstadoFilter([]) })
    }
    return filters
  }, [tipoFilter, estadoFilter])

  const handleClearAllFilters = () => {
    setTipoFilter([])
    setEstadoFilter([])
  }

  // ---------- CRUD ----------
  const handleCreate = async () => {
    if (!formData.dni_cuit.trim()) {
      Swal.fire('Campo requerido', 'El DNI/CUIT es obligatorio.', 'warning')
      return
    }
    if (formData.tipo === 'persona' && (!formData.nombres.trim() || !formData.apellidos.trim())) {
      Swal.fire('Campos requeridos', 'Nombres y Apellidos son obligatorios para tipo Persona.', 'warning')
      return
    }
    if (formData.tipo === 'empresa' && !formData.razon_social.trim()) {
      Swal.fire('Campo requerido', 'Razón Social es obligatorio para tipo Empresa.', 'warning')
      return
    }

    setSaving(true)
    try {
      const insertData: Record<string, unknown> = {
        tipo: formData.tipo,
        dni_cuit: formData.dni_cuit.trim(),
        domicilio: formData.domicilio.trim() || null,
        email: formData.email.trim() || null,
        telefono: formData.telefono.trim() || null,
        estado: 'activo',
        sede_id: sedeActualId || null,
        created_by: userId,
        created_by_name: userName,
      }

      if (formData.tipo === 'persona') {
        insertData.nombres = formData.nombres.trim().toUpperCase()
        insertData.apellidos = formData.apellidos.trim().toUpperCase()
        insertData.conyugue = formData.conyugue.trim() || null
        insertData.dni_conyugue = formData.dni_conyugue.trim() || null
        insertData.nombre_conyugue = formData.nombre_conyugue.trim().toUpperCase() || null
      } else {
        insertData.razon_social = formData.razon_social.trim().toUpperCase()
        insertData.representante_administrativo = formData.representante_administrativo.trim().toUpperCase() || null
        insertData.dni_representante = formData.dni_representante.trim() || null
        insertData.email_representante = formData.email_representante.trim() || null
        insertData.domicilio_fiscal = formData.domicilio_fiscal.trim() || null
      }

      const { error: err } = await supabase.from('titulares').insert(insertData)
      if (err) throw err

      showSuccess('Titular creado correctamente')
      setShowCreateModal(false)
      setFormData({ ...EMPTY_FORM })
      loadTitulares()
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedTitular) return
    if (!formData.dni_cuit.trim()) {
      Swal.fire('Campo requerido', 'El DNI/CUIT es obligatorio.', 'warning')
      return
    }

    setSaving(true)
    try {
      const updateData: Record<string, unknown> = {
        tipo: formData.tipo,
        dni_cuit: formData.dni_cuit.trim(),
        domicilio: formData.domicilio.trim() || null,
        email: formData.email.trim() || null,
        telefono: formData.telefono.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (formData.tipo === 'persona') {
        updateData.nombres = formData.nombres.trim().toUpperCase()
        updateData.apellidos = formData.apellidos.trim().toUpperCase()
        updateData.conyugue = formData.conyugue.trim() || null
        updateData.dni_conyugue = formData.dni_conyugue.trim() || null
        updateData.nombre_conyugue = formData.nombre_conyugue.trim().toUpperCase() || null
        // Limpiar campos empresa
        updateData.razon_social = null
        updateData.representante_administrativo = null
        updateData.dni_representante = null
        updateData.email_representante = null
        updateData.domicilio_fiscal = null
      } else {
        updateData.razon_social = formData.razon_social.trim().toUpperCase()
        updateData.representante_administrativo = formData.representante_administrativo.trim().toUpperCase() || null
        updateData.dni_representante = formData.dni_representante.trim() || null
        updateData.email_representante = formData.email_representante.trim() || null
        updateData.domicilio_fiscal = formData.domicilio_fiscal.trim() || null
        // Limpiar campos persona
        updateData.nombres = null
        updateData.apellidos = null
        updateData.conyugue = null
        updateData.dni_conyugue = null
        updateData.nombre_conyugue = null
      }

      const { error: err } = await supabase.from('titulares').update(updateData).eq('id', selectedTitular.id)
      if (err) throw err

      showSuccess('Titular actualizado correctamente')
      setShowEditModal(false)
      setSelectedTitular(null)
      setFormData({ ...EMPTY_FORM })
      loadTitulares()
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (titular: Titular) => {
    const nombre = titular.tipo === 'persona'
      ? `${titular.nombres} ${titular.apellidos}`
      : titular.razon_social
    const confirm = await Swal.fire({
      title: 'Eliminar titular',
      html: `Se eliminará el titular <b>${nombre}</b>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    })
    if (!confirm.isConfirmed) return

    try {
      const { error: err } = await supabase.from('titulares').delete().eq('id', titular.id)
      if (err) throw err
      showSuccess('Titular eliminado')
      loadTitulares()
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error')
    }
  }

  const openEdit = (titular: Titular) => {
    setSelectedTitular(titular)
    setFormData({
      tipo: titular.tipo,
      dni_cuit: titular.dni_cuit || '',
      domicilio: titular.domicilio || '',
      email: titular.email || '',
      telefono: titular.telefono || '',
      nombres: titular.nombres || '',
      apellidos: titular.apellidos || '',
      conyugue: titular.conyugue || '',
      dni_conyugue: titular.dni_conyugue || '',
      nombre_conyugue: titular.nombre_conyugue || '',
      razon_social: titular.razon_social || '',
      representante_administrativo: titular.representante_administrativo || '',
      dni_representante: titular.dni_representante || '',
      email_representante: titular.email_representante || '',
      domicilio_fiscal: titular.domicilio_fiscal || '',
    })
    setShowEditModal(true)
  }

  const openDetail = (titular: Titular) => {
    setSelectedTitular(titular)
    setShowDetailModal(true)
  }

  const openVehiculos = async (titular: Titular) => {
    setSelectedTitular(titular)
    try {
      const { data } = await supabase
        .from('vehiculos_titulares')
        .select('*, vehiculos(patente, marca, modelo)')
        .eq('titular_id', titular.id)
        .order('activo', { ascending: false })
        .order('fecha_desde', { ascending: false })
      setVehiculosTitular((data || []) as VehiculoTitular[])
    } catch {
      setVehiculosTitular([])
    }
    setShowVehiculosModal(true)
  }

  // ---------- Helper de nombre ----------
  const getNombre = (t: Titular) => {
    if (t.tipo === 'persona') return `${t.nombres || ''} ${t.apellidos || ''}`.trim()
    return t.razon_social || ''
  }

  // ---------- Columnas ----------
  const tiposUnicos = ['persona', 'empresa']
  const estadosUnicos = useMemo(() => {
    const set = new Set<string>()
    titulares.forEach(t => { if (t.estado) set.add(t.estado) })
    return Array.from(set).sort()
  }, [titulares])

  const columns: ColumnDef<Titular, any>[] = useMemo(() => [
    {
      accessorKey: 'nombre_display',
      header: () => (
        <span>Nombre / Razón Social</span>
      ),
      cell: ({ row }) => {
        const t = row.original
        const nombre = getNombre(t)
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{nombre}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {t.dni_cuit}
            </div>
          </div>
        )
      },
      sortingFn: (a, b) => getNombre(a.original).localeCompare(getNombre(b.original)),
    },
    {
      accessorKey: 'tipo',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={tiposUnicos}
          selectedValues={tipoFilter}
          onSelectionChange={setTipoFilter}
          filterId="tipo"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const isPers = row.original.tipo === 'persona'
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 500,
            background: isPers ? '#dbeafe' : '#fef3c7',
            color: isPers ? '#1d4ed8' : '#92400e',
          }}>
            {isPers ? 'Persona' : 'Empresa'}
          </span>
        )
      },
    },
    {
      accessorKey: 'domicilio',
      header: 'Domicilio',
      cell: ({ row }) => {
        const t = row.original
        return t.tipo === 'empresa' ? (t.domicilio_fiscal || t.domicilio || 'N/A') : (t.domicilio || 'N/A')
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const t = row.original
        return t.tipo === 'empresa' ? (t.email_representante || t.email || 'N/A') : (t.email || 'N/A')
      },
    },
    {
      accessorKey: 'telefono',
      header: 'Teléfono',
      cell: ({ row }) => row.original.telefono || 'N/A',
    },
    {
      accessorKey: 'estado',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={estadosUnicos}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const estado = row.original.estado
        const isActivo = estado === 'activo'
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 500,
            background: isActivo ? '#d1fae5' : '#fee2e2',
            color: isActivo ? '#065f46' : '#991b1b',
          }}>
            {isActivo ? 'ACTIVO' : estado?.toUpperCase()}
          </span>
        )
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const actions = [
          {
            icon: <Eye size={15} />,
            label: 'Ver detalles',
            onClick: () => openDetail(row.original),
          },
          {
            icon: <Car size={15} />,
            label: 'Ver vehículos',
            onClick: () => openVehiculos(row.original),
          },
          {
            icon: <Edit size={15} />,
            label: 'Editar',
            onClick: () => openEdit(row.original),
            hidden: !canEdit,
          },
          {
            icon: <Trash2 size={15} />,
            label: 'Eliminar',
            onClick: () => handleDelete(row.original),
            hidden: !canDelete,
            variant: 'danger' as const,
          },
        ]
        return <ActionsMenu actions={actions} />
      },
    },
  ], [tipoFilter, estadoFilter, tiposUnicos, estadosUnicos, canEdit, canDelete, openFilterId])

  // ---------- Render Form ----------
  const renderForm = () => {
    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid var(--border-primary)',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontSize: '13px',
    }
    const labelStyle: React.CSSProperties = {
      fontSize: '12px',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      marginBottom: '4px',
      display: 'block',
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Tipo */}
        <div>
          <label style={labelStyle}>Tipo <span style={{ color: '#dc2626' }}>*</span></label>
          <select
            className="form-select"
            value={formData.tipo}
            onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'persona' | 'empresa' })}
            disabled={saving}
            style={inputStyle}
          >
            <option value="persona">Persona</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>

        {/* DNI/CUIT */}
        <div>
          <label style={labelStyle}>{formData.tipo === 'persona' ? 'DNI' : 'CUIT'} <span style={{ color: '#dc2626' }}>*</span></label>
          <input style={inputStyle} value={formData.dni_cuit} onChange={(e) => setFormData({ ...formData, dni_cuit: e.target.value })} disabled={saving} placeholder={formData.tipo === 'persona' ? 'Ej: 30123456' : 'Ej: 30-71834000-0'} />
        </div>

        {formData.tipo === 'persona' ? (
          <>
            {/* Campos persona */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Nombres <span style={{ color: '#dc2626' }}>*</span></label>
                <input style={inputStyle} value={formData.nombres} onChange={(e) => setFormData({ ...formData, nombres: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label style={labelStyle}>Apellidos <span style={{ color: '#dc2626' }}>*</span></label>
                <input style={inputStyle} value={formData.apellidos} onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })} disabled={saving} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Domicilio</label>
              <input style={inputStyle} value={formData.domicilio} onChange={(e) => setFormData({ ...formData, domicilio: e.target.value })} disabled={saving} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} disabled={saving} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Conyugue (tiene/no tiene)</label>
                <select style={inputStyle} value={formData.conyugue} onChange={(e) => setFormData({ ...formData, conyugue: e.target.value })} disabled={saving}>
                  <option value="">Seleccionar</option>
                  <option value="si">Tiene</option>
                  <option value="no">No tiene</option>
                </select>
              </div>
              {formData.conyugue === 'si' && (
                <>
                  <div>
                    <label style={labelStyle}>DNI Conyugue</label>
                    <input style={inputStyle} value={formData.dni_conyugue} onChange={(e) => setFormData({ ...formData, dni_conyugue: e.target.value })} disabled={saving} />
                  </div>
                </>
              )}
            </div>
            {formData.conyugue === 'si' && (
              <div>
                <label style={labelStyle}>Nombre y Apellidos Conyugue</label>
                <input style={inputStyle} value={formData.nombre_conyugue} onChange={(e) => setFormData({ ...formData, nombre_conyugue: e.target.value })} disabled={saving} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Campos empresa */}
            <div>
              <label style={labelStyle}>Razón Social <span style={{ color: '#dc2626' }}>*</span></label>
              <input style={inputStyle} value={formData.razon_social} onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })} disabled={saving} />
            </div>
            <div>
              <label style={labelStyle}>Representante Administrativo</label>
              <input style={inputStyle} value={formData.representante_administrativo} onChange={(e) => setFormData({ ...formData, representante_administrativo: e.target.value })} disabled={saving} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>DNI Representante</label>
                <input style={inputStyle} value={formData.dni_representante} onChange={(e) => setFormData({ ...formData, dni_representante: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label style={labelStyle}>Email Representante</label>
                <input style={inputStyle} type="email" value={formData.email_representante} onChange={(e) => setFormData({ ...formData, email_representante: e.target.value })} disabled={saving} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Domicilio Fiscal</label>
              <input style={inputStyle} value={formData.domicilio_fiscal} onChange={(e) => setFormData({ ...formData, domicilio_fiscal: e.target.value })} disabled={saving} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Email General</label>
                <input style={inputStyle} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} disabled={saving} />
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ---------- Render ----------
  return (
    <div className="veh-module">
      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Titulares</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.personas}</span>
              <span className="stat-label">Personas</span>
            </div>
          </div>
          <div className="stat-card">
            <Building2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.empresas}</span>
              <span className="stat-label">Empresas</span>
            </div>
          </div>
          <div className="stat-card">
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.activos}</span>
              <span className="stat-label">Activos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={filteredTitulares}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por nombre, DNI, CUIT, razón social..."
        emptyIcon={<Users size={64} />}
        emptyTitle="No hay titulares registrados"
        emptyDescription={canCreate ? 'Crea el primero usando el botón "+ Nuevo Titular".' : ''}
        headerAction={
          canCreate ? (
            <button className="btn-primary" onClick={() => { setFormData({ ...EMPTY_FORM }); setShowCreateModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={15} />
              Nuevo Titular
            </button>
          ) : undefined
        }
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
        stickyLeftColumns={1}
      />

      {/* Modal Crear */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Nuevo Titular</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {renderForm()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear Titular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && selectedTitular && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Editar Titular</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {renderForm()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn-primary" onClick={handleUpdate} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle */}
      {showDetailModal && selectedTitular && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Detalles del Titular</h3>
              <button className="modal-close" onClick={() => setShowDetailModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Tipo</label>
                  <div style={{ fontWeight: 500 }}>{selectedTitular.tipo === 'persona' ? 'Persona' : 'Empresa'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{selectedTitular.tipo === 'persona' ? 'DNI' : 'CUIT'}</label>
                  <div style={{ fontWeight: 500 }}>{selectedTitular.dni_cuit}</div>
                </div>

                {selectedTitular.tipo === 'persona' ? (
                  <>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Nombres</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.nombres || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Apellidos</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.apellidos || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Domicilio</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.domicilio || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Email</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.email || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Teléfono</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.telefono || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Conyugue</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.conyugue === 'si' ? `Sí - ${selectedTitular.nombre_conyugue || ''} (DNI: ${selectedTitular.dni_conyugue || 'N/A'})` : 'No tiene'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Razón Social</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.razon_social || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Representante Administrativo</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.representante_administrativo || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>DNI Representante</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.dni_representante || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Domicilio Fiscal</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.domicilio_fiscal || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Email Representante</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.email_representante || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Teléfono</label>
                      <div style={{ fontWeight: 500 }}>{selectedTitular.telefono || 'N/A'}</div>
                    </div>
                  </>
                )}

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Estado</label>
                  <div style={{ fontWeight: 500 }}>{selectedTitular.estado?.toUpperCase()}</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Creado</label>
                  <div style={{ fontWeight: 500 }}>{selectedTitular.created_at ? new Date(selectedTitular.created_at).toLocaleDateString('es-AR') : 'N/A'}</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDetailModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vehículos asociados */}
      {showVehiculosModal && selectedTitular && (
        <div className="modal-overlay" onClick={() => setShowVehiculosModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Vehículos de {getNombre(selectedTitular)}</h3>
              <button className="modal-close" onClick={() => setShowVehiculosModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ overflowX: 'auto' }}>
              {vehiculosTitular.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>
                  No hay vehículos asociados a este titular.
                </p>
              ) : (
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Patente</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Vehículo</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Desde</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Hasta</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Estado</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Reg. Oferta Locacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehiculosTitular.map(vt => (
                      <tr key={vt.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{vt.vehiculos?.patente || 'N/A'}</td>
                        <td style={{ padding: '8px' }}>{vt.vehiculos ? `${vt.vehiculos.marca} ${vt.vehiculos.modelo}` : 'N/A'}</td>
                        <td style={{ padding: '8px' }}>{vt.fecha_desde ? new Date(vt.fecha_desde).toLocaleDateString('es-AR') : 'N/A'}</td>
                        <td style={{ padding: '8px' }}>{vt.fecha_hasta ? new Date(vt.fecha_hasta).toLocaleDateString('es-AR') : 'Vigente'}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 500,
                            background: vt.activo ? '#d1fae5' : '#f3f4f6',
                            color: vt.activo ? '#065f46' : '#6b7280',
                          }}>
                            {vt.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            title="Registro de oferta locacion"
                            onClick={(e) => { e.stopPropagation() }}
                            style={{
                              background: 'none',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--text-secondary)',
                              fontSize: '12px',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <FileText size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowVehiculosModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
