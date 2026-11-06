import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatDateTimeAR } from '../../../utils/dateUtils';
import { showError, showSuccess } from '../../../utils/toast';
import { Spinner } from '../../../components/ui/LoadingOverlay';
import './BitacoraNotasVehiculo.css';

interface NotaVehiculo {
  id: number;
  nota: string;
  created_at: string;
  usuario_nombre: string | null;
  origen: string;
}

/** Cuántas notas se muestran antes de "Ver todas" */
const NOTAS_VISIBLES = 5;

interface BitacoraNotasVehiculoProps {
  vehiculoId: string;
  /** Si puede agregar notas (permiso de editar vehículos) */
  canAdd: boolean;
  /** Nota del campo viejo, para mostrar si la bitácora todavía no existe */
  notaAnterior?: string | null;
}

/**
 * Bitácora de notas del vehículo (sql/vehiculos_notas.sql): cada nota queda con
 * fecha y autor; solo se agregan, no se editan ni se borran.
 */
export function BitacoraNotasVehiculo({ vehiculoId, canAdd, notaAnterior }: BitacoraNotasVehiculoProps) {
  const [notas, setNotas] = useState<NotaVehiculo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [nuevaNota, setNuevaNota] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = async () => {
    const { data, error } = await (supabase.from('vehiculos_notas') as any)
      .select('id, nota, created_at, usuario_nombre, origen')
      .eq('vehiculo_id', vehiculoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as NotaVehiculo[];
  };

  useEffect(() => {
    let cancelado = false;
    setIsLoading(true);
    setHasError(false);
    cargar()
      .then(data => { if (!cancelado) setNotas(data); })
      .catch(error => {
        console.error('No se pudo cargar la bitácora de notas:', error);
        if (!cancelado) setHasError(true);
      })
      .finally(() => { if (!cancelado) setIsLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculoId]);

  const agregar = async () => {
    const texto = nuevaNota.trim();
    if (!texto) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase.from('vehiculos_notas') as any)
        .insert({ vehiculo_id: vehiculoId, nota: texto, created_by: user?.id });
      if (error) throw error;
      setNuevaNota('');
      setNotas(await cargar());
      showSuccess('Nota agregada');
    } catch (error) {
      console.error('No se pudo agregar la nota:', error);
      showError('No se pudo agregar la nota');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bnv">
      <div className="section-title">
        Bitácora de notas
        {!isLoading && !hasError && notas.length > 0 && (
          <span className="bnv-contador">({notas.length})</span>
        )}
      </div>

      {canAdd && !hasError && (
        <div className="bnv-nueva">
          <textarea
            className="form-input"
            rows={2}
            value={nuevaNota}
            onChange={(e) => setNuevaNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) agregar();
            }}
            placeholder="Nueva nota (queda con la fecha y tu nombre). Ctrl/Cmd + Enter para agregar"
            disabled={isSaving}
          />
          <button
            type="button"
            className="btn-primary btn-sm bnv-agregar"
            onClick={agregar}
            disabled={isSaving || !nuevaNota.trim()}
          >
            {isSaving ? <Loader2 size={14} className="spin-animation" /> : <Plus size={14} />}
            Agregar
          </button>
        </div>
      )}

      {isLoading ? (
        <Spinner size="sm" message="Cargando notas..." />
      ) : hasError ? (
        <>
          {notaAnterior && <div className="bnv-texto bnv-suelta">{notaAnterior}</div>}
          <p className="bnv-aviso">
            La bitácora todavía no está activa: falta correr sql/vehiculos_notas.sql.
          </p>
        </>
      ) : notas.length === 0 ? (
        <p className="bnv-vacia">Sin notas todavía.</p>
      ) : (
        <>
        <ul className={`bnv-lista${verTodas ? ' bnv-lista--todas' : ''}`}>
          {(verTodas ? notas : notas.slice(0, NOTAS_VISIBLES)).map(n => (
            <li key={n.id} className="bnv-item">
              <div className="bnv-meta">
                <span className="bnv-fecha">{formatDateTimeAR(n.created_at)}</span>
                <span>
                  {n.origen === 'nota_anterior'
                    ? 'Nota anterior a la bitácora'
                    : n.usuario_nombre || 'Sin usuario'}
                </span>
              </div>
              <div className="bnv-texto">{n.nota}</div>
            </li>
          ))}
        </ul>
        {notas.length > NOTAS_VISIBLES && (
          <button type="button" className="bnv-ver-todas" onClick={() => setVerTodas(v => !v)}>
            {verTodas ? 'Ver solo las últimas' : `Ver todas (${notas.length})`}
          </button>
        )}
        </>
      )}
    </div>
  );
}
