// src/pages/conductores/ConductorDetallePage.tsx
// Detalle "Ver mis datos" de un conductor: reusa el portal Mi Espacio en modo
// embebido (sin login, sin header propio, sin gráficos), mostrando las pestañas
// de facturación, multas y km recorridos.
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PortalPage } from '../../modules/portal/PortalPage'

export function ConductorDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div style={{ padding: '16px 24px' }}>
      <button
        onClick={() => navigate('/conductores/panel')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', border: '1px solid #e5e7eb', background: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151',
          cursor: 'pointer', marginBottom: 12,
        }}
      >
        <ArrowLeft size={16} /> Volver al panel
      </button>
      {id ? <PortalPage embeddedConductorId={id} /> : <div>Conductor no encontrado.</div>}
    </div>
  )
}
