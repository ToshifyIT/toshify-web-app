// Botón "Actualizar desde Geotab" de la Bitácora: vuelve a leer de Geotab la semana
// visible (viajes y turnos) con las correcciones que hayan hecho allá. El pedido lo
// procesa un cron del servidor (ver hooks/useGeotabResync.ts y
// sql/geotab_resync_semana.sql). Al terminar, un trigger sincroniza el conductor de las
// multas de la semana (sql/sincronizar_multas_geotab.sql). Aparece en todas las semanas,
// también las de período cerrado (sql/geotab_resync_todas_semanas.sql).

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
const fmtMonto = (v?: number | null) =>
  v == null ? '-' : `$ ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

export function ActualizarGeotabButton({
  sedeId, startDate, endDate, isLoading, onActualizado,
}: ActualizarGeotabButtonProps) {
  const { user, profile } = useAuth();
  const userName = (profile as { full_name?: string } | null)?.full_name || user?.email || 'admin';

  const onTerminado = useCallback((p: ResyncPedido) => {
    onActualizado();
    const r = p.resumen || {};
    const conductores = (r.conductores_afectados || []).slice(0, 10);
    const multas = r.multas;
    const listaMultas = (multas?.detalle || []).slice(0, 10)
      .map(m => `#${m.id} ${m.patente} ${m.fecha} → ${m.conductor}${m.antes ? ` (antes: ${m.antes})` : ''}`);
    const omitidas = (multas?.omitidas_con_incidencia || []).slice(0, 10)
      .map(m => `#${m.id} ${m.patente} ${m.fecha}: cargado ${m.actual || '-'}, Geotab ${m.conductor_gps}`);
    const htmlMultas = !multas ? '' : multas.error
      ? `<br><br><b>Multas:</b> <span style="color:#dc2626">no se pudieron sincronizar (${multas.error})</span>`
      : `<br><br><b>Multas sincronizadas con el conductor de Geotab: ${multas.actualizadas ?? 0}</b>`
        + (listaMultas.length ? `<br><span style="color:var(--text-secondary)">${listaMultas.join('<br>')}</span>` : '')
        + (omitidas.length
          ? `<br><span style="color:#d97706">Con incidencia ya creada, revisar a mano (${omitidas.length}):<br>${omitidas.join('<br>')}</span>`
          : '');
    const excesos = (r.excesos_afectados || []).slice(0, 10)
      .map(e => `${e.conductor}${e.patente ? ` (${e.patente})` : ''}: ${e.km_exceso ?? '-'} km de exceso, ${fmtMonto(e.monto)}`);
    const htmlExcesos = excesos.length
      ? `<br><br><span style="color:#d97706"><b>Exceso de km ya cobrado con viajes reasignados (${r.excesos_afectados!.length}):</b>`
        + ` el cobro no se recalcula, revisar a mano.<br>${excesos.join('<br>')}</span>`
      : '';
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
          ${htmlMultas}
          ${htmlExcesos}
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
          <br><br>Después se completa el conductor de las multas de la semana con el
          viaje de Geotab, salvo las que editó una persona o que ya tienen incidencia.
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

  const bloqueado = resync.enCurso || isLoading || !resync.habilitado;
  const ultima = !resync.habilitado ? 'La semana todavía no empezó'
    : resync.pedido?.estado === 'terminado' && resync.pedido.terminado_at
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
