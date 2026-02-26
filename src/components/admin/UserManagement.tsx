// src/components/admin/UserManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import type { UserWithRole, Role } from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { Users, UserCheck, UserX, Shield, KeyRound, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Error cargando datos:', err)
      setError(message)
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

      showSuccess('Usuario Creado', 'El usuario se ha creado exitosamente')
      setShowCreateModal(false)
      setNewUser({ email: '', password: '', fullName: '', roleId: '', mustChangePassword: true })
      await loadData()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
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
        .update({ role_id: newRoleId })
        .eq('id', userId)
        .select()

      if (error) {
        throw error
      }

      await loadData()

      showSuccess('Rol Actualizado', 'El rol se ha actualizado correctamente')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Error al actualizar rol:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al actualizar rol: ' + message
      })
    }
  }

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId)

      if (error) throw error

      await loadData()
      showSuccess('Estado Actualizado', `Usuario ${!currentStatus ? 'activado' : 'desactivado'} correctamente`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al cambiar estado: ' + message
      })
    }
  }

  const editUserName = async (userId: string, currentName: string) => {
    const { value: newName } = await Swal.fire({
      title: 'Editar Nombre',
      input: 'text',
      inputValue: currentName || '',
      inputPlaceholder: 'Nombre completo',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      reverseButtons: true,
      inputValidator: (value) => {
        if (!value?.trim()) return 'El nombre no puede estar vacío'
        return null
      }
    })

    if (!newName) return

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: newName.trim() })
        .eq('id', userId)

      if (error) throw error

      await loadData()
      showSuccess('Nombre Actualizado', `Nombre cambiado a "${newName.trim()}"`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al actualizar nombre: ' + message
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

  // Cifrar contraseña con XOR + base64 para no enviarla en texto plano al RPC
  const encryptPassword = (password: string): string => {
    const key = 'T0sh1fy-S3cur3-K3y-2025!'
    let encrypted = ''
    for (let i = 0; i < password.length; i++) {
      encrypted += String.fromCharCode(password.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return btoa(encrypted)
  }

  const forcePasswordChange = async (userId: string, userName: string, userEmail?: string) => {
    // Generar contraseña
    const newPassword = generatePassword()

    // Modal 1: Confirmar reset
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Resetear Contraseña',
      html: `
        <p style="color: #374151; margin-bottom: 8px;">Se generará una nueva contraseña para:</p>
        <p style="font-weight: 700; font-size: 16px; color: #111827; margin-bottom: 16px;">${userName}</p>
        <p style="font-size: 13px; color: #6b7280;">El usuario deberá cambiarla en el próximo inicio de sesión.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Resetear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      reverseButtons: true
    })

    if (result.isDismissed) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('admin_reset_user_password', {
        target_user_id: userId,
        new_password: newPassword
      })

      if (error) throw error
      if (data && !data.success) throw new Error(data.error || 'Error desconocido')

      await loadData()

      // Modal 2: Resultado con acciones integradas (copiar + enviar correo)
      const targetEmail = userEmail || ''

      await Swal.fire({
        iconHtml: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10.5 14 8 11.5"/></svg>',
        customClass: { icon: 'swal-no-border' },
        title: 'Listo',
        html: `
          <style>.swal-no-border { border: none !important; }</style>
          <div style="text-align: left;">
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">Nueva contraseña de <strong style="color: #111827;">${userName}</strong></p>

            <div style="position: relative; margin-bottom: 16px;">
              <input type="text" id="swal-pwd" value="${newPassword}" readonly
                style="width: 100%; box-sizing: border-box; background: #f9fafb; padding: 14px 16px; border-radius: 8px; font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace; font-size: 20px; letter-spacing: 3px; border: 1px solid #e5e7eb; text-align: center; color: #111827; font-weight: 600;" />
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: ${targetEmail ? '16px' : '0'};">
              <button type="button" id="swal-copy-btn"
                style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 16px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar
              </button>
              <button type="button" id="swal-email-btn"
                style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 16px; background: #FF0033; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; ${!targetEmail ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                Enviar por Correo
              </button>
            </div>

            ${targetEmail ? `
            <p id="swal-email-hint" style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              Se enviara cifrada a <strong style="color: #6b7280;">${targetEmail}</strong>
            </p>
            ` : `
            <p style="font-size: 12px; color: #f59e0b; text-align: center; margin-top: 8px;">
              Este usuario no tiene correo registrado
            </p>
            `}
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#6b7280',
        didOpen: () => {
          // Copiar
          const copyBtn = document.getElementById('swal-copy-btn')
          const pwdInput = document.getElementById('swal-pwd') as HTMLInputElement
          if (copyBtn && pwdInput) {
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(pwdInput.value)
              } catch {
                pwdInput.select()
                document.execCommand('copy')
              }
              copyBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Copiado!
              `
              copyBtn.style.background = '#d1fae5'
              copyBtn.style.color = '#059669'
              copyBtn.style.borderColor = '#6ee7b7'
              setTimeout(() => {
                copyBtn.innerHTML = `
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar
                `
                copyBtn.style.background = 'white'
                copyBtn.style.color = '#374151'
                copyBtn.style.borderColor = '#d1d5db'
              }, 2000)
            }
          }

          // Enviar por correo
          const emailBtn = document.getElementById('swal-email-btn')
          if (emailBtn) {
            if (!targetEmail) {
              // Sin email: deshabilitado
              ;(emailBtn as HTMLButtonElement).disabled = true
              return
            }

            emailBtn.onclick = async () => {
              emailBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Enviando...
              `
              emailBtn.style.opacity = '0.7'
              ;(emailBtn as HTMLButtonElement).disabled = true

              try {
                const encryptedPwd = encryptPassword(newPassword)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: emailData, error: emailError } = await (supabase.rpc as any)('send_password_email', {
                  user_email: targetEmail,
                  user_name: userName,
                  user_password: encryptedPwd
                })

                if (emailError) throw emailError
                if (emailData && !emailData.success) throw new Error(emailData.error || 'Error desconocido')

                emailBtn.innerHTML = `
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Enviado!
                `
                emailBtn.style.background = '#059669'
                emailBtn.style.opacity = '1'

                const hint = document.getElementById('swal-email-hint')
                if (hint) {
                  hint.innerHTML = `<strong style="color: #059669;">Correo enviado exitosamente</strong>`
                }
              } catch {
                emailBtn.innerHTML = `
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  Error - Reintentar
                `
                emailBtn.style.background = '#dc2626'
                emailBtn.style.opacity = '1'
                ;(emailBtn as HTMLButtonElement).disabled = false
              }
            }
          }
        }
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al cambiar contraseña: ' + message,
        confirmButtonColor: '#FF0033'
      })
    }
  }

  // Definir columnas para DataTable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<ColumnDef<UserWithRole, any>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Usuario',
        cell: ({ row }) => {
          const name = (row.original.full_name as string) || 'Sin nombre'
          const email = row.original.email as string
          const avatarUrl = row.original.avatar_url as string | null
          const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
          return (
            <div className="um-user-cell">
              <div className="um-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name} className="um-avatar-img" />
                ) : (
                  <span className="um-avatar-initials">{initials}</span>
                )}
              </div>
              <div className="um-user-info">
                <span className="um-user-name">{name}</span>
                {email && <span className="um-user-email">{email}</span>}
              </div>
            </div>
          )
        },
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
        filterFn: (row, _columnId, filterValue) => {
          const roleName = ((row.original.roles as Role)?.name || 'sin rol').toLowerCase()
          return roleName.includes(String(filterValue).toLowerCase())
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ getValue }) => {
          const isActive = getValue() as boolean
          return (
            <span className={`dt-badge ${isActive !== false ? 'dt-badge-green' : 'dt-badge-red'}`}>
              {isActive !== false ? 'Activo' : 'Inactivo'}
            </span>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Registro',
        cell: ({ getValue }) => {
          const date = new Date(getValue() as string)
          return (
            <span className="um-date">{date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          )
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        enableSorting: false,
        cell: ({ row }) => {
          const isActive = row.original.is_active !== false
          const userName = (row.original.full_name || row.original.email || 'Usuario') as string
          return (
            <div className="dt-actions">
              <button
                className="dt-btn-action dt-btn-edit"
                onClick={() => editUserName(row.original.id, (row.original.full_name || '') as string)}
                data-tooltip="Editar nombre"
              >
                <Pencil size={15} />
              </button>
              <button
                className="dt-btn-action dt-btn-warning"
                onClick={() => forcePasswordChange(row.original.id, userName, row.original.email ?? undefined)}
                data-tooltip="Resetear contraseña"
              >
                <KeyRound size={15} />
              </button>
              <button
                className={`dt-btn-action ${isActive ? 'dt-btn-danger' : 'dt-btn-success'}`}
                onClick={() => toggleUserStatus(row.original.id, isActive)}
                data-tooltip={isActive ? 'Desactivar' : 'Activar'}
              >
                {isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
              </button>
            </div>
          )
        },
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
      <LoadingOverlay show={loading} message="Cargando usuarios..." size="lg" />
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
pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
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
