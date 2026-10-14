// src/components/admin/UserManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import type { UserWithRole, Role } from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { Users, UserCheck, UserX, Shield, KeyRound, Mail, Pencil, ToggleLeft, ToggleRight, Building2 } from 'lucide-react'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { validarEmail } from '../../utils/validacionesCampos'
import './UserManagement.css'
import './AdminStyles.css'

/** Estado de la cuenta en Supabase Auth (lo devuelve /api/admin/users/auth-status). */
interface EstadoAuth {
  last_sign_in_at: string | null
  invited_at: string | null
  banned: boolean
}

const USUARIO_VACIO = { email: '', fullName: '', roleId: '', sedeId: '' }

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/**
 * Llama a los endpoints de gestion de usuarios de server.js (verifican que sea admin
 * y usan la service role: alta por invitacion, envio de correos, ban en Auth).
 */
async function llamarApiUsuarios<T = { success: boolean }>(
  accion: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  const response = await fetch(`/api/admin/users/${accion}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify({ ...body, origin: window.location.origin }) : undefined,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Error en la operación')
  return result as T
}

export function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([])
  const [estadoAuth, setEstadoAuth] = useState<Record<string, EstadoAuth>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState(USUARIO_VACIO)

  useEffect(() => {
    loadData()
  }, [])

  // Estado de Auth (activo la cuenta / bloqueado). No bloquea la tabla si falla:
  // solo se pierde el aviso de "pendiente de activación".
  const loadEstadoAuth = async () => {
    try {
      const { usuarios } = await llamarApiUsuarios<{ usuarios: Record<string, EstadoAuth> }>('auth-status')
      setEstadoAuth(usuarios || {})
    } catch (err) {
      console.error('No se pudo cargar el estado de Auth de los usuarios:', err)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    void loadEstadoAuth()

    try {
      // Cargar usuarios y roles en paralelo
      const [
        { data: usersData, error: usersError },
        { data: rolesData, error: rolesError },
        { data: sedesData },
      ] = await Promise.all([
        supabase.from('user_profiles').select('*, roles(*)').order('created_at', { ascending: false }),
        supabase.from('roles').select('*').order('name'),
        (supabase as any).from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
      ])

      if (usersError) throw usersError
      if (rolesError) throw rolesError

      setUsers(usersData as UserWithRole[])
      setRoles(rolesData)
      if (sedesData) setSedes(sedesData as { id: string; nombre: string }[])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  /** Nunca inicio sesion: la invitacion sigue pendiente. */
  const estaPendiente = (user: UserWithRole): boolean => {
    const auth = estadoAuth[user.id]
    return !!auth && !auth.last_sign_in_at
  }

  const handleCreateUser = async () => {
    const email = newUser.email.trim()
    const fullName = newUser.fullName.trim()
    if (!email || !fullName) {
      Swal.fire({
        icon: 'error',
        title: 'Campos Incompletos',
        text: 'Completá el nombre y el email'
      })
      return
    }
    const errorEmail = validarEmail(email)
    if (errorEmail) {
      Swal.fire({ icon: 'error', title: 'Email inválido', text: errorEmail })
      return
    }

    setCreating(true)
    try {
      await llamarApiUsuarios('invite', {
        email,
        fullName,
        roleId: newUser.roleId || null,
        sedeId: newUser.sedeId || null,
      })

      showSuccess('Invitación enviada', `${fullName} recibirá un correo en ${email} para activar su cuenta`)
      setShowCreateModal(false)
      setNewUser(USUARIO_VACIO)
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

      // El select guarda al instante: se confirma para que un clic sin querer no cambie permisos.
      const usuario = users.find(u => u.id === userId)
      const rolNuevo = roles.find(r => r.id === newRoleId)?.name || 'el nuevo rol'
      const confirmacion = await Swal.fire({
        icon: 'question',
        title: 'Cambiar rol',
        html: `¿Cambiar el rol de <strong>${escaparHtml((usuario?.full_name || usuario?.email || 'este usuario') as string)}</strong> a <strong>${escaparHtml(rolNuevo)}</strong>?`,
        showCancelButton: true,
        confirmButtonText: 'Cambiar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#FF0033',
        reverseButtons: true,
      })
      if (!confirmacion.isConfirmed) return

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
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al actualizar rol: ' + message
      })
    }
  }

  // Desactivar bloquea el acceso de verdad (ban en Supabase Auth), no solo el badge.
  const toggleUserStatus = async (user: UserWithRole, currentStatus: boolean) => {
    const activar = !currentStatus
    const userName = (user.full_name || user.email || 'Usuario') as string

    const confirmacion = await Swal.fire({
      icon: 'warning',
      title: activar ? 'Activar usuario' : 'Desactivar usuario',
      html: activar
        ? `<strong>${escaparHtml(userName)}</strong> va a poder volver a iniciar sesión.`
        : `<strong>${escaparHtml(userName)}</strong> no va a poder iniciar sesión y se cerrará su acceso.`,
      showCancelButton: true,
      confirmButtonText: activar ? 'Activar' : 'Desactivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      reverseButtons: true,
    })
    if (!confirmacion.isConfirmed) return

    try {
      await llamarApiUsuarios('set-active', { userId: user.id, isActive: activar })
      await loadData()
      showSuccess('Estado Actualizado', `Usuario ${activar ? 'activado' : 'desactivado'} correctamente`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al cambiar estado: ' + message
      })
    }
  }

  const configurarSede = async (user: UserWithRole) => {
    const currentSedeId = (user as any).sede_id || ''
    const puedeCambiar = (user as any).puede_cambiar_sede !== false
    const verTodas = (user as any).ver_todas_sedes === true

    const sedeOptions = sedes.map(s => `<option value="${s.id}" ${s.id === currentSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Configurar Sede',
      html: `
        <div style="text-align:left; display:flex; flex-direction:column; gap:16px; margin-top:8px">
          <div style="padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;display:flex;align-items:flex-start;gap:10px">
            <input type="checkbox" id="swal-ver-todas" ${verTodas ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;margin-top:2px" />
            <div style="flex:1">
              <label for="swal-ver-todas" style="font-size:13px;font-weight:600;color:#92400e;cursor:pointer;display:block">
                Ver todas las sedes
              </label>
              <span style="font-size:11px;color:#78350f;line-height:1.4">
                El usuario podrá ver y cambiar a cualquier sede existente (y a las que se creen en el futuro).
                Útil para roles directivos.
              </span>
            </div>
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Sede por defecto</label>
            <select id="swal-sede" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
              <option value="">Sin sede asignada</option>
              ${sedeOptions}
            </select>
            <span style="font-size:11px;color:#6b7280;line-height:1.4;margin-top:4px;display:block">
              La sede que se selecciona al iniciar sesión.
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <label style="font-size:13px;font-weight:600;color:#374151;flex:1">Puede cambiar de sede</label>
            <input type="checkbox" id="swal-puede" ${puedeCambiar ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer" />
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => ({
        sedeId: (document.getElementById('swal-sede') as HTMLSelectElement).value,
        puedeCambiar: (document.getElementById('swal-puede') as HTMLInputElement).checked,
        verTodas: (document.getElementById('swal-ver-todas') as HTMLInputElement).checked,
      }),
    })

    if (!formValues) return

    const { error: sedeError } = await supabase.from('user_profiles').update({
      sede_id: formValues.sedeId || null,
      puede_cambiar_sede: formValues.puedeCambiar,
      ver_todas_sedes: formValues.verTodas,
    } as any).eq('id', user.id)

    if (sedeError) {
      console.error('Error guardando la sede del usuario:', sedeError)
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar la sede: ' + sedeError.message })
      return
    }

    setUsers(prev => prev.map(u => u.id === user.id
      ? { ...u, sede_id: formValues.sedeId || null, puede_cambiar_sede: formValues.puedeCambiar, ver_todas_sedes: formValues.verTodas } as any
      : u
    ))
    showSuccess('Configuración de sede guardada')
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

  // Reenviar invitacion (si nunca activo la cuenta) o enlace para restablecer la contraseña.
  // El usuario define su clave desde el correo: el admin no la ve ni la escribe.
  const enviarAcceso = async (user: UserWithRole) => {
    const userName = (user.full_name || user.email || 'Usuario') as string
    const email = user.email as string | null
    const pendiente = estaPendiente(user)

    if (!email) {
      Swal.fire({ icon: 'warning', title: 'Sin correo', text: 'Este usuario no tiene correo registrado.' })
      return
    }

    const result = await Swal.fire({
      icon: 'question',
      title: pendiente ? 'Reenviar invitación' : 'Restablecer contraseña',
      html: `
        <p style="color:#374151;margin-bottom:8px">
          ${pendiente
            ? 'Se reenviará el correo de bienvenida para que active su cuenta y cree su contraseña:'
            : 'Se enviará un correo con un enlace para que cree una nueva contraseña:'}
        </p>
        <p style="font-weight:700;color:#111827;margin-bottom:4px">${escaparHtml(userName)}</p>
        <p style="font-size:13px;color:#6b7280">${escaparHtml(email)}</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Enviar correo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      reverseButtons: true,
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        try {
          return await llamarApiUsuarios('send-access', { userId: user.id })
        } catch (err: unknown) {
          Swal.showValidationMessage(err instanceof Error ? err.message : String(err))
          return false
        }
      },
    })

    if (result.isConfirmed) {
      showSuccess('Correo enviado', `Se envió el enlace a ${email}`)
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
        cell: ({ row, getValue }) => {
          const isActive = getValue() as boolean
          if (isActive !== false && estaPendiente(row.original)) {
            return (
              <span className="dt-badge dt-badge-yellow" title="Todavía no activó su cuenta desde el correo de invitación">
                Pendiente
              </span>
            )
          }
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
          const pendiente = estaPendiente(row.original)
          const esUsuarioActual = row.original.id === currentUser?.id
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
                className="dt-btn-action"
                onClick={() => configurarSede(row.original)}
                data-tooltip="Configurar sede"
                style={{ color: 'var(--color-primary)' }}
              >
                <Building2 size={15} />
              </button>
              <button
                className="dt-btn-action dt-btn-warning"
                onClick={() => enviarAcceso(row.original)}
                disabled={!isActive}
                data-tooltip={!isActive
                  ? 'Activá el usuario para enviarle acceso'
                  : pendiente ? 'Reenviar invitación' : 'Enviar enlace para restablecer contraseña'}
              >
                {pendiente ? <Mail size={15} /> : <KeyRound size={15} />}
              </button>
              <button
                className={`dt-btn-action ${isActive ? 'dt-btn-danger' : 'dt-btn-success'}`}
                onClick={() => toggleUserStatus(row.original, isActive)}
                disabled={esUsuarioActual}
                data-tooltip={esUsuarioActual ? 'No podés desactivar tu propio usuario' : isActive ? 'Desactivar' : 'Activar'}
              >
                {isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
              </button>
            </div>
          )
        },
      },
    ],
    [roles, sedes, users, estadoAuth, currentUser?.id]
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
        emptyIcon={<Users size={48}
      />}
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
              <label className="um-form-label">Sede por defecto</label>
              <select
                className="um-form-input"
                value={newUser.sedeId}
                onChange={(e) => setNewUser({ ...newUser, sedeId: e.target.value })}
                disabled={creating}
              >
                <option value="">Sin sede asignada</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </div>

            <p className="um-form-hint">
              Se enviará un correo de bienvenida al email indicado para que el usuario active su
              cuenta y cree su propia contraseña.
            </p>

            <div className="um-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewUser(USUARIO_VACIO)
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
                {creating ? 'Enviando invitación...' : 'Crear y enviar invitación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
