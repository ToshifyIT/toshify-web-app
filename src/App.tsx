// src/App.tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { HomePage } from './pages/HomePage'
import { AdminPage } from './pages/AdminPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import PermissionsDebugPage from './pages/PermissionsDebugPage'
import { ProtectedRoute } from './components/ProtectedRoute'

// Componente para detectar flujo de recovery y redirigir
function RecoveryRedirect({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Detectar si Supabase redirigió con type=recovery en el hash
    const hash = window.location.hash
    if (hash && hash.includes('type=recovery') && location.pathname === '/') {
      // Redirigir a /reset-password manteniendo el hash
      navigate('/reset-password' + hash, { replace: true })
    }
  }, [navigate, location.pathname])

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <RecoveryRedirect>
        <AuthProvider>
          <PermissionsProvider>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Debug de permisos (solo desarrollo) */}
            <Route
              path="/debug/permisos"
              element={
                <ProtectedRoute>
                  <PermissionsDebugPage />
                </ProtectedRoute>
              }
            />

            {/* Admin panel - mantener por compatibilidad (deprecado) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* HomePage como layout principal para todos los usuarios autenticados */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </PermissionsProvider>
        </AuthProvider>
      </RecoveryRedirect>
    </BrowserRouter>
  )
}

export default App
