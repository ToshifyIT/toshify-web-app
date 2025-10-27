// src/pages/UserDashboard.tsx
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Routes, Route } from 'react-router-dom'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
// import { VehiclesPage } from './VehiclesPage' // TODO: Crear esta página
import { useState } from 'react'

export function UserDashboard() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const { getVisibleMenus, getVisibleSubmenusForMenu, canViewMenu, loading } = useEffectivePermissions()
  const [currentMenu, setCurrentMenu] = useState<string | null>(null)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleMenuClick = (menuName: string) => {
    setCurrentMenu(currentMenu === menuName ? null : menuName)
  }

  const handleNavigation = (path: string) => {
    navigate(path)
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

        .dashboard-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background: #F9FAFB;
        }

        .sidebar {
          width: 260px;
          background: #1F2937;
          color: white;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sidebar-logo-icon {
          width: 36px;
          height: 36px;
          background: #E63946;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 16px;
        }

        .sidebar-logo-text h2 {
          font-size: 16px;
          font-weight: 700;
        }

        .sidebar-logo-text p {
          font-size: 11px;
          color: #9CA3AF;
          margin-top: 2px;
        }

        .sidebar-nav {
          flex: 1;
          padding: 12px;
        }

        .nav-menu {
          margin-bottom: 8px;
        }

        .nav-menu-button {
          width: 100%;
          padding: 12px 16px;
          background: transparent;
          border: none;
          color: white;
          text-align: left;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.2s;
        }

        .nav-menu-button:hover {
          background: rgba(255,255,255,0.1);
        }

        .nav-menu-button.active {
          background: #E63946;
        }

        .nav-submenu {
          margin-left: 28px;
          margin-top: 4px;
        }

        .nav-submenu-button {
          width: 100%;
          padding: 8px 16px;
          background: transparent;
          border: none;
          color: #D1D5DB;
          text-align: left;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .nav-submenu-button:hover {
          background: rgba(255,255,255,0.05);
          color: white;
        }

        .dashboard-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .topbar {
          height: 64px;
          background: white;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo-icon {
          width: 40px;
          height: 40px;
          background: #E63946;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 18px;
          font-weight: bold;
        }

        .topbar-title {
          font-size: 20px;
          font-weight: 700;
          color: #1F2937;
        }

        .btn-logout {
          padding: 10px 20px;
          background: white;
          color: #E63946;
          border: 1px solid #E63946;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-logout:hover {
          background: #E63946;
          color: white;
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
        }

        .welcome-card {
          background: white;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 24px;
        }

        .welcome-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .user-avatar {
          width: 60px;
          height: 60px;
          background: #E63946;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 24px;
        }

        .welcome-text h1 {
          font-size: 24px;
          font-weight: 700;
          color: #1F2937;
          margin-bottom: 4px;
        }

        .welcome-text p {
          color: #6B7280;
          font-size: 14px;
        }

        .role-badge {
          display: inline-block;
          padding: 4px 12px;
          background: #FEF3C7;
          color: #92400E;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
          margin-top: 8px;
        }

        .menus-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }

        .menu-card {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .menu-card:hover {
          border-color: #E63946;
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.1);
          transform: translateY(-2px);
        }

        .menu-icon {
          font-size: 36px;
          margin-bottom: 12px;
        }

        .menu-title {
          font-size: 18px;
          font-weight: 600;
          color: #1F2937;
          margin-bottom: 8px;
        }

        .menu-permissions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .perm-badge {
          padding: 3px 8px;
          background: #F3F4F6;
          color: #6B7280;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
        }

        .perm-badge.active {
          background: #D1FAE5;
          color: #065F46;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .empty-state h2 {
          font-size: 20px;
          color: #1F2937;
          margin-bottom: 8px;
        }

        .empty-state p {
          color: #6B7280;
          font-size: 14px;
        }
      `}</style>

      <div className="dashboard-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">T</div>
              <div className="sidebar-logo-text">
                <h2>Toshify</h2>
                <p>Panel de Usuario</p>
              </div>
            </div>
          </div>

          <div className="sidebar-nav">
            {visibleMenus.length > 0 ? (
              visibleMenus.map((menu) => {
                const submenus = getVisibleSubmenusForMenu(menu.menu_id)
                const hasSubmenus = submenus.length > 0
                const isOpen = currentMenu === menu.menu_name

                return (
                  <div key={menu.menu_id} className="nav-menu">
                    <button
                      className={`nav-menu-button ${isOpen ? 'active' : ''}`}
                      onClick={() => {
                        if (hasSubmenus) {
                          handleMenuClick(menu.menu_name)
                        } else {
                          handleNavigation(`/dashboard/${menu.menu_name}`)
                        }
                      }}
                    >
                      <span>🚗</span>
                      <span>{menu.menu_label}</span>
                      {hasSubmenus && (
                        <span style={{ marginLeft: 'auto' }}>
                          {isOpen ? '▼' : '▶'}
                        </span>
                      )}
                    </button>

                    {hasSubmenus && isOpen && (
                      <div className="nav-submenu">
                        {submenus.map((submenu) => (
                          <button
                            key={submenu.submenu_id}
                            className="nav-submenu-button"
                            onClick={() => handleNavigation(`/dashboard/${menu.menu_name}/${submenu.submenu_name}`)}
                          >
                            <span>•</span>
                            <span>{submenu.submenu_label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div style={{ padding: '20px', color: '#9CA3AF', fontSize: '13px', textAlign: 'center' }}>
                No tienes menús disponibles
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="dashboard-content">
          <div className="topbar">
            <div className="topbar-left">
              <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '16px' }}>
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  {profile?.full_name || 'Usuario'}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {profile?.roles?.name || 'Sin rol'}
                </div>
              </div>
            </div>
            <button className="btn-logout" onClick={handleSignOut}>
              Cerrar Sesión
            </button>
          </div>

          <div className="main-content">
            <Routes>
              <Route path="/" element={
                <div className="welcome-card">
                  <div className="welcome-header">
                    <div className="user-avatar">
                      {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="welcome-text">
                      <h1>Bienvenido, {profile?.full_name || 'Usuario'}</h1>
                      <p>{user?.email || 'Sin email'}</p>
                      {profile?.roles?.name && (
                        <div className="role-badge">
                          {profile.roles.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <p style={{ marginTop: '16px', color: '#6B7280' }}>
                    Selecciona un menú del panel izquierdo para comenzar
                  </p>
                </div>
              } />

              {/* Ruta para Vehículos */}
              {canViewMenu('vehiculos') && (
                <Route path="/vehiculos" element={
                  <div className="welcome-card">
                    <h2>Vehículos</h2>
                    <p>Página de vehículos (en desarrollo)</p>
                  </div>
                } />
              )}

              {/* Aquí se pueden agregar más rutas según los menús */}
            </Routes>
          </div>
        </div>
      </div>
    </>
  )
}
