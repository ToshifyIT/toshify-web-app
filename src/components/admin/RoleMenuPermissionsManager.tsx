// src/components/admin/RoleMenuPermissionsManager.tsx
import { useState, useEffect, useMemo } from 'react'
import { Check, AlertTriangle, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import { useAuth } from '../../contexts/AuthContext'
import './AdminStyles.css'
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

interface RoleTabPermission {
  role_id: string
  tab_id: string
  tab_name: string
  tab_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface TabRecord {
  id: string
  name: string
  label: string
  menu_id: string | null
  submenu_id: string | null
  order_index: number
}

interface PermissionRow {
  id: string
  type: 'menu' | 'submenu' | 'tab'
  name: string
  label: string
  parentLabel?: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  menu_id?: string
  submenu_id?: string
  tab_id?: string
  submenuCount?: number
  parentMenuId?: string
  level?: number // 0 = menu, 1 = submenu nivel 1, 2 = sub-submenu, 3 = tab, etc.
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
  const [tabs, setTabs] = useState<TabRecord[]>([])
  const [menuPermissions, setMenuPermissions] = useState<RoleMenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<RoleSubmenuPermission[]>([])
  const [tabPermissions, setTabPermissions] = useState<RoleTabPermission[]>([])
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

      // Cargar tabs
      const { data: tabsData, error: tabsError } = await supabase
        .from('tabs')
        .select('id, name, label, menu_id, submenu_id, order_index')
        .eq('is_active', true)
        .order('order_index')

      if (tabsError) throw tabsError

      // Sanitizar datos antes de guardar en estado
      setRoles((rolesData || []).map(role => sanitizeObject(role)))
      setMenus((menusData || []).map(menu => sanitizeObject(menu)))
      setSubmenus((submenusData || []).map(submenu => sanitizeObject(submenu)))
      setTabs((tabsData || []).map(tab => sanitizeObject(tab)))

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

      // Cargar permisos de tabs del rol
      const { data: tabPermsData, error: tabError } = await supabase
        .from('role_tab_permissions')
        .select(`
          role_id,
          tab_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          tabs (
            id,
            name,
            label
          )
        `)
        .eq('role_id', validatedRoleId)

      if (tabError) throw tabError

      const formattedTabPerms = (tabPermsData || []).map((p: any) => sanitizeObject({
        role_id: p.role_id,
        tab_id: p.tab_id,
        tab_name: p.tabs?.name || '',
        tab_label: p.tabs?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      devLog.info('✅ Permisos cargados:', {
        menus: formattedMenuPerms.length,
        submenus: formattedSubmenuPerms.length,
        tabs: formattedTabPerms.length
      })

      setMenuPermissions(formattedMenuPerms)
      setSubmenuPermissions(formattedSubmenuPerms)
      setTabPermissions(formattedTabPerms)
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
          .update({ [validatedField]: newValue })
          .eq('role_id', validatedRoleId)
          .eq('menu_id', validatedMenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso
        devLog.info('➕ Creando nuevo permiso')
        const { error } = await supabase
          .from('role_menu_permissions')
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
          .update({ [validatedField]: newValue })
          .eq('role_id', validatedRoleId)
          .eq('submenu_id', validatedSubmenuId)

        if (error) throw error
      } else {
        // Crear nuevo permiso
        devLog.info('➕ Creando nuevo permiso')
        const { error } = await supabase
          .from('role_submenu_permissions')
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

  const getTabPermission = (tabId: string, field: keyof RoleTabPermission) => {
    const perm = tabPermissions.find(p => p.tab_id === tabId)
    return perm ? perm[field] : false
  }

  const toggleTabPermission = async (
    tabId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    if (!selectedRole) return

    const rateLimitKey = `toggle_tab_${user?.id}_${selectedRole}`
    if (!rateLimiter.check(rateLimitKey)) {
      setNotification({ type: 'error', message: 'Demasiados cambios. Por favor, espera un momento.' })
      return
    }

    setSaving(true)
    try {
      const validatedRoleId = UUIDSchema.parse(selectedRole)
      const validatedTabId = UUIDSchema.parse(tabId)
      const validatedField = PermissionFieldSchema.parse(field)

      const existingPerm = tabPermissions.find(p => p.tab_id === validatedTabId)
      const newValue = existingPerm ? !existingPerm[validatedField] : true

      if (existingPerm) {
        const { error } = await supabase
          .from('role_tab_permissions')
          .update({ [validatedField]: newValue })
          .eq('role_id', validatedRoleId)
          .eq('tab_id', validatedTabId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('role_tab_permissions')
          .insert([{
            role_id: validatedRoleId,
            tab_id: validatedTabId,
            can_view: validatedField === 'can_view',
            can_create: validatedField === 'can_create',
            can_edit: validatedField === 'can_edit',
            can_delete: validatedField === 'can_delete'
          }])
        if (error) throw error
      }

      setTabPermissions(prev => {
        const index = prev.findIndex(p => p.tab_id === validatedTabId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], [validatedField]: newValue }
          return updated
        } else {
          const tab = tabs.find(t => t.id === validatedTabId)
          return [...prev, {
            role_id: validatedRoleId,
            tab_id: validatedTabId,
            tab_name: tab?.name || '',
            tab_label: tab?.label || '',
            can_view: validatedField === 'can_view' ? newValue : false,
            can_create: validatedField === 'can_create' ? newValue : false,
            can_edit: validatedField === 'can_edit' ? newValue : false,
            can_delete: validatedField === 'can_delete' ? newValue : false
          }]
        }
      })

      setNotification({ type: 'success', message: 'Permiso de tab actualizado' })
    } catch (err) {
      if (err instanceof z.ZodError) {
        setNotification({ type: 'error', message: 'Datos inválidos.' })
      } else {
        const safeError = handleDatabaseError(err)
        devLog.error('Error actualizando permiso de tab:', safeError.logMessage)
        setNotification({ type: 'error', message: safeError.userMessage })
      }
    } finally {
      setSaving(false)
      setTimeout(() => setNotification(null), 3000)
    }
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

      // Agregar tabs de este submenú
      addTabsForParent('submenu', submenu.id, submenu.label, rows, level + 1)

      // Recursivamente agregar los hijos de este submenú
      addSubmenusHierarchically(submenu.id, menuSubmenus, menu, rows, level + 1)
    })
  }

  // Helper: agregar tabs de un parent (menu o submenu) como filas
  const addTabsForParent = (
    parentType: 'menu' | 'submenu',
    parentId: string,
    parentLabel: string,
    rows: PermissionRow[],
    level: number
  ) => {
    const parentTabs = parentType === 'menu'
      ? tabs.filter(t => t.menu_id === parentId)
      : tabs.filter(t => t.submenu_id === parentId)

    parentTabs.forEach(tab => {
      rows.push({
        id: tab.id,
        type: 'tab',
        name: tab.name,
        label: tab.label,
        parentLabel: parentLabel,
        can_view: getTabPermission(tab.id, 'can_view') as boolean,
        can_create: getTabPermission(tab.id, 'can_create') as boolean,
        can_edit: getTabPermission(tab.id, 'can_edit') as boolean,
        can_delete: getTabPermission(tab.id, 'can_delete') as boolean,
        tab_id: tab.id,
        parentMenuId: parentType === 'menu' ? parentId : undefined,
        level: level
      })
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

      // Agregar tabs directamente del menú (si no tiene submenús como padre)
      addTabsForParent('menu', menu.id, menu.label, rows, 1)
    })

    return rows
  }, [menus, submenus, tabs, menuPermissions, submenuPermissions, tabPermissions])

  // Definir columnas
  const columns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Módulo',
        cell: ({ row }) => {
          const isSubmenu = row.original.type === 'submenu'
          const isTab = row.original.type === 'tab'
          const level = row.original.level || 0

          return (
            <div className={`module-cell ${isTab ? 'is-tab' : isSubmenu ? 'is-submenu' : 'is-menu'} level-${level}`}>
              {isTab && <span className="tab-indicator">⊟</span>}
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
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_view ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_view')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_view')
              } else if (row.original.type === 'tab' && row.original.tab_id) {
                toggleTabPermission(row.original.tab_id, 'can_view')
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
              } else if (row.original.type === 'tab' && row.original.tab_id) {
                toggleTabPermission(row.original.tab_id, 'can_create')
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
              } else if (row.original.type === 'tab' && row.original.tab_id) {
                toggleTabPermission(row.original.tab_id, 'can_edit')
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
              } else if (row.original.type === 'tab' && row.original.tab_id) {
                toggleTabPermission(row.original.tab_id, 'can_delete')
              }
            }}
          >
            {row.original.can_delete && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
    ],
    [menuPermissions, submenuPermissions, tabPermissions, saving]
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
        pageSize: 50,
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
    <div className="admin-module">
      <LoadingOverlay show={loading} message="Cargando permisos..." size="lg" />
      <style>{`
        .permissions-container {
          width: 100%;
        }

        .role-selector {
          margin-bottom: 16px;
          padding: 20px;
          background: var(--bg-primary);
          border-radius: 8px;
          border: 1px solid var(--border-primary);
        }

        .role-search-container {
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

        .role-dropdown {
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

        .role-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid var(--border-primary);
          color: var(--text-primary);
        }

        .role-option:last-child {
          border-bottom: none;
        }

        .role-option:hover {
          background: var(--bg-secondary);
        }

        .role-option.selected {
          background: var(--badge-red-bg);
          color: var(--color-primary);
          font-weight: 600;
        }

        .role-info-banner {
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

        /* Tab Row */
        .data-table tbody tr.tab-row {
          background: var(--bg-secondary);
        }

        .data-table tbody tr.tab-row:hover {
          background: var(--bg-tertiary, var(--bg-secondary));
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
          border-left: 3px solid #ff0033;
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
          color: #ff0033;
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
          color: #ff0033;
          font-weight: 600;
          margin-right: 8px;
          font-family: monospace;
        }

        /* Tab styling */
        .module-cell.is-tab {
          border-left: 3px solid var(--color-primary, #ff0033);
          background: linear-gradient(90deg, rgba(230, 57, 70, 0.03) 0%, transparent 100%);
        }

        .module-cell.is-tab.level-1 {
          padding-left: 40px;
        }

        .module-cell.is-tab.level-2 {
          padding-left: 70px;
        }

        .module-cell.is-tab.level-3 {
          padding-left: 100px;
        }

        .module-cell.is-tab .module-name {
          font-weight: 400;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .tab-indicator {
          color: var(--color-primary, #ff0033);
          font-weight: 600;
          margin-right: 8px;
          font-size: 12px;
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
        }

        .perm-checkbox:hover {
          border-color: #ff0033;
          background: rgba(230, 57, 70, 0.08);
        }

        .perm-checkbox.checked {
          background: #ff0033;
          border-color: #ff0033;
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
          border-color: #ff0033;
          color: #ff0033;
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
        {/* Role Selector with Search */}
        <div className="role-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
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
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', textTransform: 'capitalize' }}>
                  {sanitizeHTML(selectedRoleData.name)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '18px' }}>
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
                      const rowClass = row.original.type === 'tab'
                        ? `tab-row level-${level}`
                        : row.original.type === 'submenu'
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
                      {[10, 20, 50, 100].map(pageSize => (
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
