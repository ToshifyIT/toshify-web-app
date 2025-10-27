// src/pages/AdminPage.tsx
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { useNavigate } from 'react-router-dom'
import { UserManagement } from '../components/admin/UserManagement'
import { RoleManagement } from '../components/admin/RoleManagement'
import { PermissionMatrix } from '../components/admin/PermissionMatrix'

export function AdminPage() {
  const { profile, signOut } = useAuth()
  const { isAdmin } = usePermissions()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users')

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
          width: 260px;
          background: #1F2937;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #374151;
        }

        .sidebar-header {
          padding: 24px;
          border-bottom: 1px solid #374151;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sidebar-logo-icon {
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

        .sidebar-logo-text h1 {
          color: white;
          font-size: 18px;
          font-weight: 700;
        }

        .sidebar-logo-text p {
          color: #9CA3AF;
          font-size: 12px;
          margin-top: 2px;
        }

        .sidebar-nav {
          flex: 1;
          padding: 16px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          color: #9CA3AF;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 4px;
          font-size: 14px;
          font-weight: 500;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }

        .nav-item:hover {
          background: #374151;
          color: white;
        }

        .nav-item.active {
          background: #E63946;
          color: white;
        }

        .nav-icon {
          font-size: 18px;
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid #374151;
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #374151;
          border-radius: 8px;
        }

        .user-avatar {
          width: 40px;
          height: 40px;
          background: #E63946;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name {
          color: white;
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          color: #9CA3AF;
          font-size: 12px;
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
          .user-info {
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
            <button
              className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <span className="nav-icon">👥</span>
              <span className="nav-label">Usuarios</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              <span className="nav-icon">🔑</span>
              <span className="nav-label">Roles</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'permissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('permissions')}
            >
              <span className="nav-icon">⚙️</span>
              <span className="nav-label">Permisos</span>
            </button>
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
              {activeTab === 'users' && 'Gestión de Usuarios'}
              {activeTab === 'roles' && 'Gestión de Roles'}
              {activeTab === 'permissions' && 'Matriz de Permisos'}
            </h1>
            <button className="btn-logout" onClick={handleSignOut}>
              Cerrar Sesión
            </button>
          </div>

          <div className="content-area">
            <div className="content-card">
              {activeTab === 'users' && <UserManagement />}
              {activeTab === 'roles' && <RoleManagement />}
              {activeTab === 'permissions' && <PermissionMatrix />}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}