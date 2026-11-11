// src/modules/leads/components/AlertasLicencia.tsx
// Avisos de licencia para revisar (ver alertasLicencia en ../licenciaLead.ts).
// Se usa en Leads y en Conductores.
import { AlertTriangle } from 'lucide-react'

export function AlertasLicencia({ mensajes }: { mensajes: string[] }) {
  if (mensajes.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: '6px', margin: '4px 0 12px' }}>
      {mensajes.map(m => (
        <div
          key={m}
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
            background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-primary)',
          }}
        >
          <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
          <span>{m}</span>
        </div>
      ))}
    </div>
  )
}
