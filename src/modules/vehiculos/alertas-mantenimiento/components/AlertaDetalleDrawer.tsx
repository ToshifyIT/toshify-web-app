import { X, AlertOctagon, AlertTriangle, Info, CheckCircle, Wrench, Gauge, Clock, Activity, FileText, ClipboardList } from 'lucide-react'
import type { AlertaMantenimiento, AlertaSeveridad } from '../types/alertas.types'

interface Props {
  alerta: AlertaMantenimiento | null
  onClose: () => void
}

const SERVICE_INTERVAL = 10000

function severidadInfo(sev: AlertaSeveridad) {
  const map: Record<AlertaSeveridad, { label: string; color: string; bg: string; Icon: typeof AlertOctagon }> = {
    Critical: { label: 'Crítica', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)', Icon: AlertOctagon },
    High: { label: 'Alta', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.08)', Icon: AlertOctagon },
    Medium: { label: 'Media', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.08)', Icon: AlertTriangle },
    Low: { label: 'Baja', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)', Icon: Info },
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

function kmHastaProximoService(odometro: number | null | undefined): number | null {
  if (odometro == null) return null
  const proxService = Math.ceil(odometro / SERVICE_INTERVAL) * SERVICE_INTERVAL
  return proxService - odometro
}

export function AlertaDetalleDrawer({ alerta, onClose }: Props) {
  if (!alerta) return null

  const sev = severidadInfo(alerta.severidad)
  const SevIcon = sev.Icon
  const v = alerta.vehiculo
  const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
  const odometro = v?.kilometraje_actual ?? null
  const faltanKm = kmHastaProximoService(odometro)
  const consumido = faltanKm != null ? SERVICE_INTERVAL - faltanKm : null
  const pctConsumido = consumido != null ? (consumido / SERVICE_INTERVAL) * 100 : null
  const vencido = faltanKm != null && faltanKm <= 0
  const proximo = faltanKm != null && faltanKm > 0 && faltanKm <= SERVICE_INTERVAL * 0.2

  const lampActiva = alerta.lampara_red ? 'Stop (rojo)'
    : alerta.lampara_malfunction ? 'Check engine'
    : alerta.lampara_amber ? 'Advertencia ámbar'
    : alerta.lampara_protect ? 'Protección'
    : null

  const barColor = vencido ? '#dc2626' : proximo ? '#ea580c' : '#16a34a'

  return (
    <>
      <div className="alerta-drawer-overlay" onClick={onClose} />
      <aside className="alerta-drawer alerta-drawer-wide">
        {/* HEADER */}
        <div className="alerta-drawer-header">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {alerta.patente || '-'}
            </span>
            {modelo && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {modelo}{v?.gnc ? ' · GNC' : ''}
              </span>
            )}
          </div>
          <button className="alerta-drawer-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="alerta-drawer-body">

          {/* ============ BANNER DE ALERTA PRINCIPAL ============ */}
          <div
            style={{
              background: sev.bg,
              border: `1px solid ${sev.color}33`,
              borderLeft: `3px solid ${sev.color}`,
              borderRadius: 8,
              padding: '14px 16px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <SevIcon size={20} style={{ color: sev.color, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: sev.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Severidad {sev.label}
                </span>
                {alerta.estado === 'atendida' && (
                  <span className="dt-badge dt-badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={11} /> Atendida
                  </span>
                )}
                {alerta.estado === 'descartada' && (
                  <span className="dt-badge dt-badge-gray">Descartada</span>
                )}
                {alerta.estado === 'activa' && (
                  <span className="dt-badge dt-badge-red">Activa</span>
                )}
              </div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                {alerta.diagnostic_name || alerta.fault_description || '(sin descripción)'}
              </h3>
              {lampActiva && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <strong>Lámpara activa:</strong> {lampActiva}
                </div>
              )}
            </div>
          </div>

          {/* ============ GRID DE MÉTRICAS DEL VEHÍCULO ============ */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Estado del Vehículo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Odómetro */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Gauge size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Odómetro</span>
                </div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {odometro != null ? `${odometro.toLocaleString('es-AR')} km` : '—'}
                </div>
              </div>

              {/* Próximo Service */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Wrench size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Próximo Service</span>
                </div>
                {faltanKm != null ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, color: vencido ? '#dc2626' : 'var(--text-primary)', marginBottom: 6 }}>
                      {vencido ? `Vencido ${Math.abs(faltanKm).toLocaleString('es-AR')} km` : `En ${faltanKm.toLocaleString('es-AR')} km`}
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, pctConsumido || 0)}%`, background: barColor, borderRadius: 3 }} />
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sin datos de odómetro</span>
                )}
              </div>

              {/* Ocurrencias */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Activity size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Ocurrencias</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {alerta.count} {alerta.count === 1 ? 'vez' : 'veces'}
                </div>
              </div>

              {/* Fecha */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Detectado</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatFechaLarga(alerta.fecha_evento)}
                </div>
              </div>
            </div>
          </div>

          {/* ============ INFO TÉCNICA ============ */}
          {(alerta.diagnostic_code || alerta.failure_mode || alerta.conductor_name) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Información Técnica
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '4px 0' }}>
                {alerta.conductor_name && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 14px', borderBottom: '1px solid var(--border-secondary)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Conductor</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{alerta.conductor_name}</span>
                  </div>
                )}
                {alerta.diagnostic_code && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 14px', borderBottom: '1px solid var(--border-secondary)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Código</span>
                    <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 500, color: 'var(--text-primary)' }}>{alerta.diagnostic_code}</span>
                  </div>
                )}
                {alerta.failure_mode && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 14px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Modo de falla</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{alerta.failure_mode}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============ DESCRIPCIÓN / EFECTO / RECOMENDACIÓN ============ */}
          {(alerta.fault_description || alerta.effect_on_component || alerta.recommendation) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Diagnóstico
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {alerta.fault_description && (
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FileText size={12} style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Descripción</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{alerta.fault_description}</p>
                  </div>
                )}
                {alerta.effect_on_component && (
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <AlertTriangle size={12} style={{ color: '#ea580c' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: 0.3 }}>Efecto en el componente</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{alerta.effect_on_component}</p>
                  </div>
                )}
                {alerta.recommendation && (
                  <div style={{ background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <ClipboardList size={12} style={{ color: '#2563eb' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.3 }}>Recomendación del taller</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{alerta.recommendation}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============ AUDITORÍA ============ */}
          {alerta.estado !== 'activa' && alerta.dismiss_user && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Auditoría
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: '4px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 14px', borderBottom: '1px solid var(--border-secondary)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {alerta.estado === 'atendida' ? 'Atendida por' : 'Descartada por'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{alerta.dismiss_user}</span>
                </div>
                {alerta.dismiss_at && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 14px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Fecha</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{formatFechaLarga(alerta.dismiss_at)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acciones se manejan desde la columna "Acciones" de la tabla principal */}
      </aside>
    </>
  )
}
