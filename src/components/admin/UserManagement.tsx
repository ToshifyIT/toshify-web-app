// src/components/admin/UserManagement.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Role } from '../../types/database.types'

export function UserManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    roleId: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
  console.log('📥 Cargando datos...')
  setLoading(true)
  setError('')
  
  try {
    const { data: usersData, error: usersError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        roles (*)
      `)
      .order('created_at', { ascending: false })

    console.log('👥 Usuarios cargados:', usersData)
    console.log('⚠️ Error usuarios:', usersError)

    if (usersError) throw usersError

    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .order('name')

    console.log('🏷️ Roles cargados:', rolesData)
    console.log('⚠️ Error roles:', rolesError)

    if (rolesError) throw rolesError

    setUsers(usersData as UserWithRole[])
    setRoles(rolesData)
    console.log('✅ Estado actualizado')
  } catch (err: any) {
    console.error('❌ Error cargando datos:', err)
    setError(err.message)
  } finally {
    setLoading(false)
  }
}

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      alert('Complete todos los campos requeridos')
      return
    }

    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(newUser)
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error creando usuario')
      }

      alert('✅ Usuario creado exitosamente')
      setShowCreateModal(false)
      setNewUser({ email: '', password: '', fullName: '', roleId: '' })
      await loadData()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

const handleRoleChange = async (userId: string, newRoleId: string) => {
  console.log('🔄 Intentando cambiar rol:', { userId, newRoleId })
  
  try {
    // Verificar que hay un rol seleccionado
    if (!newRoleId) {
      console.log('⚠️ No se seleccionó rol')
      alert('Selecciona un rol válido')
      return
    }

    // Hacer el update
    const { data, error } = await supabase
      .from('user_profiles')
      // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
      .update({ role_id: newRoleId })
      .eq('id', userId)
      .select()

    console.log('📦 Respuesta de Supabase:', { data, error })

    if (error) {
      console.error('❌ Error de Supabase:', error)
      throw error
    }

    console.log('✅ Rol actualizado en DB')

    // Recargar datos
    await loadData()
    console.log('✅ Datos recargados')
    
    alert('✅ Rol actualizado correctamente')
  } catch (err: any) {
    console.error('❌ Error completo:', err)
    alert('❌ Error al actualizar rol: ' + err.message)
  }
}

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({ is_active: !currentStatus })
        .eq('id', userId)

      if (error) throw error

      await loadData()
      alert(`Usuario ${!currentStatus ? 'activado' : 'desactivado'} correctamente`)
    } catch (err: any) {
      alert('Error al cambiar estado: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
        Cargando usuarios...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        padding: '16px', 
        background: '#FEE2E2', 
        color: '#DC2626', 
        borderRadius: '8px' 
      }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div>
      <style>{`
        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 800px;
        }

        .users-table th {
          text-align: left;
          padding: 12px;
          background: #F9FAFB;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E5E7EB;
          white-space: nowrap;
        }

        .users-table th:last-child {
          min-width: 120px;
          text-align: center;
        }

        .users-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #1F2937;
          font-size: 14px;
        }

        .users-table td:last-child {
          text-align: center;
          min-width: 120px;
        }

        .users-table tr:hover {
          background: #F9FAFB;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-inactive {
          background: #FEE2E2;
          color: #DC2626;
        }

        .select-role {
          padding: 6px 10px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .btn-toggle {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #1F2937;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-toggle:hover {
          background: #F9FAFB;
          border-color: #E63946;
          color: #E63946;
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
          padding: 32px;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
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

        .btn-primary {
          padding: 10px 20px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #D62828;
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

        @media (max-width: 768px) {
          .users-table {
            min-width: 700px;
          }
          .users-table th,
          .users-table td {
            padding: 10px 8px;
            font-size: 12px;
          }
          .modal-content {
            padding: 24px;
          }
          .form-group {
            margin-bottom: 12px;
          }
        }

        @media (max-width: 480px) {
          .users-table {
            min-width: 600px;
          }
          .users-table th,
          .users-table td {
            padding: 8px 6px;
            font-size: 11px;
          }
          .badge {
            padding: 3px 8px;
            font-size: 10px;
          }
          .btn-toggle {
            padding: 4px 8px;
            font-size: 10px;
          }
        }
      `}</style>

      {/* Header con botón crear */}
      <div style={{ 
        marginBottom: '20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
            Usuarios del Sistema
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6B7280' }}>
            {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear Usuario
        </button>
      </div>

      {/* Tabla de usuarios */}
      <div className="table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>ID</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Fecha Registro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.full_name || 'Sin nombre'}</strong>
                </td>
                <td>
                  <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>
                    {user.id.substring(0, 8)}...
                  </span>
                </td>
                <td>
                  <select
                    className="select-role"
                    value={user.role_id || ''}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  >
                    <option value="">Sin rol</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${user.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  {new Date(user.created_at).toLocaleDateString('es-ES')}
                </td>
                <td>
                  <button
                    className="btn-toggle"
                    onClick={() => toggleUserStatus(user.id, user.is_active)}
                  >
                    {user.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
          No hay usuarios registrados. Crea el primero usando el botón "+ Crear Usuario".
        </div>
      )}

      {/* Modal para crear usuario */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Crear Nuevo Usuario
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
              Completa los datos del nuevo usuario del sistema
            </p>

            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input
                type="text"
                className="form-input"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                placeholder="Juan Pérez"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <input
                type="email"
                className="form-input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="usuario@toshify.com"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña *</label>
              <input
                type="password"
                className="form-input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rol</label>
              <select
                className="form-input"
                value={newUser.roleId}
                onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value })}
                disabled={creating}
              >
                <option value="">Sin rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewUser({ email: '', password: '', fullName: '', roleId: '' })
                }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateUser}
                disabled={creating}
              >
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}