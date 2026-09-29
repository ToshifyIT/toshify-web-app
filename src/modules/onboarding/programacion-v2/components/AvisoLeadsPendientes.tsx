// src/modules/onboarding/components/AvisoLeadsPendientes.tsx
//
// Aviso previo al envio a entrega cuando la programacion tiene turnos
// ocupados por LEADS.
//
// Por que existe: la conversion crea un conductor de verdad y marca el lead
// como convertido, cosa que no se deshace. Antes de abrir el formulario
// conviene decir con todas las letras que eso va a pasar y cuantas personas
// alcanza, para que nadie lo descubra a mitad de camino.
//
// Con un solo lead el boton lleva directo al formulario. Con varios se elige
// por cual empezar: el orden lo decide el operador, no el codigo.

import { AlertTriangle, ArrowRight, X } from 'lucide-react'

export interface LeadPendiente {
  leadId: string
  slot: 'diurno' | 'nocturno' | 'cargo'
  label: string
  nombre: string
}

interface Props {
  pendientes: LeadPendiente[]
  onCancelar: () => void
  onElegir: (pendiente: LeadPendiente) => void
}

export function AvisoLeadsPendientes({ pendientes, onCancelar, onElegir }: Props) {
  const varios = pendientes.length > 1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--modal-bg, #fff)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} style={{ color: '#B45309' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {varios
                  ? `Esta programación tiene ${pendientes.length} leads`
                  : 'Esta programación tiene 1 lead'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Para enviarla a entrega {varios ? 'todos tienen' : 'tiene'} que ser
                conductor{varios ? 'es' : ''}. {varios ? 'Elegí por cuál empezar' : 'Vas a completar sus datos'} y
                se {varios ? 'convierten' : 'convierte'} antes de continuar con el envío.
              </p>
            </div>
          </div>
          <button
            onClick={onCancelar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            title="Cancelar"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pendientes.map((p) => (
            <div
              key={p.leadId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {p.nombre}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Turno {p.label}
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(139, 92, 246, 0.18)',
                      color: '#7C3AED',
                    }}
                  >
                    LEAD
                  </span>
                </div>
              </div>
              {varios && (
                <button
                  onClick={() => onElegir(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 13px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#16a34a',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Convertir <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            onClick={onCancelar}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
              background: 'var(--modal-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar envío
          </button>
          {!varios && (
            <button
              onClick={() => onElegir(pendientes[0])}
              style={{
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                background: '#16a34a',
                color: 'white',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Convertir a conductor
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
