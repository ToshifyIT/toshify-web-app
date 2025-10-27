// src/hooks/useEffectivePermissions.ts
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface MenuPermission {
  menu_id: string
  menu_name: string
  menu_label: string
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
  menu_id: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  has_individual_override: boolean
  has_role_permission: boolean
}

export function useEffectivePermissions() {
  const { profile } = useAuth()
  const [menuPermissions, setMenuPermissions] = useState<MenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<SubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) {
      loadEffectivePermissions()
    }
  }, [profile?.id])

  const loadEffectivePermissions = async () => {
    if (!profile?.id) return

    setLoading(true)
    try {
      console.log('🔍 Cargando permisos efectivos para usuario:', profile.id)

      // Cargar permisos efectivos de menús
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

      // Cargar permisos efectivos de submenús
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
    } catch (err) {
      console.error('❌ Error cargando permisos efectivos:', err)
    } finally {
      setLoading(false)
    }
  }

  const canViewMenu = (menuName: string): boolean => {
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_view || false
  }

  const canCreateInMenu = (menuName: string): boolean => {
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_create || false
  }

  const canEditInMenu = (menuName: string): boolean => {
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_edit || false
  }

  const canDeleteInMenu = (menuName: string): boolean => {
    const perm = menuPermissions.find(p => p.menu_name === menuName)
    return perm?.can_delete || false
  }

  const canViewSubmenu = (submenuName: string): boolean => {
    const perm = submenuPermissions.find(p => p.submenu_name === submenuName)
    return perm?.can_view || false
  }

  const getVisibleMenus = () => {
    return menuPermissions.filter(p => p.can_view)
  }

  const getVisibleSubmenusForMenu = (menuId: string) => {
    return submenuPermissions.filter(p => p.menu_id === menuId && p.can_view)
  }

  const hasAnyMenuAccess = (): boolean => {
    return menuPermissions.some(p => p.can_view)
  }

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
