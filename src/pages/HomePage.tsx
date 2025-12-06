// src/pages/HomePage.tsx
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'

// Importar páginas
import { UsuariosPage } from './usuarios/UsuariosPage'
import { VehiculosPage } from './vehiculos/VehiculosPage'
import { ConductoresPage } from './conductores/ConductoresPage'
import { SiniestrosPage } from './siniestros/SiniestrosPage'
import { IncidenciasPage } from './incidencias/IncidenciasPage'
import { InformesPage } from './informes/InformesPage'
import { AsignacionesPage } from './asignaciones/AsignacionesPage'
import { AsignacionesActivasPage } from './asignaciones/AsignacionesActivasPage'
import { ProductosPage } from './productos/ProductosPage'
import { ProveedoresPage } from './proveedores/ProveedoresPage'
import { InventarioDashboardPage } from './inventario/InventarioDashboardPage'
import { MovimientosPage } from './inventario/MovimientosPage'
import { AsignacionesActivasPage as AsignacionesActivasInventarioPage } from './inventario/AsignacionesActivasPage'
import { HistorialMovimientosPage } from './inventario/HistorialMovimientosPage'
import { PedidosTransitoPage } from './inventario/PedidosTransitoPage'
import { AprobacionesPendientesPage } from './inventario/AprobacionesPendientesPage'
import { USSPage } from './integraciones/uss/USSPage'
import { CabifyPage } from './integraciones/cabify/CabifyPage'
import { ReportesPage } from './reportes/ReportesPage'
import { RolesPage } from './administracion/RolesPage'
import { GestionUsuariosPage } from './administracion/GestionUsuariosPage'
import { MenuPorRolPage } from './administracion/MenuPorRolPage'
import { MenuPorUsuarioPage } from './administracion/MenuPorUsuarioPage'
import { GestorMenusPage } from './administracion/GestorMenusPage'
import { ProtectedRoute } from '../components/ProtectedRoute'

export function HomePage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { getVisibleMenus, getVisibleSubmenusForMenu, loading } = useEffectivePermissions()
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const toggleMenu = (menuName: string) => {
    setOpenMenus(prev => ({ ...prev, [menuName]: !prev[menuName] }))
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const isActiveRoute = (path: string) => {
    return location.pathname === path
  }

  const visibleMenus = getVisibleMenus()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui'
      }}>
        Cargando...
      </div>
    )
  }

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

        .app-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
        }

        /* Sidebar */
        .sidebar {
          width: 240px;
          background: var(--bg-primary);
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-primary);
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid var(--border-primary);
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .sidebar-logo-icon {
          width: 32px;
          height: 32px;
          background: var(--color-gray-800);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-inverse);
          font-size: 16px;
          font-weight: 600;
        }

        .sidebar-logo-text h1 {
          color: var(--text-primary);
          font-size: 16px;
          font-weight: 600;
        }

        .sidebar-logo-text p {
          color: var(--text-secondary);
          font-size: 11px;
          margin-top: 2px;
        }

        .sidebar-nav {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: 2px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }

        .nav-item:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: var(--color-gray-800);
          color: var(--text-inverse);
        }

        .nav-item:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .nav-item:disabled:hover {
          background: none;
          color: var(--text-secondary);
        }

        .nav-icon {
          font-size: 16px;
          width: 16px;
          text-align: center;
        }

        .nav-section {
          margin-bottom: 12px;
        }

        .nav-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 12px;
          color: var(--text-tertiary);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }

        .nav-section-header:hover {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }

        .nav-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .nav-section-arrow {
          font-size: 10px;
          transition: transform 0.2s;
          color: var(--text-tertiary);
        }

        .nav-section-arrow.open {
          transform: rotate(90deg);
        }

        .nav-section-items {
          margin-left: 8px;
          margin-top: 2px;
          padding-left: 12px;
        }

        .nav-section-items.collapsed {
          display: none;
        }

        .nav-divider {
          height: 1px;
          background: var(--border-primary);
          margin: 12px 0;
        }

        .sidebar-footer {
          padding: 12px;
          border-top: 1px solid var(--border-primary);
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: var(--bg-secondary);
          border-radius: 6px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: var(--color-gray-800);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-inverse);
          font-weight: 600;
          font-size: 13px;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name {
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          color: var(--text-secondary);
          font-size: 11px;
        }

        /* Main Content */
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .topbar {
          height: 64px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-primary);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 32px;
          gap: 16px;
        }

        .topbar-title {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .btn-logout {
          padding: 10px 24px;
          background: var(--color-primary);
          color: var(--text-inverse);
          border: 2px solid var(--color-primary);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-logout:hover {
          background: var(--color-primary-hover);
          border-color: var(--color-primary-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 6px var(--color-primary-shadow);
        }

        .content-area {
          flex: 1;
          overflow-y: auto;
          background: var(--bg-secondary);
          padding: 32px;
        }

        .content-card {
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 32px;
          box-shadow: var(--shadow-sm);
        }

        .card-header {
          margin-bottom: 24px;
        }

        .card-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .card-description {
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        @media (max-width: 1024px) {
          .topbar-title {
            font-size: 20px;
          }
          .content-area {
            padding: 24px;
          }
        }

        .menu-toggle {
          display: none;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 8px;
          color: var(--text-primary);
        }

        .sidebar-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg-overlay);
          z-index: 999;
        }

        .sidebar-overlay.show {
          display: block;
        }

        @media (max-width: 768px) {
          .menu-toggle {
            display: block;
          }
          .sidebar {
            width: 240px;
            position: fixed;
            left: -240px;
            top: 0;
            bottom: 0;
            z-index: 1000;
            transition: left 0.3s ease;
          }
          .sidebar.open {
            left: 0;
          }
          .topbar {
            padding: 0 12px;
          }
          .topbar-title {
            font-size: 16px;
          }
          .btn-logout {
            padding: 8px 12px;
            font-size: 12px;
          }
          .content-area {
            padding: 16px;
          }
          .content-card {
            padding: 20px;
          }
        }

        @media (max-width: 480px) {
          .topbar {
            padding: 0 8px;
          }
          .topbar-title {
            font-size: 14px;
          }
          .btn-logout {
            padding: 6px 10px;
            font-size: 11px;
          }
          .content-area {
            padding: 12px;
          }
          .content-card {
            padding: 16px;
          }
        }
      `}</style>

      <div className="app-layout">
        {/* Overlay for mobile */}
        <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={toggleSidebar}></div>

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">T</div>
              <div className="sidebar-logo-text">
                <h1>Toshify</h1>
                <p>Admin Panel</p>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {visibleMenus.length > 0 ? (
              visibleMenus.map((menu) => {
                const submenus = getVisibleSubmenusForMenu(menu.menu_id)
                const hasSubmenus = submenus.length > 0
                const isMenuOpen = openMenus[menu.menu_name] || false

                if (hasSubmenus) {
                  // Menú con submenús
                  return (
                    <div key={menu.menu_id} className="nav-section">
                      <button
                        className="nav-section-header"
                        onClick={() => toggleMenu(menu.menu_name)}
                      >
                        <div className="nav-section-title">
                          {menu.menu_label}
                        </div>
                        <span className={`nav-section-arrow ${isMenuOpen ? 'open' : ''}`}>▸</span>
                      </button>

                      <div className={`nav-section-items ${!isMenuOpen ? 'collapsed' : ''}`}>
                        {submenus.map((submenu) => (
                          <button
                            key={submenu.submenu_id}
                            className={`nav-item ${isActiveRoute(submenu.submenu_route) ? 'active' : ''}`}
                            onClick={() => navigate(submenu.submenu_route)}
                          >
                            <span className="nav-label">{submenu.submenu_label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                } else {
                  // Menú simple sin submenús
                  return (
                    <button
                      key={menu.menu_id}
                      className={`nav-item ${isActiveRoute(menu.menu_route) ? 'active' : ''}`}
                      onClick={() => navigate(menu.menu_route)}
                      title={menu.menu_label}
                    >
                      <span className="nav-label">{menu.menu_label}</span>
                    </button>
                  )
                }
              })
            ) : (
              <div style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                No tienes menús disponibles
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="user-card">
              <div className="user-avatar">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="user-info">
                <div className="user-name">{profile?.full_name || 'Usuario'}</div>
                <div className="user-role">
                  {profile?.roles?.name || 'Sin rol'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <div className="topbar">
            <button className="menu-toggle" onClick={toggleSidebar}>
              <Menu size={24} />
            </button>
            <button className="btn-logout" onClick={handleSignOut}>
              Cerrar Sesión
            </button>
          </div>

          <div className="content-area">
            <Routes>
              {/* Módulos principales */}
              <Route path="/usuarios" element={
                <ProtectedRoute menuName="usuarios" action="view">
                  <UsuariosPage />
                </ProtectedRoute>
              } />
              <Route path="/vehiculos" element={
                <ProtectedRoute menuName="vehiculos" action="view">
                  <VehiculosPage />
                </ProtectedRoute>
              } />
              <Route path="/conductores" element={
                <ProtectedRoute menuName="conductores" action="view">
                  <ConductoresPage />
                </ProtectedRoute>
              } />
              <Route path="/productos" element={
                <ProtectedRoute submenuName="productos" action="view">
                  <ProductosPage />
                </ProtectedRoute>
              } />
              <Route path="/proveedores" element={
                <ProtectedRoute submenuName="proveedores" action="view">
                  <ProveedoresPage />
                </ProtectedRoute>
              } />

              {/* Inventario */}
              <Route path="/inventario/dashboard" element={
                <ProtectedRoute submenuName="inventario-dashboard" action="view">
                  <InventarioDashboardPage />
                </ProtectedRoute>
              } />
              <Route path="/inventario/movimientos" element={
                <ProtectedRoute submenuName="inventario-movimientos" action="view">
                  <MovimientosPage />
                </ProtectedRoute>
              } />
              <Route path="/inventario/asignaciones-activas" element={
                <ProtectedRoute submenuName="inventario-asignaciones" action="view">
                  <AsignacionesActivasInventarioPage />
                </ProtectedRoute>
              } />
              <Route path="/inventario/historial" element={
                <ProtectedRoute submenuName="inventario-historial" action="view">
                  <HistorialMovimientosPage />
                </ProtectedRoute>
              } />
              <Route path="/inventario/pedidos-transito" element={
                <ProtectedRoute submenuName="inventario-pedidos-transito" action="view">
                  <PedidosTransitoPage />
                </ProtectedRoute>
              } />
              <Route path="/inventario/aprobaciones" element={
                <ProtectedRoute submenuName="inventario-aprobaciones" action="view">
                  <AprobacionesPendientesPage />
                </ProtectedRoute>
              } />

              <Route path="/siniestros" element={
                <ProtectedRoute menuName="siniestros" action="view">
                  <SiniestrosPage />
                </ProtectedRoute>
              } />
              <Route path="/incidencias" element={
                <ProtectedRoute menuName="incidencias" action="view">
                  <IncidenciasPage />
                </ProtectedRoute>
              } />
              <Route path="/informes" element={
                <ProtectedRoute menuName="informes" action="view">
                  <InformesPage />
                </ProtectedRoute>
              } />
              <Route path="/asignaciones" element={
                <ProtectedRoute menuName="asignaciones" action="view">
                  <AsignacionesPage />
                </ProtectedRoute>
              } />
              <Route path="/asignaciones-activas" element={
                <ProtectedRoute submenuName="asignaciones-activas" action="view">
                  <AsignacionesActivasPage />
                </ProtectedRoute>
              } />

              {/* Integraciones */}
              <Route path="/uss" element={
                <ProtectedRoute submenuName="uss" action="view">
                  <USSPage />
                </ProtectedRoute>
              } />
              <Route path="/cabify" element={
                <ProtectedRoute submenuName="cabify" action="view">
                  <CabifyPage />
                </ProtectedRoute>
              } />

              {/* Reportes */}
              <Route path="/reportes" element={
                <ProtectedRoute menuName="reportes" action="view">
                  <ReportesPage />
                </ProtectedRoute>
              } />

              {/* Administración */}
              <Route path="/gestion-usuarios" element={
                <ProtectedRoute submenuName="gestion-usuarios" action="view">
                  <GestionUsuariosPage />
                </ProtectedRoute>
              } />
              <Route path="/roles" element={
                <ProtectedRoute submenuName="roles" action="view">
                  <RolesPage />
                </ProtectedRoute>
              } />
              <Route path="/menu-por-rol" element={
                <ProtectedRoute submenuName="menu-por-rol" action="view">
                  <MenuPorRolPage />
                </ProtectedRoute>
              } />
              <Route path="/administracion/menu-por-usuario" element={
                <ProtectedRoute submenuName="menu-por-usuario" action="view">
                  <MenuPorUsuarioPage />
                </ProtectedRoute>
              } />
              <Route path="/gestor-menus" element={
                <ProtectedRoute submenuName="gestor-menus" action="view">
                  <GestorMenusPage />
                </ProtectedRoute>
              } />

              {/* Ruta por defecto */}
              <Route path="/" element={
                <div className="content-card">
                  <div className="card-header">
                    <h2 className="card-title">Bienvenido al Panel de Administración</h2>
                    <p className="card-description">
                      Selecciona una opción del menú lateral para comenzar
                    </p>
                  </div>
                </div>
              } />
            </Routes>
          </div>
        </main>
      </div>
    </>
  )
}
