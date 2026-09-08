// src/components/LandingRedirect.tsx
//
// Destino de la ruta "/" para un usuario ya autenticado.
//
// Antes "/" redirigia fijo a /estado-de-flota, y esa ruta era la unica del
// layout SIN ProtectedRoute: cualquier usuario, con el rol que fuera, veia la
// flota completa entrando por URL. Al ponerle el candado hacia falta resolver
// tambien el aterrizaje, porque si no el usuario sin ese permiso caia en
// "Acceso Denegado" apenas iniciaba sesion.
//
// Regla: si tiene Estado de Flota va ahi (comportamiento historico); si no, al
// primer modulo de su propio menu; y si no tiene ninguno, a la pantalla
// "Sin modulos asignados".
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../contexts/PermissionsContext'

export function LandingRedirect() {
  const { canViewMenu, getVisibleMenus, getVisibleSubmenus } = usePermissions()

  if (canViewMenu('estado-de-flota')) {
    return <Navigate to="/estado-de-flota" replace />
  }

  const menus = [...getVisibleMenus()].sort((a, b) => a.order_index - b.order_index)
  const submenus = getVisibleSubmenus()

  for (const menu of menus) {
    // Un menu con submenus puede no tener pagina propia: en ese caso el destino
    // real es su primer submenu de primer nivel.
    const primerSubmenu = submenus
      .filter(s => (s.parent_menu_id || s.menu_id) === menu.id && s.parent_id == null)
      .sort((a, b) => a.order_index - b.order_index)[0]

    const destino = primerSubmenu?.route || menu.route
    if (destino) return <Navigate to={destino} replace />
  }

  return <Navigate to="/sin-modulos" replace />
}
