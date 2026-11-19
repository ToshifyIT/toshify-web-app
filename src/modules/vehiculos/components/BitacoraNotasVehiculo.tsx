import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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

/**
 * Entrada que no es una nota escrita (p. ej. una llamada de 2Chat): se muestra mezclada
 * con las notas por fecha, pero no se guarda en la tabla de la bitácora.
 */
export interface EntradaBitacora {
  id: string;
  fecha: string;
  autor: string;
  icono?: ReactNode;
  contenido: ReactNode;
}

/** Cuántas notas se muestran antes de "Ver todas" */
const NOTAS_VISIBLES = 5;

interface BitacoraNotasVehiculoProps {
  vehiculoId: string;
  /** Si puede agregar notas (permiso de editar vehículos) */
  canAdd: boolean;
  /** Nota del campo viejo, para mostrar si la bitácora todavía no existe */
  notaAnterior?: string | null;
  /**
   * Otra bitácora con la misma forma (p. ej. la de cobranza de conductores,
   * sql/conductores_notas_cobranza.sql). Por defecto, la de vehículos.
   */
  config?: {
    tabla: string;
    columnaId: string;
    titulo: string;
    sqlArchivo: string;
    /** Texto de cada origen distinto de 'app' (p. ej. 'carga_inicial') */
    etiquetaOrigen?: Record<string, string>;
  };
  /** Otras entradas para mezclar con las notas (ya cargadas por quien usa la bitácora) */
  extras?: EntradaBitacora[];
  /** Se agregó una nota (p. ej. para rehacer el resumen de seguimiento) */
  onNotaAgregada?: () => void;
  /** Contenido entre el título y el cuadro de nueva nota (p. ej. un resumen) */
  encabezado?: ReactNode;
}

const CONFIG_VEHICULO = {
  tabla: 'vehiculos_notas',
  columnaId: 'vehiculo_id',
  titulo: 'Bitácora de notas',
  sqlArchivo: 'sql/vehiculos_notas.sql',
  etiquetaOrigen: { nota_anterior: 'Nota anterior a la bitácora' } as Record<string, string>,
};

/**
 * Bitácora de notas del vehículo (sql/vehiculos_notas.sql): cada nota queda con
 * fecha y autor; solo se agregan, no se editan ni se borran.
 */
export function BitacoraNotasVehiculo({ vehiculoId, canAdd, notaAnterior, config = CONFIG_VEHICULO, extras, onNotaAgregada, encabezado }: BitacoraNotasVehiculoProps) {
  const [notas, setNotas] = useState<NotaVehiculo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [nuevaNota, setNuevaNota] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = async () => {
    const { data, error } = await (supabase.from(config.tabla) as any)
      .select('id, nota, created_at, usuario_nombre, origen')
      .eq(config.columnaId, vehiculoId)
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
      const { error } = await (supabase.from(config.tabla) as any)
        .insert({ [config.columnaId]: vehiculoId, nota: texto, created_by: user?.id });
      if (error) throw error;
      setNuevaNota('');
      setNotas(await cargar());
      showSuccess('Nota agregada');
      onNotaAgregada?.();
    } catch (error) {
      console.error('No se pudo agregar la nota:', error);
      showError('No se pudo agregar la nota');
    } finally {
      setIsSaving(false);
    }
  };

  type Item = { key: string; fecha: string; autor: string; icono?: ReactNode; contenido: ReactNode };
  const items: Item[] = [
    ...notas.map(n => ({
      key: `n${n.id}`,
      fecha: n.created_at,
      autor: n.origen !== 'app' && config.etiquetaOrigen?.[n.origen]
        ? config.etiquetaOrigen[n.origen]
        : n.usuario_nombre || 'Sin usuario',
      contenido: n.nota as ReactNode,
    })),
    ...(extras || []).map(e => ({ key: `e${e.id}`, fecha: e.fecha, autor: e.autor, icono: e.icono, contenido: e.contenido })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="bnv">
      <div className="section-title">
        {config.titulo}
        {!isLoading && !hasError && items.length > 0 && (
          <span className="bnv-contador">({items.length})</span>
        )}
      </div>

      {encabezado}

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
            La bitácora todavía no está activa: falta correr {config.sqlArchivo}.
          </p>
        </>
      ) : items.length === 0 ? (
        <p className="bnv-vacia">Sin notas todavía.</p>
      ) : (
        <>
        <ul className={`bnv-lista${verTodas ? ' bnv-lista--todas' : ''}`}>
          {(verTodas ? items : items.slice(0, NOTAS_VISIBLES)).map(n => (
            <li key={n.key} className="bnv-item">
              <div className="bnv-meta">
                {n.icono}
                <span className="bnv-fecha">{formatDateTimeAR(n.fecha)}</span>
                <span>{n.autor}</span>
              </div>
              <div className="bnv-texto">{n.contenido}</div>
            </li>
          ))}
        </ul>
        {items.length > NOTAS_VISIBLES && (
          <button type="button" className="bnv-ver-todas" onClick={() => setVerTodas(v => !v)}>
            {verTodas ? 'Ver solo las últimas' : `Ver todas (${items.length})`}
          </button>
        )}
        </>
      )}
    </div>
  );
}
