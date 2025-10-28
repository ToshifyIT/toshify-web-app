// src/components/RoleBasedRedirect.tsx
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../contexts/PermissionsContext'

export function RoleBasedRedirect() {
  const { isAdmin } = usePermissions()

  console.log('🔀 RoleBasedRedirect - isAdmin:', isAdmin())

  // Si es admin, va al panel de administración (primera página disponible)
  if (isAdmin()) {
    return <Navigate to="/vehiculos" replace />
  }

  // Si no es admin, va al dashboard de usuario
  return <Navigate to="/dashboard" replace />
}
