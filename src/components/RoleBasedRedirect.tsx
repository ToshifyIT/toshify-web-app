// src/components/RoleBasedRedirect.tsx
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../contexts/PermissionsContext'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'

export function RoleBasedRedirect() {
  const { isAdmin } = usePermissions()
  const { getVisibleMenus, loading } = useEffectivePermissions()

  if (loading) {
    return <div>Cargando...</div>
  }

  // Obtener el primer menú visible para el usuario
  const visibleMenus = getVisibleMenus()
  const firstMenu = visibleMenus[0]

  // Si tiene menús visibles, redirigir al primero
  if (firstMenu?.menu_route) {
    return <Navigate to={firstMenu.menu_route} replace />
  }

  // Fallback: si es admin pero no tiene menús, ir a vehiculos
  if (isAdmin()) {
    return <Navigate to="/vehiculos" replace />
  }

  // Si no tiene menús ni es admin, mostrar mensaje
  return <Navigate to="/" replace />
}
