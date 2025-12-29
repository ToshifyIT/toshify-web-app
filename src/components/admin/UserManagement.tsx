// src/components/admin/UserManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Role } from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { Users, UserCheck, UserX, Shield } from 'lucide-react'
import Swal from 'sweetalert2'
import './UserManagement.css'
import './AdminStyles.css'

export function UserManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
    setLoading(true)
    setError(null)

    try {
      const { data: usersData, error: usersError } = await supabase
        .from('user_profiles')
        .select(`
          *,
          roles (*)
        `)
        .order('created_at', { ascending: false })

      if (usersError) throw usersError

      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('name')

      if (rolesError) throw rolesError

      setUsers(usersData as UserWithRole[])
      setRoles(rolesData)
    } catch (err: any) {
      console.error('❌ Error cargando datos:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      Swal.fire({
        icon: 'error',
        title: 'Campos Incompletos',
        text: 'Complete todos los campos requeridos'
      })
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

      await Swal.fire({
        icon: 'success',
        title: 'Usuario Creado',
        text: 'El usuario se ha creado exitosamente',
        showConfirmButton: false,
        timer: 2000
      })
      setShowCreateModal(false)
      setNewUser({ email: '', password: '', fullName: '', roleId: '' })
      await loadData()
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message
      })
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async (userId: string, newRoleId: string) => {
    try {
      if (!newRoleId) {
        Swal.fire({
          icon: 'warning',
          title: 'Rol no seleccionado',
          text: 'Selecciona un rol válido'
        })
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({ role_id: newRoleId })
        .eq('id', userId)
        .select()

      if (error) {
        throw error
      }

      await loadData()

      Swal.fire({
        icon: 'success',
        title: 'Rol Actualizado',
        text: 'El rol se ha actualizado correctamente',
        showConfirmButton: false,
        timer: 2000
      })
    } catch (err: any) {
      console.error('❌ Error completo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al actualizar rol: ' + err.message
      })
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
      Swal.fire({
        icon: 'success',
        title: 'Estado Actualizado',
        text: `Usuario ${!currentStatus ? 'activado' : 'desactivado'} correctamente`,
        showConfirmButton: false,
        timer: 2000
      })
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al cambiar estado: ' + err.message
      })
    }
  }

  // Definir columnas para DataTable
  const columns = useMemo<ColumnDef<UserWithRole, any>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Usuario',
        cell: ({ getValue }) => (
          <strong className="um-user-name">{(getValue() as string) || 'Sin nombre'}</strong>
        ),
      },
      {
        accessorKey: 'id',
        header: 'ID',
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="um-user-id">
            {(getValue() as string).substring(0, 8)}...
          </span>
        ),
      },
      {
        accessorKey: 'role_id',
        header: 'Rol',
        cell: ({ row }) => (
          <select
            className="um-select-role"
            value={row.original.role_id || ''}
            onChange={(e) => handleRoleChange(row.original.id, e.target.value)}
          >
            <option value="">Sin rol</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ getValue }) => {
          const isActive = getValue() as boolean
          return (
            <span className={`dt-badge ${isActive ? 'dt-badge-green' : 'dt-badge-red'}`}>
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Fecha Registro',
        cell: ({ getValue }) => (
          <span>{new Date(getValue() as string).toLocaleDateString('es-ES')}</span>
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="dt-actions">
            <button
              className="dt-btn-action"
              onClick={() => toggleUserStatus(row.original.id, row.original.is_active)}
            >
              {row.original.is_active ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ),
      },
    ],
    [roles]
  )

  // Calcular estadísticas
  const statsData = useMemo(() => {
    const total = users.length
    const activos = users.filter(u => u.is_active !== false).length
    const inactivos = users.filter(u => u.is_active === false).length
    const rolesCount = new Set(users.map(u => u.role_id)).size
    return { total, activos, inactivos, rolesCount }
  }, [users])

  return (
    <div className="admin-module">
      {/* Stats Cards - Estilo Bitacora */}
      <div className="admin-stats">
        <div className="admin-stats-grid">
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.total}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card">
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.activos}</span>
              <span className="stat-label">Activos</span>
            </div>
          </div>
          <div className="stat-card">
            <UserX size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.inactivos}</span>
              <span className="stat-label">Inactivos</span>
            </div>
          </div>
          <div className="stat-card">
            <Shield size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.rolesCount}</span>
              <span className="stat-label">Roles</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por nombre, email, ID..."
        emptyIcon={<Users size={48} />}
        emptyTitle="No hay usuarios registrados"
        emptyDescription="Crea el primero usando el botón '+ Crear Usuario'"
        pageSize={10}
        pageSizeOptions={[10, 20, 30, 50]}
        headerAction={
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Crear Usuario
          </button>
        }
      />

      {/* Modal para crear usuario */}
      {showCreateModal && (
        <div className="um-modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="um-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="um-modal-title">Crear Nuevo Usuario</h2>
            <p className="um-modal-subtitle">
              Completa los datos del nuevo usuario del sistema
            </p>

            <div className="um-form-group">
              <label className="um-form-label">Nombre Completo *</label>
              <input
                type="text"
                className="um-form-input"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                placeholder="Juan Pérez"
                disabled={creating}
              />
            </div>

            <div className="um-form-group">
              <label className="um-form-label">Email *</label>
              <input
                type="email"
                className="um-form-input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="usuario@toshify.com"
                disabled={creating}
              />
            </div>

            <div className="um-form-group">
              <label className="um-form-label">Contraseña *</label>
              <input
                type="password"
                className="um-form-input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                disabled={creating}
              />
            </div>

            <div className="um-form-group">
              <label className="um-form-label">Rol</label>
              <select
                className="um-form-input"
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

            <div className="um-modal-actions">
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
