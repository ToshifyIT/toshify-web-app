// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { AdminPage } from './pages/AdminPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import PermissionsDebugPage from './pages/PermissionsDebugPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
    </BrowserRouter>
  )
}

export default App