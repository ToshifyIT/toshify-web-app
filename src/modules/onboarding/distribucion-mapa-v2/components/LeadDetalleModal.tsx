// src/modules/onboarding/distribucion-mapa-v2/components/LeadDetalleModal.tsx
//
// Overlay modal para LeadDetailView (que no trae overlay propio). Usa el mismo
// modal que "Detalle de Lead" en Leads, así la ficha se ve igual en los dos lados.

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Lead } from '../../../../types/leads.types'
import { LeadDetailView } from '../../../leads/components/LeadDetailView'
import { usePermissions } from '../../../../contexts/PermissionsContext'

export function LeadDetalleModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { canEditInMenu } = usePermissions()
  const puedeEditar = canEditInMenu('leads')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Mismo modal que "Detalle de Lead" en Leads (misma ficha, mismo tamaño)
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 'var(--z-modal-nested)' as any }}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Detalle de Lead</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <LeadDetailView
            lead={lead}
            mostrarVideocuestionario={false}
            // Se edita en Leads (otra pestaña, así no se pierden los filtros del mapa)
            onEdit={puedeEditar ? () => {
              const base = window.location.pathname.startsWith('/demo') ? '/demo' : ''
              window.open(`${base}/leads?editar=${encodeURIComponent(lead.id)}`, '_blank', 'noopener')
            } : undefined}
          />
        </div>
      </div>
    </div>
  )
}
