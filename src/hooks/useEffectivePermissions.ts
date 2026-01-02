// src/hooks/useEffectivePermissions.ts
/**
 * Hook deprecado - usar usePermissions() del PermissionsContext en su lugar
 * Este hook se mantiene por compatibilidad con código existente
 * pero ahora delega al nuevo sistema basado en edge functions
 *
 * REFACTORIZADO:
 * - Funciones de transformación extraídas y reutilizables
 * - useMemo para evitar recálculos innecesarios
 * - Código duplicado eliminado
 */
import { useCallback, useMemo } from 'react'
import { usePermissions } from '../contexts/PermissionsContext'

// =====================================================
// TIPOS LEGACY (compatibilidad con código existente)
// =====================================================

interface MenuPermission {
  menu_id: string
  menu_name: string
  menu_label: string
  menu_route: string
  menu_icon?: string
  order_index: number
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
  parent_id: string | null
  level: number
  order_index: number
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  has_individual_override: boolean
  has_role_permission: boolean
}

// Tipos del contexto nuevo (para transformaciones)
interface NewMenuFormat {
  id: string
  name: string
  label: string
  route: string
  order_index: number
  permissions: {
    can_view: boolean
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
  }
  permission_source: 'user_override' | 'role_inherited'
}

interface NewSubmenuFormat {
  id: string
  name: string
  label: string
  route: string
  order_index: number
  menu_id?: string
  parent_menu_id?: string
  parent_id?: string | null
  level?: number
  permissions: {
    can_view: boolean
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
  }
  permission_source: 'user_override' | 'role_inherited'
}

// =====================================================
// FUNCIONES DE TRANSFORMACIÓN REUTILIZABLES (DRY)
// =====================================================

/**
 * Transforma un menú del formato nuevo al formato legacy
 * Función pura - misma entrada siempre produce misma salida
 */
function transformMenuToLegacy(menu: NewMenuFormat): MenuPermission {
  return {
    menu_id: menu.id,
    menu_name: menu.name,
    menu_label: menu.label,
    menu_route: menu.route,
    menu_icon: undefined,
    order_index: menu.order_index,
    can_view: menu.permissions.can_view,
    can_create: menu.permissions.can_create,
    can_edit: menu.permissions.can_edit,
    can_delete: menu.permissions.can_delete,
    has_individual_override: menu.permission_source === 'user_override',
    has_role_permission: menu.permission_source === 'role_inherited'
  }
}

/**
 * Transforma un submenú del formato nuevo al formato legacy
 * Función pura - misma entrada siempre produce misma salida
 */
function transformSubmenuToLegacy(submenu: NewSubmenuFormat): SubmenuPermission {
  return {
    submenu_id: submenu.id,
    submenu_name: submenu.name,
    submenu_label: submenu.label,
    submenu_route: submenu.route,
    menu_id: submenu.parent_menu_id || submenu.menu_id || '',
    parent_id: submenu.parent_id || null,
    level: submenu.level || 1,
    order_index: submenu.order_index,
    can_view: submenu.permissions.can_view,
    can_create: submenu.permissions.can_create,
    can_edit: submenu.permissions.can_edit,
    can_delete: submenu.permissions.can_delete,
    has_individual_override: submenu.permission_source === 'user_override',
    has_role_permission: submenu.permission_source === 'role_inherited'
  }
}

// =====================================================
// HOOK PRINCIPAL
// =====================================================

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

  // =====================================================
  // TRANSFORMACIONES MEMOIZADAS (evita recálculos)
  // =====================================================

  /** Permisos de menú en formato legacy - solo se recalcula si cambia userPermissions */
  const menuPermissions = useMemo<MenuPermission[]>(() => {
    if (!userPermissions?.menus) return []
    return userPermissions.menus.map(transformMenuToLegacy)
  }, [userPermissions?.menus])

  /** Permisos de submenú en formato legacy - solo se recalcula si cambia userPermissions */
  const submenuPermissions = useMemo<SubmenuPermission[]>(() => {
    if (!userPermissions?.submenus) return []
    return (userPermissions.submenus as NewSubmenuFormat[]).map(transformSubmenuToLegacy)
  }, [userPermissions?.submenus])

  /** Pre-calcula si hay acceso a algún menú */
  const hasAnyAccess = useMemo(() => {
    return menuPermissions.some(p => p.can_view)
  }, [menuPermissions])

  // =====================================================
  // FUNCIONES WRAPPER (delegan al contexto optimizado)
  // =====================================================

  // Estas funciones simplemente delegan al contexto que ya está optimizado con Maps
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

  /** Retorna menús visibles en formato legacy */
  const getVisibleMenus = useCallback((): MenuPermission[] => {
    return contextGetVisibleMenus().map(transformMenuToLegacy)
  }, [contextGetVisibleMenus])

  /** Retorna submenús visibles para un menú específico en formato legacy */
  const getVisibleSubmenusForMenu = useCallback((menuId: string): SubmenuPermission[] => {
    return contextGetVisibleSubmenus()
      .filter(submenu => {
        const sub = submenu as NewSubmenuFormat
        return sub.parent_menu_id === menuId || sub.menu_id === menuId
      })
      .map(sub => transformSubmenuToLegacy(sub as NewSubmenuFormat))
  }, [contextGetVisibleSubmenus])

  /** Verifica si hay acceso a algún menú - usa valor pre-calculado */
  const hasAnyMenuAccess = useCallback((): boolean => {
    return hasAnyAccess
  }, [hasAnyAccess])

  // =====================================================
  // RETURN API LEGACY
  // =====================================================

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
