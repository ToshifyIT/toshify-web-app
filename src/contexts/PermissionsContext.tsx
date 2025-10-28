// src/contexts/PermissionsContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { Permission } from '../types/database.types'

interface PermissionsMap {
  [module: string]: {
    create: boolean
    read: boolean
    update: boolean
    delete: boolean
  }
}

interface PermissionsContextType {
  permissions: PermissionsMap | null
  loading: boolean
  canAccess: (module: string) => boolean
  canCreate: (module: string) => boolean
  canRead: (module: string) => boolean
  canUpdate: (module: string) => boolean
  canDelete: (module: string) => boolean
  isAdmin: () => boolean
  hasAnyPermission: (module: string, actions: Array<'create' | 'read' | 'update' | 'delete'>) => boolean
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined)

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth()
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!profile || !profile.role_id) {
      setPermissions(null)
      setLoading(false)
      return
    }

    loadPermissions()
  }, [profile, authLoading])

  const loadPermissions = async () => {
    if (!profile?.role_id) {
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .eq('role_id', profile.role_id)

      if (error) throw error

      // Transformar array a objeto para acceso rápido
      const permsMap = (data as Permission[]).reduce((acc, perm) => {
        acc[perm.module] = {
          create: perm.can_create,
          read: perm.can_read,
          update: perm.can_update,
          delete: perm.can_delete,
        }
        return acc
      }, {} as PermissionsMap)

      setPermissions(permsMap)
    } catch (error) {
      console.error('Error cargando permisos:', error)
      setPermissions(null)
    } finally {
      setLoading(false)
    }
  }

  const canAccess = (module: string): boolean => {
    return permissions?.[module]?.read ?? false
  }

  const canCreate = (module: string): boolean => {
    return permissions?.[module]?.create ?? false
  }

  const canRead = (module: string): boolean => {
    return permissions?.[module]?.read ?? false
  }

  const canUpdate = (module: string): boolean => {
    return permissions?.[module]?.update ?? false
  }

  const canDelete = (module: string): boolean => {
    return permissions?.[module]?.delete ?? false
  }

  const isAdmin = (): boolean => {
    return profile?.roles?.name === 'admin'
  }

  const hasAnyPermission = (
    module: string,
    actions: Array<'create' | 'read' | 'update' | 'delete'>
  ): boolean => {
    if (!permissions?.[module]) return false
    return actions.some(action => permissions[module][action])
  }

  const value = {
    permissions,
    loading,
    canAccess,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    isAdmin,
    hasAnyPermission,
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