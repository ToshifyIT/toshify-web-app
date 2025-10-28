// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: permsLoading } = usePermissions()

  const loading = authLoading || permsLoading

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui'
      }}>
        <div>Cargando...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Si la ruta requiere admin y el usuario no es admin, redirigir al dashboard
  if (requireAdmin && !isAdmin()) {
    console.log('⚠️ Acceso denegado: se requiere rol admin')
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}