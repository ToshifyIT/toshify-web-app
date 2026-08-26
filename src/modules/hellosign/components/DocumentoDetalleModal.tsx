// src/modules/hellosign/components/DocumentoDetalleModal.tsx
/**
 * Detalle de una solicitud de firma: estado por firmante, cuándo lo vio, cuándo
 * firmó y cuándo se le mandó el último recordatorio, con la opción de recordarle.
 *
 * Mostrar `last_reminded_at` es a propósito: sin ese dato es fácil mandar tres
 * recordatorios seguidos a la misma persona sin darse cuenta.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock, Loader2, X, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import type { SignatureRequest, SignatureRequestSignature } from '../types/hellosign.types';
import { formatFechaHelloSign, hellosignService } from '../hellosignService';

interface DocumentoDetalleModalProps {
  documento: SignatureRequest;
  onClose: () => void;
  /** Para refrescar el listado cuando se manda un recordatorio. */
  onActualizado: () => void;
}

/** Estado visual de un firmante a partir del status_code de la API. */
function estadoFirmante(firma: SignatureRequestSignature): {
  label: string;
  clase: string;
  icono: React.ReactNode;
} {
  switch (firma.status_code) {
    case 'signed':
      return {
        label: 'Firmado',
        clase: 'hs-badge-green',
        icono: <CheckCircle2 size={14} />,
      };
    case 'declined':
      return { label: 'Rechazado', clase: 'hs-badge-red', icono: <XCircle size={14} /> };
    case 'error_unknown':
    case 'error_file':
    case 'error_component_position':
    case 'error_text_tag':
      return { label: 'Error', clase: 'hs-badge-red', icono: <AlertTriangle size={14} /> };
    case 'on_hold':
      return { label: 'En espera', clase: 'hs-badge-gray', icono: <Clock size={14} /> };
    default:
      return {
        label: 'Pendiente',
        clase: 'hs-badge-yellow',
        icono: <Clock size={14} />,
      };
  }
}

export function DocumentoDetalleModal({
  documento,
  onClose,
  onActualizado,
}: DocumentoDetalleModalProps) {
  const [detalle, setDetalle] = useState<SignatureRequest>(documento);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordando, setRecordando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await hellosignService.getSignatureRequest(
          documento.signature_request_id,
        );
        if (!cancelado && data) setDetalle(data);
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle');
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void cargar();
    return () => {
      cancelado = true;
    };
  }, [documento.signature_request_id]);

  const handleRecordar = async (firma: SignatureRequestSignature) => {
    const email = firma.signer_email_address;
    if (!email) return;

    const confirmacion = await Swal.fire({
      title: 'Enviar recordatorio',
      html: `Se le va a reenviar el mail de firma a <b>${email}</b>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)',
    });
    if (!confirmacion.isConfirmed) return;

    setRecordando(email);
    try {
      await hellosignService.remindSignatureRequest(
        detalle.signature_request_id,
        email,
        firma.signer_name ?? undefined,
      );
      showSuccess('Recordatorio enviado', email);

      const actualizado = await hellosignService.getSignatureRequest(
        detalle.signature_request_id,
      );
      if (actualizado) setDetalle(actualizado);
      onActualizado();
    } catch (err) {
      void Swal.fire(
        'Error',
        err instanceof Error ? err.message : 'No se pudo enviar el recordatorio',
        'error',
      );
    } finally {
      setRecordando(null);
    }
  };

  const firmas = detalle.signatures ?? [];
  const cerrado = Boolean(detalle.is_complete || detalle.is_declined);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{detalle.title || 'Solicitud de firma'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="hs-modal-loading">
              <Loader2 size={18} className="hs-spin" />
              <span>Cargando detalle...</span>
            </div>
          )}

          {error && (
            <div className="hs-alert hs-alert-error">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Asunto</span>
              <span className="detail-value">{detalle.subject || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Enviada</span>
              <span className="detail-value">
                {formatFechaHelloSign(detalle.created_at)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Solicitante</span>
              <span className="detail-value">
                {detalle.requester_email_address || '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">ID</span>
              <span className="detail-value hs-mono">
                {detalle.signature_request_id}
              </span>
            </div>
          </div>

          {detalle.test_mode && (
            <div className="hs-alert hs-alert-warn">
              <AlertTriangle size={15} />
              <span>
                Enviada en <b>modo prueba</b>: no tiene validez legal.
              </span>
            </div>
          )}

          <h3 className="section-title">Firmantes ({firmas.length})</h3>

          {firmas.length === 0 && !loading && (
            <p className="hs-empty-inline">Esta solicitud no tiene firmantes.</p>
          )}

          <ul className="hs-firmante-list">
            {firmas.map((firma) => {
              const estado = estadoFirmante(firma);
              const puedeRecordar =
                !cerrado && firma.status_code !== 'signed' && firma.status_code !== 'declined';

              return (
                <li key={firma.signature_id} className="hs-firmante-item">
                  <div className="hs-firmante-datos">
                    <span className="hs-firmante-nombre">
                      {firma.signer_name || firma.signer_email_address || 'Sin nombre'}
                      {firma.signer_role && (
                        <span className="hs-badge hs-badge-blue">{firma.signer_role}</span>
                      )}
                    </span>
                    <span className="hs-firmante-email">{firma.signer_email_address}</span>

                    <span className="hs-firmante-meta">
                      {firma.signed_at
                        ? `Firmó el ${formatFechaHelloSign(firma.signed_at)}`
                        : firma.last_viewed_at
                          ? `Lo vio el ${formatFechaHelloSign(firma.last_viewed_at)}`
                          : 'Todavía no lo abrió'}
                      {firma.last_reminded_at
                        ? ` · Último recordatorio: ${formatFechaHelloSign(firma.last_reminded_at)}`
                        : ''}
                    </span>

                    {firma.decline_reason && (
                      <span className="hs-firmante-meta">
                        Motivo del rechazo: {firma.decline_reason}
                      </span>
                    )}
                  </div>

                  <div className="hs-firmante-acciones">
                    <span className={`hs-badge ${estado.clase}`}>
                      {estado.icono}
                      {estado.label}
                    </span>

                    {puedeRecordar && (
                      <button
                        className="btn-secondary hs-btn-mini"
                        onClick={() => void handleRecordar(firma)}
                        disabled={recordando === firma.signer_email_address}
                        title="Reenviar el mail de firma"
                      >
                        {recordando === firma.signer_email_address ? (
                          <Loader2 size={13} className="hs-spin" />
                        ) : (
                          <Bell size={13} />
                        )}
                        Recordar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
