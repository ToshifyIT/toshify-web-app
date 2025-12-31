// src/pages/LoginPage.tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Swal from 'sweetalert2'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
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
        if (error.message.includes('Invalid login')) {
          setError('Credenciales incorrectas. Verificá tu email y contraseña.')
        } else {
          setError(error.message)
        }
      } else {
        navigate('/admin')
      }
    } catch {
      setError('Error al iniciar sesión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    // Mostrar mensaje de próximamente disponible
    setError('')
    await Swal.fire({
      icon: 'info',
      title: 'Próximamente',
      text: 'El inicio de sesión con Google estará disponible pronto.',
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#DC2626'
    })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #F3F4F6;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: white;
          border-radius: 16px;
          padding: 48px 40px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .login-logo {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-logo-text {
          font-size: 28px;
          font-weight: 700;
          color: #1F2937;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-title {
          font-size: 24px;
          font-weight: 600;
          color: #1F2937;
          margin: 0 0 8px 0;
        }

        .login-subtitle {
          font-size: 15px;
          color: #6B7280;
          margin: 0;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 8px;
        }

        .input-wrapper {
          position: relative;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          font-size: 15px;
          font-family: inherit;
          color: #1F2937;
          background: white;
          transition: all 0.15s;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: #DC2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
        }

        .form-input::placeholder {
          color: #9CA3AF;
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: #9CA3AF;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .password-toggle:hover {
          color: #6B7280;
        }

        .form-input.has-toggle {
          padding-right: 44px;
        }

        .form-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .remember-me {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .remember-me input {
          width: 16px;
          height: 16px;
          accent-color: #DC2626;
          cursor: pointer;
        }

        .remember-me span {
          font-size: 14px;
          color: #374151;
        }

        .forgot-link {
          font-size: 14px;
          color: #DC2626;
          text-decoration: none;
          font-weight: 500;
        }

        .forgot-link:hover {
          text-decoration: underline;
        }

        .error-message {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          color: #DC2626;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          background: #DC2626;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          font-family: inherit;
        }

        .submit-btn:hover:not(:disabled) {
          background: #B91C1C;
        }

        .submit-btn:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }

        .divider {
          display: flex;
          align-items: center;
          margin: 24px 0;
          gap: 16px;
        }

        .divider-line {
          flex: 1;
          height: 1px;
          background: #E5E7EB;
        }

        .divider-text {
          font-size: 14px;
          color: #9CA3AF;
        }

        .google-btn {
          width: 100%;
          padding: 12px;
          background: white;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.15s;
          font-family: inherit;
        }

        .google-btn:hover {
          background: #F9FAFB;
          border-color: #9CA3AF;
        }

        .google-icon {
          width: 20px;
          height: 20px;
        }

        .login-footer {
          margin-top: 24px;
          text-align: center;
        }

        .footer-text {
          font-size: 14px;
          color: #6B7280;
          margin: 0;
        }

        .footer-link {
          color: #1F2937;
          text-decoration: none;
          font-weight: 600;
        }

        .footer-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 32px 24px;
          }

          .login-logo-text {
            font-size: 24px;
          }

          .login-title {
            font-size: 20px;
          }

          .form-options {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
        }
      `}</style>

      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <h1 className="login-logo-text">toshify</h1>
          </div>

          <div className="login-header">
            <h2 className="login-title">Iniciar sesión</h2>
            <p className="login-subtitle">Accedé a tu cuenta para continuar</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@toshify.com.ar"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Recordarme</span>
              </label>
              <a href="#" className="forgot-link">¿Olvidaste tu contraseña?</a>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div className="divider">
            <div className="divider-line"></div>
            <span className="divider-text">o</span>
            <div className="divider-line"></div>
          </div>

          <button type="button" className="google-btn" onClick={handleGoogleLogin}>
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="login-footer">
            <p className="footer-text">
              ¿Necesitás ayuda? <a href="mailto:soporte@toshify.com.ar" className="footer-link">Contactar soporte</a>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
