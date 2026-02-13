/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/sedes/SedesModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Building2, Plus, Edit2, Trash2, Eye, MapPin, Check, X } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'

interface Sede {
  id: string
  nombre: string
  codigo: string
  pais: string
  ciudad: string
  direccion: string | null
  telefono: string | null
  email: string | null
  es_principal: boolean
  activa: boolean
  created_at: string
  updated_at: string
}

const initialFormData = {
  nombre: '',
  codigo: '',
  pais: 'Argentina',
  ciudad: '',
  direccion: '',
  telefono: '',
  email: '',
  es_principal: false,
  activa: true,
}

export function SedesModule() {
  const { canCreateInSubmenu, canEditInSubmenu, canDeleteInSubmenu } = usePermissions()
  const { sedes: sedesContext } = useSede()
  const canCreate = canCreateInSubmenu('sedes')
  const canEdit = canEditInSubmenu('sedes')
  const canDelete = canDeleteInSubmenu('sedes')

  const [sedes, setSedes] = useState<Sede[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedSede, setSelectedSede] = useState<Sede | null>(null)
  const [formData, setFormData] = useState(initialFormData)
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Stats
  const stats = useMemo(() => {
    const total = sedes.length
    const activas = sedes.filter(s => s.activa).length
    const inactivas = total - activas
    const principal = sedes.find(s => s.es_principal)
    return { total, activas, inactivas, principal: principal?.nombre || '-' }
  }, [sedes])

  // Filtro
  const filteredSedes = useMemo(() => {
    if (activeFilter === 'active') return sedes.filter(s => s.activa)
    if (activeFilter === 'inactive') return sedes.filter(s => !s.activa)
    return sedes
  }, [sedes, activeFilter])

  // Cargar sedes
  const cargarSedes = async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase
        .from('sedes') as any)
        .select('*')
        .order('es_principal', { ascending: false })
        .order('nombre')

      if (error) throw error
      setSedes(data || [])
    } catch (error) {
      console.error('Error cargando sedes:', error)
      Swal.fire('Error', 'No se pudieron cargar las sedes', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarSedes()
  }, [])

  // Crear sede
  const handleCreate = async () => {
    if (!formData.nombre.trim() || !formData.codigo.trim() || !formData.ciudad.trim()) {
      Swal.fire('Campos requeridos', 'Nombre, código y ciudad son obligatorios', 'warning')
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase
        .from('sedes') as any)
        .insert({
          nombre: formData.nombre.trim(),
          codigo: formData.codigo.trim().toUpperCase(),
          pais: formData.pais.trim() || 'Argentina',
          ciudad: formData.ciudad.trim(),
          direccion: formData.direccion.trim() || null,
          telefono: formData.telefono.trim() || null,
          email: formData.email.trim() || null,
          es_principal: formData.es_principal,
          activa: formData.activa,
        })

      if (error) throw error

      showSuccess('Sede creada')
      setShowCreateModal(false)
      setFormData(initialFormData)
      cargarSedes()
    } catch (error: any) {
      if (error?.code === '23505') {
        Swal.fire('Error', 'Ya existe una sede con ese código', 'error')
      } else {
        console.error('Error creando sede:', error)
        Swal.fire('Error', 'No se pudo crear la sede', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  // Editar sede
  const handleEdit = async () => {
    if (!selectedSede) return
    if (!formData.nombre.trim() || !formData.codigo.trim() || !formData.ciudad.trim()) {
      Swal.fire('Campos requeridos', 'Nombre, código y ciudad son obligatorios', 'warning')
      return
    }

    setSaving(true)
    try {
      // Si se marca como principal, desmarcar las demás
      if (formData.es_principal && !selectedSede.es_principal) {
        await (supabase
          .from('sedes') as any)
          .update({ es_principal: false })
          .neq('id', selectedSede.id)
      }

      const { error } = await (supabase
        .from('sedes') as any)
        .update({
          nombre: formData.nombre.trim(),
          codigo: formData.codigo.trim().toUpperCase(),
          pais: formData.pais.trim() || 'Argentina',
          ciudad: formData.ciudad.trim(),
          direccion: formData.direccion.trim() || null,
          telefono: formData.telefono.trim() || null,
          email: formData.email.trim() || null,
          es_principal: formData.es_principal,
          activa: formData.activa,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedSede.id)

      if (error) throw error

      showSuccess('Sede actualizada')
      setShowEditModal(false)
      setSelectedSede(null)
      setFormData(initialFormData)
      cargarSedes()
    } catch (error: any) {
      if (error?.code === '23505') {
        Swal.fire('Error', 'Ya existe una sede con ese código', 'error')
      } else {
        console.error('Error actualizando sede:', error)
        Swal.fire('Error', 'No se pudo actualizar la sede', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  // Eliminar (desactivar) sede
  const handleDelete = async (sede: Sede) => {
    if (sede.es_principal) {
      Swal.fire('No permitido', 'No se puede desactivar la sede principal', 'warning')
      return
    }

    // Verificar si tiene registros asociados
    const { data: conductoresCount } = await (supabase
      .from('conductores') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sede_id', sede.id)

    const count = conductoresCount?.length || 0

    const result = await Swal.fire({
      title: '¿Desactivar sede?',
      html: `Se desactivará la sede <strong>${sede.nombre}</strong>.${count > 0 ? `<br><br><span style="color: var(--color-warning)">Tiene ${count} conductor(es) asociados.</span>` : ''}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: 'Desactivar',
      cancelButtonText: 'Cancelar',
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('sedes') as any)
        .update({ activa: false, updated_at: new Date().toISOString() })
        .eq('id', sede.id)

      if (error) throw error
      showSuccess('Sede desactivada')
      cargarSedes()
    } catch (error) {
      console.error('Error desactivando sede:', error)
      Swal.fire('Error', 'No se pudo desactivar la sede', 'error')
    }
  }

  // Reactivar sede
  const handleReactivar = async (sede: Sede) => {
    try {
      const { error } = await (supabase
        .from('sedes') as any)
        .update({ activa: true, updated_at: new Date().toISOString() })
        .eq('id', sede.id)

      if (error) throw error
      showSuccess('Sede reactivada')
      cargarSedes()
    } catch (error) {
      console.error('Error reactivando sede:', error)
      Swal.fire('Error', 'No se pudo reactivar la sede', 'error')
    }
  }

  // Abrir edit modal
  const openEditModal = (sede: Sede) => {
    setSelectedSede(sede)
    setFormData({
      nombre: sede.nombre,
      codigo: sede.codigo,
      pais: sede.pais,
      ciudad: sede.ciudad,
      direccion: sede.direccion || '',
      telefono: sede.telefono || '',
      email: sede.email || '',
      es_principal: sede.es_principal,
      activa: sede.activa,
    })
    setShowEditModal(true)
  }

  // Abrir view modal
  const openViewModal = (sede: Sede) => {
    setSelectedSede(sede)
    setShowViewModal(true)
  }

  // Columnas
  const columns: ColumnDef<Sede>[] = useMemo(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building2 size={16} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontWeight: 600 }}>{row.original.nombre}</span>
          {row.original.es_principal && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 600,
            }}>
              PRINCIPAL
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'codigo',
      header: 'Código',
      cell: ({ row }) => (
        <span style={{
          fontFamily: 'monospace',
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}>
          {row.original.codigo}
        </span>
      ),
    },
    {
      accessorKey: 'pais',
      header: 'País',
    },
    {
      accessorKey: 'ciudad',
      header: 'Ciudad',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={14} style={{ color: 'var(--text-secondary)' }} />
          {row.original.ciudad}
        </div>
      ),
    },
    {
      accessorKey: 'telefono',
      header: 'Teléfono',
      cell: ({ row }) => row.original.telefono || '-',
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'activa',
      header: 'Estado',
      cell: ({ row }) => (
        <span style={{
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 600,
          background: row.original.activa ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: row.original.activa ? '#10B981' : '#EF4444',
        }}>
          {row.original.activa ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const sede = row.original
        return (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => openViewModal(sede)}
              title="Ver detalle"
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Eye size={14} />
            </button>
            {canEdit && (
              <button
                onClick={() => openEditModal(sede)}
                title="Editar"
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Edit2 size={14} />
              </button>
            )}
            {canDelete && !sede.es_principal && sede.activa && (
              <button
                onClick={() => handleDelete(sede)}
                title="Desactivar"
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#EF4444',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
            {canEdit && !sede.activa && (
              <button
                onClick={() => handleReactivar(sede)}
                title="Reactivar"
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  border: '1px solid #10B981',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Check size={14} />
              </button>
            )}
          </div>
        )
      },
    },
  ], [canEdit, canDelete])

  // Render form fields (shared between create & edit)
  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            Nombre *
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Ej: CABA"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            Código * <span style={{ fontWeight: 400, fontSize: '11px' }}>(único, ej: BRC)</span>
          </label>
          <input
            type="text"
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            placeholder="Ej: BRC"
            maxLength={10}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            País
          </label>
          <input
            type="text"
            value={formData.pais}
            onChange={(e) => setFormData({ ...formData, pais: e.target.value })}
            placeholder="Argentina"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            Ciudad *
          </label>
          <input
            type="text"
            value={formData.ciudad}
            onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
            placeholder="Ej: San Carlos de Bariloche"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          />
        </div>
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
          Dirección
        </label>
        <input
          type="text"
          value={formData.direccion}
          onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
          placeholder="Dirección de la sede"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: '8px',
            border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: '14px',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            Teléfono
          </label>
          <input
            type="text"
            value={formData.telefono}
            onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
            placeholder="Ej: +54 11 1234-5678"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="sede@toshify.com.ar"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={formData.es_principal}
            onChange={(e) => setFormData({ ...formData, es_principal: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Sede principal
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={formData.activa}
            onChange={(e) => setFormData({ ...formData, activa: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: '#10B981' }}
          />
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Activa
          </span>
        </label>
      </div>
    </div>
  )

  // Modal overlay style
  const modalOverlay: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1000, padding: '20px',
  }
  const modalContent: React.CSSProperties = {
    background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px',
    width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  }

  if (loading) return <LoadingOverlay show={true} message="Cargando sedes..." />

  // Check context connection
  void sedesContext

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Sedes
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Gestión de sedes y sucursales
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setFormData(initialFormData); setShowCreateModal(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              background: 'var(--color-primary)', color: '#fff',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Nueva Sede
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: stats.total, color: 'var(--color-primary)', filter: 'all' as const },
          { label: 'Activas', value: stats.activas, color: '#10B981', filter: 'active' as const },
          { label: 'Inactivas', value: stats.inactivas, color: '#EF4444', filter: 'inactive' as const },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setActiveFilter(activeFilter === s.filter ? 'all' : s.filter)}
            style={{
              padding: '16px', borderRadius: '12px',
              border: activeFilter === s.filter ? `2px solid ${s.color}` : '1px solid var(--border-primary)',
              background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
          </button>
        ))}
        <div style={{
          padding: '16px', borderRadius: '12px',
          border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Principal</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{stats.principal}</div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredSedes}
        loading={loading}
        emptyIcon={<Building2 size={64} />}
        emptyTitle="No hay sedes"
        emptyDescription="Crea la primera sede para comenzar"
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div style={modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Nueva Sede
              </h2>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            {renderForm()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'Crear Sede'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedSede && (
        <div style={modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Editar Sede
              </h2>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            {renderForm()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedSede && (
        <div style={modalOverlay} onClick={() => setShowViewModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Detalle de Sede
              </h2>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Nombre', value: selectedSede.nombre },
                { label: 'Código', value: selectedSede.codigo },
                { label: 'País', value: selectedSede.pais },
                { label: 'Ciudad', value: selectedSede.ciudad },
                { label: 'Dirección', value: selectedSede.direccion || '-' },
                { label: 'Teléfono', value: selectedSede.telefono || '-' },
                { label: 'Email', value: selectedSede.email || '-' },
                { label: 'Principal', value: selectedSede.es_principal ? 'Sí' : 'No' },
                { label: 'Estado', value: selectedSede.activa ? 'Activa' : 'Inactiva' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px' }}>
                  <span style={{ width: '120px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => setShowViewModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
