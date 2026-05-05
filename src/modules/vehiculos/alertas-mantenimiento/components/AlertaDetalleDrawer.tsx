import { X, AlertOctagon, AlertTriangle, Info, CheckCircle, Wrench, RotateCcw } from 'lucide-react'
import type { AlertaMantenimiento, AlertaSeveridad } from '../types/alertas.types'

interface Props {
  alerta: AlertaMantenimiento | null
  onClose: () => void
  onAtender: (id: string) => void
  onDescartar: (id: string) => void
  onReactivar: (id: string) => void
}

function severidadInfo(sev: AlertaSeveridad) {
  const map: Record<AlertaSeveridad, { label: string; color: string; Icon: typeof AlertOctagon }> = {
    Critical: { label: 'Crítica', color: '#dc2626', Icon: AlertOctagon },
    High: { label: 'Alta', color: '#ea580c', Icon: AlertOctagon },
    Medium: { label: 'Media', color: '#ea580c', Icon: AlertTriangle },
    Low: { label: 'Baja', color: '#6b7280', Icon: Info },
  }
  return map[sev]
}

function formatFechaLarga(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AlertaDetalleDrawer({ alerta, onClose, onAtender, onDescartar, onReactivar }: Props) {
  if (!alerta) return null

  const sev = severidadInfo(alerta.severidad)
  const SevIcon = sev.Icon
  const v = alerta.vehiculo
  const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
  const lampActiva = alerta.lampara_red ? 'Stop (rojo)' : alerta.lampara_malfunction ? 'Check engine' : alerta.lampara_amber ? 'Advertencia ámbar' : alerta.lampara_protect ? 'Protección' : null

  return (
    <>
      <div className="alerta-drawer-overlay" onClick={onClose} />
      <aside className="alerta-drawer">
        <div className="alerta-drawer-header">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, fontWeight: 700 }}>
              {alerta.patente || '-'}
            </span>
            {modelo && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{modelo}{v?.gnc ? ' · GNC' : ''}</span>}
          </div>
          <button className="alerta-drawer-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="alerta-drawer-body">
          {/* Bloque severidad */}
          <div className="alerta-drawer-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SevIcon size={16} style={{ color: sev.color }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: sev.color, textTransform: 'uppercase' }}>
                {sev.label}
              </span>
              {alerta.estado === 'atendida' && (
                <span className="dt-badge dt-badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={11} /> Atendida
                </span>
              )}
              {alerta.estado === 'descartada' && (
                <span className="dt-badge dt-badge-gray">Descartada</span>
              )}
            </div>
            <h3 className="alerta-drawer-title">
              {alerta.diagnostic_name || alerta.fault_description || '(sin descripción)'}
            </h3>
          </div>

          {/* Bloque info */}
          <div className="alerta-drawer-section">
            <dl className="alerta-drawer-info">
              <dt>Conductor asignado</dt>
              <dd>{alerta.conductor_name || '-'}</dd>

              <dt>Fecha del evento</dt>
              <dd>{formatFechaLarga(alerta.fecha_evento)}</dd>

              <dt>Ocurrencias</dt>
              <dd>{alerta.count} {alerta.count === 1 ? 'vez' : 'veces'}</dd>

              {lampActiva && (
                <>
                  <dt>Lámpara activa</dt>
                  <dd>{lampActiva}</dd>
                </>
              )}

              {alerta.diagnostic_code && (
                <>
                  <dt>Código diagnóstico</dt>
                  <dd style={{ fontFamily: 'ui-monospace, monospace' }}>{alerta.diagnostic_code}</dd>
                </>
              )}

              {alerta.failure_mode && (
                <>
                  <dt>Modo de falla</dt>
                  <dd>{alerta.failure_mode}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Bloque enriched (solo si hay datos) */}
          {(alerta.fault_description || alerta.effect_on_component || alerta.recommendation) && (
            <div className="alerta-drawer-section">
              {alerta.fault_description && (
                <div className="alerta-drawer-block">
                  <h4>Descripción</h4>
                  <p>{alerta.fault_description}</p>
                </div>
              )}
              {alerta.effect_on_component && (
                <div className="alerta-drawer-block">
                  <h4>Efecto en componente</h4>
                  <p>{alerta.effect_on_component}</p>
                </div>
              )}
              {alerta.recommendation && (
                <div className="alerta-drawer-block">
                  <h4>Recomendación</h4>
                  <p>{alerta.recommendation}</p>
                </div>
              )}
            </div>
          )}

          {/* Estado de atención */}
          {alerta.estado !== 'activa' && alerta.dismiss_user && (
            <div className="alerta-drawer-section">
              <dl className="alerta-drawer-info">
                <dt>Atendida por</dt>
                <dd>{alerta.dismiss_user}</dd>
                {alerta.dismiss_at && (
                  <>
                    <dt>Fecha</dt>
                    <dd>{formatFechaLarga(alerta.dismiss_at)}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>

        {/* Footer acciones */}
        <div className="alerta-drawer-footer">
          {alerta.estado === 'activa' ? (
            <>
              <button
                onClick={() => onAtender(alerta.id)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Wrench size={14} /> Marcar atendida
              </button>
              <button
                onClick={() => onDescartar(alerta.id)}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <X size={14} /> Descartar
              </button>
            </>
          ) : (
            <button
              onClick={() => onReactivar(alerta.id)}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RotateCcw size={14} /> Reactivar
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
