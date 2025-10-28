// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { AdminPage } from './pages/AdminPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

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