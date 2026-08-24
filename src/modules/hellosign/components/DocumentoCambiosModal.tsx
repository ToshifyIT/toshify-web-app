// src/modules/hellosign/components/DocumentoCambiosModal.tsx
/**
 * "Ver cambios del documento": compara el estado del documento enviado.
 *
 *  - Pestaña "Documento actual": el PDF servido por signature_request/files,
 *    que Dropbox Sign va actualizando a medida que la gente firma (las firmas
 *    quedan "quemadas" en el archivo). Siempre se baja fresco (cache no-store).
 *  - Pestaña "Original (plantilla)": el PDF de la plantilla usada en el envío,
 *    tal como estaba antes de cualquier firma. Solo disponible si la solicitud
 *    salió de una plantilla (template_ids).
 *
 * Al costado se muestra la línea de tiempo real del documento: cuándo se envió
 * y qué hizo cada firmante (visto / firmado / rechazado, con fecha).
 *
 * Limitación de la API: Dropbox Sign NO guarda versiones intermedias del
 * archivo; expone el original (vía plantilla) y el estado actual. La línea de
 * tiempo cubre el "cómo fue cambiando" con las fechas de cada firma.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileClock,
  FileText,
  Loader2,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import type {
  SignatureRequest,
  SignatureRequestSignature,
} from '../types/hellosign.types';
import { formatFechaHelloSign, hellosignService } from '../hellosignService';

interface DocumentoCambiosModalProps {
  documento: SignatureRequest;
  onClose: () => void;
}

type Version = 'actual' | 'original';

/** Convierte un título en un nombre de archivo usable. */
function aNombreArchivo(texto: string, fallback = 'documento'): string {
  const base = (texto || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || fallback}.pdf`;
}

function iconoFirma(firma: SignatureRequestSignature) {
  if (firma.status_code === 'signed')
    return <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />;
  if (firma.status_code === 'declined')
    return <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />;
  return <Clock size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />;
}

function textoEstadoFirma(firma: SignatureRequestSignature): string {
  if (firma.status_code === 'signed')
    return `Firmó · ${formatFechaHelloSign(firma.signed_at)}`;
  if (firma.status_code === 'declined')
    return `Rechazó${firma.decline_reason ? `: ${firma.decline_reason}` : ''}`;
  if (firma.last_viewed_at)
    return `Vio el documento · ${formatFechaHelloSign(firma.last_viewed_at)}`;
  return 'Todavía no lo abrió';
}

export function DocumentoCambiosModal({ documento, onClose }: DocumentoCambiosModalProps) {
  const templateId = documento.template_ids?.[0] ?? null;

  const [version, setVersion] = useState<Version>('actual');
  // Cache local por pestaña: cada versión se baja una sola vez por apertura.
  const [blobs, setBlobs] = useState<Partial<Record<Version, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Descarga la versión activa (si no está ya en cache local).
  useEffect(() => {
    if (blobs[version]) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const url =
          version === 'actual'
            ? hellosignService.getSignatureRequestFileUrl(documento.signature_request_id)
            : hellosignService.getTemplateFileUrl(templateId!);

        // no-store: el backend cachea 5 min y acá queremos SIEMPRE lo último.
        const respuesta = await fetch(url, { cache: 'no-store' });

        if (!respuesta.ok) {
          const payload = await respuesta.json().catch(() => null);
          const mensajeApi = (payload as { error?: string } | null)?.error ?? '';

          // La plantilla del envío puede ya no existir: pasa con los envíos de
          // "Enviar con otro documento" (la plantilla temporal se borra después
          // de enviar) y con plantillas reemplazadas o eliminadas a mano.
          if (
            version === 'original' &&
            (respuesta.status === 404 || /not found/i.test(mensajeApi))
          ) {
            throw new Error(
              'La plantilla usada en este envío ya no existe en Dropbox Sign, ' +
                'así que no se puede mostrar el documento original. Esto pasa con ' +
                'los envíos hechos con "Enviar con otro documento" (la plantilla ' +
                'temporal se elimina después de enviar) y con plantillas que fueron ' +
                'reemplazadas o eliminadas. El documento actual con las firmas sigue ' +
                'disponible en la otra pestaña.',
            );
          }

          throw new Error(
            mensajeApi || `No se pudo cargar el documento (HTTP ${respuesta.status})`,
          );
        }

        const blob = await respuesta.blob();
        if (cancelado) return;

        const blobUrl = URL.createObjectURL(blob);
        setBlobs((prev) => ({ ...prev, [version]: blobUrl }));
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el documento');
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, documento.signature_request_id, templateId]);

  // Libera los object URLs al cerrar el modal.
  useEffect(() => {
    return () => {
      Object.values(blobs).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blobActivo = blobs[version] ?? null;

  const firmasOrdenadas = useMemo(() => {
    const firmas = [...(documento.signatures ?? [])];
    // Firmados primero por fecha de firma; después el resto por orden de rol.
    return firmas.sort((a, b) => {
      const fa = a.signed_at ?? Number.MAX_SAFE_INTEGER;
      const fb = b.signed_at ?? Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [documento.signatures]);

  const abrirEnPestana = () => {
    if (blobActivo) window.open(blobActivo, '_blank', 'noopener,noreferrer');
  };

  const descargar = () => {
    if (!blobActivo) return;
    const sufijo = version === 'actual' ? 'actual' : 'original';
    const link = document.createElement('a');
    link.href = blobActivo;
    link.download = aNombreArchivo(`${documento.title || 'documento'}-${sufijo}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hs-visor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header hs-visor-header">
          <h2>
            <FileClock size={17} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Cambios · {documento.title || 'Documento'}
          </h2>

          <div className="hs-visor-acciones">
            <button
              className={version === 'actual' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setVersion('actual')}
              title="El documento como está hoy, con las firmas ya aplicadas"
            >
              <FileText size={15} />
              Documento actual
            </button>
            <button
              className="btn-secondary"
              onClick={abrirEnPestana}
              disabled={!blobActivo}
              title="Abrir el PDF en una pestaña nueva"
            >
              <ExternalLink size={15} />
              Abrir
            </button>
            <button
              className="btn-secondary"
              onClick={descargar}
              disabled={!blobActivo}
              title="Descargar esta versión del PDF"
            >
              <Download size={15} />
              Descargar
            </button>
          </div>

          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div
          className="modal-body hs-visor-body"
          style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}
        >
          {/* Línea de tiempo del documento */}
          <div
            style={{
              width: 264,
              flexShrink: 0,
              overflowY: 'auto',
              margin: '10px 0 10px 10px',
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid var(--border-color, #e5e7eb)',
              background: 'var(--bg-secondary, #f9fafb)',
              fontSize: 12,
              lineHeight: 1.45,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100% - 20px)',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: '1px solid var(--border-color, #e5e7eb)',
              }}
            >
              Línea de tiempo
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Send size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Enviado</div>
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {formatFechaHelloSign(documento.created_at)}
                </div>
              </div>
            </div>

            {firmasOrdenadas.map((firma) => (
              <div
                key={firma.signature_id}
                style={{ display: 'flex', gap: 10, marginBottom: 14 }}
              >
                <span style={{ marginTop: 1, flexShrink: 0 }}>{iconoFirma(firma)}</span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={firma.signer_email_address ?? undefined}
                  >
                    {firma.signer_name || firma.signer_email_address || 'Firmante'}
                  </div>
                  {firma.signer_role && (
                    <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {firma.signer_role}
                    </div>
                  )}
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {textoEstadoFirma(firma)}
                  </div>
                </div>
              </div>
            ))}

            {documento.is_complete && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontWeight: 600 }}>Documento completado</div>
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--border-color, #e5e7eb)',
                color: 'var(--text-tertiary)',
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              Dropbox Sign no guarda versiones intermedias del archivo: se puede ver el
              original de la plantilla y el estado actual con las firmas aplicadas.
            </div>
          </div>

          {/* Visor */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {loading && (
              <div className="hs-visor-estado" style={{ flex: 1 }}>
                <Loader2 size={22} className="hs-spin" />
                <span>
                  {version === 'actual'
                    ? 'Cargando la versión actual desde Dropbox Sign...'
                    : 'Cargando el original de la plantilla...'}
                </span>
              </div>
            )}

            {error && !loading && (
              <div className="hs-visor-estado hs-visor-estado-error" style={{ flex: 1 }}>
                <AlertTriangle size={22} />
                <span>{error}</span>
              </div>
            )}

            {blobActivo && !loading && !error && (
              <iframe
                className="hs-visor-frame"
                style={{ flex: 1 }}
                src={blobActivo}
                title={`Documento (${version}): ${documento.title ?? ''}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
