import { useState, useEffect } from 'react';
import { X, Clock, User, ArrowRight, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatFechaHora } from '../../utils/format'

interface HistorialEntry {
  id: string;
  tipo_evento: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  detalles: Record<string, unknown>;
  usuario_nombre: string | null;
  modulo: string | null;
  created_at: string;
}

interface HistorialModalProps {
  tipo: 'vehiculo' | 'conductor';
  entityId: string;
  entityLabel: string; // patente o nombre del conductor
  onClose: () => void;
}

const EVENTO_LABELS: Record<string, string> = {
  cambio_estado: 'Cambio de Estado',
  baja: 'Baja',
  asignacion_creada: 'Asignación Creada',
  asignacion_activada: 'Asignación Activada',
  asignacion_completada: 'Asignación Completada',
  asignacion_cancelada: 'Asignación Cancelada',
  asignacion_finalizada: 'Asignación Finalizada',
  devolucion: 'Devolución',
  siniestro: 'Siniestro',
  regularizacion: 'Regularización',
  eliminacion_asignacion: 'Asignación Eliminada',
};

const EVENTO_COLORS: Record<string, string> = {
  cambio_estado: '#3B82F6',
  baja: '#EF4444',
  asignacion_creada: '#10B981',
  asignacion_activada: '#10B981',
  asignacion_completada: '#6B7280',
  asignacion_cancelada: '#F59E0B',
  asignacion_finalizada: '#6B7280',
  devolucion: '#8B5CF6',
  siniestro: '#EF4444',
  regularizacion: '#F59E0B',
  eliminacion_asignacion: '#EF4444',
};

const MODULO_LABELS: Record<string, string> = {
  vehiculos: 'Vehículos',
  conductores: 'Conductores',
  asignaciones: 'Asignaciones',
  siniestros: 'Siniestros',
  programacion: 'Programación',
};

function formatFecha(iso: string): string {
  return formatFechaHora(iso);
}

function formatDetalles(detalles: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const keys: Record<string, string> = {
    patente: 'Patente',
    nombre: 'Conductor',
    conductor_nombre: 'Conductor',
    motivo: 'Motivo',
    motivo_baja: 'Motivo de baja',
    motivo_cancelacion: 'Motivo cancelación',
    fecha_terminacion: 'Fecha terminación',
    asignacion_codigo: 'Asignación',
    codigo_asignacion: 'Asignación',
    asignaciones_afectadas: 'Asignaciones afectadas',
    asignaciones_finalizadas: 'Asignaciones finalizadas',
    vehiculo_patente: 'Patente',
    accion: 'Acción',
    flujo: 'Flujo',
    reemplazadoPor: 'Reemplazado por',
    asignacion_continua: 'Asignación continúa',
    categoria: 'Categoría',
    responsable: 'Responsable',
  };

  for (const [key, value] of Object.entries(detalles)) {
    if (value === null || value === undefined || key === 'vehiculo_id' || key === 'conductor_id' || key === 'asignacion_id' || key === 'sede_id' || key === 'siniestro_id') continue;
    const label = keys[key] || key;
    if (typeof value === 'boolean') {
      lines.push(`${label}: ${value ? 'Sí' : 'No'}`);
    } else if (typeof value === 'object') {
      continue;
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines;
}

/**
 * Línea de tiempo de los movimientos (historial_vehiculos / historial_conductores).
 * La usa HistorialModal y la pestaña "Movimientos" del detalle del vehículo.
 */
export function HistorialLista({ tipo, entityId }: { tipo: 'vehiculo' | 'conductor'; entityId: string }) {
  const [entries, setEntries] = useState<HistorialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistorial();
  }, [entityId]);

  async function loadHistorial() {
    setLoading(true);
    try {
      const tabla = tipo === 'vehiculo' ? 'historial_vehiculos' : 'historial_conductores';
      const campo = tipo === 'vehiculo' ? 'vehiculo_id' : 'conductor_id';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(tabla) as any)
        .select('*')
        .eq(campo, entityId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setEntries(data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Cargando historial...</div>
  }
  return (
    <>
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
          <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 14 }}>No hay registros de historial</p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute', left: 15, top: 8, bottom: 8,
            width: 2, background: '#E5E7EB',
          }} />

          {entries.map((entry, i) => {
            const color = EVENTO_COLORS[entry.tipo_evento] || '#6B7280';
            const detallesLines = formatDetalles(entry.detalles || {});

            return (
              <div key={entry.id} style={{
                position: 'relative', paddingLeft: 36, paddingBottom: i < entries.length - 1 ? 10 : 0,
              }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute', left: 9, top: 6,
                  width: 14, height: 14, borderRadius: '50%',
                  background: color, border: '3px solid #fff',
                  boxShadow: `0 0 0 2px ${color}33`,
                }} />

                {/* Card */}
                <div style={{
                  background: '#F9FAFB', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', border: '1px solid #E5E7EB',
                }}>
                  {/* Tipo + fecha */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color,
                      background: `${color}15`, padding: '1px 6px', borderRadius: 'var(--radius-xs)',
                    }}>
                      {EVENTO_LABELS[entry.tipo_evento] || entry.tipo_evento}
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} />
                      {formatFecha(entry.created_at)}
                    </span>
                  </div>

                  {/* Estado anterior → nuevo */}
                  {(entry.estado_anterior || entry.estado_nuevo) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11, color: '#374151', marginBottom: 2,
                    }}>
                      {entry.estado_anterior && (
                        <span style={{
                          padding: '1px 6px', borderRadius: 'var(--radius-xs)',
                          background: '#FEE2E2', color: '#991B1B', fontSize: 11,
                        }}>
                          {entry.estado_anterior}
                        </span>
                      )}
                      {entry.estado_anterior && entry.estado_nuevo && (
                        <ArrowRight size={12} style={{ color: '#9CA3AF' }} />
                      )}
                      {entry.estado_nuevo && (
                        <span style={{
                          padding: '1px 6px', borderRadius: 'var(--radius-xs)',
                          background: '#D1FAE5', color: '#065F46', fontSize: 11,
                        }}>
                          {entry.estado_nuevo}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Detalles */}
                  {detallesLines.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 1.45 }}>
                      {detallesLines.map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                    </div>
                  )}

                  {/* Usuario + módulo */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 10, color: '#9CA3AF', marginTop: 6,
                    borderTop: '1px solid #E5E7EB', paddingTop: 5,
                  }}>
                    {entry.usuario_nombre && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <User size={11} />
                        {entry.usuario_nombre}
                      </span>
                    )}
                    {entry.modulo && (
                      <span style={{
                        background: '#F3F4F6', padding: '1px 6px', borderRadius: 'var(--radius-xs)',
                      }}>
                        {MODULO_LABELS[entry.modulo] || entry.modulo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function HistorialModal({ tipo, entityId, entityLabel, onClose }: HistorialModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal-nested)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-lg)', width: '95%', maxWidth: 600,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Historial de Cambios
            </h3>
            <span style={{ fontSize: 13, color: '#6B7280' }}>{entityLabel}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 'var(--radius-sm)', color: '#6B7280',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <HistorialLista tipo={tipo} entityId={entityId} />
        </div>
      </div>
    </div>
  );
}
