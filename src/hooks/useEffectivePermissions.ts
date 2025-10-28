// src/hooks/useEffectivePermissions.ts
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
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

// Tipos de la base de datos
interface DBMenu {
  id: string
  name: string
  label: string
  route: string
  icon?: string
  order_index: number
}

interface DBSubmenu {
  id: string
  menu_id: string
  name: string
  label: string
  route: string
  order_index: number
}

export function useEffectivePermissions() {
  const { profile } = useAuth()
  const { isAdmin } = usePermissions()
  const [menuPermissions, setMenuPermissions] = useState<MenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<SubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Solo cargar si el usuario cambió o si nunca se ha cargado
    if (profile?.id && (profile.id !== currentUserIdRef.current || !hasLoadedRef.current)) {
      currentUserIdRef.current = profile.id
      loadEffectivePermissions()
    }
  }, [profile?.id])

  const loadEffectivePermissions = async () => {
    if (!profile?.id || hasLoadedRef.current) return

    console.log('🔍 Cargando permisos efectivos para usuario:', profile.id)

    setLoading(true)
    try {
      console.log('👑 Es admin:', isAdmin())

      // Si es admin, cargar TODOS los menús directamente
      if (isAdmin()) {
        console.log('👑 Usuario admin detectado - cargando todos los menús')

        // Cargar TODOS los menús de la tabla menus
        const { data: allMenus, error: menusError } = await supabase
          .from('menus')
          .select('id, name, label, route, icon, order_index')
          .eq('is_active', true)
          .order('order_index')

        if (menusError) {
          console.error('Error cargando todos los menús:', menusError)
        } else {
          console.log('✅ Todos los menús cargados para admin:', allMenus)
          console.log('📊 Cantidad de menús:', allMenus?.length)

          // Verificar si hay duplicados
          const duplicates = allMenus?.filter((menu, index, self) =>
            self.findIndex(m => m.name === menu.name) !== index
          )
          if (duplicates && duplicates.length > 0) {
            console.warn('⚠️ Menús duplicados encontrados:', duplicates)
          }

          // Convertir a formato MenuPermission con todos los permisos
          const adminMenuPermissions: MenuPermission[] = (allMenus || []).map((menu: DBMenu) => ({
            menu_id: menu.id,
            menu_name: menu.name,
            menu_label: menu.label,
            menu_route: menu.route,
            menu_icon: menu.icon,
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true,
            has_individual_override: false,
            has_role_permission: true
          }))
          console.log('📋 MenuPermissions creados:', adminMenuPermissions.length)
          setMenuPermissions(adminMenuPermissions)
        }

        // Cargar TODOS los submenús
        const { data: allSubmenus, error: submenusError } = await supabase
          .from('submenus')
          .select('id, menu_id, name, label, route, order_index')
          .eq('is_active', true)
          .order('order_index')

        if (submenusError) {
          console.error('Error cargando todos los submenús:', submenusError)
        } else {
          console.log('✅ Todos los submenús cargados para admin:', allSubmenus)
          const adminSubmenuPermissions: SubmenuPermission[] = (allSubmenus || []).map((submenu: DBSubmenu) => ({
            submenu_id: submenu.id,
            submenu_name: submenu.name,
            submenu_label: submenu.label,
            submenu_route: submenu.route,
            menu_id: submenu.menu_id,
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: true,
            has_individual_override: false,
            has_role_permission: true
          }))
          setSubmenuPermissions(adminSubmenuPermissions)
        }
      } else {
        // Usuario normal - cargar permisos efectivos
        console.log('👤 Usuario normal - cargando permisos efectivos')

        const { data: menuData, error: menuError } = await supabase
          .from('user_effective_menu_permissions')
          .select('*')
          .eq('user_id', profile.id)

        if (menuError) {
          console.error('Error cargando permisos de menú:', menuError)
        } else {
          console.log('✅ Permisos de menú cargados:', menuData)
          setMenuPermissions(menuData || [])
        }

        const { data: submenuData, error: submenuError } = await supabase
          .from('user_effective_submenu_permissions')
          .select('*')
          .eq('user_id', profile.id)

        if (submenuError) {
          console.error('Error cargando permisos de submenú:', submenuError)
        } else {
          console.log('✅ Permisos de submenú cargados:', submenuData)
          setSubmenuPermissions(submenuData || [])
        }
      }
    } catch (err) {
      console.error('❌ Error cargando permisos efectivos:', err)
    } finally {
      setLoading(false)
      hasLoadedRef.current = true
      console.log('✅ Permisos cargados completamente')
    }
  }

  const canViewMenu = useCallback((menuName: string): boolean => {
    if (isAdmin()) return true
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_view || false
  }, [menuPermissions, isAdmin])

  const canCreateInMenu = useCallback((menuName: string): boolean => {
    if (isAdmin()) return true
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_create || false
  }, [menuPermissions, isAdmin])

  const canEditInMenu = useCallback((menuName: string): boolean => {
    if (isAdmin()) return true
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_edit || false
  }, [menuPermissions, isAdmin])

  const canDeleteInMenu = useCallback((menuName: string): boolean => {
    if (isAdmin()) return true
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_delete || false
  }, [menuPermissions, isAdmin])

  const canViewSubmenu = useCallback((submenuName: string): boolean => {
    if (isAdmin()) return true
    const perm = submenuPermissions.find(p => p.submenu_name === submenuName)
    return perm?.can_view || false
  }, [submenuPermissions, isAdmin])

  const getVisibleMenus = useCallback(() => {
    return menuPermissions.filter(p => p.can_view)
  }, [menuPermissions])

  const getVisibleSubmenusForMenu = useCallback((menuId: string) => {
    return submenuPermissions.filter(p => p.menu_id === menuId && p.can_view)
  }, [submenuPermissions])

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
    hasAnyMenuAccess
  }
}
