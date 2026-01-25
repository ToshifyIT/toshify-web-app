// src/pages/HomePage.tsx
import { useState, lazy, Suspense, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { 
  Menu, AlertCircle, RefreshCw, PanelLeftClose, PanelLeft,
  Car, Users, AlertTriangle, FileWarning, BarChart3, Receipt,
  Truck, Link2, Settings, CreditCard, Activity, Package,
  Calendar, MapPin, Gauge, FileText, Shield, UserCog, List, ClipboardList, History
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import { useTheme } from '../contexts/ThemeContext'
import logoToshify from '../assets/logo-toshify.png'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { Spinner } from '../components/ui/LoadingOverlay'

// Mapeo de iconos por nombre de menú
const menuIcons: Record<string, LucideIcon> = {
  'estado-de-flota': Activity,
  'vehiculos': Car,
  'conductores': Users,
  'incidencias': AlertTriangle,
  'siniestros': FileWarning,
  'reportes': BarChart3,
  'facturacion': Receipt,
  'logistica': Truck,
  'integraciones': Link2,
  'administracion': Settings,
  'multas-telepase': CreditCard,
  'onboarding': Calendar,
  'inventario': Package,
  // Submenús comunes
  'programacion': Calendar,
  'programacion-entregas': Calendar,
  'productos': Package,
  'proveedores': Users,
  'ctrl-exceso-vel': Gauge,
  'bitacora-uss': History,
  'cabify': MapPin,
  'gestion-usuarios': UserCog,
  'roles': Shield,
  'menu-por-rol': List,
  'menu-por-usuario': List,
  'gestor-menus': ClipboardList,
  'auditoria': FileText,
  'telepase-historico': CreditCard,
  'multas': FileWarning,
  'inventario-dashboard': BarChart3,
  'inventario-movimientos': Package,
  'inventario-asignaciones': Users,
  'inventario-historial': History,
  'inventario-pedidos': ClipboardList,
}

// Función para obtener icono de un menú
const getMenuIcon = (menuName: string): LucideIcon => {
  return menuIcons[menuName] || Activity
}

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '50vh'
  }}>
    <Spinner size="lg" message="Cargando..." />
  </div>
)

// Error Boundary para manejar errores de carga de chunks
interface LazyErrorBoundaryState {
  hasError: boolean
}

class LazyErrorBoundary extends Component<{ children: ReactNode }, LazyErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): LazyErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error cargando página:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '50vh',
          gap: '16px',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          padding: '20px'
        }}>
          <AlertCircle size={48} style={{ color: 'var(--color-error, #DC2626)' }} />
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Error al cargar la página</h3>
          <p style={{ margin: 0 }}>Hubo un problema de conexión. Intentá de nuevo.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--color-primary, #3B82F6)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Wrapper que combina Suspense + Error Boundary
const LazyPage = ({ children }: { children: ReactNode }) => (
  <LazyErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  </LazyErrorBoundary>
)

// Lazy-loaded pages (largest modules first for biggest impact)
const ConductoresPage = lazy(() => import('./conductores/ConductoresPage').then(m => ({ default: m.ConductoresPage })))
const FacturacionPage = lazy(() => import('./facturacion/FacturacionPage').then(m => ({ default: m.FacturacionPage })))
const IncidenciasPage = lazy(() => import('./incidencias/IncidenciasPage').then(m => ({ default: m.IncidenciasPage })))
const ProgramacionPage = lazy(() => import('./onboarding/ProgramacionPage'))
const MovimientosPage = lazy(() => import('./inventario/MovimientosPage').then(m => ({ default: m.MovimientosPage })))
const AsignacionesPage = lazy(() => import('./asignaciones/AsignacionesPage').then(m => ({ default: m.AsignacionesPage })))

// Regular imports for smaller/frequently used pages
import { UsuariosPage } from './usuarios/UsuariosPage'
import { VehiculosPage } from './vehiculos/VehiculosPage'
import { SiniestrosPage } from './siniestros/SiniestrosPage'
import { InformesPage } from './informes/InformesPage'
import { AsignacionesActivasPage } from './asignaciones/AsignacionesActivasPage'
import { ProductosPage } from './productos/ProductosPage'
import { ProveedoresPage } from './proveedores/ProveedoresPage'
import { InventarioDashboardPage } from './inventario/InventarioDashboardPage'
import { AsignacionesActivasPage as AsignacionesActivasInventarioPage } from './inventario/AsignacionesActivasPage'
import { HistorialMovimientosPage } from './inventario/HistorialMovimientosPage'
import { PedidosPage } from './inventario/PedidosPage'
import { USSPage } from './integraciones/uss/USSPage'
import { BitacoraPage } from './integraciones/uss/BitacoraPage'
import { CabifyPage } from './integraciones/cabify/CabifyPage'
import { ReportesPage } from './reportes/ReportesPage'
import { RolesPage } from './administracion/RolesPage'
import { GestionUsuariosPage } from './administracion/GestionUsuariosPage'
import { MenuPorRolPage } from './administracion/MenuPorRolPage'
import { MenuPorUsuarioPage } from './administracion/MenuPorUsuarioPage'
import { GestorMenusPage } from './administracion/GestorMenusPage'
import { AuditoriaPage } from './administracion/AuditoriaPage'
import { ProfilePage } from './profile/ProfilePage'
// Multas/Telepase
import { TelepaseHistoricoPage } from './multas-telepase/TelepaseHistoricoPage'
import { MultasPage } from './multas-telepase/MultasPage'

// Tipo para submenús con jerarquía
interface SubmenuWithHierarchy {
  submenu_id: string
  submenu_name: string
  submenu_label: string
  submenu_route: string
  menu_id: string
  parent_id: string | null
  level: number
  order_index: number
}

export function HomePage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { getVisibleMenus, getVisibleSubmenusForMenu, loading } = useEffectivePermissions()
  useTheme() // Para mantener el contexto del tema activo
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [openNestedMenus, setOpenNestedMenus] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

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

  const toggleNestedMenu = (submenuId: string) => {
    setOpenNestedMenus(prev => ({ ...prev, [submenuId]: !prev[submenuId] }))
  }

  const isActiveRoute = (path: string) => {
    return location.pathname === path
  }

  // Función recursiva para renderizar submenús anidados
  const renderSubmenus = (
    allSubmenus: SubmenuWithHierarchy[],
    parentId: string | null = null,
    depth: number = 0
  ): React.ReactNode => {
    // Filtrar submenús que son hijos del padre actual
    const children = allSubmenus
      .filter(sub => sub.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index)

    if (children.length === 0) return null

    return children.map(submenu => {
      // Verificar si este submenú tiene hijos
      const hasChildren = allSubmenus.some(sub => sub.parent_id === submenu.submenu_id)
      const isNestedOpen = openNestedMenus[submenu.submenu_id] || false

      if (hasChildren) {
        // Este submenú tiene hijos - renderizar como grupo colapsable
        return (
          <div key={submenu.submenu_id} className="nav-nested-group">
            <button
              className="nav-nested-header"
              onClick={() => {
                // Si tiene ruta, navegar; si no, solo toggle
                if (submenu.submenu_route) {
                  navigate(submenu.submenu_route)
                }
                toggleNestedMenu(submenu.submenu_id)
              }}
            >
              <span>{submenu.submenu_label === 'Telepase Histórico' ? 'Telepase' : submenu.submenu_label}</span>
              <span className={`nav-nested-arrow ${isNestedOpen ? 'open' : ''}`}>▸</span>
            </button>
            <div className={`nav-nested-items ${!isNestedOpen ? 'collapsed' : ''}`}>
              {renderSubmenus(allSubmenus, submenu.submenu_id, depth + 1)}
            </div>
          </div>
        )
      } else {
        // Submenú sin hijos - renderizar como botón navegable
        return (
          <button
            key={submenu.submenu_id}
            className={`nav-item ${depth > 0 ? 'nested' : ''} ${isActiveRoute(submenu.submenu_route) ? 'active' : ''}`}
            onClick={() => navigate(submenu.submenu_route)}
          >
            <span className="nav-label">{submenu.submenu_label === 'Telepase Histórico' ? 'Telepase' : submenu.submenu_label}</span>
          </button>
        )
      }
    })
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
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-primary);
        }

        .sidebar-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .sidebar-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          overflow: hidden;
        }

        .sidebar-logo-img {
          height: 140px;
          width: auto;
          object-fit: contain;
          margin: -45px 0;
        }

        .sidebar-logo-subtitle {
          color: var(--text-tertiary, #6B7280);
          font-size: 11px;
          margin: 0;
          font-weight: 500;
        }

        .sidebar-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sidebar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .sidebar-collapse-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        /* Sidebar Collapsed State */
        .sidebar.collapsed {
          width: 64px;
          overflow: visible;
        }

        .sidebar.collapsed .sidebar-header {
          padding: 16px 12px;
        }

        .sidebar.collapsed .sidebar-header-row {
          justify-content: center;
        }

        .sidebar.collapsed .sidebar-nav {
          padding: 12px 8px;
          overflow: visible;
        }

        .sidebar.collapsed .nav-section-wrapper,
        .sidebar.collapsed .nav-item-wrapper {
          position: relative;
        }

        .sidebar.collapsed .nav-item {
          justify-content: center;
          padding: 12px;
        }

        .sidebar.collapsed .nav-label {
          display: none;
        }

        .sidebar.collapsed .nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          min-width: 24px;
          color: var(--text-secondary);
        }

        .sidebar.collapsed .nav-item:hover .nav-icon {
          color: var(--text-primary);
        }

        .sidebar.collapsed .nav-item.active .nav-icon {
          color: var(--text-inverse);
        }

        .sidebar.collapsed .nav-section-header {
          justify-content: center;
          padding: 12px;
        }

        .sidebar.collapsed .nav-section-title {
          display: none;
        }

        .sidebar.collapsed .nav-section-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          min-width: 24px;
          color: var(--text-tertiary);
        }

        .sidebar.collapsed .nav-section-header:hover .nav-section-icon {
          color: var(--text-secondary);
        }

        .sidebar.collapsed .nav-section-arrow {
          display: none;
        }

        .sidebar.collapsed .nav-section-items {
          display: none;
        }

        .sidebar.collapsed .sidebar-footer {
          padding: 12px 8px;
        }

        .sidebar.collapsed .user-card {
          justify-content: center;
          padding: 10px;
        }

        .sidebar.collapsed .user-info {
          display: none;
        }

        .sidebar.collapsed .user-avatar {
          width: 36px;
          height: 36px;
        }

        /* Hide tooltips when sidebar is expanded */
        .sidebar:not(.collapsed) .nav-tooltip {
          display: none;
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

        .nav-icon,
        .nav-section-icon {
          display: none;
        }

        /* Wrapper para tooltip */
        .nav-item-wrapper,
        .nav-section-wrapper {
          position: relative;
        }

        /* Tooltip styles */
        .nav-tooltip {
          position: absolute;
          left: calc(100% + 8px);
          top: 50%;
          transform: translateY(-50%);
          padding: 8px 12px;
          background: var(--color-gray-800);
          color: var(--text-inverse);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          border-radius: 6px;
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: opacity 0.15s, visibility 0.15s;
        }

        .nav-tooltip::before {
          content: '';
          position: absolute;
          right: 100%;
          top: 50%;
          transform: translateY(-50%);
          border: 6px solid transparent;
          border-right-color: var(--color-gray-800);
        }

        .sidebar.collapsed .nav-item-wrapper:hover .nav-tooltip {
          opacity: 1;
          visibility: visible;
        }

        /* Flyout menu for collapsed sidebar with submenus */
        .nav-flyout {
          position: absolute;
          left: 100%;
          top: 0;
          min-width: 200px;
          padding-left: 8px;
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.15s, visibility 0.15s;
        }

        .nav-flyout-content {
          background: var(--bg-primary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }

        /* Área invisible para conectar el icono con el flyout */
        .nav-flyout::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 8px;
          background: transparent;
        }

        .sidebar.collapsed .nav-section-wrapper:hover .nav-flyout {
          opacity: 1;
          visibility: visible;
        }

        .nav-flyout-header {
          padding: 12px 16px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-primary);
          background: var(--bg-primary);
        }

        .nav-flyout-items {
          padding: 8px;
          background: var(--bg-primary);
          max-height: 400px;
          overflow-y: auto;
        }

        .nav-flyout-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          background: none;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .nav-flyout-item:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-flyout-item.active {
          background: var(--color-gray-800);
          color: var(--text-inverse);
        }

        .nav-flyout-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          color: var(--text-tertiary);
        }

        .nav-flyout-item:hover .nav-flyout-icon {
          color: var(--text-secondary);
        }

        .nav-flyout-item.active .nav-flyout-icon {
          color: var(--text-inverse);
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

        /* Submenús anidados */
        .nav-nested-group {
          margin-bottom: 2px;
        }

        .nav-nested-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 13px;
          font-weight: 500;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }

        .nav-nested-header:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-nested-arrow {
          font-size: 10px;
          transition: transform 0.2s;
          color: var(--text-tertiary);
          margin-left: auto;
        }

        .nav-nested-arrow.open {
          transform: rotate(90deg);
        }

        .nav-nested-items {
          margin-left: 8px;
          padding-left: 12px;
          border-left: 1px solid var(--border-primary);
          margin-top: 2px;
        }

        .nav-nested-items.collapsed {
          display: none;
        }

        .nav-item.nested {
          padding: 10px 12px;
          font-size: 13px;
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

        .user-card-clickable {
          width: 100%;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .user-card-clickable:hover {
          background: var(--bg-tertiary);
          transform: translateY(-1px);
        }

        .user-card-clickable:active {
          transform: translateY(0);
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
          .sidebar {
            width: 220px;
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
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
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

        /* Tablet portrait & large phones */
        @media (max-width: 768px) {
          .menu-toggle {
            display: flex;
          }
          .sidebar-collapse-btn {
            display: none;
          }
          .sidebar {
            width: 280px;
            max-width: 85vw;
            position: fixed;
            left: -100%;
            top: 0;
            bottom: 0;
            z-index: 1000;
            transition: left 0.3s ease;
          }
          .sidebar.collapsed {
            width: 280px;
          }
          .sidebar.collapsed .sidebar-header {
            padding: 16px 20px;
          }
          .sidebar.collapsed .sidebar-logo {
            display: flex;
          }
          .sidebar.collapsed .nav-label,
          .sidebar.collapsed .nav-section-title,
          .sidebar.collapsed .nav-section-arrow,
          .sidebar.collapsed .nav-section-items,
          .sidebar.collapsed .user-info {
            display: block;
          }
          .sidebar.collapsed .nav-section-items {
            display: block;
          }
          .sidebar.collapsed .nav-section-items.collapsed {
            display: none;
          }
          .sidebar.open {
            left: 0;
          }
          .topbar {
            padding: 0 12px;
            justify-content: space-between;
          }
          .topbar-title {
            font-size: 16px;
          }
          .btn-logout {
            padding: 10px 16px;
            font-size: 13px;
            min-height: 44px;
          }
          .content-area {
            padding: 16px;
          }
          .content-card {
            padding: 20px;
            border-radius: 8px;
          }
          .card-title {
            font-size: 18px;
          }
          .card-description {
            font-size: 13px;
          }
          .sidebar-header {
            padding: 16px;
          }
          .sidebar-footer {
            padding: 12px 16px;
          }
          .user-card {
            padding: 12px;
          }
        }

        /* Mobile phones (iPhone 15 Pro Max = 430px, iPhone 14 = 390px) */
        @media (max-width: 480px) {
          .topbar {
            padding: 0 10px;
            height: 56px;
            gap: 8px;
          }
          .topbar-title {
            font-size: 14px;
          }
          .btn-logout {
            padding: 10px 14px;
            font-size: 13px;
            min-height: 44px;
            border-radius: 6px;
          }
          .content-area {
            padding: 12px;
          }
          .content-card {
            padding: 16px;
            border-radius: 8px;
          }
          .card-title {
            font-size: 16px;
          }
          .card-description {
            font-size: 12px;
          }
          .sidebar {
            width: 100%;
            max-width: 300px;
          }
          .sidebar-header {
            padding: 14px 16px;
          }
          .sidebar-logo-img {
            height: 20px;
          }
          .sidebar-logo-subtitle {
            font-size: 10px;
          }
          .nav-item {
            padding: 12px;
            font-size: 14px;
            min-height: 44px;
          }
          .nav-section-header {
            padding: 10px 12px;
            font-size: 10px;
            min-height: 40px;
          }
          .nav-section-items {
            padding-left: 8px;
          }
          .user-avatar {
            width: 34px;
            height: 34px;
            font-size: 12px;
          }
          .user-name {
            font-size: 13px;
          }
          .user-role {
            font-size: 10px;
          }
        }

        /* Small phones (iPhone SE, older devices) */
        @media (max-width: 375px) {
          .topbar {
            padding: 0 8px;
            height: 52px;
          }
          .btn-logout {
            padding: 8px 12px;
            font-size: 12px;
          }
          .content-area {
            padding: 10px;
          }
          .content-card {
            padding: 14px;
          }
          .card-title {
            font-size: 15px;
          }
          .sidebar {
            max-width: 280px;
          }
          .nav-item {
            padding: 10px 12px;
            font-size: 13px;
          }
        }

        /* Landscape orientation on mobile */
        @media (max-height: 500px) and (orientation: landscape) {
          .sidebar {
            width: 240px;
          }
          .topbar {
            height: 48px;
          }
          .content-area {
            padding: 8px 12px;
          }
          .sidebar-header {
            padding: 8px 12px;
          }
          .sidebar-footer {
            padding: 8px 12px;
          }
          .nav-item {
            padding: 8px 12px;
            min-height: 36px;
          }
          .user-card {
            padding: 8px;
          }
        }
      `}</style>

      <div className="app-layout">
        {/* Overlay for mobile */}
        <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={toggleSidebar}></div>

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-header-row">
              {!sidebarCollapsed && (
                <div className="sidebar-logo">
                  <img
                    src={logoToshify}
                    alt="Toshify"
                    className="sidebar-logo-img"
                  />
                </div>
              )}
              <div className="sidebar-header-actions">
                {!sidebarCollapsed && <ThemeToggle />}
                <button 
                  className="sidebar-collapse-btn"
                  onClick={toggleSidebarCollapse}
                  title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                >
                  {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
                </button>
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
                  const MenuIcon = getMenuIcon(menu.menu_name)
                  return (
                    <div key={menu.menu_id} className="nav-section">
                      <div className="nav-section-wrapper">
                        <button
                          className="nav-section-header"
                          onClick={() => !sidebarCollapsed && toggleMenu(menu.menu_name)}
                        >
                          <span className="nav-section-icon"><MenuIcon size={18} /></span>
                          <div className="nav-section-title">
                            {menu.menu_label}
                          </div>
                          <span className={`nav-section-arrow ${isMenuOpen ? 'open' : ''}`}>▸</span>
                        </button>
                      
                        {/* Flyout para estado colapsado */}
                        {sidebarCollapsed && (
                          <div className="nav-flyout">
                            <div className="nav-flyout-content">
                              <div className="nav-flyout-header">{menu.menu_label}</div>
                              <div className="nav-flyout-items">
                                {(submenus as SubmenuWithHierarchy[])
                                  .filter(sub => sub.parent_id === null)
                                  .sort((a, b) => a.order_index - b.order_index)
                                  .map(submenu => {
                                    const SubIcon = getMenuIcon(submenu.submenu_name)
                                    return (
                                      <button
                                        key={submenu.submenu_id}
                                        className={`nav-flyout-item ${isActiveRoute(submenu.submenu_route) ? 'active' : ''}`}
                                        onClick={() => navigate(submenu.submenu_route)}
                                      >
                                        <span className="nav-flyout-icon"><SubIcon size={16} /></span>
                                        <span>{submenu.submenu_label === 'Telepase Histórico' ? 'Telepase' : submenu.submenu_label}</span>
                                      </button>
                                    )
                                  })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`nav-section-items ${!isMenuOpen ? 'collapsed' : ''}`}>
                        {renderSubmenus(submenus as SubmenuWithHierarchy[], null, 0)}
                      </div>
                    </div>
                  )
                } else {
                  // Menú simple sin submenús
                  const MenuIcon = getMenuIcon(menu.menu_name)
                  return (
                    <div key={menu.menu_id} className="nav-item-wrapper">
                      <button
                        className={`nav-item ${isActiveRoute(menu.menu_route) ? 'active' : ''}`}
                        onClick={() => navigate(menu.menu_route)}
                      >
                        <span className="nav-icon"><MenuIcon size={18} /></span>
                        <span className="nav-label">{menu.menu_label}</span>
                      </button>
                      {sidebarCollapsed && (
                        <div className="nav-tooltip">{menu.menu_label}</div>
                      )}
                    </div>
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
            <button
              className="user-card user-card-clickable"
              onClick={() => navigate('/perfil')}
              title="Ver mi perfil"
            >
              <div className="user-avatar">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="user-info">
                <div className="user-name">{profile?.full_name || 'Usuario'}</div>
                <div className="user-role">
                  {profile?.roles?.name || 'Sin rol'}
                </div>
              </div>
            </button>
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
                  <LazyPage>
                    <ConductoresPage />
                  </LazyPage>
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
                  <LazyPage>
                    <MovimientosPage />
                  </LazyPage>
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
              <Route path="/inventario/pedidos" element={
                <ProtectedRoute submenuName="inventario-pedidos" action="view">
                  <PedidosPage />
                </ProtectedRoute>
              } />

              <Route path="/siniestros" element={
                <ProtectedRoute menuName="siniestros" action="view">
                  <SiniestrosPage />
                </ProtectedRoute>
              } />
              <Route path="/incidencias" element={
                <ProtectedRoute menuName="incidencias" action="view">
                  <LazyPage>
                    <IncidenciasPage />
                  </LazyPage>
                </ProtectedRoute>
              } />
              <Route path="/informes" element={
                <ProtectedRoute menuName="informes" action="view">
                  <InformesPage />
                </ProtectedRoute>
              } />
              <Route path="/programacion" element={
                <ProtectedRoute submenuName="programacion" action="view">
                  <LazyPage>
                    <AsignacionesPage />
                  </LazyPage>
                </ProtectedRoute>
              } />
              <Route path="/estado-de-flota" element={<AsignacionesActivasPage />} />
              <Route path="/asignaciones" element={
                <ProtectedRoute submenuName="asignaciones" action="view">
                  <LazyPage>
                    <AsignacionesPage />
                  </LazyPage>
                </ProtectedRoute>
              } />
              {/* Onboarding - Programacion de Entregas */}
              <Route path="/onboarding/programacion" element={
                <ProtectedRoute submenuName="programacion-entregas" action="view">
                  <LazyPage>
                    <ProgramacionPage />
                  </LazyPage>
                </ProtectedRoute>
              } />

              {/* Integraciones */}
              <Route path="/uss" element={
                <ProtectedRoute submenuName="ctrl-exceso-vel" action="view">
                  <USSPage />
                </ProtectedRoute>
              } />
              <Route path="/uss/bitacora" element={
                <ProtectedRoute submenuName="bitacora-uss" action="view">
                  <BitacoraPage />
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

              {/* Facturación */}
              <Route path="/facturacion" element={
                <ProtectedRoute submenuName="facturacion" action="view">
                  <LazyPage>
                    <FacturacionPage />
                  </LazyPage>
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
              <Route path="/auditoria" element={
                <ProtectedRoute submenuName="auditoria" action="view">
                  <AuditoriaPage />
                </ProtectedRoute>
              } />

              {/* Multas/Telepase */}
              <Route path="/telepase-historico" element={
                <ProtectedRoute submenuName="telepase-historico" action="view">
                  <TelepaseHistoricoPage />
                </ProtectedRoute>
              } />
              <Route path="/multas" element={
                <ProtectedRoute submenuName="multas" action="view">
                  <MultasPage />
                </ProtectedRoute>
              } />

              {/* Perfil de usuario */}
              <Route path="/perfil" element={<ProfilePage />} />

              {/* Ruta por defecto - redirige a Estado de Flota */}
              <Route path="/" element={<Navigate to="/estado-de-flota" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </>
  )
}
