// src/modules/integraciones/uss/bitacora/components/ConductorHistorialModal.tsx
/**
 * Modal de historial del conductor para Bitácora: Historial de Vehículos +
 * Historial de Bajas y Reactivaciones. Réplica liviana de las secciones del
 * modal "Detalles del Conductor" (ConductoresModule), con estilos propios para
 * no depender del CSS de ese módulo.
 *
 * Se abre clickeando el nombre del conductor cuando el modo historial está
 * activo (Ctrl+Shift+H en la tabla de Marcaciones).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../../../../../lib/supabase';

interface ConductorHistorialModalProps {
  conductorId: string;
  conductorNombre: string;
  onClose: () => void;
}

interface VehiculoAsignado {
  id: string;
  horario: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at: string;
  asignaciones: {
    id: string;
    codigo: string | null;
    estado: string;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    vehiculos: {
      patente: string | null;
      marca: string | null;
      modelo: string | null;
      anio: number | null;
    } | null;
  } | null;
}

interface EventoBaja {
  id: string;
  tipo_evento: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  motivo_baja: string | null;
  usuario_nombre: string | null;
  created_at: string | null;
}

// Mismos criterios de badge que el modal de Conductores
function estadoBadge(conductorEstado: string, asignacionEstado?: string) {
  if (asignacionEstado === 'programado') {
    return { bg: 'rgba(234, 179, 8, 0.1)', color: '#A16207', label: 'Programada' };
  }
  const estados: Record<string, { bg: string; color: string; label: string }> = {
    activo: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22C55E', label: 'Activa' },
    asignado: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', label: 'Asignado' },
    cancelado: { bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', label: 'Cancelada' },
    completado: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Finalizada' },
  };
  return estados[conductorEstado] || { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: conductorEstado };
}

function turnoBadge(turno: string) {
  if (turno === 'diurno') return { bg: '#FDE68A', color: '#92400E', label: 'DIURNO' };
  if (turno === 'nocturno') return { bg: '#DBEAFE', color: '#1E40AF', label: 'NOCTURNO' };
  return { bg: '#F3F4F6', color: '#374151', label: 'A CARGO' };
}

const fmtFecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';

export function ConductorHistorialModal({ conductorId, conductorNombre, onClose }: ConductorHistorialModalProps) {
  const [vehiculos, setVehiculos] = useState<VehiculoAsignado[]>([]);
  const [bajas, setBajas] = useState<EventoBaja[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [vehRes, bajasRes] = await Promise.all([
        supabase
          .from('asignaciones_conductores')
          .select(`
            id, horario, estado, fecha_inicio, fecha_fin, created_at,
            asignaciones!inner (
              id, codigo, estado, fecha_inicio, fecha_fin,
              vehiculos ( patente, marca, modelo, anio )
            )
          `)
          .eq('conductor_id', conductorId)
          .not('asignaciones.estado', 'eq', 'cancelada')
          .order('created_at', { ascending: false }),
        supabase
          .from('conductores_historial_bajas')
          .select('id, tipo_evento, estado_anterior, estado_nuevo, motivo_baja, usuario_nombre, created_at')
          .eq('conductor_id', conductorId)
          .order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setVehiculos(((vehRes.data || []) as unknown) as VehiculoAsignado[]);
      setBajas(((bajasRes.data || []) as unknown) as EventoBaja[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [conductorId]);

  const sectionTitle: CSSProperties = {
    fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
    margin: '16px 0 10px',
  };
  const emptyBox: CSSProperties = {
    padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px',
    background: 'var(--bg-secondary)', borderRadius: '8px',
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '16px' }}>Historial — {conductorNombre}</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <div style={{ padding: '4px 24px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Historial de Vehículos */}
          <div style={sectionTitle}>
            Historial de Vehículos
            {!loading && (
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 'normal' }}>
                ({vehiculos.length})
              </span>
            )}
          </div>
          {loading ? (
            <div style={emptyBox}>Cargando historial...</div>
          ) : vehiculos.length === 0 ? (
            <div style={emptyBox}>Sin vehículos asignados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {vehiculos.map((item) => {
                const asig = item.asignaciones;
                const v = asig?.vehiculos;
                const eb = estadoBadge(item.estado, asig?.estado);
                const tb = turnoBadge(item.horario);
                const isActiva = asig?.estado === 'activa';
                const ini = item.fecha_inicio || asig?.fecha_inicio;
                const fin = item.fecha_fin || asig?.fecha_fin;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                      padding: '10px 14px', borderRadius: '10px',
                      border: `1px solid ${isActiva ? 'rgba(34,197,94,0.45)' : 'var(--border-color, #e5e7eb)'}`,
                      background: isActiva ? 'rgba(34,197,94,0.05)' : 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>
                        {v?.patente || asig?.codigo || 'N/A'}
                      </div>
                      {v?.marca && v?.modelo && (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                          {v.marca} {v.modelo} {v.anio ? `(${v.anio})` : ''}
                        </div>
                      )}
                    </div>
                    <span style={{ background: tb.bg, color: tb.color, fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                      {tb.label}
                    </span>
                    <span style={{ background: eb.bg, color: eb.color, fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>
                      {eb.label}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                      {ini && `${fmtFecha(ini)}${fin ? ` - ${fmtFecha(fin)}` : ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Historial de Bajas y Reactivaciones */}
          <div style={sectionTitle}>
            Historial de Bajas y Reactivaciones
            {!loading && (
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 'normal' }}>
                ({bajas.length})
              </span>
            )}
          </div>
          {loading ? (
            <div style={emptyBox}>Cargando historial...</div>
          ) : bajas.length === 0 ? (
            <div style={emptyBox}>Sin bajas ni reactivaciones registradas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bajas.map((b) => {
                const esBaja = b.tipo_evento === 'baja';
                const color = esBaja ? '#dc2626' : '#059669';
                const bg = esBaja ? 'rgba(220,38,38,0.06)' : 'rgba(5,150,105,0.06)';
                const fecha = b.created_at
                  ? new Date(b.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '—';
                return (
                  <div key={b.id} style={{ borderLeft: `3px solid ${color}`, background: bg, borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: color, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                        {esBaja ? 'Baja' : 'Reactivación'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {(b.estado_anterior || '—')} → {(b.estado_nuevo || '—')}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-tertiary)' }}>{fecha}</span>
                    </div>
                    {b.motivo_baja && (
                      <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-primary)' }}>
                        <b>Motivo:</b> {b.motivo_baja}
                      </div>
                    )}
                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Por {b.usuario_nombre || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
