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
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Cargando roles...</div>
  }

  return (
    <div className="admin-module">
      <style>{`
        .roles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 24px;
          margin-top: 0;
          max-width: 1200px;
          margin-left: auto;
          margin-right: auto;
        }

        .role-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-primary);
          border-radius: 16px;
          padding: 28px;
          transition: all 0.3s ease;
          position: relative;
          box-shadow: var(--shadow-sm);
        }

        .role-card:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-4px);
        }

        .role-icon {
          display: none;
        }

        .role-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
          text-transform: capitalize;
        }

        .role-description {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .role-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .btn-icon {
          flex: 1;
          padding: 8px;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .btn-icon:hover {
          background: var(--bg-secondary);
        }

        .btn-icon.btn-edit:hover {
          border-color: var(--color-info);
          color: var(--color-info);
        }

        .btn-icon.btn-delete:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .rm-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg-overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .rm-modal-content {
          background: var(--modal-bg);
          padding: 40px;
          border-radius: 16px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border-primary);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--input-border);
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          background: var(--input-bg);
          color: var(--text-primary);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: var(--input-focus-shadow);
        }

        .rm-action-bar {
          margin-bottom: 24px;
          display: flex;
          justify-content: flex-end;
        }

        .icon-selector {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .icon-option {
          width: 44px;
          height: 44px;
          border: 2px solid var(--border-primary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--bg-primary);
        }

        .icon-option:hover {
          border-color: var(--color-primary);
          transform: scale(1.1);
        }

        .icon-option.selected {
          border-color: var(--color-primary);
          background: var(--color-primary-light);
        }

        .delete-warning {
          background: var(--badge-red-bg);
          border: 1px solid var(--color-danger-light);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .delete-warning-title {
          color: var(--color-danger);
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .delete-warning-text {
          color: var(--color-danger-dark);
          font-size: 14px;
          line-height: 1.6;
        }

        @media (max-width: 768px) {
          .roles-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 16px;
          }
          .role-card {
            padding: 20px;
          }
          .role-icon {
            width: 44px;
            height: 44px;
            font-size: 22px;
          }
          .role-name {
            font-size: 16px;
          }
          .role-description {
            font-size: 13px;
          }
        }

        @media (max-width: 480px) {
          .roles-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .role-card {
            padding: 16px;
          }
          .role-icon {
            width: 40px;
            height: 40px;
            font-size: 20px;
          }
          .role-name {
            font-size: 15px;
          }
          .role-description {
            font-size: 12px;
          }
        }
      `}</style>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
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
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Crear Nuevo Rol
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
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

            <div style={{
              background: 'var(--badge-blue-bg)',
              border: '1px solid var(--color-info-light)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--badge-blue-text)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Nota:</strong> Se crearán permisos por defecto (solo lectura) para todos los módulos. Podrás editarlos en la pestaña "Permisos".
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
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
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Editar Rol
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
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

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
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
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: 'var(--color-danger)' }}>
              Eliminar Rol
            </h2>

            <div className="delete-warning">
              <div className="delete-warning-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} /> Advertencia
              </div>
              <div className="delete-warning-text">
                Estás a punto de eliminar el rol "<strong>{selectedRole.name}</strong>".
                Esta acción eliminará también todos los permisos asociados y es <strong>irreversible</strong>.
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              ¿Estás seguro de que deseas continuar?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
                className="btn-primary"
                onClick={handleDeleteRole}
                disabled={creating}
                style={{ background: 'var(--color-danger)' }}
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
