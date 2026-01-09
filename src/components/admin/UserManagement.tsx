// src/components/admin/UserManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Role } from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { Users, UserCheck, UserX, Shield, KeyRound } from 'lucide-react'
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
    roleId: '',
    mustChangePassword: true // Por defecto, forzar cambio de contraseña
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

    // Validación de contraseña segura (OWASP)
    const passwordErrors: string[] = []
    if (newUser.password.length < 8) {
      passwordErrors.push('Mínimo 8 caracteres')
    }
    if (!/[A-Z]/.test(newUser.password)) {
      passwordErrors.push('Al menos una mayúscula')
    }
    if (!/[a-z]/.test(newUser.password)) {
      passwordErrors.push('Al menos una minúscula')
    }
    if (!/[0-9]/.test(newUser.password)) {
      passwordErrors.push('Al menos un número')
    }

    if (passwordErrors.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Contraseña débil',
        html: `La contraseña debe cumplir:<br>• ${passwordErrors.join('<br>• ')}`
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
      setNewUser({ email: '', password: '', fullName: '', roleId: '', mustChangePassword: true })
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

      const { error } = await supabase
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

  // Generar contraseña aleatoria segura
  const generatePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const numbers = '0123456789'
    const all = upper + lower + numbers

    let password = ''
    // Asegurar al menos uno de cada tipo
    password += upper[Math.floor(Math.random() * upper.length)]
    password += lower[Math.floor(Math.random() * lower.length)]
    password += numbers[Math.floor(Math.random() * numbers.length)]

    // Completar hasta 10 caracteres
    for (let i = 0; i < 7; i++) {
      password += all[Math.floor(Math.random() * all.length)]
    }

    // Mezclar
    return password.split('').sort(() => Math.random() - 0.5).join('')
  }

  const forcePasswordChange = async (userId: string, userName: string, userEmail?: string) => {
    // Generar contraseña
    const newPassword = generatePassword()

    const result = await Swal.fire({
      icon: 'info',
      title: 'Resetear Contraseña',
      html: `
        <p style="margin-bottom: 16px;">Nueva contraseña para <strong>${userName}</strong>:</p>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
          <input type="text" id="password-display" value="${newPassword}" readonly style="flex: 1; background: #f3f4f6; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 18px; letter-spacing: 2px; border: 1px solid #e5e7eb; text-align: center;" />
          <button type="button" id="copy-password-btn" style="padding: 12px 16px; background: #FF0033; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;">
            Copiar
          </button>
        </div>
        <p style="font-size: 12px; color: #666;">
          El usuario deberá cambiarla en el próximo inicio de sesión.
        </p>
      `,
      didOpen: () => {
        const copyBtn = document.getElementById('copy-password-btn')
        const passwordInput = document.getElementById('password-display') as HTMLInputElement
        if (copyBtn && passwordInput) {
          copyBtn.onclick = () => {
            passwordInput.select()
            document.execCommand('copy')
            copyBtn.textContent = 'Copiado!'
            copyBtn.style.background = '#10b981'
            setTimeout(() => {
              copyBtn.textContent = 'Copiar'
              copyBtn.style.background = '#FF0033'
            }, 1500)
          }
        }
      },
      showCancelButton: true,
      confirmButtonText: 'Aplicar Cambio',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033'
    })

    if (result.isDismissed) return

    try {
      // Usar función RPC de base de datos (funciona en selfhosted)
      const { data, error } = await supabase.rpc('admin_reset_user_password' as any, {
        target_user_id: userId,
        new_password: newPassword
      })

      if (error) throw error
      if (data && !(data as any).success) throw new Error((data as any).error)

      await loadData()

      // Preguntar si quiere enviar por correo
      if (userEmail) {
        const emailResult = await Swal.fire({
          icon: 'success',
          title: 'Contraseña Actualizada',
          html: `
            <p>La contraseña de <strong>${userName}</strong> ha sido cambiada.</p>
            <p style="margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-family: monospace; font-size: 16px;">${newPassword}</p>
            <p style="margin-top: 12px; font-size: 13px; color: #666;">¿Deseas enviarla por correo a <strong>${userEmail}</strong>?</p>
          `,
          showCancelButton: true,
          confirmButtonText: 'Enviar por Correo',
          cancelButtonText: 'No, solo copiar',
          confirmButtonColor: '#FF0033'
        })

        if (emailResult.isConfirmed) {
          try {
            // Usar función RPC de PostgreSQL con http extension para enviar email
            const { data: emailData, error: emailError } = await supabase.rpc('send_password_email' as any, {
              user_email: userEmail,
              user_name: userName,
              user_password: newPassword
            })

            if (emailError) throw emailError
            if (emailData && !(emailData as any).success) throw new Error((emailData as any).error)

            Swal.fire({
              icon: 'success',
              title: 'Correo Enviado',
              html: `La contraseña fue enviada a <strong>${userEmail}</strong>`,
              confirmButtonColor: '#FF0033'
            })
          } catch (emailErr: any) {
            Swal.fire({
              icon: 'error',
              title: 'Error enviando correo',
              text: emailErr.message,
              confirmButtonColor: '#FF0033'
            })
          }
        }
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Contraseña Actualizada',
          html: `La contraseña de <strong>${userName}</strong> ha sido cambiada.<br>Deberá cambiarla en el próximo inicio.`,
          showConfirmButton: false,
          timer: 3000
        })
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al cambiar contraseña: ' + err.message
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
              className="dt-btn-action dt-btn-warning"
              onClick={() => forcePasswordChange(row.original.id, row.original.full_name || row.original.email || 'Usuario', row.original.email || undefined)}
              title="Forzar cambio de contraseña"
            >
              <KeyRound size={14} />
            </button>
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
                placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
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

            <div className="um-form-group">
              <label className="um-checkbox-label">
                <input
                  type="checkbox"
                  checked={newUser.mustChangePassword}
                  onChange={(e) => setNewUser({ ...newUser, mustChangePassword: e.target.checked })}
                  disabled={creating}
                />
                <span>Contraseña temporal (forzar cambio en primer inicio)</span>
              </label>
              <p className="um-form-hint">
                Si está marcado, el usuario deberá cambiar su contraseña la primera vez que inicie sesión.
              </p>
            </div>

            <div className="um-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewUser({ email: '', password: '', fullName: '', roleId: '', mustChangePassword: true })
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
