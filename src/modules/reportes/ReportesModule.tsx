// src/modules/reportes/ReportesModule.tsx
import { BarChart3 } from 'lucide-react'

export function ReportesModule() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header - Estilo Bitacora */}
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        padding: '20px',
        border: '1px solid var(--border-primary)'
      }}>
        <div style={{ borderLeft: '4px solid #DC2626', paddingLeft: '16px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Generacion de Reportes
          </h1>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'block', marginTop: '2px' }}>
            Diseno y estructura de reportes de facturacion
          </span>
        </div>
      </div>

      {/* Contenido */}
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        padding: '40px',
        border: '1px solid var(--border-primary)',
        textAlign: 'center'
      }}>
        <BarChart3 size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
          Modulo en desarrollo...
        </p>
      </div>
    </div>
  )
}
