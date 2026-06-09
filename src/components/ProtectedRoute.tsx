// src/components/ProtectedRoute.tsx
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { Spinner } from './ui/LoadingOverlay'

// Salvavidas final: si el arranque (auth + permisos) no resolvió en este
// tiempo, cortar el spinner y ofrecer reintento. Debe ser MAYOR que el timeout
// de fetch de Supabase (20s) para no interferir con el flujo normal de error:
// con red sana el arranque resuelve en <1s y este watchdog nunca dispara.
const STARTUP_WATCHDOG_MS = 25000

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
  const [watchdogTripped, setWatchdogTripped] = useState(false)

  useEffect(() => {
    if (!loading) {
      setWatchdogTripped(false)
      return
    }
    const timer = setTimeout(() => setWatchdogTripped(true), STARTUP_WATCHDOG_MS)
    return () => clearTimeout(timer)
  }, [loading])

  // Conexión lenta/cortada (típico con antivirus que escanea HTTPS): no culpar
  // al AV, solo ofrecer reintento para que el usuario nunca quede con spinner eterno.
  if (loading && watchdogTripped) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg-primary, #f9fafb)',
      }}>
        <p style={{ maxWidth: 420, color: 'var(--text-secondary, #4b5563)', lineHeight: 1.5 }}>
          La conexión está tardando más de lo normal. Revisá tu internet e intentá de nuevo.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            background: 'var(--color-primary, #ff0033)',
            color: '#fff',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

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