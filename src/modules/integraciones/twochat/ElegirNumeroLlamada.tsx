// src/modules/integraciones/twochat/ElegirNumeroLlamada.tsx
// Se abre al tocar Llamar solo si el conductor tiene más de un número (WhatsApp y
// secundario): elige a cuál llamar. Con un solo número se llama directo.
import { Phone, X } from 'lucide-react'
import type { TelefonoLlamada, TipoTelefono } from './telefonosConductor'

interface Props {
  nombre: string
  telefonos: TelefonoLlamada[]
  onElegir: (tipo: TipoTelefono) => void
  onClose: () => void
}

export function ElegirNumeroLlamada({ nombre, telefonos, onElegir, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 360, width: 'calc(100% - 32px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">¿A qué número llamás a {nombre}?</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {telefonos.map((t) => (
            <button
              key={t.tipo}
              type="button"
              className="btn-secondary"
              onClick={() => onElegir(t.tipo)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start', padding: '10px 12px' }}
            >
              <Phone size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.3 }}>
                <span style={{ fontWeight: 600 }}>{t.etiqueta}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{t.numero}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
