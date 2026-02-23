// src/contexts/PermissionsContext.tsx
/**
 * Context de permisos optimizado
 * - Usa Map para lookups O(1) en lugar de Array.find() O(n)
 * - useMemo para evitar recálculos innecesarios
 * - useCallback para estabilidad referencial
 */
import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Tipos para el nuevo sistema de permisos
interface MenuPermission {
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

interface SubmenuPermission {
  id: string
  name: string
  label: string
  route: string
  order_index: number
  menu_id?: string // Deprecated: usar parent_menu_id
  parent_menu_id?: string
  parent_id?: string | null  // ID del submenú padre (para submenús anidados)
  level?: number  // Nivel de anidamiento (1 = primer nivel, 2 = hijo de submenú, etc.)
  permissions: {
    can_view: boolean
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
  }
  permission_source: 'user_override' | 'role_inherited'
}

interface TabPermission {
  id: string
  name: string
  label: string
  menu_id?: string | null
  submenu_id?: string | null
  order_index: number
  permissions: {
    can_view: boolean
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
  }
  permission_source: 'user_override' | 'role_inherited'
}

interface UserPermissionsResponse {
  user_id: string
  email: string
  role: {
    id: string
    name: string
    description: string
  } | null
  menus: MenuPermission[]
  submenus: SubmenuPermission[]
  tabs: TabPermission[]
}

interface PermissionsContextType {
  userPermissions: UserPermissionsResponse | null
  loading: boolean
  // Funciones para menús
  canViewMenu: (menuName: string) => boolean
  canCreateInMenu: (menuName: string) => boolean
  canEditInMenu: (menuName: string) => boolean
  canDeleteInMenu: (menuName: string) => boolean
  // Funciones para submenús
  canViewSubmenu: (submenuName: string) => boolean
  canCreateInSubmenu: (submenuName: string) => boolean
  canEditInSubmenu: (submenuName: string) => boolean
  canDeleteInSubmenu: (submenuName: string) => boolean
  // Funciones para tabs
  canViewTab: (tabName: string) => boolean
  canCreateInTab: (tabName: string) => boolean
  canEditInTab: (tabName: string) => boolean
  canDeleteInTab: (tabName: string) => boolean
  getVisibleTabs: (modulePrefix: string) => TabPermission[]
  // Función general para verificar permisos
  canAccess: (menuOrSubmenuName: string, action?: 'view' | 'create' | 'edit' | 'delete') => boolean
  isAdmin: () => boolean
  isAdministrativo: () => boolean
  // Obtener menús/submenús visibles
  getVisibleMenus: () => MenuPermission[]
  getVisibleSubmenus: () => SubmenuPermission[]
  // Funciones de compatibilidad (deprecadas)
  canCreate: () => boolean
  canUpdate: () => boolean
  canDelete: () => boolean
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined)

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [userPermissions, setUserPermissions] = useState<UserPermissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setUserPermissions(null)
      setLoading(false)
      return
    }

    loadPermissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const loadPermissions = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      // TEMPORAL: Usar fallback directo hasta que edge function se actualice
      await loadPermissionsFallback()

      /* Edge function temporalmente deshabilitada
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-user-permissions`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        console.warn('⚠️ Edge function no disponible, usando fallback')
        await loadPermissionsFallback()
        return
      }

      const data: UserPermissionsResponse = await response.json()
      setUserPermissions(data)
      */
    } catch (error) {
      console.error('Error cargando permisos:', error)
      console.warn('⚠️ Usando modo fallback')
      await loadPermissionsFallback()
    } finally {
      setLoading(false)
    }
  }

  // Fallback cuando el edge function no está disponible
  const loadPermissionsFallback = async () => {
    try {
      // Cargar perfil del usuario
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*, roles(*)')
        .eq('id', user!.id)
        .single()

      if (profileError) throw profileError
      if (!profileData) throw new Error('No profile data')

      // Verificar si es admin
      const isUserAdmin = (profileData as any).roles?.name === 'admin'

      let menusData: MenuPermission[] = []
      let submenusData: SubmenuPermission[] = []
      let tabsData: TabPermission[] = []

      if (isUserAdmin) {
        // Si es admin, cargar TODOS los menús de la base de datos
        const { data: allMenus } = await supabase
          .from('menus')
          .select('*')
          .eq('is_active', true)
          .order('order_index')

        const { data: allSubmenus } = await supabase
          .from('submenus')
          .select('*, parent_id, level')
          .eq('is_active', true)
          .order('order_index')

        const { data: allTabs } = await supabase
          .from('tabs')
          .select('*')
          .eq('is_active', true)
          .order('order_index')

        // Convertir a formato de permisos con acceso completo
        menusData = (allMenus || []).map((menu: any) => ({
          id: menu.id,
          name: menu.name,
          label: menu.label,
          route: menu.route,
          order_index: menu.order_index || 0,
          permissions: {
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true
          },
          permission_source: 'role_inherited' as const
        }))

        submenusData = (allSubmenus || []).map((submenu: any) => ({
          id: submenu.id,
          name: submenu.name,
          label: submenu.label,
          route: submenu.route,
          order_index: submenu.order_index || 0,
          menu_id: submenu.menu_id,
          parent_id: submenu.parent_id || null,
          level: submenu.level || 1,
          permissions: {
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true
          },
          permission_source: 'role_inherited' as const
        }))

        tabsData = (allTabs || []).map((tab: any) => ({
          id: tab.id,
          name: tab.name,
          label: tab.label,
          menu_id: tab.menu_id,
          submenu_id: tab.submenu_id,
          order_index: tab.order_index || 0,
          permissions: {
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true
          },
          permission_source: 'role_inherited' as const
        }))
      } else {
        // Para usuarios NO admin, usar funciones RPC (SECURITY DEFINER)
        // que bypasean RLS y combinan permisos de rol + usuario
        const userId = user!.id

        // Cargar permisos de menús y submenús via RPC
        const { data: rpcPerms, error: rpcError } = await supabase
          .rpc('get_user_permissions', { p_user_id: userId })

        if (rpcError) throw rpcError

        const rpcRows = (rpcPerms || []) as any[]

        // Separar menús y submenús
        menusData = rpcRows
          .filter((r: any) => r.is_menu && r.can_view)
          .map((r: any) => ({
            id: r.menu_id,
            name: r.menu_name,
            label: r.menu_label,
            route: r.menu_route || '',
            order_index: r.order_index || 0,
            permissions: {
              can_view: r.can_view || false,
              can_create: r.can_create || false,
              can_edit: r.can_edit || false,
              can_delete: r.can_delete || false
            },
            permission_source: (r.permission_source || 'role_inherited') as 'user_override' | 'role_inherited'
          }))

        submenusData = rpcRows
          .filter((r: any) => !r.is_menu && r.can_view)
          .map((r: any) => ({
            id: r.menu_id,
            name: r.menu_name,
            label: r.menu_label,
            route: r.menu_route || '',
            order_index: r.order_index || 0,
            menu_id: r.parent_menu_id,
            parent_id: null,
            level: 1,
            permissions: {
              can_view: r.can_view || false,
              can_create: r.can_create || false,
              can_edit: r.can_edit || false,
              can_delete: r.can_delete || false
            },
            permission_source: (r.permission_source || 'role_inherited') as 'user_override' | 'role_inherited'
          }))

        // Cargar permisos de tabs via RPC
        const { data: rpcTabs, error: rpcTabError } = await supabase
          .rpc('get_user_tab_permissions', { p_user_id: userId })

        if (rpcTabError) throw rpcTabError

        tabsData = ((rpcTabs || []) as any[])
          .filter((r: any) => r.can_view)
          .map((r: any) => ({
            id: r.tab_id,
            name: r.tab_name,
            label: r.tab_label,
            menu_id: r.menu_id || null,
            submenu_id: r.submenu_id || null,
            order_index: r.order_index || 0,
            permissions: {
              can_view: r.can_view || false,
              can_create: r.can_create || false,
              can_edit: r.can_edit || false,
              can_delete: r.can_delete || false
            },
            permission_source: (r.permission_source || 'role_inherited') as 'user_override' | 'role_inherited'
          }))

      }

      setUserPermissions({
        user_id: user!.id,
        email: user!.email || '',
        role: {
          id: (profileData as any).role_id || '',
          name: (profileData as any).roles?.name || 'sin_rol',
          description: (profileData as any).roles?.description || 'Sin descripción'
        },
        menus: menusData,
        submenus: submenusData,
        tabs: tabsData
      })
    } catch (error) {
      console.error('Error en fallback:', error)
      setUserPermissions(null)
    }
  }

  // =====================================================
  // OPTIMIZACIÓN: Maps indexados para lookups O(1)
  // Se recalculan solo cuando cambia userPermissions
  // =====================================================

  /** Map de menús indexado por nombre (lowercase) - O(1) lookup */
  const menusByName = useMemo<Map<string, MenuPermission>>(() => {
    if (!userPermissions?.menus) return new Map()
    return new Map(userPermissions.menus.map(m => [m.name.toLowerCase(), m]))
  }, [userPermissions?.menus])

  /** Map de submenús indexado por nombre (lowercase) - O(1) lookup */
  const submenusByName = useMemo<Map<string, SubmenuPermission>>(() => {
    if (!userPermissions?.submenus) return new Map()
    return new Map(userPermissions.submenus.map(s => [s.name.toLowerCase(), s]))
  }, [userPermissions?.submenus])

  /** Menús visibles pre-calculados y ordenados */
  const visibleMenusCache = useMemo<MenuPermission[]>(() => {
    if (!userPermissions?.menus) return []
    return userPermissions.menus
      .filter(m => m.permissions.can_view)
      .sort((a, b) => a.order_index - b.order_index)
  }, [userPermissions?.menus])

  /** Submenús visibles pre-calculados y ordenados */
  const visibleSubmenusCache = useMemo<SubmenuPermission[]>(() => {
    if (!userPermissions?.submenus) return []
    return userPermissions.submenus
      .filter(s => s.permissions.can_view)
      .sort((a, b) => a.order_index - b.order_index)
  }, [userPermissions?.submenus])

  /** Map de tabs indexado por nombre (lowercase) - O(1) lookup */
  const tabsByName = useMemo<Map<string, TabPermission>>(() => {
    if (!userPermissions?.tabs) return new Map()
    return new Map(userPermissions.tabs.map(t => [t.name.toLowerCase(), t]))
  }, [userPermissions?.tabs])

  /** Permisos globales pre-calculados (para funciones deprecadas) */
  const globalPermissions = useMemo(() => {
    if (!userPermissions) {
      return { canCreate: false, canUpdate: false, canDelete: false }
    }

    const menus = userPermissions.menus
    const submenus = userPermissions.submenus

    return {
      canCreate: menus.some(m => m.permissions.can_create) || submenus.some(s => s.permissions.can_create),
      canUpdate: menus.some(m => m.permissions.can_edit) || submenus.some(s => s.permissions.can_edit),
      canDelete: menus.some(m => m.permissions.can_delete) || submenus.some(s => s.permissions.can_delete)
    }
  }, [userPermissions])

  // =====================================================
  // FUNCIONES DE PERMISOS - Usando Map.get() O(1)
  // =====================================================

  // Funciones para menús - O(1) con Map (case-insensitive)
  // Admin siempre tiene todos los permisos
  const canViewMenu = useCallback((menuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return menusByName.get(menuName.toLowerCase())?.permissions.can_view ?? false
  }, [menusByName, userPermissions?.role?.name])

  const canCreateInMenu = useCallback((menuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return menusByName.get(menuName.toLowerCase())?.permissions.can_create ?? false
  }, [menusByName, userPermissions?.role?.name])

  const canEditInMenu = useCallback((menuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return menusByName.get(menuName.toLowerCase())?.permissions.can_edit ?? false
  }, [menusByName, userPermissions?.role?.name])

  const canDeleteInMenu = useCallback((menuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return menusByName.get(menuName.toLowerCase())?.permissions.can_delete ?? false
  }, [menusByName, userPermissions?.role?.name])

  // Funciones para submenús - O(1) con Map (case-insensitive)
  // Admin siempre tiene todos los permisos
  const canViewSubmenu = useCallback((submenuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return submenusByName.get(submenuName.toLowerCase())?.permissions.can_view ?? false
  }, [submenusByName, userPermissions?.role?.name])

  const canCreateInSubmenu = useCallback((submenuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return submenusByName.get(submenuName.toLowerCase())?.permissions.can_create ?? false
  }, [submenusByName, userPermissions?.role?.name])

  const canEditInSubmenu = useCallback((submenuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return submenusByName.get(submenuName.toLowerCase())?.permissions.can_edit ?? false
  }, [submenusByName, userPermissions?.role?.name])

  const canDeleteInSubmenu = useCallback((submenuName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return submenusByName.get(submenuName.toLowerCase())?.permissions.can_delete ?? false
  }, [submenusByName, userPermissions?.role?.name])

  // Funciones para tabs - O(1) con Map (case-insensitive)
  // Admin siempre tiene todos los permisos
  const canViewTab = useCallback((tabName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return tabsByName.get(tabName.toLowerCase())?.permissions.can_view ?? false
  }, [tabsByName, userPermissions?.role?.name])

  const canCreateInTab = useCallback((tabName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return tabsByName.get(tabName.toLowerCase())?.permissions.can_create ?? false
  }, [tabsByName, userPermissions?.role?.name])

  const canEditInTab = useCallback((tabName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return tabsByName.get(tabName.toLowerCase())?.permissions.can_edit ?? false
  }, [tabsByName, userPermissions?.role?.name])

  const canDeleteInTab = useCallback((tabName: string): boolean => {
    if (userPermissions?.role?.name === 'admin') return true
    return tabsByName.get(tabName.toLowerCase())?.permissions.can_delete ?? false
  }, [tabsByName, userPermissions?.role?.name])

  /** Obtener tabs visibles filtrados por prefijo de módulo (e.g., 'facturacion', 'incidencias') */
  const getVisibleTabs = useCallback((modulePrefix: string): TabPermission[] => {
    if (!userPermissions?.tabs) return []
    if (userPermissions.role?.name === 'admin') {
      return userPermissions.tabs
        .filter(t => t.name.toLowerCase().startsWith(modulePrefix.toLowerCase() + ':'))
        .sort((a, b) => a.order_index - b.order_index)
    }
    return userPermissions.tabs
      .filter(t => t.permissions.can_view && t.name.toLowerCase().startsWith(modulePrefix.toLowerCase() + ':'))
      .sort((a, b) => a.order_index - b.order_index)
  }, [userPermissions?.tabs, userPermissions?.role?.name])

  // Función general que busca en menús y submenús - O(1) con Maps (case-insensitive)
  // Admin siempre tiene todos los permisos
  const canAccess = useCallback((
    menuOrSubmenuName: string,
    action: 'view' | 'create' | 'edit' | 'delete' = 'view'
  ): boolean => {
    // Admin tiene acceso total
    if (userPermissions?.role?.name === 'admin') return true
    
    const permKey = `can_${action}` as const
    const nameLower = menuOrSubmenuName.toLowerCase()

    // Buscar primero en menús (más común) - O(1)
    const menu = menusByName.get(nameLower)
    if (menu) return menu.permissions[permKey] ?? false

    // Buscar en submenús - O(1)
    const submenu = submenusByName.get(nameLower)
    if (submenu) return submenu.permissions[permKey] ?? false

    // Buscar en tabs - O(1)
    const tab = tabsByName.get(nameLower)
    if (tab) return tab.permissions[permKey] ?? false

    return false
  }, [menusByName, submenusByName, tabsByName, userPermissions?.role?.name])

  const isAdmin = useCallback((): boolean => {
    return userPermissions?.role?.name === 'admin'
  }, [userPermissions?.role?.name])

  const isAdministrativo = useCallback((): boolean => {
    return userPermissions?.role?.name === 'administrativo'
  }, [userPermissions?.role?.name])

  // Retornan caches pre-calculados - O(1)
  const getVisibleMenus = useCallback((): MenuPermission[] => {
    return visibleMenusCache
  }, [visibleMenusCache])

  const getVisibleSubmenus = useCallback((): SubmenuPermission[] => {
    return visibleSubmenusCache
  }, [visibleSubmenusCache])

  // Funciones de compatibilidad (deprecadas) - Usan cache pre-calculado
  const canCreate = useCallback((): boolean => {
    return globalPermissions.canCreate
  }, [globalPermissions.canCreate])

  const canUpdate = useCallback((): boolean => {
    return globalPermissions.canUpdate
  }, [globalPermissions.canUpdate])

  const canDelete = useCallback((): boolean => {
    return globalPermissions.canDelete
  }, [globalPermissions.canDelete])

  const value = {
    userPermissions,
    loading,
    canViewMenu,
    canCreateInMenu,
    canEditInMenu,
    canDeleteInMenu,
    canViewSubmenu,
    canCreateInSubmenu,
    canEditInSubmenu,
    canDeleteInSubmenu,
    canViewTab,
    canCreateInTab,
    canEditInTab,
    canDeleteInTab,
    getVisibleTabs,
    canAccess,
    isAdmin,
    isAdministrativo,
    getVisibleMenus,
    getVisibleSubmenus,
    canCreate,
    canUpdate,
    canDelete,
  }

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionsContext)
  if (context === undefined) {
    throw new Error('usePermissions debe usarse dentro de PermissionsProvider')
  }
  return context
}