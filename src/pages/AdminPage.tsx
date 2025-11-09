// src/pages/AdminPage.tsx
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { useNavigate } from 'react-router-dom'
import { UserManagement } from '../components/admin/UserManagement'
import { RoleManagement } from '../components/admin/RoleManagement'
import { PermissionMatrix } from '../components/admin/PermissionMatrix'
import { VehicleManagement } from '../modules/vehiculos/VehicleManagement'
import { UserMenuPermissionsManager } from '../components/admin/UserMenuPermissionsManager'
import { RoleMenuPermissionsManager } from '../components/admin/RoleMenuPermissionsManager'
import { MenuHierarchyManager } from '../components/admin/MenuHierarchyManager'
import { UsuariosModule } from '../modules/usuarios/UsuariosModule'
import { ConductoresModule } from '../modules/conductores/ConductoresModule'
import { SiniestrosModule } from '../modules/siniestros/SiniestrosModule'
import { IncidenciasModule } from '../modules/incidencias/IncidenciasModule'
import { InformesModule } from '../modules/informes/InformesModule'
import { AsignacionesModule } from '../modules/asignaciones/AsignacionesModule'
import { USSModule } from '../modules/integraciones/uss/USSModule'
import { CabifyModule } from '../modules/integraciones/cabify/CabifyModule'
import { ReportesModule } from '../modules/reportes/ReportesModule'

type TabType =
  | 'usuarios' | 'vehiculos' | 'conductores' | 'siniestros' | 'incidencias'
  | 'informes' | 'asignaciones' | 'uss' | 'cabify' | 'reportes' | 'administracion'
  | 'users' | 'roles' | 'permissions' | 'menu-permissions' | 'role-menu-permissions' | 'menu-manager'

export function AdminPage() {
  const { profile, signOut } = useAuth()
  const { isAdmin, canViewMenu } = usePermissions()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('vehiculos')
  const [administracionMenuOpen, setAdministracionMenuOpen] = useState(false)
  const [integracionesMenuOpen, setIntegracionesMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
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
          background: #FFFFFF;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #E5E7EB;
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid #E5E7EB;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .sidebar-logo-icon {
          width: 32px;
          height: 32px;
          background: #1F2937;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
          font-weight: 600;
        }

        .sidebar-logo-text h1 {
          color: #1F2937;
          font-size: 16px;
          font-weight: 600;
        }

        .sidebar-logo-text p {
          color: #6B7280;
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
          color: #6B7280;
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
          background: #F3F4F6;
          color: #1F2937;
        }

        .nav-item.active {
          background: #1F2937;
          color: white;
        }

        .nav-item:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .nav-item:disabled:hover {
          background: none;
          color: #6B7280;
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
          color: #9CA3AF;
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
          background: #F9FAFB;
          color: #6B7280;
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
          color: #9CA3AF;
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
          background: #E5E7EB;
          margin: 12px 0;
        }

        .sidebar-footer {
          padding: 12px;
          border-top: 1px solid #E5E7EB;
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #F9FAFB;
          border-radius: 6px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: #1F2937;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 13px;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name {
          color: #1F2937;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          color: #6B7280;
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
          background: white;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
        }

        .topbar-title {
          font-size: 24px;
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

        .content-area {
          flex: 1;
          overflow-y: auto;
          background: #F9FAFB;
          padding: 32px;
        }

        .content-card {
          background: white;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .card-header {
          margin-bottom: 24px;
        }

        .card-title {
          font-size: 20px;
          font-weight: 700;
          color: #1F2937;
          margin-bottom: 8px;
        }

        .card-description {
          color: #6B7280;
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

        @media (max-width: 768px) {
          .sidebar {
            width: 70px;
          }
          .sidebar-logo-text,
          .nav-label,
          .user-info,
          .nav-section-arrow {
            display: none;
          }
          .sidebar-header {
            padding: 16px;
          }
          .sidebar-logo-icon {
            width: 38px;
            height: 38px;
            font-size: 16px;
          }
          .nav-item {
            padding: 12px;
            justify-content: center;
          }
          .nav-section-header {
            padding: 12px;
            justify-content: center;
          }
          .nav-section-items {
            margin-left: 0;
            border-left: none;
            padding-left: 0;
          }
          .user-card {
            padding: 12px;
            justify-content: center;
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
          .sidebar {
            width: 60px;
          }
          .sidebar-header {
            padding: 12px;
          }
          .sidebar-logo-icon {
            width: 36px;
            height: 36px;
            font-size: 14px;
          }
          .nav-item {
            padding: 10px;
          }
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
        {/* Sidebar */}
        <aside className="sidebar">
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
            {/* Módulos principales */}
            <button
              className={`nav-item ${activeTab === 'usuarios' ? 'active' : ''}`}
              onClick={() => setActiveTab('usuarios')}
              disabled={!canViewMenu('usuarios')}
              title={!canViewMenu('usuarios') ? 'No tienes permisos' : 'Gestión de Usuarios'}
            >
              <span className="nav-icon">👥</span>
              <span className="nav-label">Usuarios</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'vehiculos' ? 'active' : ''}`}
              onClick={() => setActiveTab('vehiculos')}
              disabled={!canViewMenu('vehiculos')}
              title={!canViewMenu('vehiculos') ? 'No tienes permisos' : 'Flota de Vehículos'}
            >
              <span className="nav-icon">🚗</span>
              <span className="nav-label">Vehículos</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'conductores' ? 'active' : ''}`}
              onClick={() => setActiveTab('conductores')}
              disabled={!canViewMenu('conductores')}
              title={!canViewMenu('conductores') ? 'No tienes permisos' : 'Conductores'}
            >
              <span className="nav-icon">👨‍✈️</span>
              <span className="nav-label">Conductores</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'siniestros' ? 'active' : ''}`}
              onClick={() => setActiveTab('siniestros')}
              disabled={!canViewMenu('siniestros')}
              title={!canViewMenu('siniestros') ? 'No tienes permisos' : 'Siniestros y Seguros'}
            >
              <span className="nav-icon">⚠️</span>
              <span className="nav-label">Siniestros</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'incidencias' ? 'active' : ''}`}
              onClick={() => setActiveTab('incidencias')}
              disabled={!canViewMenu('incidencias')}
              title={!canViewMenu('incidencias') ? 'No tienes permisos' : 'Incidencias'}
            >
              <span className="nav-icon">📋</span>
              <span className="nav-label">Incidencias</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'informes' ? 'active' : ''}`}
              onClick={() => setActiveTab('informes')}
              disabled={!canViewMenu('informes')}
              title={!canViewMenu('informes') ? 'No tienes permisos' : 'Informes Operativos'}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-label">Informes</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'asignaciones' ? 'active' : ''}`}
              onClick={() => setActiveTab('asignaciones')}
              disabled={!canViewMenu('asignaciones')}
              title={!canViewMenu('asignaciones') ? 'No tienes permisos' : 'Asignaciones'}
            >
              <span className="nav-icon">📅</span>
              <span className="nav-label">Asignaciones</span>
            </button>

            <div className="nav-divider"></div>

            {/* Integraciones - Menú con submenús */}
            <div className="nav-section">
              <button
                className="nav-section-header"
                onClick={() => setIntegracionesMenuOpen(!integracionesMenuOpen)}
              >
                <div className="nav-section-title">
                  <span className="nav-icon">🔗</span>
                  Integraciones
                </div>
                <span className={`nav-section-arrow ${integracionesMenuOpen ? 'open' : ''}`}>▸</span>
              </button>

              <div className={`nav-section-items ${!integracionesMenuOpen ? 'collapsed' : ''}`}>
                <button
                  className={`nav-item ${activeTab === 'uss' ? 'active' : ''}`}
                  onClick={() => setActiveTab('uss')}
                >
                  <span className="nav-label">Integración USS</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'cabify' ? 'active' : ''}`}
                  onClick={() => setActiveTab('cabify')}
                >
                  <span className="nav-label">Integración Cabify</span>
                </button>
              </div>
            </div>

            <button
              className={`nav-item ${activeTab === 'reportes' ? 'active' : ''}`}
              onClick={() => setActiveTab('reportes')}
              title="Diseño de Reportes"
            >
              <span className="nav-icon">📄</span>
              <span className="nav-label">Reportes</span>
            </button>

            <div className="nav-divider"></div>

            {/* Administración - Menú con submenús */}
            <div className="nav-section">
              <button
                className="nav-section-header"
                onClick={() => setAdministracionMenuOpen(!administracionMenuOpen)}
              >
                <div className="nav-section-title">
                  <span className="nav-icon">⚙️</span>
                  Administración
                </div>
                <span className={`nav-section-arrow ${administracionMenuOpen ? 'open' : ''}`}>▸</span>
              </button>

              <div className={`nav-section-items ${!administracionMenuOpen ? 'collapsed' : ''}`}>
                <button
                  className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                  onClick={() => setActiveTab('users')}
                >
                  <span className="nav-label">Usuarios</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'roles' ? 'active' : ''}`}
                  onClick={() => setActiveTab('roles')}
                >
                  <span className="nav-label">Roles</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'permissions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('permissions')}
                >
                  <span className="nav-label">Permisos</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'role-menu-permissions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('role-menu-permissions')}
                >
                  <span className="nav-label">Menú por Rol</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'menu-permissions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('menu-permissions')}
                >
                  <span className="nav-label">Menú por Usuario</span>
                </button>
                <button
                  className={`nav-item ${activeTab === 'menu-manager' ? 'active' : ''}`}
                  onClick={() => setActiveTab('menu-manager')}
                >
                  <span className="nav-label">Gestor Menús</span>
                </button>
              </div>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="user-card">
              <div className="user-avatar">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="user-info">
                <div className="user-name">{profile?.full_name || 'Usuario'}</div>
                <div className="user-role">
                  {profile?.roles?.name || 'Sin rol'} {isAdmin() && '👑'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <div className="topbar">
            <h1 className="topbar-title">
              {activeTab === 'usuarios' && 'Gestión de Usuarios'}
              {activeTab === 'vehiculos' && 'Flota de Vehículos'}
              {activeTab === 'conductores' && 'Conductores'}
              {activeTab === 'siniestros' && 'Siniestros y Seguros'}
              {activeTab === 'incidencias' && 'Incidencias'}
              {activeTab === 'informes' && 'Informes Operativos'}
              {activeTab === 'asignaciones' && 'Control de Asignaciones'}
              {activeTab === 'uss' && 'Integración USS'}
              {activeTab === 'cabify' && 'Integración Cabify'}
              {activeTab === 'reportes' && 'Diseño de Reportes'}
              {activeTab === 'users' && 'Administración de Usuarios'}
              {activeTab === 'roles' && 'Gestión de Roles'}
              {activeTab === 'permissions' && 'Matriz de Permisos'}
              {activeTab === 'role-menu-permissions' && 'Permisos de Menú por Rol'}
              {activeTab === 'menu-permissions' && 'Permisos de Menú por Usuario'}
              {activeTab === 'menu-manager' && 'Gestor de Menús Jerárquicos'}
            </h1>
            <button className="btn-logout" onClick={handleSignOut}>
              Cerrar Sesión
            </button>
          </div>

          <div className="content-area">
            <div className="content-card">
              {/* Módulos principales */}
              {activeTab === 'usuarios' && <UsuariosModule />}
              {activeTab === 'vehiculos' && <VehicleManagement />}
              {activeTab === 'conductores' && <ConductoresModule />}
              {activeTab === 'siniestros' && <SiniestrosModule />}
              {activeTab === 'incidencias' && <IncidenciasModule />}
              {activeTab === 'informes' && <InformesModule />}
              {activeTab === 'asignaciones' && <AsignacionesModule />}

              {/* Integraciones */}
              {activeTab === 'uss' && <USSModule />}
              {activeTab === 'cabify' && <CabifyModule />}

              {/* Reportes */}
              {activeTab === 'reportes' && <ReportesModule />}

              {/* Administración */}
              {activeTab === 'users' && <UserManagement />}
              {activeTab === 'roles' && <RoleManagement />}
              {activeTab === 'permissions' && <PermissionMatrix />}
              {activeTab === 'role-menu-permissions' && <RoleMenuPermissionsManager />}
              {activeTab === 'menu-permissions' && <UserMenuPermissionsManager />}
              {activeTab === 'menu-manager' && <MenuHierarchyManager />}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}