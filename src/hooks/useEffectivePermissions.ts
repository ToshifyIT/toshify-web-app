// src/hooks/useEffectivePermissions.ts
/**
 * Hook deprecado - usar usePermissions() del PermissionsContext en su lugar
 * Este hook se mantiene por compatibilidad con código existente
 * pero ahora delega al nuevo sistema basado en edge functions
 */
import { useCallback } from 'react'
import { usePermissions } from '../contexts/PermissionsContext'

interface MenuPermission {
  menu_id: string
  menu_name: string
  menu_label: string
  menu_route: string
  menu_icon?: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  has_individual_override: boolean
  has_role_permission: boolean
}

interface SubmenuPermission {
  submenu_id: string
  submenu_name: string
  submenu_label: string
  submenu_route: string
  menu_id: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  has_individual_override: boolean
  has_role_permission: boolean
}

/**
 * @deprecated Usar usePermissions() del PermissionsContext directamente
 */
export function useEffectivePermissions() {
  const {
    userPermissions,
    loading,
    isAdmin,
    canViewMenu: contextCanViewMenu,
    canCreateInMenu: contextCanCreateInMenu,
    canEditInMenu: contextCanEditInMenu,
    canDeleteInMenu: contextCanDeleteInMenu,
    canViewSubmenu: contextCanViewSubmenu,
    getVisibleMenus: contextGetVisibleMenus,
    getVisibleSubmenus: contextGetVisibleSubmenus
  } = usePermissions()

  // Convertir el formato nuevo al formato antiguo para compatibilidad
  const menuPermissions: MenuPermission[] = (userPermissions?.menus || []).map(menu => ({
    menu_id: menu.id,
    menu_name: menu.name,
    menu_label: menu.label,
    menu_route: menu.route,
    menu_icon: undefined,
    can_view: menu.permissions.can_view,
    can_create: menu.permissions.can_create,
    can_edit: menu.permissions.can_edit,
    can_delete: menu.permissions.can_delete,
    has_individual_override: menu.permission_source === 'user_override',
    has_role_permission: menu.permission_source === 'role_inherited'
  }))

  const submenuPermissions: SubmenuPermission[] = (userPermissions?.submenus || []).map(submenu => ({
    submenu_id: submenu.id,
    submenu_name: submenu.name,
    submenu_label: submenu.label,
    submenu_route: submenu.route,
    menu_id: (submenu as any).parent_menu_id || submenu.menu_id,
    can_view: submenu.permissions.can_view,
    can_create: submenu.permissions.can_create,
    can_edit: submenu.permissions.can_edit,
    can_delete: submenu.permissions.can_delete,
    has_individual_override: submenu.permission_source === 'user_override',
    has_role_permission: submenu.permission_source === 'role_inherited'
  }))

  const canViewMenu = useCallback((menuName: string): boolean => {
    return contextCanViewMenu(menuName)
  }, [contextCanViewMenu])

  const canCreateInMenu = useCallback((menuName: string): boolean => {
    return contextCanCreateInMenu(menuName)
  }, [contextCanCreateInMenu])

  const canEditInMenu = useCallback((menuName: string): boolean => {
    return contextCanEditInMenu(menuName)
  }, [contextCanEditInMenu])

  const canDeleteInMenu = useCallback((menuName: string): boolean => {
    return contextCanDeleteInMenu(menuName)
  }, [contextCanDeleteInMenu])

  const canViewSubmenu = useCallback((submenuName: string): boolean => {
    return contextCanViewSubmenu(submenuName)
  }, [contextCanViewSubmenu])

  const getVisibleMenus = useCallback(() => {
    return contextGetVisibleMenus().map(menu => ({
      menu_id: menu.id,
      menu_name: menu.name,
      menu_label: menu.label,
      menu_route: menu.route,
      menu_icon: undefined,
      can_view: menu.permissions.can_view,
      can_create: menu.permissions.can_create,
      can_edit: menu.permissions.can_edit,
      can_delete: menu.permissions.can_delete,
      has_individual_override: menu.permission_source === 'user_override',
      has_role_permission: menu.permission_source === 'role_inherited'
    }))
  }, [contextGetVisibleMenus])

  const getVisibleSubmenusForMenu = useCallback((menuId: string) => {
    return contextGetVisibleSubmenus()
      .filter(submenu => (submenu as any).parent_menu_id === menuId || submenu.menu_id === menuId)
      .map(submenu => ({
        submenu_id: submenu.id,
        submenu_name: submenu.name,
        submenu_label: submenu.label,
        submenu_route: submenu.route,
        menu_id: (submenu as any).parent_menu_id || submenu.menu_id,
        can_view: submenu.permissions.can_view,
        can_create: submenu.permissions.can_create,
        can_edit: submenu.permissions.can_edit,
        can_delete: submenu.permissions.can_delete,
        has_individual_override: submenu.permission_source === 'user_override',
        has_role_permission: submenu.permission_source === 'role_inherited'
      }))
  }, [contextGetVisibleSubmenus])

  const hasAnyMenuAccess = useCallback((): boolean => {
    return menuPermissions.some(p => p.can_view)
  }, [menuPermissions])

  return {
    menuPermissions,
    submenuPermissions,
    loading,
    canViewMenu,
    canCreateInMenu,
    canEditInMenu,
    canDeleteInMenu,
    canViewSubmenu,
    getVisibleMenus,
    getVisibleSubmenusForMenu,
    hasAnyMenuAccess,
    isAdmin
  }
}
