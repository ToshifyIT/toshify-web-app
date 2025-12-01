// src/components/admin/RoleMenuPermissionsManager.tsx
import { useState, useEffect, useMemo } from 'react'
import { Check, AlertTriangle, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Role, Menu, Submenu } from '../../types/database.types'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  UUIDSchema,
  SearchTermSchema,
  PermissionFieldSchema,
  sanitizeHTML,
  sanitizeObject,
  devLog,
  handleDatabaseError,
  checkPermission,
  rateLimiter
} from '../../utils/security'
import { z } from 'zod'

interface RoleMenuPermission {
  role_id: string
  menu_id: string
  menu_name: string
  menu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface RoleSubmenuPermission {
  role_id: string
  submenu_id: string
  submenu_name: string
  submenu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface PermissionRow {
  id: string
  type: 'menu' | 'submenu'
  name: string
  label: string
  parentLabel?: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  menu_id?: string
  submenu_id?: string
}

export function RoleMenuPermissionsManager() {
  // =====================================================
  // AUTENTICACIÓN Y AUTORIZACIÓN
  // =====================================================
  const { user, profile } = useAuth()
  const [authError, setAuthError] = useState<string>('')

  // Estados
  const [roles, setRoles] = useState<Role[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [menuPermissions, setMenuPermissions] = useState<RoleMenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<RoleSubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [roleSearchTerm, setRoleSearchTerm] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // =====================================================
  // VERIFICACIÓN DE PERMISOS
  // =====================================================
  useEffect(() => {
    const permissionCheck = checkPermission(profile?.roles?.name, 'manage_permissions')

    if (!permissionCheck.hasPermission) {
      setAuthError(permissionCheck.reason || 'No tienes permisos para acceder a esta sección')
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole)
    }
  }, [selectedRole])

  const loadData = async () => {
    if (authError) return // No cargar si no tiene permisos

    setLoading(true)
    try {
      // Cargar roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('name')

      if (rolesError) throw rolesError

      // Cargar menús
      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .eq('is_active', true)
        .order('order_index')

      if (menusError) throw menusError

      // Cargar submenús
      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('*, menus(name)')
        .eq('is_active', true)
        .order('order_index')

      if (submenusError) throw submenusError

      // Sanitizar datos antes de guardar en estado
      setRoles((rolesData || []).map(role => sanitizeObject(role)))
      setMenus((menusData || []).map(menu => sanitizeObject(menu)))
      setSubmenus((submenusData || []).map(submenu => sanitizeObject(submenu)))

      devLog.info('✅ Datos cargados correctamente')
    } catch (err) {
      const safeError = handleDatabaseError(err)
      devLog.error('Error cargando datos:', safeError.logMessage)
      setNotification({
        type: 'error',
        message: safeError.userMessage
      })
    } finally {
      setLoading(false)
    }
  }

  const loadRolePermissions = async (roleId: string) => {
    try {
      // Validar UUID del rol
      const validatedRoleId = UUIDSchema.parse(roleId)
      devLog.info('📥 Cargando permisos para rol:', validatedRoleId)

      // Cargar permisos de menú del rol
      const { data: menuPermsData, error: menuError } = await supabase
        .from('role_menu_permissions')
        .select(`
          role_id,
          menu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          menus (
            id,
            name,
            label
          )
        `)
        .eq('role_id', validatedRoleId)

      if (menuError) throw menuError

      // Cargar permisos de submenú del rol
      const { data: submenuPermsData, error: submenuError } = await supabase
        .from('role_submenu_permissions')
        .select(`
          role_id,
          submenu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          submenus (
            id,
            name,
            label
          )
        `)
        .eq('role_id', validatedRoleId)

      if (submenuError) throw submenuError

      // Transformar y sanitizar datos
      const formattedMenuPerms = (menuPermsData || []).map((p: any) => sanitizeObject({
        role_id: p.role_id,
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedSubmenuPerms = (submenuPermsData || []).map((p: any) => sanitizeObject({
        role_id: p.role_id,
        submenu_id: p.submenu_id,
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      devLog.info('✅ Permisos cargados:', {
        menus: formattedMenuPerms.length,
        submenus: formattedSubmenuPerms.length
      })

      setMenuPermissions(formattedMenuPerms)
      setSubmenuPermissions(formattedSubmenuPerms)
    } catch (err) {
      if (err instanceof z.ZodError) {
        devLog.error('❌ ID de rol inválido:', err.issues)
        setNotification({
          type: 'error',
          message: 'ID de rol inválido'
        })
      } else {
        const safeError = handleDatabaseError(err)
        devLog.error('❌ Error cargando permisos:', safeError.logMessage)
        setNotification({
          type: 'error',
          message: safeError.userMessage
        })
      }
    }
  }

  const toggleMenuPermission = async (
    menuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    // =====================================================
    // VALIDACIONES DE SEGURIDAD
    // =====================================================

    // 1. Verificar que hay un rol seleccionado
    if (!selectedRole) {
      devLog.warn('⚠️ No hay rol seleccionado')
      setNotification({
        type: 'error',
        message: 'Debes seleccionar un rol primero'
      })
      return
    }

    // 2. Rate limiting (prevenir spam)
    const rateLimitKey = `toggle_menu_${user?.id}_${selectedRole}`
    if (!rateLimiter.check(rateLimitKey)) {
      setNotification({
        type: 'error',
        message: 'Demasiados cambios. Por favor, espera un momento.'
      })
      return
    }

    setSaving(true)
    try {
      // 3. Validar UUIDs
      const validatedRoleId = UUIDSchema.parse(selectedRole)
      const validatedMenuId = UUIDSchema.parse(menuId)
      const validatedField = PermissionFieldSchema.parse(field)

      devLog.info('🔄 Toggling menu permission:', {
        menuId: validatedMenuId,
        field: validatedField,
        roleId: validatedRoleId
      })

      const existingPerm = menuPermissions.find(p => p.menu_id === validatedMenuId)
      const newValue = existingPerm ? !existingPerm[validatedField] : true

      if (existingPerm) {
        // Actualizar permiso existente
        devLog.info('🔧 Actualizando permiso existente')
        const { error } = await supabase
          .from('role_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [validatedField]: newValue })
          .eq('role_id', validatedRoleId)
          .eq('menu_id', validatedMenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso
        devLog.info('➕ Creando nuevo permiso')
        const { error } = await supabase
          .from('role_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            role_id: validatedRoleId,
            menu_id: validatedMenuId,
            can_view: validatedField === 'can_view',
            can_create: validatedField === 'can_create',
            can_edit: validatedField === 'can_edit',
            can_delete: validatedField === 'can_delete'
          }])

        if (error) throw error
      }

      devLog.info('✅ Permiso actualizado exitosamente')

      // Actualizar el estado local sin recargar desde el servidor
      setMenuPermissions(prev => {
        const index = prev.findIndex(p => p.menu_id === validatedMenuId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], [validatedField]: newValue }
          return updated
        } else {
          // Agregar nuevo permiso al estado
          const menu = menus.find(m => m.id === validatedMenuId)
          return [...prev, {
            role_id: validatedRoleId,
            menu_id: validatedMenuId,
            menu_name: menu?.name || '',
            menu_label: menu?.label || '',
            can_view: validatedField === 'can_view' ? newValue : false,
            can_create: validatedField === 'can_create' ? newValue : false,
            can_edit: validatedField === 'can_edit' ? newValue : false,
            can_delete: validatedField === 'can_delete' ? newValue : false
          }]
        }
      })

      setNotification({
        type: 'success',
        message: 'Permiso actualizado correctamente'
      })

    } catch (err) {
      if (err instanceof z.ZodError) {
        devLog.error('❌ Error de validación:', err.issues)
        setNotification({
          type: 'error',
          message: 'Datos inválidos. Por favor, recarga la página.'
        })
      } else {
        const safeError = handleDatabaseError(err)
        devLog.error('❌ Error actualizando permiso:', safeError.logMessage)
        setNotification({
          type: 'error',
          message: safeError.userMessage
        })
      }
    } finally {
      setSaving(false)
      // Auto-limpiar notificación después de 3 segundos
      setTimeout(() => setNotification(null), 3000)
    }
  }

  const toggleSubmenuPermission = async (
    submenuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    // =====================================================
    // VALIDACIONES DE SEGURIDAD
    // =====================================================

    // 1. Verificar que hay un rol seleccionado
    if (!selectedRole) {
      devLog.warn('⚠️ No hay rol seleccionado')
      setNotification({
        type: 'error',
        message: 'Debes seleccionar un rol primero'
      })
      return
    }

    // 2. Rate limiting (prevenir spam)
    const rateLimitKey = `toggle_submenu_${user?.id}_${selectedRole}`
    if (!rateLimiter.check(rateLimitKey)) {
      setNotification({
        type: 'error',
        message: 'Demasiados cambios. Por favor, espera un momento.'
      })
      return
    }

    setSaving(true)
    try {
      // 3. Validar UUIDs
      const validatedRoleId = UUIDSchema.parse(selectedRole)
      const validatedSubmenuId = UUIDSchema.parse(submenuId)
      const validatedField = PermissionFieldSchema.parse(field)

      devLog.info('🔄 Toggling submenu permission:', {
        submenuId: validatedSubmenuId,
        field: validatedField,
        roleId: validatedRoleId
      })

      const existingPerm = submenuPermissions.find(p => p.submenu_id === validatedSubmenuId)
      const newValue = existingPerm ? !existingPerm[validatedField] : true

      if (existingPerm) {
        // Actualizar permiso existente
        devLog.info('🔧 Actualizando permiso existente')
        const { error } = await supabase
          .from('role_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [validatedField]: newValue })
          .eq('role_id', validatedRoleId)
          .eq('submenu_id', validatedSubmenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso
        devLog.info('➕ Creando nuevo permiso')
        const { error } = await supabase
          .from('role_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            role_id: validatedRoleId,
            submenu_id: validatedSubmenuId,
            can_view: validatedField === 'can_view',
            can_create: validatedField === 'can_create',
            can_edit: validatedField === 'can_edit',
            can_delete: validatedField === 'can_delete'
          }])

        if (error) throw error
      }

      devLog.info('✅ Permiso actualizado exitosamente')

      // Actualizar el estado local sin recargar desde el servidor
      setSubmenuPermissions(prev => {
        const index = prev.findIndex(p => p.submenu_id === validatedSubmenuId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], [validatedField]: newValue }
          return updated
        } else {
          // Agregar nuevo permiso al estado
          const submenu = submenus.find(s => s.id === validatedSubmenuId)
          return [...prev, {
            role_id: validatedRoleId,
            submenu_id: validatedSubmenuId,
            submenu_name: submenu?.name || '',
            submenu_label: submenu?.label || '',
            can_view: validatedField === 'can_view' ? newValue : false,
            can_create: validatedField === 'can_create' ? newValue : false,
            can_edit: validatedField === 'can_edit' ? newValue : false,
            can_delete: validatedField === 'can_delete' ? newValue : false
          }]
        }
      })

      setNotification({
        type: 'success',
        message: 'Permiso actualizado correctamente'
      })

    } catch (err) {
      if (err instanceof z.ZodError) {
        devLog.error('❌ Error de validación:', err.issues)
        setNotification({
          type: 'error',
          message: 'Datos inválidos. Por favor, recarga la página.'
        })
      } else {
        const safeError = handleDatabaseError(err)
        devLog.error('❌ Error actualizando permiso:', safeError.logMessage)
        setNotification({
          type: 'error',
          message: safeError.userMessage
        })
      }
    } finally {
      setSaving(false)
      // Auto-limpiar notificación después de 3 segundos
      setTimeout(() => setNotification(null), 3000)
    }
  }

  const getMenuPermission = (menuId: string, field: keyof RoleMenuPermission) => {
    const perm = menuPermissions.find(p => p.menu_id === menuId)
    return perm ? perm[field] : false
  }

  const getSubmenuPermission = (submenuId: string, field: keyof RoleSubmenuPermission) => {
    const perm = submenuPermissions.find(p => p.submenu_id === submenuId)
    return perm ? perm[field] : false
  }

  // Crear estructura de datos plana para la tabla
  const tableData = useMemo<PermissionRow[]>(() => {
    const rows: PermissionRow[] = []

    menus.forEach(menu => {
      // Agregar fila del menú
      rows.push({
        id: menu.id,
        type: 'menu',
        name: menu.name,
        label: menu.label,
        can_view: getMenuPermission(menu.id, 'can_view') as boolean,
        can_create: getMenuPermission(menu.id, 'can_create') as boolean,
        can_edit: getMenuPermission(menu.id, 'can_edit') as boolean,
        can_delete: getMenuPermission(menu.id, 'can_delete') as boolean,
        menu_id: menu.id
      })

      // Agregar filas de submenús
      const menuSubmenus = submenus.filter((sm: any) => sm.menus?.name === menu.name)
      menuSubmenus.forEach((submenu: any) => {
        rows.push({
          id: submenu.id,
          type: 'submenu',
          name: submenu.name,
          label: submenu.label,
          parentLabel: menu.label,
          can_view: getSubmenuPermission(submenu.id, 'can_view') as boolean,
          can_create: getSubmenuPermission(submenu.id, 'can_create') as boolean,
          can_edit: getSubmenuPermission(submenu.id, 'can_edit') as boolean,
          can_delete: getSubmenuPermission(submenu.id, 'can_delete') as boolean,
          submenu_id: submenu.id
        })
      })
    })

    return rows
  }, [menus, submenus, menuPermissions, submenuPermissions])

  // Definir columnas
  const columns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue() as string
          return (
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: type === 'menu' ? '#DBEAFE' : '#E9D5FF',
                color: type === 'menu' ? '#1E40AF' : '#6B21A8',
              }}
            >
              {type === 'menu' ? 'Menú' : 'Submenú'}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'label',
        header: 'Elemento',
        cell: ({ row }) => {
          const isSubmenu = row.original.type === 'submenu'
          return (
            <div>
              {isSubmenu && (
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '2px' }}>
                  {row.original.parentLabel}
                </div>
              )}
              <div
                style={{
                  fontWeight: isSubmenu ? 400 : 600,
                  color: isSubmenu ? '#6B7280' : '#1F2937',
                  paddingLeft: isSubmenu ? '20px' : '0',
                }}
              >
                {isSubmenu && '↳ '}
                {row.original.label}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'can_view',
        header: 'Ver',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_view ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_view')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_view')
              }
            }}
          >
            {row.original.can_view && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_create',
        header: 'Crear',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_create ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_create')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_create')
              }
            }}
          >
            {row.original.can_create && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_edit',
        header: 'Editar',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_edit ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_edit')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_edit')
              }
            }}
          >
            {row.original.can_edit && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_delete',
        header: 'Eliminar',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_delete ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_delete')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_delete')
              }
            }}
          >
            {row.original.can_delete && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
    ],
    [menuPermissions, submenuPermissions, saving]
  )

  // Configurar TanStack Table
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false, // Evitar que la paginación se reinicie al actualizar datos
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  const selectedRoleData = roles.find(r => r.id === selectedRole)

  // Filtrar roles según búsqueda (con validación)
  const filteredRoles = useMemo(() => {
    try {
      const sanitizedSearch = SearchTermSchema.parse(roleSearchTerm).toLowerCase()
      return roles.filter(role =>
        role.name.toLowerCase().includes(sanitizedSearch) ||
        (role.description && role.description.toLowerCase().includes(sanitizedSearch))
      )
    } catch {
      // Si la búsqueda es inválida, retornar todos los roles
      return roles
    }
  }, [roles, roleSearchTerm])

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  // Mostrar error de autorización si no tiene permisos
  if (authError) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Shield size={64} style={{ margin: '0 auto 20px', color: '#EF4444' }} />
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', marginBottom: '12px' }}>
          Acceso Denegado
        </h2>
        <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '20px' }}>
          {authError}
        </p>
        <p style={{ fontSize: '14px', color: '#9CA3AF' }}>
          Si crees que deberías tener acceso a esta sección, contacta a tu administrador.
        </p>
      </div>
    )
  }

  return (
    <div>
      <style>{`
        .permissions-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .role-selector {
          margin-bottom: 30px;
          padding: 24px;
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .role-search-container {
          position: relative;
        }

        .select-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
          cursor: pointer;
        }

        .select-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .role-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          max-height: 300px;
          overflow-y: auto;
          z-index: 1000;
        }

        .role-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid #F3F4F6;
        }

        .role-option:last-child {
          border-bottom: none;
        }

        .role-option:hover {
          background: #F9FAFB;
        }

        .role-option.selected {
          background: #FEF2F2;
          color: #E63946;
          font-weight: 600;
        }

        .role-info-banner {
          margin-top: 16px;
          padding: 16px;
          background: #F9FAFB;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .search-filter-container {
          margin-bottom: 20px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 42px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .table-container {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: #F9FAFB;
          padding: 14px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          border-bottom: 2px solid #E5E7EB;
          cursor: pointer;
          user-select: none;
        }

        .data-table th.sortable:hover {
          background: #F3F4F6;
        }

        .data-table th:nth-child(3),
        .data-table th:nth-child(4),
        .data-table th:nth-child(5),
        .data-table th:nth-child(6) {
          text-align: center;
          width: 100px;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #F3F4F6;
          color: #1F2937;
        }

        .data-table td:nth-child(3),
        .data-table td:nth-child(4),
        .data-table td:nth-child(5),
        .data-table td:nth-child(6) {
          text-align: center;
        }

        .data-table tbody tr {
          transition: background 0.2s;
        }

        .data-table tbody tr:hover {
          background: #F9FAFB;
        }

        .sort-indicator {
          margin-left: 8px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .perm-checkbox {
          width: 36px;
          height: 36px;
          border: 2px solid #D1D5DB;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
          font-size: 16px;
        }

        .perm-checkbox:hover {
          border-color: #E63946;
          background: #FEF2F2;
        }

        .perm-checkbox.checked {
          background: #E63946;
          border-color: #E63946;
          color: white;
        }

        .perm-checkbox.disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-top: 1px solid #E5E7EB;
          background: #FAFAFA;
        }

        .pagination-info {
          font-size: 14px;
          color: #6B7280;
        }

        .pagination-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .pagination-controls button {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          transition: all 0.2s;
        }

        .pagination-controls button:hover:not(:disabled) {
          background: #F9FAFB;
          border-color: #E63946;
          color: #E63946;
        }

        .pagination-controls button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination-controls select {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .empty-state {
          padding: 80px 20px;
          text-align: center;
          color: #9CA3AF;
        }

        .empty-state-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 16px 24px;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 9999;
          animation: slideIn 0.3s ease-out;
          max-width: 400px;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .notification.success {
          background: #10B981;
          color: white;
        }

        .notification.error {
          background: #EF4444;
          color: white;
        }

        .notification-message {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
        }
      `}</style>

      {/* Notificación flotante */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === 'success' ? (
            <Check size={20} />
          ) : (
            <AlertTriangle size={20} />
          )}
          <div className="notification-message">
            {notification.message}
          </div>
        </div>
      )}

      <div className="permissions-container">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Menú por Rol
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Configura los permisos de menús y submenús para cada rol del sistema
          </p>
        </div>

        {/* Role Selector with Search */}
        <div className="role-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#374151' }}>
            Seleccionar Rol
          </label>
          <div className="role-search-container">
            <input
              type="text"
              className="select-input"
              placeholder={selectedRoleData ? `${sanitizeHTML(selectedRoleData.name)} - ${sanitizeHTML(selectedRoleData.description || 'Sin descripción')}` : 'Buscar y seleccionar rol...'}
              value={roleSearchTerm}
              onChange={(e) => setRoleSearchTerm(e.target.value)}
              onFocus={() => setShowRoleDropdown(true)}
              onBlur={() => setTimeout(() => setShowRoleDropdown(false), 200)}
            />
            {showRoleDropdown && (
              <div className="role-dropdown">
                {filteredRoles.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>
                    No se encontraron roles
                  </div>
                ) : (
                  filteredRoles.map(role => (
                    <div
                      key={role.id}
                      className={`role-option ${selectedRole === role.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedRole(role.id)
                        setRoleSearchTerm('')
                        setShowRoleDropdown(false)
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '2px', textTransform: 'capitalize' }}>
                        {sanitizeHTML(role.name)}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        {sanitizeHTML(role.description || 'Sin descripción')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedRoleData && (
            <div className="role-info-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: '#1F2937', fontSize: '14px', textTransform: 'capitalize' }}>
                  {sanitizeHTML(selectedRoleData.name)}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                  {sanitizeHTML(selectedRoleData.description || 'Sin descripción')}
                </div>
              </div>
            </div>
          )}
        </div>

        {!selectedRole ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280', fontSize: '18px' }}>
              Selecciona un rol
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Elige un rol del selector para gestionar sus permisos de menús y submenús
            </p>
          </div>
        ) : (
          <>
            {/* Search Filter */}
            <div className="search-filter-container">
              <div style={{ position: 'relative' }}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
                >
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar menú o submenú..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="table-container">
              <table className="data-table">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className={header.column.getCanSort() ? 'sortable' : ''}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: header.index > 1 ? 'center' : 'flex-start' }}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <span className="sort-indicator">
                                {{
                                  asc: ' ↑',
                                  desc: ' ↓',
                                }[header.column.getIsSorted() as string] ?? ' ↕'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                        No se encontraron resultados
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map(row => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {table.getRowModel().rows.length > 0 && (
                <div className="pagination">
                  <div className="pagination-info">
                    Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                      table.getFilteredRowModel().rows.length
                    )}{' '}
                    de {table.getFilteredRowModel().rows.length} registros
                  </div>
                  <div className="pagination-controls">
                    <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                      {'<<'}
                    </button>
                    <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                      {'<'}
                    </button>
                    <span style={{ fontSize: '14px', color: '#6B7280' }}>
                      Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
                    </span>
                    <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                      {'>'}
                    </button>
                    <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                      {'>>'}
                    </button>
                    <select
                      value={table.getState().pagination.pageSize}
                      onChange={e => table.setPageSize(Number(e.target.value))}
                    >
                      {[10, 20, 30, 50].map(pageSize => (
                        <option key={pageSize} value={pageSize}>
                          {pageSize} por página
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
