import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { VEHICULO_ESTADO_LABELS } from '../../../types/vehiculo.types';
import { formatDateTimeAR } from '../../../utils/dateUtils';
import { Spinner } from '../../../components/ui/LoadingOverlay';
import { EmptyState } from '../../../components/ui/EstadosVista';
import './HistorialEstadosVehiculo.css';

interface PeriodoEstado {
  id: number;
  estado_codigo: string | null;
  desde: string;
  hasta: string | null;
  motivo: string | null;
  origen: string;
  usuario_nombre: string | null;
}

interface HistorialEstadosVehiculoProps {
  vehiculoId: string;
}

const MS_DIA = 24 * 60 * 60 * 1000;

function duracionMs(p: PeriodoEstado, ahora: number): number {
  return (p.hasta ? new Date(p.hasta).getTime() : ahora) - new Date(p.desde).getTime();
}

/** "12 días", "1 día", "5 h" (menos de un día) */
function textoDuracion(ms: number): string {
  if (ms < MS_DIA) {
    const horas = Math.max(0, Math.round(ms / (60 * 60 * 1000)));
    return `${horas} h`;
  }
  const dias = Math.floor(ms / MS_DIA);
  return dias === 1 ? '1 día' : `${dias} días`;
}

function etiquetaEstado(codigo: string | null): string {
  if (!codigo) return 'Sin estado';
  return VEHICULO_ESTADO_LABELS[codigo] || codigo;
}

/**
 * Historial de estados del vehículo por períodos (sql/vehiculos_estado_historial.sql):
 * desde, hasta, cuánto duró, motivo y quién lo cambió.
 */
export function HistorialEstadosVehiculo({ vehiculoId }: HistorialEstadosVehiculoProps) {
  const [periodos, setPeriodos] = useState<PeriodoEstado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [ahora] = useState(() => Date.now());

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const { data, error } = await (supabase.from('vehiculos_estado_historial') as any)
          .select('id, estado_codigo, desde, hasta, motivo, origen, usuario_nombre')
          .eq('vehiculo_id', vehiculoId)
          .order('desde', { ascending: false });
        if (error) throw error;
        if (!cancelado) setPeriodos(data || []);
      } catch (error) {
        console.error('No se pudo cargar el historial de estados:', error);
        if (!cancelado) setHasError(true);
      } finally {
        if (!cancelado) setIsLoading(false);
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [vehiculoId]);

  // Tiempo total en cada estado (solo períodos con fecha de inicio real)
  const totales = useMemo(() => {
    const porEstado = new Map<string, number>();
    for (const p of periodos) {
      if (p.origen === 'inicio_registro') continue;
      const clave = p.estado_codigo || '';
      porEstado.set(clave, (porEstado.get(clave) || 0) + duracionMs(p, ahora));
    }
    return [...porEstado.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodos, ahora]);

  if (isLoading) return <Spinner size="sm" message="Cargando historial de estados..." />;
  if (hasError) {
    return (
      <EmptyState
        size="sm"
        title="No se pudo cargar el historial de estados"
        description="Si es la primera vez, falta correr sql/vehiculos_estado_historial.sql."
      />
    );
  }
  if (periodos.length === 0) return <EmptyState size="sm" title="Sin cambios de estado registrados" />;

  return (
    <div className="hev">
      {totales.length > 0 && (
        <>
          <div className="section-title">Tiempo en cada estado</div>
          <div className="hev-totales">
            {totales.map(([codigo, ms]) => (
              <span key={codigo} className="hev-total">
                {etiquetaEstado(codigo || null)}
                <strong>{textoDuracion(ms)}</strong>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Períodos</div>
      <div className="hev-tabla-wrap">
        <table className="hev-tabla">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Duración</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {periodos.map(p => {
              const sinInicio = p.origen === 'inicio_registro';
              return (
                <tr key={p.id} className={p.hasta ? '' : 'hev-actual'}>
                  <td className="hev-estado">{etiquetaEstado(p.estado_codigo)}</td>
                  <td>{sinInicio ? 'Antes del registro' : formatDateTimeAR(p.desde)}</td>
                  <td>{p.hasta ? formatDateTimeAR(p.hasta) : <span className="hev-hoy">Hoy (actual)</span>}</td>
                  <td>{sinInicio ? '—' : textoDuracion(duracionMs(p, ahora))}</td>
                  <td>
                    <div>
                      {p.motivo || (
                        <span className="hev-sin-motivo">
                          {p.origen === 'trigger' ? 'Sin motivo' : 'Sin motivo (registro anterior)'}
                        </span>
                      )}
                    </div>
                    {p.usuario_nombre && <div className="hev-usuario">Por {p.usuario_nombre}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hev-nota">
        Desde el 06/11/2026 se registran todos los cambios. Lo anterior se reconstruyó con el
        historial que había (desde 25/02/2026) y puede tener huecos.
      </p>
    </div>
  );
}
