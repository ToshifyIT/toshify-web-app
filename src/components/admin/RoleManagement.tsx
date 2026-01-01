// src/components/admin/RoleManagement.tsx
import { useState, useEffect } from 'react'
import { AlertTriangle, Edit2, Trash2, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types/database.types'
import Swal from 'sweetalert2'
import './AdminStyles.css'

// @ts-nocheck en operaciones de base de datos por problemas de tipos generados

export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    icon: ''
  })
  const [editRole, setEditRole] = useState({
    name: '',
    description: '',
    icon: ''
  })

  // const availableModules = ['vehiculos', 'conductores', 'usuarios', 'reportes']

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name')

      if (error) throw error
      setRoles(data)
    } catch (err) {
      console.error('Error cargando roles:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRole = async () => {
    if (!newRole.name.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Campo Requerido',
        text: 'El nombre del rol es requerido'
      })
      return
    }

    setCreating(true)
    try {
      // Crear el rol
      const { error: roleError } = await supabase
        .from('roles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert([{
          name: newRole.name.toLowerCase().trim(),
          description: newRole.description.trim() || null
        }])
        .select()
        .single()

      if (roleError) throw roleError

      // Nota: Los permisos ahora se manejan a través de role_menu_permissions
      // No necesitamos crear permisos por defecto aquí

      await Swal.fire({
        icon: 'success',
        title: 'Rol Creado',
        text: 'El rol se ha creado exitosamente',
        showConfirmButton: false,
        timer: 2000
      })
      setShowCreateModal(false)
      setNewRole({ name: '', description: '', icon: '' })
      await loadRoles()
    } catch (err: any) {
      console.error('Error creando rol:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message
      })
    } finally {
      setCreating(false)
    }
  }

  const handleEditRole = async () => {
    if (!selectedRole || !editRole.name.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Campo Requerido',
        text: 'El nombre del rol es requerido'
      })
      return
    }

    setCreating(true)
    try {
      const { error } = await supabase
        .from('roles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({
          name: editRole.name.toLowerCase().trim(),
          description: editRole.description.trim() || null
        })
        .eq('id', selectedRole.id)

      if (error) throw error

      await Swal.fire({
        icon: 'success',
        title: 'Rol Actualizado',
        text: 'El rol se ha actualizado exitosamente',
        showConfirmButton: false,
        timer: 2000
      })
      setShowEditModal(false)
      setSelectedRole(null)
      await loadRoles()
    } catch (err: any) {
      console.error('Error actualizando rol:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteRole = async () => {
    if (!selectedRole) return

    setCreating(true)
    try {
      // Verificar si hay usuarios con este rol
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('role_id', selectedRole.id)
        .limit(1)

      if (usersError) throw usersError

      if (users && users.length > 0) {
        Swal.fire({
          icon: 'warning',
          title: 'No se puede eliminar',
          text: 'Este rol tiene usuarios asignados'
        })
        setShowDeleteModal(false)
        setSelectedRole(null)
        setCreating(false)
        return
      }

      // Nota: Ya no necesitamos eliminar de 'permissions' porque usamos role_menu_permissions
      // y tiene ON DELETE CASCADE configurado

      // Eliminar el rol
      const { error: roleError } = await supabase
        .from('roles')
        .delete()
        .eq('id', selectedRole.id)

      if (roleError) throw roleError

      await Swal.fire({
        icon: 'success',
        title: 'Rol Eliminado',
        text: 'El rol se ha eliminado exitosamente',
        showConfirmButton: false,
        timer: 2000
      })
      setShowDeleteModal(false)
      setSelectedRole(null)
      await loadRoles()
    } catch (err: any) {
      console.error('Error eliminando rol:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message
      })
    } finally {
      setCreating(false)
    }
  }

  const openEditModal = (role: Role) => {
    setSelectedRole(role)
    setEditRole({
      name: role.name,
      description: role.description || '',
      icon: getRoleIcon(role.name)
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (role: Role) => {
    setSelectedRole(role)
    setShowDeleteModal(true)
  }

  const getRoleIcon = (_roleName: string) => {
    // Emojis removidos - retornar cadena vacía
    return ''
  }

  if (loading) {
    return <div className="dt-loading">Cargando roles...</div>
  }

  return (
    <div className="admin-module">
      {/* Action buttons */}
      <div className="rm-action-bar">
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear Rol
        </button>
      </div>

      {/* Grid de roles */}
      <div className="roles-grid">
        {roles.map((role) => (
          <div key={role.id} className="role-card">
            <div className="role-icon">
              {getRoleIcon(role.name)}
            </div>
            <h3 className="role-name">{role.name}</h3>
            <p className="role-description">{role.description || 'Sin descripción'}</p>
            <div className="role-actions">
              <button
                className="btn-icon btn-edit"
                onClick={() => openEditModal(role)}
              >
                <Edit2 size={16} /> Editar
              </button>
              <button
                className="btn-icon btn-delete"
                onClick={() => openDeleteModal(role)}
              >
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal para crear rol */}
      {showCreateModal && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="rm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title">Crear Nuevo Rol</h2>
            <p className="rm-modal-subtitle">
              Define un nuevo rol con sus permisos por defecto
            </p>

            <div className="form-group">
              <label className="form-label">Nombre del Rol *</label>
              <input
                type="text"
                className="form-input"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="ejemplo: gerente, asistente, etc."
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="form-input"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                placeholder="Describe las responsabilidades de este rol..."
                rows={3}
                disabled={creating}
              />
            </div>

            <div className="rm-info-box">
              <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Nota:</strong> Se crearán permisos por defecto (solo lectura) para todos los módulos. Podrás editarlos en la pestaña "Permisos".
              </div>
            </div>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewRole({ name: '', description: '', icon: '' })
                }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateRole}
                disabled={creating}
              >
                {creating ? 'Creando...' : 'Crear Rol'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar rol */}
      {showEditModal && selectedRole && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowEditModal(false)}>
          <div className="rm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title">Editar Rol</h2>
            <p className="rm-modal-subtitle">
              Modifica la información del rol "{selectedRole.name}"
            </p>

            <div className="form-group">
              <label className="form-label">Nombre del Rol *</label>
              <input
                type="text"
                className="form-input"
                value={editRole.name}
                onChange={(e) => setEditRole({ ...editRole, name: e.target.value })}
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="form-input"
                value={editRole.description}
                onChange={(e) => setEditRole({ ...editRole, description: e.target.value })}
                placeholder="Describe las responsabilidades de este rol..."
                rows={3}
                disabled={creating}
              />
            </div>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedRole(null)
                }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleEditRole}
                disabled={creating}
              >
                {creating ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para eliminar rol */}
      {showDeleteModal && selectedRole && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowDeleteModal(false)}>
          <div className="rm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title rm-modal-title-danger">Eliminar Rol</h2>

            <div className="rm-delete-warning">
              <div className="rm-delete-warning-title">
                <AlertTriangle size={20} /> Advertencia
              </div>
              <div className="rm-delete-warning-text">
                Estás a punto de eliminar el rol "<strong>{selectedRole.name}</strong>".
                Esta acción eliminará también todos los permisos asociados y es <strong>irreversible</strong>.
              </div>
            </div>

            <p className="rm-modal-subtitle">
              ¿Estás seguro de que deseas continuar?
            </p>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedRole(null)
                }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary btn-danger"
                onClick={handleDeleteRole}
                disabled={creating}
              >
                {creating ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
