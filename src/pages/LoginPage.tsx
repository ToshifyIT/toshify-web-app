// src/pages/LoginPage.tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import logoToshify from '../assets/logo-toshify.png'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signInWithGoogle } = useAuth()
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
        navigate('/estado-de-flota')
      }
    } catch {
      setError('Error al iniciar sesión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      setError('Error al iniciar sesión con Google. Intentá de nuevo.')
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault()

    const { value: forgotEmail } = await Swal.fire({
      title: 'Recuperar contraseña',
      input: 'email',
      inputLabel: 'Ingresá tu correo electrónico',
      inputPlaceholder: 'tu@toshify.com.ar',
      inputValue: email, // Pre-fill with email if already entered
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      inputValidator: (value) => {
        if (!value) {
          return 'Debés ingresar un correo electrónico'
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Ingresá un correo electrónico válido'
        }
        return null
      }
    })

    if (forgotEmail) {
      try {
        // Verificar si el email existe en auth.users
        const { data: emailExists } = await (supabase.rpc as any)('check_email_exists', {
          email_to_check: forgotEmail
        })

        if (!emailExists) {
          await Swal.fire({
            icon: 'warning',
            title: 'Email no registrado',
            text: 'No existe una cuenta con este correo electrónico.',
            confirmButtonColor: '#FF0033'
          })
          return
        }

        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
          redirectTo: `${window.location.origin}/reset-password`
        })

        if (error) {
          await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message,
            confirmButtonColor: '#FF0033'
          })
        } else {
          await Swal.fire({
            icon: 'success',
            title: 'Correo enviado',
            text: 'Revisá tu bandeja de entrada. Te enviamos un enlace para restablecer tu contraseña.',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#FF0033'
          })
        }
      } catch {
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo enviar el correo. Intentá de nuevo.',
          confirmButtonColor: '#FF0033'
        })
      }
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .login-page {
          --white: #FFFFFF;
          --gray-50: #F9FAFB;
          --gray-100: #F3F4F6;
          --gray-200: #E5E7EB;
          --gray-300: #D1D5DB;
          --gray-400: #9CA3AF;
          --gray-500: #6B7280;
          --gray-600: #4B5563;
          --gray-700: #374151;
          --gray-900: #111827;
          --red: #FF0033;
          --red-hover: #E6002E;
          --red-active: #CC0029;
          --red-light: rgba(255, 0, 51, 0.06);
          --red-focus: rgba(255, 0, 51, 0.12);

          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background-color: var(--gray-50);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .login-card {
          width: 100%;
          max-width: 380px;
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 16px;
          padding: 40px 36px;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.04),
            0 4px 12px rgba(0, 0, 0, 0.03);
        }

        .logo {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .logo img {
          height: 180px;
          width: auto;
          object-fit: contain;
          margin: -50px 0;
        }

        .form-header {
          text-align: center;
          margin-bottom: 28px;
        }

        .form-title {
          font-size: 22px;
          font-weight: 600;
          color: var(--gray-900);
          letter-spacing: -0.3px;
          margin-bottom: 6px;
        }

        .form-subtitle {
          font-size: 14px;
          color: var(--gray-500);
          line-height: 1.5;
        }

        .form-group {
          margin-bottom: 18px;
        }

        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--gray-700);
          margin-bottom: 6px;
        }

        .input-wrapper {
          position: relative;
        }

        .form-input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          font-size: 14px;
          font-family: inherit;
          background: var(--white);
          border: 1px solid var(--gray-300);
          border-radius: 10px;
          color: var(--gray-900);
          transition: all 0.15s ease;
        }

        .form-input::placeholder {
          color: var(--gray-400);
        }

        .form-input:hover:not(:focus) {
          border-color: var(--gray-400);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--red);
          box-shadow: 0 0 0 3px var(--red-light);
        }

        .form-input.has-toggle {
          padding-right: 44px;
        }

        .password-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          background: none;
          border: none;
          border-radius: 8px;
          color: var(--gray-400);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .password-toggle:hover {
          color: var(--gray-600);
          background: var(--gray-100);
        }

        .password-toggle svg {
          width: 18px;
          height: 18px;
        }

        .form-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 20px 0 24px;
        }

        .remember-group {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .remember-group input {
          width: 16px;
          height: 16px;
          accent-color: var(--red);
          cursor: pointer;
          border-radius: 4px;
        }

        .remember-group span {
          font-size: 13px;
          color: var(--gray-600);
          user-select: none;
        }

        .forgot-link {
          font-size: 13px;
          color: var(--red);
          text-decoration: none;
          font-weight: 500;
          transition: opacity 0.15s ease;
        }

        .forgot-link:hover {
          opacity: 0.8;
        }

        .error-message {
          background: var(--red-light);
          border: 1px solid rgba(255, 0, 51, 0.2);
          color: var(--red);
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 18px;
        }

        .btn-primary {
          width: 100%;
          height: 44px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          background: var(--red);
          color: var(--white);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.15s ease;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--red-hover);
        }

        .btn-primary:active:not(:disabled) {
          background: var(--red-active);
          transform: scale(0.98);
        }

        .btn-primary:disabled {
          opacity: 0.85;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: var(--white);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .divider {
          display: flex;
          align-items: center;
          margin: 24px 0;
          gap: 12px;
        }

        .divider-line {
          flex: 1;
          height: 1px;
          background: var(--gray-200);
        }

        .divider-text {
          font-size: 12px;
          color: var(--gray-400);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 500;
        }

        .btn-google {
          width: 100%;
          height: 44px;
          font-size: 14px;
          font-weight: 500;
          font-family: inherit;
          background: var(--white);
          color: var(--gray-700);
          border: 1px solid var(--gray-300);
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.15s ease;
        }

        .btn-google:hover {
          background: var(--gray-50);
          border-color: var(--gray-400);
        }

        .btn-google:active {
          background: var(--gray-100);
        }

        .btn-google svg {
          width: 18px;
          height: 18px;
        }

        .form-footer {
          margin-top: 28px;
          text-align: center;
        }

        .form-footer p {
          font-size: 13px;
          color: var(--gray-500);
          margin: 0;
        }

        .form-footer a {
          color: var(--gray-700);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.15s ease;
        }

        .form-footer a:hover {
          color: var(--gray-900);
        }

        @media (max-width: 420px) {
          .login-page {
            padding: 16px;
          }

          .login-card {
            padding: 32px 24px;
            border-radius: 12px;
          }

          .logo img {
            height: 60px;
          }

          .form-title {
            font-size: 20px;
          }

          .form-options {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
        }

        /* Dark Mode Support */
        [data-theme="dark"] .login-page {
          background-color: #0F172A;
        }

        [data-theme="dark"] .login-card {
          background: #1E293B;
          border-color: #334155;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        [data-theme="dark"] .form-title {
          color: #F1F5F9;
        }

        [data-theme="dark"] .form-subtitle {
          color: #94A3B8;
        }

        [data-theme="dark"] .form-label {
          color: #E2E8F0;
        }

        [data-theme="dark"] .form-input {
          background: #0F172A;
          border-color: #475569;
          color: #F1F5F9;
        }

        [data-theme="dark"] .form-input::placeholder {
          color: #64748B;
        }

        [data-theme="dark"] .form-input:hover:not(:focus) {
          border-color: #64748B;
        }

        [data-theme="dark"] .form-input:focus {
          border-color: var(--red);
          box-shadow: 0 0 0 3px rgba(255, 0, 51, 0.15);
        }

        [data-theme="dark"] .password-toggle {
          color: #64748B;
        }

        [data-theme="dark"] .password-toggle:hover {
          color: #94A3B8;
          background: #334155;
        }

        [data-theme="dark"] .remember-group span {
          color: #94A3B8;
        }

        [data-theme="dark"] .divider-line {
          background: #334155;
        }

        [data-theme="dark"] .divider-text {
          color: #64748B;
        }

        [data-theme="dark"] .btn-google {
          background: #0F172A;
          color: #E2E8F0;
          border-color: #475569;
        }

        [data-theme="dark"] .btn-google:hover {
          background: #1E293B;
          border-color: #64748B;
        }

        [data-theme="dark"] .btn-google:active {
          background: #334155;
        }

        [data-theme="dark"] .form-footer p {
          color: #64748B;
        }

        [data-theme="dark"] .form-footer a {
          color: #94A3B8;
        }

        [data-theme="dark"] .form-footer a:hover {
          color: #F1F5F9;
        }

        [data-theme="dark"] .error-message {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: #FCA5A5;
        }
      `}</style>

      <div className="login-page">
        <div className="login-card">
          <div className="logo">
            <img src={logoToshify} alt="Toshify" />
          </div>

          <div className="form-header">
            <h1 className="form-title">Bienvenido</h1>
            <p className="form-subtitle">Ingresá a tu cuenta para continuar</p>
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
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-options" style={{ justifyContent: 'flex-end' }}>
              <a href="#" className="forgot-link" onClick={handleForgotPassword}>¿Olvidaste tu contraseña?</a>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? <span className="spinner"></span> : 'Ingresar'}
            </button>
          </form>

          <div className="divider">
            <div className="divider-line"></div>
            <span className="divider-text">o</span>
            <div className="divider-line"></div>
          </div>

          <button type="button" className="btn-google" onClick={handleGoogleLogin}>
            <svg viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="form-footer">
            <p>¿Necesitás ayuda? <a href="mailto:soporte@toshify.com.ar">Contactar soporte</a></p>
          </div>
        </div>
      </div>
    </>
  )
}
