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
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: '3vh 16px',
      }}
    >
      {/* El nombre queda fijo arriba y el contenido scrollea adentro del modal
          (antes scrolleaba toda la página y se perdía el nombre). */}
      <style>{`
        .lead-detalle-modal-mapa .lead-detail-header {
          position: sticky;
          top: 0;
          z-index: 2;
          margin: 0 -20px 12px;
          padding: 16px 112px 12px 20px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-primary);
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 1000,
          maxHeight: '94vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            zIndex: 3,
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
        <div className="lead-detalle-modal-mapa" style={{ overflowY: 'auto', padding: '0 20px 20px', minHeight: 0 }}>
          <LeadDetailView lead={lead} mostrarVideocuestionario={false} />
        </div>
      </div>
    </div>
  )
}
