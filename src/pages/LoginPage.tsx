// src/pages/LoginPage.tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error.message)
      } else {
        navigate('/admin')
      }
    } catch (err) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#f8f9fa'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            background: '#E63946',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'white',
            fontSize: '24px',
            fontWeight: 'bold'
          }}>
            T
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
            Toshify
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px' }}>
            Sistema de Gestión de Flota
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontWeight: '600', 
              marginBottom: '8px',
              fontSize: '14px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@toshify.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ 
              display: 'block', 
              fontWeight: '600', 
              marginBottom: '8px',
              fontSize: '14px'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: '#FEE2E2',
              color: '#DC2626',
              borderRadius: '6px',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#9CA3AF' : '#E63946',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

      </div>
    </div>
  )
}