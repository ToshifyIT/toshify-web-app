// src/App.tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { SedeProvider } from './contexts/SedeContext'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { HomePage } from './pages/HomePage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import PermissionsDebugPage from './pages/PermissionsDebugPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PortalPage } from './modules/portal/PortalPage'
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal'
import { useDeviceType } from './hooks/useDeviceType'

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

// Componente que muestra modal de cambio de contraseña si es requerido
function ForcePasswordChangeWrapper({ children }: { children: React.ReactNode }) {
  const { mustChangePassword, user, loading, refreshProfile } = useAuth()

  // Si está cargando o no hay usuario, mostrar children normalmente
  if (loading || !user) {
    return <>{children}</>
  }

  // Si debe cambiar contraseña, mostrar modal bloqueante
  if (mustChangePassword) {
    return (
      <>
        {children}
        <ForcePasswordChangeModal onSuccess={() => refreshProfile()} />
      </>
    )
  }

  return <>{children}</>
}

// Componente que inicializa la detección de dispositivo y agrega clases al body
function DeviceTypeInitializer({ children }: { children: React.ReactNode }) {
  // El hook agrega automáticamente clases al body:
  // device-mobile, device-tablet, device-desktop, device-touch, device-ios, device-android
  useDeviceType();
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <DeviceTypeInitializer>
        <Routes>
          {/* Portal público - fuera de auth providers */}
          <Route path="/mi-facturacion" element={<PortalPage />} />

          {/* App principal - con auth */}
          <Route path="/*" element={
            <RecoveryRedirect>
              <AuthProvider>
                <ForcePasswordChangeWrapper>
                  <PermissionsProvider>
                  <SedeProvider>
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
                  </SedeProvider>
                </PermissionsProvider>
              </ForcePasswordChangeWrapper>
            </AuthProvider>
          </RecoveryRedirect>
          } />
        </Routes>
      </DeviceTypeInitializer>
    </BrowserRouter>
  )
}

export default App