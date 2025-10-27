// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/admin" replace />} />
          </Routes>
        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App