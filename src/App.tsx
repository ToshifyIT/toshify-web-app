// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { UserDashboard } from './pages/UserDashboard'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleBasedRedirect } from './components/RoleBasedRedirect'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Admin panel - solo para admins */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Dashboard de usuario normal - con subrutas */}
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <UserDashboard />
                </ProtectedRoute>
              }
            />

            {/* Ruta raíz - redirige según el rol */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleBasedRedirect />
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