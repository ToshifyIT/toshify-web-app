// src/pages/SinModulosPage.tsx
//
// Pantalla para el usuario autenticado que todavia no tiene ningun modulo
// habilitado. Antes caia en "Acceso Denegado", que se lee como un error del
// sistema cuando en realidad lo que falta es configuracion de permisos.
import { Lightbulb, LayoutGrid } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function SinModulosPage() {
  const { signOut } = useAuth()

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', padding: '40px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
          <LayoutGrid size={80} color="#9CA3AF" strokeWidth={1.5} />
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1F2937', marginBottom: '16px' }}>
          Sin modulos asignados
        </h1>

        <p style={{ fontSize: '16px', color: '#6B7280', lineHeight: 1.6, marginBottom: '32px' }}>
          Tu usuario todavia no tiene modulos habilitados, asi que no hay nada que
          mostrarte por ahora. No es un error: falta que te asignen permisos.
        </p>

        <button
          onClick={() => { void signOut() }}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            background: '#fff',
            color: '#374151',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Cerrar sesion
        </button>

        <div style={{
          marginTop: '32px',
          padding: '16px',
          background: '#FEF3C7',
          borderRadius: '8px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          textAlign: 'left',
        }}>
          <Lightbulb size={18} color="#92400E" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '14px', color: '#92400E', margin: 0, lineHeight: 1.5 }}>
            <strong>Consejo:</strong> pedile al administrador del sistema que te
            asigne un rol o habilite los modulos que necesitas.
          </p>
        </div>
      </div>
    </div>
  )
}
