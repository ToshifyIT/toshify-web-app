// src/components/admin/ZonaTiposManager.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, AlertTriangle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../ui/LoadingOverlay'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import './AdminStyles.css'

interface ZonaTipo {
  id: string
  codigo: string
  nombre: string
  color: string
  descripcion: string | null
  activo: boolean
  created_at: string
}

interface Props {
  onClose: () => void
  onUpdate: () => void
}

// Default colors for selection
const DEFAULT_COLORS = [
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#7C3AED', // Purple
]

export function ZonaTiposManager({ onClose, onUpdate }: Props) {
  const [tipos, setTipos] = useState<ZonaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [selectedTipo, setSelectedTipo] = useState<ZonaTipo | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    color: '#EF4444',
    descripcion: ''
  })

  useEffect(() => {
    loadTipos()
  }, [])

  const loadTipos = async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase as any)
        .from('zonas_tipos')
        .select('*')
        .order('nombre')

      if (error) throw error
      setTipos(data || [])
    } catch (err) {
      console.error('Error cargando tipos:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      codigo: '',
      nombre: '',
      color: '#EF4444',
      descripcion: ''
    })
  }

  const handleCreate = async () => {
    if (!formData.codigo.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El codigo es requerido' })
      return
    }
    if (!formData.nombre.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El nombre es requerido' })
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from('zonas_tipos')
        .insert([{
          codigo: formData.codigo.toLowerCase().trim().replace(/\s+/g, '_'),
          nombre: formData.nombre.trim(),
          color: formData.color,
          descripcion: formData.descripcion.trim() || null
        }])

      if (error) throw error

      showSuccess('Tipo Creado', 'El tipo de zona se ha creado exitosamente')
      setShowCreateForm(false)
      resetForm()
      await loadTipos()
      onUpdate()
    } catch (err: any) {
      console.error('Error creando tipo:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedTipo) return

    if (!formData.codigo.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El codigo es requerido' })
      return
    }
    if (!formData.nombre.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El nombre es requerido' })
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from('zonas_tipos')
        .update({
          codigo: formData.codigo.toLowerCase().trim().replace(/\s+/g, '_'),
          nombre: formData.nombre.trim(),
          color: formData.color,
          descripcion: formData.descripcion.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTipo.id)

      if (error) throw error

      showSuccess('Tipo Actualizado', 'El tipo de zona se ha actualizado exitosamente')
      setShowEditForm(false)
      setSelectedTipo(null)
      resetForm()
      await loadTipos()
      onUpdate()
    } catch (err: any) {
      console.error('Error actualizando tipo:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedTipo) return

    setSaving(true)
    try {
      // Check if there are zones using this type
      const { data: zones, error: checkError } = await (supabase as any)
        .from('zonas_peligrosas')
        .select('id')
        .eq('tipo_id', selectedTipo.id)
        .limit(1)

      if (checkError) throw checkError

      if (zones && zones.length > 0) {
        Swal.fire({
          icon: 'warning',
          title: 'No se puede eliminar',
          text: 'Este tipo tiene zonas asociadas. Elimina o reasigna las zonas primero.'
        })
        setShowDeleteConfirm(false)
        setSelectedTipo(null)
        setSaving(false)
        return
      }

      const { error } = await (supabase as any)
        .from('zonas_tipos')
        .delete()
        .eq('id', selectedTipo.id)

      if (error) throw error

      showSuccess('Tipo Eliminado', 'El tipo de zona se ha eliminado exitosamente')
      setShowDeleteConfirm(false)
      setSelectedTipo(null)
      await loadTipos()
      onUpdate()
    } catch (err: any) {
      console.error('Error eliminando tipo:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const openEditForm = (tipo: ZonaTipo) => {
    setSelectedTipo(tipo)
    setFormData({
      codigo: tipo.codigo,
      nombre: tipo.nombre,
      color: tipo.color,
      descripcion: tipo.descripcion || ''
    })
    setShowEditForm(true)
  }

  const openDeleteConfirm = (tipo: ZonaTipo) => {
    setSelectedTipo(tipo)
    setShowDeleteConfirm(true)
  }

  return (
    <div className="rm-modal-overlay" onClick={onClose}>
      <div className="rm-modal-content zona-tipos-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zona-tipos-header">
          <h2 className="rm-modal-title">Tipos de Zona</h2>
          <button className="zona-tipos-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="zona-tipos-loading">
            <Spinner size="md" />
            <span>Cargando tipos...</span>
          </div>
        ) : (
          <>
            <div className="zona-tipos-actions">
              <button
                className="btn-primary btn-sm"
                onClick={() => { resetForm(); setShowCreateForm(true) }}
              >
                <Plus size={16} /> Nuevo Tipo
              </button>
            </div>

            <div className="zona-tipos-list">
              {tipos.length === 0 ? (
                <div className="zona-tipos-empty">
                  No hay tipos de zona registrados
                </div>
              ) : (
                tipos.map(tipo => (
                  <div key={tipo.id} className={`zona-tipo-card ${!tipo.activo ? 'inactive' : ''}`}>
                    <div className="zona-tipo-color" style={{ backgroundColor: tipo.color }} />
                    <div className="zona-tipo-info">
                      <div className="zona-tipo-name">{tipo.nombre}</div>
                      <div className="zona-tipo-code">{tipo.codigo}</div>
                      {tipo.descripcion && (
                        <div className="zona-tipo-desc">{tipo.descripcion}</div>
                      )}
                    </div>
                    <div className="zona-tipo-actions">
                      <button
                        className="btn-icon btn-edit"
                        onClick={() => openEditForm(tipo)}
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn-icon btn-delete"
                        onClick={() => openDeleteConfirm(tipo)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="zona-tipos-footer">
              <button className="btn-secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="zona-tipos-form-overlay">
            <div className="zona-tipos-form">
              <h3>Nuevo Tipo de Zona</h3>

              <div className="form-group">
                <label className="form-label">Codigo *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  placeholder="Ej: peligrosa, restringida"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Zona Peligrosa"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="zona-color-picker">
                  {DEFAULT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`zona-color-option ${formData.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                      disabled={saving}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="zona-color-input"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Descripcion</label>
                <textarea
                  className="form-input"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Descripcion del tipo de zona..."
                  rows={2}
                  disabled={saving}
                />
              </div>

              <div className="zona-tipos-form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => { setShowCreateForm(false); resetForm() }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreate}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Form */}
        {showEditForm && selectedTipo && (
          <div className="zona-tipos-form-overlay">
            <div className="zona-tipos-form">
              <h3>Editar Tipo de Zona</h3>

              <div className="form-group">
                <label className="form-label">Codigo *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="zona-color-picker">
                  {DEFAULT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`zona-color-option ${formData.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                      disabled={saving}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="zona-color-input"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Descripcion</label>
                <textarea
                  className="form-input"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={2}
                  disabled={saving}
                />
              </div>

              <div className="zona-tipos-form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => { setShowEditForm(false); setSelectedTipo(null); resetForm() }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleEdit}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {showDeleteConfirm && selectedTipo && (
          <div className="zona-tipos-form-overlay">
            <div className="zona-tipos-form">
              <h3 style={{ color: 'var(--color-danger)' }}>Eliminar Tipo</h3>

              <div className="rm-delete-warning">
                <div className="rm-delete-warning-title">
                  <AlertTriangle size={20} /> Advertencia
                </div>
                <div className="rm-delete-warning-text">
                  Estas a punto de eliminar el tipo "<strong>{selectedTipo.nombre}</strong>".
                  Esta accion es <strong>irreversible</strong>.
                </div>
              </div>

              <div className="zona-tipos-form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => { setShowDeleteConfirm(false); setSelectedTipo(null) }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary btn-danger"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {saving ? 'Eliminando...' : 'Si, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
