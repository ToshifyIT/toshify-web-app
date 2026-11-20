// src/modules/leads/components/ChatLeadModal.tsx
// Botón «Chat» de la lista de Leads: abre la conversación de WhatsApp del lead en
// 2Chat («Toshify Clientes»). Si todavía no hay conversación, deja editar el saludo
// y lo manda para iniciarla. En los dos casos el servidor la etiqueta «Lead» y la
// asigna al usuario que la abre (server-2chat.js, /api/2chat/lead-chat).
// Con tipo="conductor" (Seguimiento de conductores): etiqueta «Conductor», equipo
// Clientes y asignada a su capitán (/api/2chat/conductor-chat).
import { useEffect, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { abrirChatConductor, abrirChatLead, obtenerChatConductor, obtenerChatLead } from '../../../services/twoChatService'
import type { ChatLeadInfo } from '../../../services/twoChatService'
import { showError, showSuccess, showWarning } from '../../../utils/toast'
import { Spinner } from '../../../components/ui/LoadingOverlay'

interface ChatLeadModalProps {
  leadId: string
  nombre: string
  onClose: () => void
  /** «conductor»: leadId es el id del conductor (etiqueta Conductor, equipo Clientes, su capitán) */
  tipo?: 'lead' | 'conductor'
}

export function ChatLeadModal({ leadId, nombre, onClose, tipo = 'lead' }: ChatLeadModalProps) {
  const esConductor = tipo === 'conductor'
  const etiqueta = esConductor ? 'Conductor' : 'Lead'
  const equipo = esConductor ? 'Clientes' : 'Ventas'
  const [info, setInfo] = useState<ChatLeadInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [isEnviando, setIsEnviando] = useState(false)

  useEffect(() => {
    let cancelado = false
    ;(esConductor ? obtenerChatConductor(leadId) : obtenerChatLead(leadId))
      .then(d => { if (!cancelado) { setInfo(d); setMensaje(d.saludo) } })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo consultar 2Chat') })
    return () => { cancelado = true }
  }, [leadId, esConductor])

  const abrir = async () => {
    if (!info) return
    if (!info.existe && !mensaje.trim()) return
    // La pestaña se abre ya (con el clic) para que el navegador no la bloquee
    const pestana = window.open('about:blank', '_blank')
    setIsEnviando(true)
    try {
      const texto = info.existe ? undefined : mensaje.trim()
      const r = await (esConductor ? abrirChatConductor(leadId, texto) : abrirChatLead(leadId, texto))
      if (pestana) pestana.location.href = r.url
      else window.open(r.url, '_blank')
      r.avisos.forEach(a => showWarning('2Chat', a))
      if (r.enviado) showSuccess('Mensaje enviado', `Se inició la conversación con ${nombre}`)
      onClose()
    } catch (e) {
      pestana?.close()
      showError('2Chat', e instanceof Error ? e.message : 'No se pudo abrir el chat')
    } finally {
      setIsEnviando(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Chat de WhatsApp con ${nombre}`}
        style={{
          background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '520px',
          display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--border-primary)' }}>
          <MessageCircle size={18} style={{ color: '#16a34a' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Chat con {nombre}</div>
            {info && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{info.telefono} · WhatsApp {info.canal}</div>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-primary)' }}>
          {!info && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Spinner size="sm" /> Buscando la conversación en 2Chat…
            </div>
          )}
          {error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}

          {info && !info.canal_conectado && (
            <div style={{ color: 'var(--color-warning)' }}>El WhatsApp de 2Chat figura desconectado: puede que el mensaje no salga.</div>
          )}

          {info?.existe && (
            <p style={{ margin: 0 }}>
              Ya hay una conversación con este número. Se abre en 2Chat con la etiqueta «{etiqueta}», en el equipo {equipo}
              {info.agente ? <> y asignada a <b>{info.agente}</b>{info.es_capitan ? ' (su capitán)' : ''}</> : ' (tu usuario no está en 2Chat: queda sin asignar)'}.
            </p>
          )}

          {info && !info.existe && (
            <>
              <p style={{ margin: 0 }}>
                Todavía no hay conversación con este número. Se inicia mandando este mensaje desde el WhatsApp de Toshify
                {info.agente ? <>, queda asignada a <b>{info.agente}</b>{info.es_capitan ? ' (su capitán)' : ''}</> : ''}, con la etiqueta «{etiqueta}» y en el equipo {equipo}.
              </p>
              <textarea
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                rows={6}
                maxLength={1000}
                aria-label="Primer mensaje"
                style={{
                  width: '100%', resize: 'vertical', padding: 10, fontSize: 13, lineHeight: 1.45,
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit',
                }}
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-primary)' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isEnviando}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={abrir}
            disabled={!info || isEnviando || (!info.existe && !mensaje.trim())}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {info?.existe ? <MessageCircle size={15} /> : <Send size={15} />}
            {isEnviando ? 'Abriendo…' : info?.existe ? 'Abrir chat' : 'Enviar y abrir chat'}
          </button>
        </div>
      </div>
    </div>
  )
}
