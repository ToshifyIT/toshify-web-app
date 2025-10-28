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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .login-container {
          min-height: 100vh;
          display: flex;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #333333 0%, #1a1a1a 100%);
          position: relative;
          overflow: hidden;
        }

        .login-container::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: moveBackground 20s linear infinite;
        }

        @keyframes moveBackground {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }

        .login-left {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px;
          position: relative;
          z-index: 1;
        }

        .login-right {
          flex: 1;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px;
          box-shadow: -10px 0 50px rgba(0,0,0,0.1);
          position: relative;
          z-index: 2;
        }

        .brand-content {
          max-width: 500px;
          color: white;
        }

        .brand-logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 32px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }

        .brand-logo-text {
          font-size: 36px;
          font-weight: 700;
          background: linear-gradient(135deg, #333333 0%, #1a1a1a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .brand-title {
          font-size: 48px;
          font-weight: 700;
          margin: 0 0 16px 0;
          line-height: 1.2;
        }

        .brand-subtitle {
          font-size: 20px;
          opacity: 0.9;
          line-height: 1.6;
          margin: 0 0 32px 0;
        }

        .brand-features {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .brand-features li {
          padding: 12px 0;
          display: flex;
          align-items: center;
          font-size: 16px;
          opacity: 0.9;
        }

        .brand-features li::before {
          content: '✓';
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          margin-right: 12px;
          font-weight: bold;
        }

        .login-form-container {
          width: 100%;
          max-width: 440px;
        }

        .form-header {
          margin-bottom: 40px;
        }

        .form-title {
          font-size: 32px;
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 8px 0;
        }

        .form-subtitle {
          font-size: 16px;
          color: #6B7280;
          margin: 0;
        }

        .input-group {
          margin-bottom: 24px;
        }

        .input-label {
          display: block;
          font-weight: 600;
          font-size: 14px;
          color: #374151;
          margin-bottom: 8px;
        }

        .input-field {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #E5E7EB;
          border-radius: 10px;
          font-size: 15px;
          font-family: inherit;
          transition: all 0.2s;
          background: white;
          color: #1F2937;
        }

        .input-field:focus {
          outline: none;
          border-color: #333333;
          background: white;
          box-shadow: 0 0 0 4px rgba(51, 51, 51, 0.1);
        }

        .input-field::placeholder {
          color: #9CA3AF;
        }

        .error-message {
          padding: 14px 16px;
          background: #FEE2E2;
          color: #DC2626;
          border-radius: 10px;
          font-size: 14px;
          margin-bottom: 24px;
          border-left: 4px solid #DC2626;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .error-message::before {
          content: '⚠';
          font-size: 18px;
        }

        .submit-button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #333333 0%, #1a1a1a 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(51, 51, 51, 0.4);
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(51, 51, 51, 0.5);
        }

        .submit-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-button:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
          box-shadow: none;
        }

        .login-footer {
          margin-top: 32px;
          text-align: center;
          padding-top: 24px;
          border-top: 1px solid #E5E7EB;
        }

        .footer-text {
          color: #6B7280;
          font-size: 14px;
          margin: 0;
        }

        .footer-link {
          color: #333333;
          text-decoration: none;
          font-weight: 600;
        }

        .footer-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 1024px) {
          .login-left {
            display: none;
          }

          .login-right {
            flex: 1;
            padding: 40px 20px;
          }
        }

        @media (max-width: 640px) {
          .login-right {
            padding: 30px 20px;
          }

          .form-title {
            font-size: 28px;
          }

          .input-field {
            padding: 12px 14px;
          }
        }
      `}</style>

      <div className="login-container">
        <div className="login-left">
          <div className="brand-content">
            <div className="brand-logo">
              <span className="brand-logo-text">T</span>
            </div>
            <h1 className="brand-title">Bienvenido a Toshify</h1>
            <p className="brand-subtitle">
              Sistema integral de gestión de flotas vehiculares con control total de tu operación
            </p>
            <ul className="brand-features">
              <li>Gestión completa de vehículos y conductores</li>
              <li>Control de siniestros e incidencias</li>
              <li>Reportes y análisis en tiempo real</li>
              <li>Integraciones con USS y Cabify</li>
            </ul>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-container">
            <div className="form-header">
              <h2 className="form-title">Iniciar Sesión</h2>
              <p className="form-subtitle">Ingresa tus credenciales para acceder</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Correo Electrónico</label>
                <input
                  type="email"
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@toshify.com.ar"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Contraseña</label>
                <input
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="submit-button"
                disabled={loading}
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </form>

            <div className="login-footer">
              <p className="footer-text">
                Sistema protegido con Row Level Security
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}