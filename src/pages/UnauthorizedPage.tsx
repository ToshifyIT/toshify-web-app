// src/pages/UnauthorizedPage.tsx
import { useNavigate } from 'react-router-dom'

export function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F9FAFB',
      fontFamily: 'system-ui'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '500px',
        padding: '40px'
      }}>
        {/* Icono de candado */}
        <div style={{
          fontSize: '80px',
          marginBottom: '20px'
        }}>
          🔒
        </div>

        {/* Título */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#1F2937',
          marginBottom: '16px'
        }}>
          Acceso Denegado
        </h1>

        {/* Mensaje */}
        <p style={{
          fontSize: '16px',
          color: '#6B7280',
          lineHeight: '1.6',
          marginBottom: '32px'
        }}>
          No tienes los permisos necesarios para acceder a esta página.
          Si crees que deberías tener acceso, contacta a tu administrador.
        </p>

        {/* Botones */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#374151',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#F9FAFB'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'white'
            }}
          >
            Volver atrás
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '12px 24px',
              background: '#E63946',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s',
              boxShadow: '0 4px 6px rgba(230, 57, 70, 0.2)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#D62828'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(230, 57, 70, 0.3)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#E63946'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(230, 57, 70, 0.2)'
            }}
          >
            Ir al Dashboard
          </button>
        </div>

        {/* Info adicional */}
        <div style={{
          marginTop: '40px',
          padding: '16px',
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '8px',
          color: '#92400E',
          fontSize: '14px',
          textAlign: 'left'
        }}>
          <strong>💡 Consejo:</strong> Si necesitas acceso a módulos adicionales,
          solicita al administrador del sistema que actualice tus permisos de usuario.
        </div>
      </div>
    </div>
  )
}
