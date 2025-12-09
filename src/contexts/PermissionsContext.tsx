// src/contexts/PermissionsContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
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
  // Función general para verificar permisos
  canAccess: (menuOrSubmenuName: string, action?: 'view' | 'create' | 'edit' | 'delete') => boolean
  isAdmin: () => boolean
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
      console.warn('⚠️ Usando fallback directo (edge function deshabilitada temporalmente)')
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
      console.log('✅ Permisos cargados desde edge function:', data)
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

      if (isUserAdmin) {
        // Si es admin, cargar TODOS los menús de la base de datos
        const { data: allMenus } = await supabase
          .from('menus')
          .select('*')
          .eq('is_active', true)
          .order('order_index')

        const { data: allSubmenus } = await supabase
          .from('submenus')
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
          permissions: {
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true
          },
          permission_source: 'role_inherited' as const
        }))
      } else {
        // Para usuarios NO admin, cargar permisos del rol
        const roleId = (profileData as any).role_id

        if (roleId) {
          // Cargar permisos de menús del rol
          const { data: roleMenuPerms } = await supabase
            .from('role_menu_permissions')
            .select(`
              can_view, can_create, can_edit, can_delete,
              menus (id, name, label, route, order_index, is_active)
            `)
            .eq('role_id', roleId)
            .eq('can_view', true)

          // Cargar permisos de submenús del rol
          const { data: roleSubmenuPerms } = await supabase
            .from('role_submenu_permissions')
            .select(`
              can_view, can_create, can_edit, can_delete,
              submenus (id, name, label, route, order_index, menu_id, is_active)
            `)
            .eq('role_id', roleId)
            .eq('can_view', true)

          // Convertir permisos de menús
          menusData = (roleMenuPerms || [])
            .filter((p: any) => p.menus?.is_active)
            .map((p: any) => ({
              id: p.menus.id,
              name: p.menus.name,
              label: p.menus.label,
              route: p.menus.route,
              order_index: p.menus.order_index || 0,
              permissions: {
                can_view: p.can_view || false,
                can_create: p.can_create || false,
                can_edit: p.can_edit || false,
                can_delete: p.can_delete || false
              },
              permission_source: 'role_inherited' as const
            }))

          // Convertir permisos de submenús
          submenusData = (roleSubmenuPerms || [])
            .filter((p: any) => p.submenus?.is_active)
            .map((p: any) => ({
              id: p.submenus.id,
              name: p.submenus.name,
              label: p.submenus.label,
              route: p.submenus.route,
              order_index: p.submenus.order_index || 0,
              menu_id: p.submenus.menu_id,
              permissions: {
                can_view: p.can_view || false,
                can_create: p.can_create || false,
                can_edit: p.can_edit || false,
                can_delete: p.can_delete || false
              },
              permission_source: 'role_inherited' as const
            }))

          console.log('📋 Permisos de rol cargados - Menús:', menusData.length, 'Submenús:', submenusData.length)
        }
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
        submenus: submenusData
      })

      console.log('✅ Modo fallback activado - Rol:', (profileData as any).roles?.name)
      console.log('📋 Menús cargados:', menusData.length)
      console.log('📋 Submenús cargados:', submenusData.length)
    } catch (error) {
      console.error('Error en fallback:', error)
      setUserPermissions(null)
    }
  }

  // Funciones para menús
  const canViewMenu = (menuName: string): boolean => {
    if (!userPermissions) return false
    const menu = userPermissions.menus.find(m => m.name === menuName)
    return menu?.permissions.can_view ?? false
  }

  const canCreateInMenu = (menuName: string): boolean => {
    if (!userPermissions) return false
    const menu = userPermissions.menus.find(m => m.name === menuName)
    return menu?.permissions.can_create ?? false
  }

  const canEditInMenu = (menuName: string): boolean => {
    if (!userPermissions) return false
    const menu = userPermissions.menus.find(m => m.name === menuName)
    return menu?.permissions.can_edit ?? false
  }

  const canDeleteInMenu = (menuName: string): boolean => {
    if (!userPermissions) return false
    const menu = userPermissions.menus.find(m => m.name === menuName)
    return menu?.permissions.can_delete ?? false
  }

  // Funciones para submenús
  const canViewSubmenu = (submenuName: string): boolean => {
    if (!userPermissions) return false
    const submenu = userPermissions.submenus.find(s => s.name === submenuName)
    return submenu?.permissions.can_view ?? false
  }

  const canCreateInSubmenu = (submenuName: string): boolean => {
    if (!userPermissions) return false
    const submenu = userPermissions.submenus.find(s => s.name === submenuName)
    return submenu?.permissions.can_create ?? false
  }

  const canEditInSubmenu = (submenuName: string): boolean => {
    if (!userPermissions) return false
    const submenu = userPermissions.submenus.find(s => s.name === submenuName)
    return submenu?.permissions.can_edit ?? false
  }

  const canDeleteInSubmenu = (submenuName: string): boolean => {
    if (!userPermissions) return false
    const submenu = userPermissions.submenus.find(s => s.name === submenuName)
    return submenu?.permissions.can_delete ?? false
  }

  // Función general que busca en menús y submenús
  const canAccess = (menuOrSubmenuName: string, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
    if (!userPermissions) return false

    // Buscar en menús
    const menu = userPermissions.menus.find(m => m.name === menuOrSubmenuName)
    if (menu) {
      return menu.permissions[`can_${action}`] ?? false
    }

    // Buscar en submenús
    const submenu = userPermissions.submenus.find(s => s.name === menuOrSubmenuName)
    if (submenu) {
      return submenu.permissions[`can_${action}`] ?? false
    }

    return false
  }

  const isAdmin = (): boolean => {
    return userPermissions?.role?.name === 'admin'
  }

  const getVisibleMenus = (): MenuPermission[] => {
    return userPermissions?.menus
      .filter(m => m.permissions.can_view)
      .sort((a, b) => a.order_index - b.order_index) ?? []
  }

  const getVisibleSubmenus = (): SubmenuPermission[] => {
    return userPermissions?.submenus
      .filter(s => s.permissions.can_view)
      .sort((a, b) => a.order_index - b.order_index) ?? []
  }

  // Funciones de compatibilidad (deprecadas)
  // Retornan true si el usuario tiene AL MENOS UN permiso de ese tipo
  const canCreate = (): boolean => {
    if (!userPermissions) return false
    const hasMenuCreate = userPermissions.menus.some(m => m.permissions.can_create)
    const hasSubmenuCreate = userPermissions.submenus.some(s => s.permissions.can_create)
    return hasMenuCreate || hasSubmenuCreate
  }

  const canUpdate = (): boolean => {
    if (!userPermissions) return false
    const hasMenuEdit = userPermissions.menus.some(m => m.permissions.can_edit)
    const hasSubmenuEdit = userPermissions.submenus.some(s => s.permissions.can_edit)
    return hasMenuEdit || hasSubmenuEdit
  }

  const canDelete = (): boolean => {
    if (!userPermissions) return false
    const hasMenuDelete = userPermissions.menus.some(m => m.permissions.can_delete)
    const hasSubmenuDelete = userPermissions.submenus.some(s => s.permissions.can_delete)
    return hasMenuDelete || hasSubmenuDelete
  }

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
    canAccess,
    isAdmin,
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