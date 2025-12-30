// src/pages/LoginPage.tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import logoWhite from '../assets/logo-toshify-white.svg'
import logoRed from '../assets/logo-toshify-red.svg'

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
          background: linear-gradient(160deg, #1a1a1a 0%, #0d0d0d 100%);
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
          margin-bottom: 32px;
        }

        .brand-logo img {
          height: 40px;
          width: auto;
        }

        .brand-title {
          font-size: 48px;
          font-weight: 700;
          margin: 0 0 16px 0;
          line-height: 1.2;
        }

        .brand-subtitle {
          font-size: 18px;
          opacity: 0.8;
          line-height: 1.6;
          margin: 0;
        }

        .login-form-container {
          width: 100%;
          max-width: 440px;
        }

        .form-header {
          margin-bottom: 40px;
        }

        .form-logo-mobile {
          display: none;
          margin-bottom: 24px;
        }

        .form-logo-mobile img {
          height: 32px;
          width: auto;
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
          border-color: #FF0033;
          background: white;
          box-shadow: 0 0 0 4px rgba(255, 0, 51, 0.08);
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
          background: #FF0033;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(255, 0, 51, 0.25);
        }

        .submit-button:hover:not(:disabled) {
          background: #E6002E;
          box-shadow: 0 4px 12px rgba(255, 0, 51, 0.35);
        }

        .submit-button:active:not(:disabled) {
          background: #CC0029;
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
          color: #FF0033;
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

          .form-logo-mobile {
            display: block;
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
              <img src={logoWhite} alt="Toshify" />
            </div>
            <h1 className="brand-title">Bienvenido a Toshify</h1>
            <p className="brand-subtitle">
              Sistema integral de gestión de flotas vehiculares con control total de tu operación
            </p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-container">
            <div className="form-header">
              <div className="form-logo-mobile">
                <img src={logoRed} alt="Toshify" />
              </div>
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