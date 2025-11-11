// src/components/admin/RoleManagement.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types/database.types'

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
    icon: '🔑'
  })
  const [editRole, setEditRole] = useState({
    name: '',
    description: '',
    icon: '🔑'
  })

  const availableModules = ['vehiculos', 'conductores', 'usuarios', 'reportes']

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
      alert('El nombre del rol es requerido')
      return
    }

    setCreating(true)
    try {
      // Crear el rol
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert([{
          name: newRole.name.toLowerCase().trim(),
          description: newRole.description.trim() || null
        }])
        .select()
        .single()

      if (roleError) throw roleError

      // Crear permisos por defecto para cada módulo
      const defaultPermissions = availableModules.map(module => ({
        role_id: (roleData as Role).id,
        module: module,
        can_create: false,
        can_read: true,
        can_update: false,
        can_delete: false
      }))

      const { error: permError } = await supabase
        .from('permissions')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert(defaultPermissions)

      if (permError) throw permError

      alert('✅ Rol creado exitosamente con permisos por defecto')
      setShowCreateModal(false)
      setNewRole({ name: '', description: '', icon: '🔑' })
      await loadRoles()
    } catch (err: any) {
      console.error('Error creando rol:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleEditRole = async () => {
    if (!selectedRole || !editRole.name.trim()) {
      alert('El nombre del rol es requerido')
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

      alert('✅ Rol actualizado exitosamente')
      setShowEditModal(false)
      setSelectedRole(null)
      await loadRoles()
    } catch (err: any) {
      console.error('Error actualizando rol:', err)
      alert('❌ Error: ' + err.message)
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
        alert('❌ No se puede eliminar este rol porque tiene usuarios asignados')
        setShowDeleteModal(false)
        setSelectedRole(null)
        setCreating(false)
        return
      }

      // Eliminar permisos asociados primero
      const { error: permError } = await supabase
        .from('permissions')
        .delete()
        .eq('role_id', selectedRole.id)

      if (permError) throw permError

      // Eliminar el rol
      const { error: roleError } = await supabase
        .from('roles')
        .delete()
        .eq('id', selectedRole.id)

      if (roleError) throw roleError

      alert('✅ Rol eliminado exitosamente')
      setShowDeleteModal(false)
      setSelectedRole(null)
      await loadRoles()
    } catch (err: any) {
      console.error('Error eliminando rol:', err)
      alert('❌ Error: ' + err.message)
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

  const getRoleIcon = (roleName: string) => {
    // Emojis removidos - retornar cadena vacía
    return ''
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Cargando roles...</div>
  }

  return (
    <div>
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
          background: white;
          border: none;
          border-radius: 16px;
          padding: 28px;
          transition: all 0.3s ease;
          position: relative;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .role-card:hover {
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
          transform: translateY(-4px);
        }

        .role-icon {
          display: none;
        }

        .role-name {
          font-size: 18px;
          font-weight: 700;
          color: #1F2937;
          margin-bottom: 8px;
          text-transform: capitalize;
        }

        .role-description {
          font-size: 14px;
          color: #6B7280;
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
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
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
          background: #F9FAFB;
        }

        .btn-icon.btn-edit:hover {
          border-color: #3B82F6;
          color: #3B82F6;
        }

        .btn-icon.btn-delete:hover {
          border-color: #E63946;
          color: #E63946;
        }

        .btn-primary {
          padding: 12px 28px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
        }

        .btn-primary:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .btn-primary:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #6B7280;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #1F2937;
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: #E63946;
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
          border: 2px solid #E5E7EB;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .icon-option:hover {
          border-color: #E63946;
          transform: scale(1.1);
        }

        .icon-option.selected {
          border-color: #E63946;
          background: #FEE2E2;
        }

        .delete-warning {
          background: #FEF2F2;
          border: 1px solid #FEE2E2;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .delete-warning-title {
          color: #DC2626;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .delete-warning-text {
          color: #7F1D1D;
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

      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Roles del Sistema
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          {roles.length} rol{roles.length !== 1 ? 'es' : ''} configurado{roles.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Action Button */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
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
                ✏️ Editar
              </button>
              <button
                className="btn-icon btn-delete"
                onClick={() => openDeleteModal(role)}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal para crear rol */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Crear Nuevo Rol
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
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
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#1E40AF'
            }}>
              <strong>ℹ️ Nota:</strong> Se crearán permisos por defecto (solo lectura) para todos los módulos. Podrás editarlos en la pestaña "Permisos".
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewRole({ name: '', description: '', icon: '🔑' })
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
        <div className="modal-overlay" onClick={() => !creating && setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Editar Rol
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
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
        <div className="modal-overlay" onClick={() => !creating && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: '#DC2626' }}>
              Eliminar Rol
            </h2>

            <div className="delete-warning">
              <div className="delete-warning-title">⚠️ Advertencia</div>
              <div className="delete-warning-text">
                Estás a punto de eliminar el rol "<strong>{selectedRole.name}</strong>".
                Esta acción eliminará también todos los permisos asociados y es <strong>irreversible</strong>.
              </div>
            </div>

            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
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
                style={{ background: '#DC2626' }}
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
