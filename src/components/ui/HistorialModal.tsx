import { useState, useEffect } from 'react';
import { X, Clock, User, ArrowRight, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  const d = new Date(iso);
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const anio = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hh}:${mm}`;
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

export function HistorialModal({ tipo, entityId, entityLabel, onClose }: HistorialModalProps) {
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

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '95%', maxWidth: 600,
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
              padding: 4, borderRadius: 6, color: '#6B7280',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
              Cargando historial...
            </div>
          ) : entries.length === 0 ? (
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
                    position: 'relative', paddingLeft: 40, paddingBottom: i < entries.length - 1 ? 20 : 0,
                  }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute', left: 8, top: 4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: color, border: '3px solid #fff',
                      boxShadow: `0 0 0 2px ${color}33`,
                    }} />

                    {/* Card */}
                    <div style={{
                      background: '#F9FAFB', borderRadius: 8,
                      padding: '10px 14px', border: '1px solid #E5E7EB',
                    }}>
                      {/* Tipo + fecha */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, color,
                          background: `${color}15`, padding: '2px 8px', borderRadius: 4,
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
                          fontSize: 13, color: '#374151', marginBottom: 4,
                        }}>
                          {entry.estado_anterior && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 4,
                              background: '#FEE2E2', color: '#991B1B', fontSize: 12,
                            }}>
                              {entry.estado_anterior}
                            </span>
                          )}
                          {entry.estado_anterior && entry.estado_nuevo && (
                            <ArrowRight size={14} style={{ color: '#9CA3AF' }} />
                          )}
                          {entry.estado_nuevo && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 4,
                              background: '#D1FAE5', color: '#065F46', fontSize: 12,
                            }}>
                              {entry.estado_nuevo}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Detalles */}
                      {detallesLines.length > 0 && (
                        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                          {detallesLines.map((line, j) => (
                            <div key={j}>{line}</div>
                          ))}
                        </div>
                      )}

                      {/* Usuario + módulo */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 11, color: '#9CA3AF', marginTop: 6,
                        borderTop: '1px solid #E5E7EB', paddingTop: 6,
                      }}>
                        {entry.usuario_nombre && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <User size={11} />
                            {entry.usuario_nombre}
                          </span>
                        )}
                        {entry.modulo && (
                          <span style={{
                            background: '#F3F4F6', padding: '1px 6px', borderRadius: 3,
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
        </div>
      </div>
    </div>
  );
}
