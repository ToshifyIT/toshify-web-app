// src/components/ForcePasswordChangeModal.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../utils/toast'

interface Props {
  onSuccess: () => void
}

export function ForcePasswordChangeModal({ onSuccess }: Props) {
  const { markPasswordChanged, profile } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const validatePassword = (password: string): string[] => {
    const validationErrors: string[] = []
    if (password.length < 8) {
      validationErrors.push('Mínimo 8 caracteres')
    }
    if (!/[A-Z]/.test(password)) {
      validationErrors.push('Al menos una mayúscula')
    }
    if (!/[a-z]/.test(password)) {
      validationErrors.push('Al menos una minúscula')
    }
    if (!/[0-9]/.test(password)) {
      validationErrors.push('Al menos un número')
    }
    return validationErrors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    // Validar contraseñas coinciden
    if (newPassword !== confirmPassword) {
      setErrors(['Las contraseñas no coinciden'])
      return
    }

    // Validar requisitos de contraseña
    const passwordErrors = validatePassword(newPassword)
    if (passwordErrors.length > 0) {
      setErrors(passwordErrors)
      return
    }

    setLoading(true)
    try {
      // Actualizar contraseña en Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      // Marcar en el perfil que ya no necesita cambiar contraseña
      await markPasswordChanged()

      showSuccess('Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente')

      onSuccess()
    } catch (error: any) {
      console.error('Error cambiando contraseña:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo cambiar la contraseña',
        confirmButtonColor: '#FF0033'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .fpc-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }

        .fpc-modal {
          background: var(--modal-bg, #fff);
          border-radius: 16px;
          padding: 40px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-primary, #e5e7eb);
        }

        .fpc-icon {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #FF0033 0%, #CC0029 100%);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }

        .fpc-icon svg {
          width: 32px;
          height: 32px;
          color: white;
        }

        .fpc-title {
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary, #111827);
          margin: 0 0 8px;
        }

        .fpc-subtitle {
          text-align: center;
          font-size: 14px;
          color: var(--text-secondary, #6b7280);
          margin: 0 0 24px;
          line-height: 1.5;
        }

        .fpc-user-info {
          background: var(--bg-secondary, #f9fafb);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 24px;
          text-align: center;
        }

        .fpc-user-name {
          font-weight: 600;
          color: var(--text-primary, #111827);
          font-size: 15px;
        }

        .fpc-form-group {
          margin-bottom: 16px;
        }

        .fpc-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .fpc-input-wrapper {
          position: relative;
        }

        .fpc-input {
          width: 100%;
          height: 44px;
          padding: 0 44px 0 14px;
          font-size: 14px;
          font-family: inherit;
          background: var(--input-bg, #fff);
          border: 1px solid var(--input-border, #d1d5db);
          border-radius: 10px;
          color: var(--text-primary, #111827);
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }

        .fpc-input:focus {
          outline: none;
          border-color: #FF0033;
          box-shadow: 0 0 0 3px rgba(255, 0, 51, 0.1);
        }

        .fpc-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          background: none;
          border: none;
          border-radius: 8px;
          color: var(--text-tertiary, #9ca3af);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fpc-toggle:hover {
          color: var(--text-secondary, #6b7280);
          background: var(--bg-secondary, #f3f4f6);
        }

        .fpc-errors {
          background: rgba(255, 0, 51, 0.08);
          border: 1px solid rgba(255, 0, 51, 0.2);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 16px;
        }

        .fpc-errors ul {
          margin: 0;
          padding-left: 18px;
          color: #FF0033;
          font-size: 13px;
        }

        .fpc-errors li {
          margin-bottom: 4px;
        }

        .fpc-errors li:last-child {
          margin-bottom: 0;
        }

        .fpc-requirements {
          background: var(--bg-secondary, #f9fafb);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 20px;
        }

        .fpc-requirements-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .fpc-requirements ul {
          margin: 0;
          padding-left: 18px;
          font-size: 13px;
          color: var(--text-tertiary, #9ca3af);
        }

        .fpc-requirements li {
          margin-bottom: 4px;
        }

        .fpc-btn {
          width: 100%;
          height: 44px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          background: #FF0033;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .fpc-btn:hover:not(:disabled) {
          background: #E6002E;
        }

        .fpc-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .fpc-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: fpc-spin 0.6s linear infinite;
        }

        @keyframes fpc-spin {
          to { transform: rotate(360deg); }
        }

        /* Dark mode */
        [data-theme="dark"] .fpc-modal {
          background: #1e293b;
          border-color: #334155;
        }

        [data-theme="dark"] .fpc-title {
          color: #f1f5f9;
        }

        [data-theme="dark"] .fpc-subtitle {
          color: #94a3b8;
        }

        [data-theme="dark"] .fpc-user-info {
          background: #0f172a;
        }

        [data-theme="dark"] .fpc-user-name {
          color: #f1f5f9;
        }

        [data-theme="dark"] .fpc-label {
          color: #e2e8f0;
        }

        [data-theme="dark"] .fpc-input {
          background: #0f172a;
          border-color: #475569;
          color: #f1f5f9;
        }

        [data-theme="dark"] .fpc-requirements {
          background: #0f172a;
        }

        [data-theme="dark"] .fpc-requirements-title {
          color: #94a3b8;
        }

        [data-theme="dark"] .fpc-requirements ul {
          color: #64748b;
        }

        @media (max-width: 480px) {
          .fpc-modal {
            padding: 24px 20px;
          }

          .fpc-icon {
            width: 56px;
            height: 56px;
          }

          .fpc-icon svg {
            width: 28px;
            height: 28px;
          }

          .fpc-title {
            font-size: 20px;
          }
        }
      `}</style>

      <div className="fpc-overlay">
        <div className="fpc-modal">
          <div className="fpc-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h2 className="fpc-title">Cambiar Contraseña</h2>
          <p className="fpc-subtitle">
            Tu contraseña actual es temporal. Por seguridad, debés crear una nueva contraseña para continuar.
          </p>

          {profile && (
            <div className="fpc-user-info">
              <span className="fpc-user-name">{profile.full_name}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="fpc-form-group">
              <label className="fpc-label">Nueva Contraseña</label>
              <div className="fpc-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="fpc-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingresá tu nueva contraseña"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="fpc-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="fpc-form-group">
              <label className="fpc-label">Confirmar Contraseña</label>
              <div className="fpc-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="fpc-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetí tu nueva contraseña"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {errors.length > 0 && (
              <div className="fpc-errors">
                <ul>
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="fpc-requirements">
              <div className="fpc-requirements-title">Requisitos</div>
              <ul>
                <li>Mínimo 8 caracteres</li>
                <li>Al menos una mayúscula</li>
                <li>Al menos una minúscula</li>
                <li>Al menos un número</li>
              </ul>
            </div>

            <button type="submit" className="fpc-btn" disabled={loading}>
              {loading ? <span className="fpc-spinner"></span> : 'Cambiar Contraseña'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
