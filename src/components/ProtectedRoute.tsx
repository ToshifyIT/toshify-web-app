// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { Spinner } from './ui/LoadingOverlay'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  menuName?: string
  submenuName?: string
  action?: 'view' | 'create' | 'edit' | 'delete'
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  menuName,
  submenuName,
  action = 'view'
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, canViewMenu, canViewSubmenu, canAccess, loading: permsLoading } = usePermissions()

  const loading = authLoading || permsLoading

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #f9fafb)',
      }}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Si la ruta requiere admin y el usuario no es admin, redirigir al dashboard
  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/dashboard" replace />
  }

  // Verificar permisos de menú si se especificó
  if (menuName && !canViewMenu(menuName)) {
    return <Navigate to="/unauthorized" replace />
  }

  // Verificar permisos de submenú si se especificó
  if (submenuName && !canViewSubmenu(submenuName)) {
    return <Navigate to="/unauthorized" replace />
  }

  // Verificar permiso específico de acción si se especificó menuName o submenuName
  if ((menuName || submenuName) && action !== 'view') {
    const targetName = submenuName || menuName
    if (targetName && !canAccess(targetName, action)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}