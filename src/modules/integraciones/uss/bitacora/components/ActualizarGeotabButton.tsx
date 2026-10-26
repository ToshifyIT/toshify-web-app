// Botón "Actualizar desde Geotab" de la Bitácora: vuelve a leer de Geotab la semana
// visible (viajes y turnos) con las correcciones que hayan hecho allá. El pedido lo
// procesa un cron del servidor (ver hooks/useGeotabResync.ts y
// sql/geotab_resync_semana.sql). Solo aparece en semanas con el período abierto.

import { useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../../../../../contexts/AuthContext';
import { showError, showSuccess } from '../../../../../utils/toast';
import { useGeotabResync, type ResyncPedido } from '../hooks/useGeotabResync';

interface ActualizarGeotabButtonProps {
  sedeId: string | null;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  /** Se llama al terminar la actualización para recargar la grilla. */
  onActualizado: () => void;
}

const fmtKm = (v?: number) => (v ?? 0).toLocaleString('es-AR');

export function ActualizarGeotabButton({
  sedeId, startDate, endDate, isLoading, onActualizado,
}: ActualizarGeotabButtonProps) {
  const { user, profile } = useAuth();
  const userName = (profile as { full_name?: string } | null)?.full_name || user?.email || 'admin';

  const onTerminado = useCallback((p: ResyncPedido) => {
    onActualizado();
    const r = p.resumen || {};
    const conductores = (r.conductores_afectados || []).slice(0, 10);
    Swal.fire({
      icon: 'success',
      title: 'Semana actualizada desde Geotab',
      html: `
        <div style="text-align:left;font-size:13px;line-height:1.6">
          Viajes de la semana: <b>${r.viajes_antes ?? '-'}</b> → <b>${r.viajes_despues ?? '-'}</b>
          (nuevos: ${r.viajes_nuevos ?? 0}, duplicados borrados: ${r.duplicados_borrados ?? 0})<br>
          Km de la semana: <b>${fmtKm(r.km_antes)}</b> → <b>${fmtKm(r.km_despues)}</b><br>
          Turnos actualizados: <b>${r.turnos_guardados ?? 0}</b><br>
          Viajes que cambiaron de conductor: <b>${r.viajes_cambio_conductor ?? 0}</b>
          (${fmtKm(r.km_reasignados)} km)
          ${conductores.length ? `<br><span style="color:var(--text-secondary)">Conductores afectados: ${conductores.join(', ')}</span>` : ''}
        </div>`,
    });
  }, [onActualizado]);

  const onError = useCallback((p: ResyncPedido) => {
    showError('No se pudo actualizar desde Geotab', p.error || 'Error desconocido');
  }, []);

  const resync = useGeotabResync(sedeId, startDate, endDate, onTerminado, onError);

  const handleClick = useCallback(async () => {
    if (!resync.semana) return;
    const confirm = await Swal.fire({
      icon: 'question',
      title: `Actualizar semana ${resync.semana.semana} desde Geotab`,
      html: `
        <div style="text-align:left;font-size:13px;line-height:1.6">
          Se vuelven a leer de Geotab todos los viajes y turnos de la semana
          (lunes a domingo) de esta sede, con las correcciones que hayan hecho allá
          (conductor de cada viaje, viajes reemitidos). Tarda 1 a 3 minutos.
          <br><br>Si ya se crearon incidencias de exceso de km de esta semana, el monto
          cargado puede dejar de coincidir con los km nuevos.
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
    });
    if (!confirm.isConfirmed) return;
    try {
      await resync.solicitar(userName);
      showSuccess('Actualización pedida', 'Se está leyendo la semana desde Geotab.');
    } catch (err) {
      console.error('Error pidiendo la actualización desde Geotab:', err);
      showError('No se pudo pedir la actualización', err instanceof Error ? err.message : String(err));
    }
  }, [resync, userName]);

  if (!resync.disponible) return null;

  const bloqueado = resync.enCurso || isLoading;
  const ultima = resync.pedido?.estado === 'terminado' && resync.pedido.terminado_at
    ? `Última actualización: ${new Date(resync.pedido.terminado_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
      + (resync.pedido.solicitado_por_nombre ? ` (${resync.pedido.solicitado_por_nombre})` : '')
    : 'Volver a leer esta semana desde Geotab';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={bloqueado}
      title={ultima}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', fontSize: 13, fontWeight: 500,
        border: '1px solid var(--border-primary)', borderRadius: 8,
        background: 'var(--bg-primary)', color: 'var(--text-primary)',
        cursor: bloqueado ? 'not-allowed' : 'pointer',
        opacity: bloqueado ? 0.7 : 1, whiteSpace: 'nowrap',
      }}
    >
      <RefreshCw size={14} className={resync.enCurso ? 'animate-spin' : undefined} />
      {resync.enCurso ? 'Actualizando desde Geotab…' : 'Actualizar desde Geotab'}
    </button>
  );
}
