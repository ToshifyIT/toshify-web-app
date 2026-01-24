// src/components/admin/UserMenuPermissionsManager.tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, AlertTriangle, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import { useAuth } from '../../contexts/AuthContext'
import './AdminStyles.css'
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
  submenuCount?: number
  parentMenuId?: string
  level?: number // 0 = menu, 1 = submenu nivel 1, 2 = sub-submenu, etc.
}

export function UserMenuPermissionsManager() {
  // =====================================================
  // AUTENTICACIÓN Y AUTORIZACIÓN
  // =====================================================
  const { user, profile } = useAuth()
  const [authError, setAuthError] = useState<string>('')

  // Estados
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
    if (selectedUser) {
      loadUserPermissions(selectedUser)
    }
  }, [selectedUser])

  const loadData = async () => {
    if (authError) return // No cargar si no tiene permisos

    setLoading(true)
    try {
      // Cargar usuarios
      const { data: usersData, error: usersError } = await supabase
        .from('user_profiles')
        .select('*, roles(*)')
        .order('full_name')

      if (usersError) throw usersError

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
      setUsers((usersData as UserWithRole[] || []).map(user => sanitizeObject(user)))
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

  const loadUserPermissions = async (userId: string) => {
    try {
      // Validar UUID del usuario
      const validatedUserId = UUIDSchema.parse(userId)

      // Obtener el rol del usuario
      const user = users.find(u => u.id === validatedUserId)
      const userRoleId = user?.role_id

      devLog.info('📥 Cargando permisos para usuario:', validatedUserId, 'con rol:', userRoleId)

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
        .eq('user_id', validatedUserId)

      if (menuError) throw menuError

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
        .eq('user_id', validatedUserId)

      if (submenuError) throw submenuError

      // Cargar permisos del ROL del usuario
      let roleMenuPerms: any[] = []
      let roleSubmenuPerms: any[] = []

      if (userRoleId) {
        const validatedRoleId = UUIDSchema.parse(userRoleId)
        devLog.info('🔐 Cargando permisos del rol:', validatedRoleId)

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
          .eq('role_id', validatedRoleId)

        if (roleMenuError) throw roleMenuError
        roleMenuPerms = roleMenuData || []

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
          .eq('role_id', validatedRoleId)

        if (roleSubmenuError) throw roleSubmenuError
        roleSubmenuPerms = roleSubmenuData || []
      }

      // Transformar y sanitizar los datos al formato esperado
      const formattedMenuPerms = (menuPermsData || []).map((p: any) => sanitizeObject({
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedSubmenuPerms = (submenuPermsData || []).map((p: any) => sanitizeObject({
        submenu_id: p.submenu_id,
        menu_name: p.submenus?.menus?.name || '',
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedRoleMenuPerms = roleMenuPerms.map((p: any) => sanitizeObject({
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedRoleSubmenuPerms = roleSubmenuPerms.map((p: any) => sanitizeObject({
        submenu_id: p.submenu_id,
        menu_name: p.submenus?.menus?.name || '',
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      devLog.info('✅ Permisos cargados:', {
        menuPerms: formattedMenuPerms.length,
        submenuPerms: formattedSubmenuPerms.length,
        roleMenuPerms: formattedRoleMenuPerms.length,
        roleSubmenuPerms: formattedRoleSubmenuPerms.length
      })

      setMenuPermissions(formattedMenuPerms)
      setSubmenuPermissions(formattedSubmenuPerms)
      setRoleMenuPermissions(formattedRoleMenuPerms)
      setRoleSubmenuPermissions(formattedRoleSubmenuPerms)
    } catch (err) {
      if (err instanceof z.ZodError) {
        devLog.error('❌ Error de validación:', err.issues)
        setNotification({
          type: 'error',
          message: 'Datos inválidos. Por favor, recarga la página.'
        })
      } else {
        const safeError = handleDatabaseError(err)
        devLog.error('Error cargando permisos:', safeError.logMessage)
        setNotification({
          type: 'error',
          message: safeError.userMessage
        })
      }
    }
  }

  const toggleMenuPermission = useCallback(async (
    menuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    // 1. Verificar que hay usuario seleccionado
    if (!selectedUser) {
      devLog.warn('⚠️ No hay usuario seleccionado')
      setNotification({
        type: 'error',
        message: 'Debes seleccionar un usuario primero'
      })
      return
    }

    // 2. Rate limiting
    const rateLimitKey = `toggle_user_menu_${user?.id}_${selectedUser}`
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
      const validatedUserId = UUIDSchema.parse(selectedUser)
      const validatedMenuId = UUIDSchema.parse(menuId)
      const validatedField = PermissionFieldSchema.parse(field)

      devLog.info('🔄 Toggling menu permission:', { menuId: validatedMenuId, field: validatedField, userId: validatedUserId })

      const existingPerm = menuPermissions.find(p => p.menu_id === validatedMenuId)
      const newValue = existingPerm ? !existingPerm[validatedField] : true

      if (existingPerm) {
        // Actualizar permiso existente
        const { error } = await supabase
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [validatedField]: newValue })
          .eq('user_id', validatedUserId)
          .eq('menu_id', validatedMenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso - heredar valores del rol primero
        const rolePerm = roleMenuPermissions.find(p => p.menu_id === validatedMenuId)
        const basePerms = {
          can_view: rolePerm?.can_view || false,
          can_create: rolePerm?.can_create || false,
          can_edit: rolePerm?.can_edit || false,
          can_delete: rolePerm?.can_delete || false
        }
        // Sobrescribir solo el campo que se está cambiando
        basePerms[validatedField] = newValue

        const { error } = await supabase
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: validatedUserId,
            menu_id: validatedMenuId,
            ...basePerms
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
          // Agregar nuevo permiso al estado - heredar del rol
          const menu = menus.find(m => m.id === validatedMenuId)
          const rolePerm = roleMenuPermissions.find(p => p.menu_id === validatedMenuId)
          return [...prev, {
            menu_id: validatedMenuId,
            menu_name: menu?.name || '',
            menu_label: menu?.label || '',
            can_view: validatedField === 'can_view' ? newValue : (rolePerm?.can_view || false),
            can_create: validatedField === 'can_create' ? newValue : (rolePerm?.can_create || false),
            can_edit: validatedField === 'can_edit' ? newValue : (rolePerm?.can_edit || false),
            can_delete: validatedField === 'can_delete' ? newValue : (rolePerm?.can_delete || false)
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
      setTimeout(() => setNotification(null), 3000)
    }
  }, [selectedUser, menuPermissions, menus, user, roleMenuPermissions])

  const toggleSubmenuPermission = useCallback(async (
    submenuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    // 1. Verificar que hay usuario seleccionado
    if (!selectedUser) {
      devLog.warn('⚠️ No hay usuario seleccionado')
      setNotification({
        type: 'error',
        message: 'Debes seleccionar un usuario primero'
      })
      return
    }

    // 2. Rate limiting
    const rateLimitKey = `toggle_user_submenu_${user?.id}_${selectedUser}`
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
      const validatedUserId = UUIDSchema.parse(selectedUser)
      const validatedSubmenuId = UUIDSchema.parse(submenuId)
      const validatedField = PermissionFieldSchema.parse(field)

      devLog.info('🔄 Toggling submenu permission:', { submenuId: validatedSubmenuId, field: validatedField, userId: validatedUserId })

      const existingPerm = submenuPermissions.find(p => p.submenu_id === validatedSubmenuId)
      const newValue = existingPerm ? !existingPerm[validatedField] : true

      if (existingPerm) {
        // Actualizar permiso existente
        const { error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [validatedField]: newValue })
          .eq('user_id', validatedUserId)
          .eq('submenu_id', validatedSubmenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso - heredar valores del rol primero
        const rolePerm = roleSubmenuPermissions.find(p => p.submenu_id === validatedSubmenuId)
        const basePerms = {
          can_view: rolePerm?.can_view || false,
          can_create: rolePerm?.can_create || false,
          can_edit: rolePerm?.can_edit || false,
          can_delete: rolePerm?.can_delete || false
        }
        // Sobrescribir solo el campo que se está cambiando
        basePerms[validatedField] = newValue

        const { error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: validatedUserId,
            submenu_id: validatedSubmenuId,
            ...basePerms
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
          // Agregar nuevo permiso al estado - heredar del rol
          const submenu = submenus.find(s => s.id === validatedSubmenuId)
          const menu = menus.find(m => m.id === submenu?.menu_id)
          const rolePerm = roleSubmenuPermissions.find(p => p.submenu_id === validatedSubmenuId)
          return [...prev, {
            submenu_id: validatedSubmenuId,
            menu_name: menu?.name || '',
            submenu_name: submenu?.name || '',
            submenu_label: submenu?.label || '',
            can_view: validatedField === 'can_view' ? newValue : (rolePerm?.can_view || false),
            can_create: validatedField === 'can_create' ? newValue : (rolePerm?.can_create || false),
            can_edit: validatedField === 'can_edit' ? newValue : (rolePerm?.can_edit || false),
            can_delete: validatedField === 'can_delete' ? newValue : (rolePerm?.can_delete || false)
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
      setTimeout(() => setNotification(null), 3000)
    }
  }, [selectedUser, submenuPermissions, submenus, menus, user, roleSubmenuPermissions])

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

  // Función para calcular el nivel de profundidad de un submenú
  const getSubmenuLevel = (submenuId: string, allSubmenus: any[]): number => {
    const submenu = allSubmenus.find(s => s.id === submenuId)
    if (!submenu || !submenu.parent_id) {
      return 1 // Nivel 1: submenú directo del menú
    }
    // Si tiene parent_id, es un sub-submenú (nivel 2+)
    return 1 + getSubmenuLevel(submenu.parent_id, allSubmenus)
  }

  // Función recursiva para agregar submenús en orden jerárquico
  const addSubmenusHierarchically = (
    parentId: string | null,
    menuSubmenus: any[],
    menu: any,
    rows: PermissionRow[],
    level: number
  ) => {
    // Filtrar submenús que tienen este parent_id
    const children = menuSubmenus.filter((sm: any) => {
      if (parentId === null) {
        // Submenús de nivel 1: no tienen parent_id
        return !sm.parent_id
      }
      return sm.parent_id === parentId
    })

    children.forEach((submenu: any) => {
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
        submenu_id: submenu.id,
        parentMenuId: menu.id,
        level: level
      })

      // Recursivamente agregar los hijos de este submenú
      addSubmenusHierarchically(submenu.id, menuSubmenus, menu, rows, level + 1)
    })
  }

  // Crear estructura de datos plana para la tabla - con jerarquía de niveles
  const tableData = useMemo<PermissionRow[]>(() => {
    const rows: PermissionRow[] = []

    menus.forEach(menu => {
      const menuSubmenus = submenus.filter((sm: any) => sm.menus?.name === menu.name)

      // Agregar fila del menú (nivel 0)
      rows.push({
        id: menu.id,
        type: 'menu',
        name: menu.name,
        label: menu.label,
        can_view: getMenuPermission(menu.id, 'can_view') as boolean,
        can_create: getMenuPermission(menu.id, 'can_create') as boolean,
        can_edit: getMenuPermission(menu.id, 'can_edit') as boolean,
        can_delete: getMenuPermission(menu.id, 'can_delete') as boolean,
        menu_id: menu.id,
        submenuCount: menuSubmenus.length,
        level: 0
      })

      // Agregar submenús jerárquicamente (nivel 1, 2, 3...)
      addSubmenusHierarchically(null, menuSubmenus, menu, rows, 1)
    })

    return rows
  }, [menus, submenus, menuPermissions, submenuPermissions, roleMenuPermissions, roleSubmenuPermissions])

  // Definir columnas
  const columns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Módulo',
        cell: ({ row }) => {
          const isSubmenu = row.original.type === 'submenu'
          const level = row.original.level || 0

          return (
            <div className={`module-cell ${isSubmenu ? 'is-submenu' : 'is-menu'} level-${level}`}>
              {isSubmenu && <span className="submenu-indicator">└─</span>}
              <span className="module-name">
                {row.original.label}
              </span>
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
              onClick={() => {
                if (saving) return
                if (!selectedUser) return
                if (row.original.type === 'menu' && row.original.menu_id) {
                  toggleMenuPermission(row.original.menu_id, 'can_view')
                } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                  toggleSubmenuPermission(row.original.submenu_id, 'can_view')
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

  // Filtrar usuarios según búsqueda con validación
  const filteredUsers = useMemo(() => {
    try {
      const sanitizedSearch = SearchTermSchema.parse(userSearchTerm).toLowerCase()
      return users.filter(user =>
        (user.full_name && user.full_name.toLowerCase().includes(sanitizedSearch)) ||
        (user.roles?.name && user.roles.name.toLowerCase().includes(sanitizedSearch))
      )
    } catch {
      return users
    }
  }, [users, userSearchTerm])

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  // Mostrar pantalla de acceso denegado si no tiene permisos
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
    <div className="admin-module">
      <LoadingOverlay show={loading} message="Cargando permisos..." size="lg" />
      <style>{`
        .permissions-container {
          width: 100%;
        }

        .user-selector {
          margin-bottom: 16px;
          padding: 20px;
          background: var(--bg-primary);
          border-radius: 8px;
          border: 1px solid var(--border-primary);
        }

        .user-search-container {
          position: relative;
        }

        .select-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 14px;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          background: var(--input-bg);
          color: var(--text-primary);
          transition: border-color 0.2s;
          cursor: pointer;
        }

        .select-input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
        }

        .user-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: var(--modal-bg);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          max-height: 300px;
          overflow-y: auto;
          z-index: 1000;
        }

        .user-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid var(--border-primary);
          color: var(--text-primary);
        }

        .user-option:last-child {
          border-bottom: none;
        }

        .user-option:hover {
          background: var(--bg-secondary);
        }

        .user-option.selected {
          background: var(--badge-red-bg);
          color: var(--color-primary);
          font-weight: 600;
        }

        .user-info-banner {
          margin-top: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .search-filter-container {
          margin-bottom: 16px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 42px;
          font-size: 14px;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          background: var(--input-bg);
          color: var(--text-primary);
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .table-container {
          background: var(--bg-primary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          overflow: hidden;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: var(--bg-secondary);
          padding: 12px 16px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-primary);
          cursor: pointer;
          user-select: none;
        }

        .data-table th:first-child {
          width: 45%;
        }

        .data-table th.sortable:hover {
          background: var(--bg-tertiary);
        }

        .data-table th:nth-child(2),
        .data-table th:nth-child(3),
        .data-table th:nth-child(4),
        .data-table th:nth-child(5) {
          text-align: center;
          width: 80px;
        }

        .data-table td {
          padding: 0;
          border-bottom: 1px solid var(--border-primary);
          color: var(--text-primary);
          vertical-align: middle;
        }

        .data-table td:nth-child(2),
        .data-table td:nth-child(3),
        .data-table td:nth-child(4),
        .data-table td:nth-child(5) {
          text-align: center;
          padding: 12px 16px;
        }

        .data-table tbody tr {
          transition: background 0.15s;
        }

        .data-table tbody tr:hover {
          background: var(--bg-hover, rgba(0,0,0,0.02));
        }

        /* Menu Row - Principal */
        .data-table tbody tr.menu-row {
          background: var(--bg-primary);
        }

        .data-table tbody tr.menu-row:hover {
          background: var(--bg-hover, rgba(0,0,0,0.02));
        }

        /* Submenu Row - Indentado con borde izquierdo */
        .data-table tbody tr.submenu-row {
          background: var(--bg-secondary);
        }

        .data-table tbody tr.submenu-row:hover {
          background: var(--bg-tertiary, var(--bg-secondary));
        }

        /* Row styling por nivel */
        .data-table tbody tr.submenu-row.level-2 {
          background: rgba(249, 115, 22, 0.03);
        }

        .data-table tbody tr.submenu-row.level-2:hover {
          background: rgba(249, 115, 22, 0.08);
        }

        .data-table tbody tr.submenu-row.level-3 {
          background: rgba(234, 179, 8, 0.03);
        }

        .data-table tbody tr.submenu-row.level-3:hover {
          background: rgba(234, 179, 8, 0.08);
        }

        /* Module Cell */
        .module-cell {
          display: flex;
          align-items: center;
          min-height: 48px;
          padding: 12px 16px;
        }

        .module-cell.is-menu {
          padding-left: 16px;
        }

        /* Nivel 1: Submenú directo del menú */
        .module-cell.is-submenu.level-1 {
          padding-left: 40px;
          border-left: 3px solid #E63946;
          background: linear-gradient(90deg, rgba(230, 57, 70, 0.05) 0%, transparent 100%);
        }

        /* Nivel 2: Sub-submenú */
        .module-cell.is-submenu.level-2 {
          padding-left: 70px;
          border-left: 3px solid #F97316;
          background: linear-gradient(90deg, rgba(249, 115, 22, 0.05) 0%, transparent 100%);
        }

        /* Nivel 3+: Sub-sub-submenú */
        .module-cell.is-submenu.level-3 {
          padding-left: 100px;
          border-left: 3px solid #EAB308;
          background: linear-gradient(90deg, rgba(234, 179, 8, 0.05) 0%, transparent 100%);
        }

        .module-name {
          font-size: 14px;
          line-height: 1.4;
        }

        .module-cell.is-menu .module-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .module-cell.is-submenu .module-name {
          font-weight: 400;
          color: var(--text-secondary);
        }

        /* Indicadores por nivel */
        .module-cell.level-1 .submenu-indicator {
          color: #E63946;
          font-weight: 600;
          margin-right: 8px;
          font-family: monospace;
        }

        .module-cell.level-2 .submenu-indicator {
          color: #F97316;
          font-weight: 600;
          margin-right: 8px;
          font-family: monospace;
        }

        .module-cell.level-3 .submenu-indicator {
          color: #EAB308;
          font-weight: 600;
          margin-right: 8px;
          font-family: monospace;
        }

        .submenu-indicator {
          color: #E63946;
          font-weight: 600;
          margin-right: 8px;
          font-family: monospace;
        }

        .sort-indicator {
          margin-left: 6px;
          color: var(--text-tertiary);
          font-size: 12px;
        }

        .perm-checkbox {
          width: 32px;
          height: 32px;
          border: 2px solid var(--border-primary);
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          background: var(--input-bg);
          font-size: 14px;
          position: relative;
        }

        .perm-checkbox:hover {
          border-color: #E63946;
          background: rgba(230, 57, 70, 0.08);
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
          padding: 12px 16px;
          border-top: 1px solid var(--border-primary);
          background: var(--bg-secondary);
        }

        .pagination-info {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .pagination-controls {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .pagination-controls button {
          padding: 6px 10px;
          border: 1px solid var(--border-primary);
          background: var(--bg-primary);
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          transition: all 0.15s;
        }

        .pagination-controls button:hover:not(:disabled) {
          background: var(--bg-hover, var(--bg-secondary));
          border-color: #E63946;
          color: #E63946;
        }

        .pagination-controls button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination-controls select {
          padding: 6px 10px;
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          font-size: 13px;
          background: var(--input-bg);
          color: var(--text-primary);
          cursor: pointer;
        }

        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: var(--text-muted);
        }

        .empty-state-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          padding: 16px 20px;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 300px;
          max-width: 500px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateX(400px);
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

      {/* Notification Component */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === 'success' ? <Check size={20} /> : <AlertTriangle size={20} />}
          <div className="notification-message">{notification.message}</div>
        </div>
      )}

      <div className="permissions-container">
        {/* User Selector with Search */}
        <div className="user-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            Seleccionar Usuario
          </label>
          <div className="user-search-container">
            <input
              type="text"
              className="select-input"
              placeholder={selectedUserData ? `${sanitizeHTML(selectedUserData.full_name || 'Sin nombre')} (${sanitizeHTML(selectedUserData.roles?.name || 'Sin rol')})` : 'Buscar y seleccionar usuario...'}
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              onFocus={() => setShowUserDropdown(true)}
              onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
            />
            {showUserDropdown && (
              <div className="user-dropdown">
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                        {sanitizeHTML(user.full_name || 'Sin nombre')}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {sanitizeHTML(user.roles?.name || 'Sin rol')}
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
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                  {sanitizeHTML(selectedUserData.full_name || 'Sin nombre')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {sanitizeHTML(selectedUserData.roles?.name || 'Sin rol')}
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
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '18px' }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: header.index > 0 ? 'center' : 'flex-start' }}>
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
                      <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No se encontraron resultados
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map(row => {
                      const level = row.original.level || 0
                      const rowClass = row.original.type === 'submenu'
                        ? `submenu-row level-${level}`
                        : 'menu-row'
                      return (
                        <tr key={row.id} className={rowClass}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      )
                    })
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
