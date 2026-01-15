// src/pages/ResetPasswordPage.tsx
import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, clearAllAuthStorage } from '../lib/supabase'
import Swal from 'sweetalert2'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Verificar si hay una sesión válida de recuperación
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      // Si hay sesión, el usuario puede cambiar su contraseña
      if (session) {
        setIsValidSession(true)
      } else {
        setIsValidSession(false)
      }
      setCheckingSession(false)
    }

    // Escuchar el evento PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true)
        setCheckingSession(false)
      } else if (session) {
        setIsValidSession(true)
        setCheckingSession(false)
      }
    })

    checkSession()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Validaciones
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        setError(error.message)
      } else {
        await Swal.fire({
          icon: 'success',
          title: 'Contraseña actualizada',
          text: 'Tu contraseña ha sido actualizada correctamente. Ahora podés iniciar sesión.',
          confirmButtonText: 'Ir al login',
          confirmButtonColor: '#FF0033'
        })

        // Cerrar sesión de forma intencional y redirigir al login
        // Nota: Usamos signOut directo pero limpiamos storage para evitar recuperación
        await supabase.auth.signOut()
        clearAllAuthStorage()
        navigate('/login')
      }
    } catch {
      setError('Error al actualizar la contraseña. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <>
        <style>{pageStyles}</style>
        <div className="reset-page">
          <div className="reset-card">
            <div className="logo">
              <Logo />
            </div>
            <div className="form-header">
              <h1 className="form-title">Verificando...</h1>
              <p className="form-subtitle">Estamos validando tu enlace de recuperación</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <span className="spinner"></span>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!isValidSession) {
    return (
      <>
        <style>{pageStyles}</style>
        <div className="reset-page">
          <div className="reset-card">
            <div className="logo">
              <Logo />
            </div>
            <div className="form-header">
              <h1 className="form-title">Enlace inválido</h1>
              <p className="form-subtitle">El enlace de recuperación ha expirado o es inválido. Por favor, solicitá uno nuevo.</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/login')}
            >
              Volver al login
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{pageStyles}</style>
      <div className="reset-page">
        <div className="reset-card">
          <div className="logo">
            <Logo />
          </div>

          <div className="form-header">
            <h1 className="form-title">Nueva contraseña</h1>
            <p className="form-subtitle">Ingresá tu nueva contraseña</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar contraseña</label>
              <div className="input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="form-input has-toggle"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? <span className="spinner"></span> : 'Actualizar contraseña'}
            </button>
          </form>

          <div className="form-footer">
            <p><a href="/login">Volver al login</a></p>
          </div>
        </div>
      </div>
    </>
  )
}

// Logo SVG component
function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 68" fill="none">
      <path d="M20.5636 39.5292V48.9441H15.8487C7.86039 48.9441 3.86619 44.9429 3.86619 36.9404V26.5443H0V17.3541H3.84596V9.64905H14.8182V17.32H20.5029V26.5443H14.8182V37.1379C14.7862 37.473 14.8216 37.8111 14.9223 38.1319C15.0231 38.4527 15.187 38.7496 15.4042 39.0046C15.9722 39.4342 16.6786 39.6334 17.3844 39.5632L20.5636 39.5292Z" fill="#FF0033"/>
      <path d="M32.856 47.3704C30.4217 46.0908 28.4001 44.1336 27.0297 41.7297C25.5731 39.0985 24.8426 36.1196 24.9148 33.1049C24.8455 30.1035 25.5885 27.14 27.0635 24.5347C28.4489 22.1356 30.4753 20.1805 32.9099 18.8938C35.5209 17.5983 38.3906 16.9247 41.2989 16.9247C44.2073 16.9247 47.077 17.5983 49.6881 18.8938C52.126 20.1782 54.1551 22.1338 55.5412 24.5347C56.9514 27.171 57.6898 30.1211 57.6898 33.1185C57.6898 36.1159 56.9514 39.0661 55.5412 41.7024C54.1574 44.1216 52.1168 46.0887 49.6611 47.3704C47.0408 48.6712 44.1606 49.3477 41.2417 49.3477C38.3228 49.3477 35.4426 48.6712 32.8223 47.3704M45.0338 38.0372C46.0509 36.8927 46.5628 35.244 46.5628 33.1049C46.5628 30.9657 46.0509 29.3239 45.0338 28.1998C44.5652 27.6585 43.9857 27.2269 43.3355 26.9351C42.6852 26.6433 41.9799 26.4984 41.2687 26.5103C40.5611 26.4968 39.8593 26.6412 39.2132 26.9332C38.567 27.2252 37.9925 27.6577 37.5304 28.1998C36.5336 29.3239 36.0284 30.9249 36.0284 33.1049C36.0284 35.2849 36.5134 36.9404 37.4766 38.0645C37.9334 38.6135 38.5067 39.0511 39.154 39.3448C39.8012 39.6385 40.5056 39.7807 41.2147 39.7608C41.9372 39.7732 42.6535 39.6253 43.3133 39.3275C43.9732 39.0297 44.5604 38.5893 45.0338 38.0372Z" fill="#FF0033"/>
      <path d="M69.0324 47.9018C66.9777 47.0676 65.1721 45.7086 63.7922 43.9574C62.5271 42.3305 61.7781 40.3546 61.6436 38.2893H72.2385C72.2946 38.7609 72.4477 39.2156 72.6878 39.6238C72.9279 40.0321 73.2498 40.3851 73.6328 40.66C74.4847 41.2461 75.4994 41.542 76.5291 41.5048C77.2771 41.5431 78.0185 41.3455 78.6508 40.9394C78.8914 40.781 79.0886 40.5637 79.224 40.3076C79.3594 40.0515 79.4287 39.765 79.4254 39.4747C79.422 39.0836 79.2964 38.7036 79.0666 38.3891C78.8367 38.0746 78.5143 37.8417 78.1456 37.7239C76.769 37.1949 75.3521 36.7802 73.9089 36.4839C72.0151 36.1286 70.1524 35.6205 68.3386 34.9647C66.8348 34.3897 65.4999 33.4381 64.459 32.1988C63.3017 30.7327 62.717 28.8878 62.8155 27.0144C62.7984 25.1986 63.3243 23.4199 64.3243 21.9118C65.4348 20.3025 66.9707 19.0418 68.7562 18.2738C70.9811 17.3144 73.3838 16.8497 75.8017 16.9113C79.8924 16.9113 83.1074 17.9264 85.4469 19.9565C87.779 21.9862 89.2301 24.8606 89.4882 27.9613H79.6207C79.492 27.0417 79.0255 26.205 78.314 25.6179C77.5115 25.037 76.5379 24.7487 75.5524 24.8003C74.8429 24.7559 74.1372 24.9343 73.5318 25.3112C73.3123 25.4709 73.1356 25.6836 73.018 25.9299C72.9004 26.1761 72.8455 26.4483 72.8582 26.7215C72.8705 27.1062 73 27.4776 73.2291 27.785C73.4582 28.0923 73.7756 28.3205 74.1379 28.4383C75.4718 28.9777 76.8547 29.3838 78.2668 29.6509C80.1928 30.0427 82.0848 30.5894 83.9247 31.2859C85.4575 31.9116 86.8151 32.9081 87.8784 34.1881C89.0835 35.7344 89.6894 37.6722 89.5825 39.6381C89.5996 41.4221 89.0416 43.1632 87.993 44.5977C86.8249 46.1464 85.2627 47.3449 83.4734 48.0653C81.2876 48.9556 78.9455 49.3867 76.5897 49.3325C74.0022 49.3795 71.4326 48.8903 69.0392 47.895" fill="#FF0033"/>
      <path d="M125.106 20.6719C127.207 23.0972 128.258 26.3762 128.258 30.5092V48.9441H117.333V31.9944C117.42 30.4495 116.922 28.9291 115.939 27.7433C115.465 27.2252 114.885 26.8179 114.239 26.5496C113.593 26.2814 112.898 26.1587 112.2 26.1901C111.486 26.1518 110.773 26.271 110.109 26.5392C109.445 26.8074 108.846 27.2182 108.354 27.7433C107.374 28.9301 106.878 30.4504 106.967 31.9944V48.9646H96.0352V7.24426H106.967V21.8504C107.972 20.3837 109.321 19.1923 110.894 18.3828C112.657 17.4579 114.619 16.9898 116.605 17.0203C120.198 17.0203 123.031 18.2329 125.106 20.6582" fill="#FF0033"/>
      <path d="M136.253 12.7761C135.689 12.2747 135.24 11.6545 134.937 10.959C134.634 10.2635 134.486 9.50951 134.502 8.74985C134.487 7.98144 134.636 7.21883 134.939 6.51364C135.241 5.80845 135.689 5.17713 136.253 4.66229C137.538 3.53013 139.205 2.94426 140.907 3.02725C142.592 2.94995 144.241 3.536 145.508 4.66229C146.074 5.17565 146.525 5.80655 146.828 6.51197C147.131 7.2174 147.281 7.98073 147.266 8.74985C147.282 9.51024 147.133 10.265 146.83 10.9607C146.526 11.6564 146.075 12.2762 145.508 12.7761C144.235 13.8882 142.588 14.4637 140.907 14.3839C139.21 14.4694 137.544 13.8941 136.253 12.7761ZM146.316 48.9442H135.384V17.3201H146.309L146.316 48.9442Z" fill="#FF0033"/>
      <path d="M170.564 26.5443H165.694V48.9783H154.709V26.5443H143.851V17.3542H154.709V17.0067C154.709 12.9509 155.889 9.84217 158.251 7.6803C160.613 5.51844 164.004 4.4375 168.422 4.4375C169.318 4.4375 170.005 4.43747 170.483 4.49197V13.9069C170.076 13.8665 169.667 13.8483 169.257 13.8525C168.312 13.7717 167.373 14.0647 166.637 14.67C166.013 15.3962 165.677 16.3307 165.694 17.2929H170.598L170.564 26.5443Z" fill="#FF0033"/>
      <path d="M209.246 17.3201L189.403 64H177.528L184.998 47.5953L172.18 17.3201H184.331L190.912 35.2508L197.264 17.3201H209.246Z" fill="#FF0033"/>
    </svg>
  )
}

// Eye icons
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// Styles
const pageStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .reset-page {
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

  .reset-card {
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
    margin-bottom: 32px;
  }

  .logo svg {
    height: 28px;
    width: auto;
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
    .reset-page {
      padding: 16px;
    }

    .reset-card {
      padding: 32px 24px;
      border-radius: 12px;
    }

    .logo svg {
      height: 24px;
    }

    .form-title {
      font-size: 20px;
    }
  }
`
