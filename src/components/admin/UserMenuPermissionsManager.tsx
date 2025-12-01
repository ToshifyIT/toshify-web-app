// src/components/admin/UserMenuPermissionsManager.tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Menu, Submenu } from '../../types/database.types'
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

interface MenuPermission {
  menu_id: string
  menu_name: string
  menu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface SubmenuPermission {
  submenu_id: string
  menu_name: string
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

export function UserMenuPermissionsManager() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [menuPermissions, setMenuPermissions] = useState<MenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<SubmenuPermission[]>([])
  const [roleMenuPermissions, setRoleMenuPermissions] = useState<MenuPermission[]>([]) // Permisos del rol
  const [roleSubmenuPermissions, setRoleSubmenuPermissions] = useState<SubmenuPermission[]>([]) // Permisos del rol
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [showUserDropdown, setShowUserDropdown] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedUser) {
      loadUserPermissions(selectedUser)
    }
  }, [selectedUser])

  const loadData = async () => {
    setLoading(true)
    try {
      // Cargar usuarios
      const { data: usersData } = await supabase
        .from('user_profiles')
        .select('*, roles(*)')
        .order('full_name')

      // Cargar menús
      const { data: menusData } = await supabase
        .from('menus')
        .select('*')
        .eq('is_active', true)
        .order('order_index')

      // Cargar submenús
      const { data: submenusData } = await supabase
        .from('submenus')
        .select('*, menus(name)')
        .eq('is_active', true)
        .order('order_index')

      setUsers(usersData as UserWithRole[] || [])
      setMenus(menusData || [])
      setSubmenus(submenusData || [])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUserPermissions = async (userId: string) => {
    try {
      // Obtener el rol del usuario
      const user = users.find(u => u.id === userId)
      const userRoleId = user?.role_id

      console.log('📥 Cargando permisos para usuario:', userId, 'con rol:', userRoleId)

      // Cargar permisos de menú del usuario desde la tabla correcta
      const { data: menuPermsData, error: menuError } = await supabase
        .from('user_menu_permissions')
        .select(`
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
        .eq('user_id', userId)

      if (menuError) {
        console.error('Error cargando permisos de menú:', menuError)
      }

      // Cargar permisos de submenú del usuario desde la tabla correcta
      const { data: submenuPermsData, error: submenuError } = await supabase
        .from('user_submenu_permissions')
        .select(`
          submenu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          submenus (
            id,
            name,
            label,
            menu_id,
            menus (
              name
            )
          )
        `)
        .eq('user_id', userId)

      if (submenuError) {
        console.error('Error cargando permisos de submenú:', submenuError)
      }

      // Cargar permisos del ROL del usuario
      let roleMenuPerms: any[] = []
      let roleSubmenuPerms: any[] = []

      if (userRoleId) {
        console.log('🔐 Cargando permisos del rol:', userRoleId)

        // Permisos de menú del rol
        const { data: roleMenuData, error: roleMenuError } = await supabase
          .from('role_menu_permissions')
          .select(`
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
          .eq('role_id', userRoleId)

        if (roleMenuError) {
          console.error('Error cargando permisos de menú del rol:', roleMenuError)
        } else {
          roleMenuPerms = roleMenuData || []
        }

        // Permisos de submenú del rol
        const { data: roleSubmenuData, error: roleSubmenuError } = await supabase
          .from('role_submenu_permissions')
          .select(`
            submenu_id,
            can_view,
            can_create,
            can_edit,
            can_delete,
            submenus (
              id,
              name,
              label,
              menu_id,
              menus (
                name
              )
            )
          `)
          .eq('role_id', userRoleId)

        if (roleSubmenuError) {
          console.error('Error cargando permisos de submenú del rol:', roleSubmenuError)
        } else {
          roleSubmenuPerms = roleSubmenuData || []
        }
      }

      // Transformar los datos al formato esperado
      const formattedMenuPerms = (menuPermsData || []).map((p: any) => ({
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedSubmenuPerms = (submenuPermsData || []).map((p: any) => ({
        submenu_id: p.submenu_id,
        menu_name: p.submenus?.menus?.name || '',
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedRoleMenuPerms = roleMenuPerms.map((p: any) => ({
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedRoleSubmenuPerms = roleSubmenuPerms.map((p: any) => ({
        submenu_id: p.submenu_id,
        menu_name: p.submenus?.menus?.name || '',
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      console.log('✅ Permisos de menú (usuario):', formattedMenuPerms)
      console.log('✅ Permisos de submenú (usuario):', formattedSubmenuPerms)
      console.log('🔐 Permisos de menú (rol):', formattedRoleMenuPerms)
      console.log('🔐 Permisos de submenú (rol):', formattedRoleSubmenuPerms)

      setMenuPermissions(formattedMenuPerms)
      setSubmenuPermissions(formattedSubmenuPerms)
      setRoleMenuPermissions(formattedRoleMenuPerms)
      setRoleSubmenuPermissions(formattedRoleSubmenuPerms)
    } catch (err) {
      console.error('❌ Error cargando permisos:', err)
    }
  }

  const toggleMenuPermission = useCallback(async (
    menuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    if (!selectedUser) {
      console.log('⚠️ No hay usuario seleccionado')
      return
    }

    console.log('🔄 Toggling menu permission:', { menuId, field, selectedUser })

    setSaving(true)
    try {
      const existingPerm = menuPermissions.find(p => p.menu_id === menuId)
      const newValue = existingPerm ? !existingPerm[field] : true

      console.log('📝 Estado actual:', existingPerm)
      console.log('✨ Nuevo valor:', newValue)

      if (existingPerm) {
        // Actualizar permiso existente
        console.log('🔧 Actualizando permiso existente...')
        const { data, error } = await supabase
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('user_id', selectedUser)
          .eq('menu_id', menuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        // Crear nuevo permiso
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: selectedUser,
            menu_id: menuId,
            can_view: field === 'can_view',
            can_create: field === 'can_create',
            can_edit: field === 'can_edit',
            can_delete: field === 'can_delete'
          }])
          .select()

        console.log('📦 Respuesta insert:', { data, error })
        if (error) throw error
      }

      console.log('✅ Permiso de menú actualizado, actualizando estado local...')

      // Actualizar el estado local sin recargar desde el servidor
      setMenuPermissions(prev => {
        const index = prev.findIndex(p => p.menu_id === menuId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], [field]: newValue }
          return updated
        } else {
          // Agregar nuevo permiso al estado
          const menu = menus.find(m => m.id === menuId)
          return [...prev, {
            menu_id: menuId,
            menu_name: menu?.name || '',
            menu_label: menu?.label || '',
            can_view: field === 'can_view' ? newValue : false,
            can_create: field === 'can_create' ? newValue : false,
            can_edit: field === 'can_edit' ? newValue : false,
            can_delete: field === 'can_delete' ? newValue : false
          }]
        }
      })
    } catch (err: any) {
      console.error('❌ Error actualizando permiso:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }, [selectedUser, menuPermissions, menus])

  const toggleSubmenuPermission = useCallback(async (
    submenuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    if (!selectedUser) {
      console.log('⚠️ No hay usuario seleccionado')
      return
    }

    console.log('🔄 Toggling submenu permission:', { submenuId, field, selectedUser })

    setSaving(true)
    try {
      const existingPerm = submenuPermissions.find(p => p.submenu_id === submenuId)
      const newValue = existingPerm ? !existingPerm[field] : true

      console.log('📝 Estado actual:', existingPerm)
      console.log('✨ Nuevo valor:', newValue)

      if (existingPerm) {
        console.log('🔧 Actualizando permiso existente...')
        const { data, error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('user_id', selectedUser)
          .eq('submenu_id', submenuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: selectedUser,
            submenu_id: submenuId,
            can_view: field === 'can_view',
            can_create: field === 'can_create',
            can_edit: field === 'can_edit',
            can_delete: field === 'can_delete'
          }])
          .select()

        console.log('📦 Respuesta insert:', { data, error })
        if (error) throw error
      }

      console.log('✅ Permiso de submenú actualizado, actualizando estado local...')

      // Actualizar el estado local sin recargar desde el servidor
      setSubmenuPermissions(prev => {
        const index = prev.findIndex(p => p.submenu_id === submenuId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], [field]: newValue }
          return updated
        } else {
          // Agregar nuevo permiso al estado
          const submenu = submenus.find(s => s.id === submenuId)
          const menu = menus.find(m => m.id === submenu?.menu_id)
          return [...prev, {
            submenu_id: submenuId,
            menu_name: menu?.name || '',
            submenu_name: submenu?.name || '',
            submenu_label: submenu?.label || '',
            can_view: field === 'can_view' ? newValue : false,
            can_create: field === 'can_create' ? newValue : false,
            can_edit: field === 'can_edit' ? newValue : false,
            can_delete: field === 'can_delete' ? newValue : false
          }]
        }
      })
    } catch (err: any) {
      console.error('❌ Error actualizando permiso:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }, [selectedUser, submenuPermissions, submenus])

  // Obtener permiso con herencia del rol
  const getMenuPermission = (menuId: string, field: keyof MenuPermission) => {
    // Prioridad: permisos del usuario > permisos del rol
    const userPerm = menuPermissions.find(p => p.menu_id === menuId)
    if (userPerm) {
      return userPerm[field]
    }

    // Si no hay permiso del usuario, heredar del rol
    const rolePerm = roleMenuPermissions.find(p => p.menu_id === menuId)
    return rolePerm ? rolePerm[field] : false
  }

  // Obtener permiso con herencia del rol
  const getSubmenuPermission = (submenuId: string, field: keyof SubmenuPermission) => {
    // Prioridad: permisos del usuario > permisos del rol
    const userPerm = submenuPermissions.find(p => p.submenu_id === submenuId)
    if (userPerm) {
      return userPerm[field]
    }

    // Si no hay permiso del usuario, heredar del rol
    const rolePerm = roleSubmenuPermissions.find(p => p.submenu_id === submenuId)
    return rolePerm ? rolePerm[field] : false
  }

  // Verificar si un permiso es heredado del rol (no tiene override del usuario)
  const isMenuPermissionInherited = (menuId: string): boolean => {
    return !menuPermissions.some(p => p.menu_id === menuId)
  }

  const isSubmenuPermissionInherited = (submenuId: string): boolean => {
    return !submenuPermissions.some(p => p.submenu_id === submenuId)
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
  }, [menus, submenus, menuPermissions, submenuPermissions, roleMenuPermissions, roleSubmenuPermissions])

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
        cell: ({ row }) => {
          const isInherited = row.original.type === 'menu' && row.original.menu_id
            ? isMenuPermissionInherited(row.original.menu_id)
            : row.original.type === 'submenu' && row.original.submenu_id
            ? isSubmenuPermissionInherited(row.original.submenu_id)
            : false

          return (
            <div
              className={`perm-checkbox ${row.original.can_view ? 'checked' : ''} ${isInherited ? 'inherited' : ''} ${saving ? 'disabled' : ''}`}
              onClick={(e) => {
                console.log('🖱️ Click en checkbox Ver', {
                  saving,
                  type: row.original.type,
                  menu_id: row.original.menu_id,
                  submenu_id: row.original.submenu_id,
                  selectedUser,
                  isInherited,
                  event: e
                })
                if (saving) {
                  console.log('⏸️ Click ignorado: saving=true')
                  return
                }
                if (!selectedUser) {
                  console.log('⏸️ Click ignorado: no selectedUser')
                  return
                }
                if (row.original.type === 'menu' && row.original.menu_id) {
                  console.log('✅ Llamando toggleMenuPermission')
                  toggleMenuPermission(row.original.menu_id, 'can_view')
                } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                  console.log('✅ Llamando toggleSubmenuPermission')
                  toggleSubmenuPermission(row.original.submenu_id, 'can_view')
                } else {
                  console.log('⚠️ No se pudo determinar tipo o ID')
                }
              }}
              title={isInherited ? 'Permiso heredado del rol' : 'Permiso específico del usuario'}
            >
              {row.original.can_view && <Check size={16} />}
              {isInherited && row.original.can_view && (
                <div className="inherited-badge">R</div>
              )}
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'can_create',
        header: 'Crear',
        cell: ({ row }) => {
          const isInherited = row.original.type === 'menu' && row.original.menu_id
            ? isMenuPermissionInherited(row.original.menu_id)
            : row.original.type === 'submenu' && row.original.submenu_id
            ? isSubmenuPermissionInherited(row.original.submenu_id)
            : false

          return (
            <div
              className={`perm-checkbox ${row.original.can_create ? 'checked' : ''} ${isInherited ? 'inherited' : ''} ${saving ? 'disabled' : ''}`}
              onClick={() => {
                console.log('🖱️ Click en checkbox Crear', { saving, selectedUser, isInherited })
                if (saving) return
                if (!selectedUser) return
                if (row.original.type === 'menu' && row.original.menu_id) {
                  toggleMenuPermission(row.original.menu_id, 'can_create')
                } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                  toggleSubmenuPermission(row.original.submenu_id, 'can_create')
                }
              }}
              title={isInherited ? 'Permiso heredado del rol' : 'Permiso específico del usuario'}
            >
              {row.original.can_create && <Check size={16} />}
              {isInherited && row.original.can_create && (
                <div className="inherited-badge">R</div>
              )}
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'can_edit',
        header: 'Editar',
        cell: ({ row }) => {
          const isInherited = row.original.type === 'menu' && row.original.menu_id
            ? isMenuPermissionInherited(row.original.menu_id)
            : row.original.type === 'submenu' && row.original.submenu_id
            ? isSubmenuPermissionInherited(row.original.submenu_id)
            : false

          return (
            <div
              className={`perm-checkbox ${row.original.can_edit ? 'checked' : ''} ${isInherited ? 'inherited' : ''} ${saving ? 'disabled' : ''}`}
              onClick={() => {
                console.log('🖱️ Click en checkbox Editar', { saving, selectedUser, isInherited })
                if (saving) return
                if (!selectedUser) return
                if (row.original.type === 'menu' && row.original.menu_id) {
                  toggleMenuPermission(row.original.menu_id, 'can_edit')
                } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                  toggleSubmenuPermission(row.original.submenu_id, 'can_edit')
                }
              }}
              title={isInherited ? 'Permiso heredado del rol' : 'Permiso específico del usuario'}
            >
              {row.original.can_edit && <Check size={16} />}
              {isInherited && row.original.can_edit && (
                <div className="inherited-badge">R</div>
              )}
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'can_delete',
        header: 'Eliminar',
        cell: ({ row }) => {
          const isInherited = row.original.type === 'menu' && row.original.menu_id
            ? isMenuPermissionInherited(row.original.menu_id)
            : row.original.type === 'submenu' && row.original.submenu_id
            ? isSubmenuPermissionInherited(row.original.submenu_id)
            : false

          return (
            <div
              className={`perm-checkbox ${row.original.can_delete ? 'checked' : ''} ${isInherited ? 'inherited' : ''} ${saving ? 'disabled' : ''}`}
              onClick={() => {
                console.log('🖱️ Click en checkbox Eliminar', { saving, selectedUser, isInherited })
                if (saving) return
                if (!selectedUser) return
                if (row.original.type === 'menu' && row.original.menu_id) {
                  toggleMenuPermission(row.original.menu_id, 'can_delete')
                } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                  toggleSubmenuPermission(row.original.submenu_id, 'can_delete')
                }
              }}
              title={isInherited ? 'Permiso heredado del rol' : 'Permiso específico del usuario'}
            >
              {row.original.can_delete && <Check size={16} />}
              {isInherited && row.original.can_delete && (
                <div className="inherited-badge">R</div>
              )}
            </div>
          )
        },
        enableSorting: true,
      },
    ],
    [saving, selectedUser, toggleMenuPermission, toggleSubmenuPermission, menuPermissions, submenuPermissions, roleMenuPermissions, roleSubmenuPermissions]
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

  const selectedUserData = users.find(u => u.id === selectedUser)

  // Filtrar usuarios según búsqueda
  const filteredUsers = users.filter(user =>
    (user.full_name && user.full_name.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
    (user.roles?.name && user.roles.name.toLowerCase().includes(userSearchTerm.toLowerCase()))
  )

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  return (
    <div>
      <style>{`
        .permissions-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .user-selector {
          margin-bottom: 30px;
          padding: 24px;
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .user-search-container {
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

        .user-dropdown {
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

        .user-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid #F3F4F6;
        }

        .user-option:last-child {
          border-bottom: none;
        }

        .user-option:hover {
          background: #F9FAFB;
        }

        .user-option.selected {
          background: #FEF2F2;
          color: #E63946;
          font-weight: 600;
        }

        .user-info-banner {
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
          position: relative;
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

        .perm-checkbox.inherited {
          border-style: dashed;
          border-width: 2px;
          opacity: 0.7;
        }

        .perm-checkbox.inherited.checked {
          background: #93C5FD;
          border-color: #3B82F6;
        }

        .perm-checkbox.disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .inherited-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #3B82F6;
          color: white;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
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
      `}</style>

      <div className="permissions-container">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Menú por Usuario
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Asigna permisos de menús y submenús específicos para cada usuario
          </p>
        </div>

        {/* User Selector with Search */}
        <div className="user-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#374151' }}>
            Seleccionar Usuario
          </label>
          <div className="user-search-container">
            <input
              type="text"
              className="select-input"
              placeholder={selectedUserData ? `${selectedUserData.full_name || 'Sin nombre'} (${selectedUserData.roles?.name || 'Sin rol'})` : 'Buscar y seleccionar usuario...'}
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              onFocus={() => setShowUserDropdown(true)}
              onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
            />
            {showUserDropdown && (
              <div className="user-dropdown">
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>
                    No se encontraron usuarios
                  </div>
                ) : (
                  filteredUsers.map(user => (
                    <div
                      key={user.id}
                      className={`user-option ${selectedUser === user.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedUser(user.id)
                        setUserSearchTerm('')
                        setShowUserDropdown(false)
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                        {user.full_name || 'Sin nombre'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        {user.roles?.name || 'Sin rol'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedUserData && (
            <div className="user-info-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: '#1F2937', fontSize: '14px' }}>
                  {selectedUserData.full_name || 'Sin nombre'}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                  {selectedUserData.roles?.name || 'Sin rol'}
                </div>
              </div>
            </div>
          )}
        </div>

        {!selectedUser ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280', fontSize: '18px' }}>
              Selecciona un usuario
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Elige un usuario del selector para gestionar sus permisos de menús
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
