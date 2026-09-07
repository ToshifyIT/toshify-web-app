// src/modules/onboarding/distribucion-mapa-v2/components/LeadDetalleModal.tsx
//
// Overlay modal para LeadDetailView (que no trae overlay propio).
// Es el mismo wrapper que usa el v1, extraído a su propio archivo para poder
// reutilizarlo sin duplicar markup.

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Lead } from '../../../../types/leads.types'
import { LeadDetailView } from '../../../leads/components/LeadDetailView'

export function LeadDetalleModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: '3vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 1000,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
          padding: 20,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            cursor: 'pointer',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <X size={14} /> Cerrar
        </button>
        <LeadDetailView lead={lead} />
      </div>
    </div>
  )
}
