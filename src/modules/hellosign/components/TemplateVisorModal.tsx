// src/modules/hellosign/components/TemplateVisorModal.tsx
/**
 * Visor del documento de una plantilla de Dropbox Sign.
 *
 * Descarga el PDF por el backend (/api/hellosign/templates/:id/file), lo pasa a
 * un blob y lo embebe en un <iframe>. Usar un blob local en vez de apuntar el
 * iframe directo a la API permite mostrar errores de verdad (si la API devuelve
 * JSON de error, el iframe lo pintaría como texto) y evita depender de los
 * headers X-Frame-Options que server.js aplica globalmente.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, X } from 'lucide-react';
import type { HelloSignTemplate } from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';

interface TemplateVisorModalProps {
  template: HelloSignTemplate;
  onClose: () => void;
}

/** Nombre de archivo amigable a partir del título de la plantilla. */
function nombreArchivo(template: HelloSignTemplate): string {
  const base = (template.title || 'plantilla')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'plantilla'}.pdf`;
}

export function TemplateVisorModal({ template, onClose }: TemplateVisorModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    let urlCreada: string | null = null;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const respuesta = await fetch(
          hellosignService.getTemplateFileUrl(template.template_id),
        );

        if (!respuesta.ok) {
          const payload = await respuesta.json().catch(() => null);
          throw new Error(
            (payload as { error?: string } | null)?.error ??
              `No se pudo cargar el documento (HTTP ${respuesta.status})`,
          );
        }

        const blob = await respuesta.blob();
        if (cancelado) return;

        urlCreada = URL.createObjectURL(blob);
        setBlobUrl(urlCreada);
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
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, [template.template_id]);

  const abrirEnPestana = () => {
    if (blobUrl) window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const descargar = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = nombreArchivo(template);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content hs-visor-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header hs-visor-header">
          <h2>{template.title || 'Documento'}</h2>

          <div className="hs-visor-acciones">
            <button
              className="btn-secondary"
              onClick={abrirEnPestana}
              disabled={!blobUrl}
              title="Abrir el PDF en una pestaña nueva"
            >
              <ExternalLink size={15} />
              Abrir
            </button>
            <button
              className="btn-secondary"
              onClick={descargar}
              disabled={!blobUrl}
              title="Descargar el PDF"
            >
              <Download size={15} />
              Descargar
            </button>
          </div>

          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body hs-visor-body">
          {loading && (
            <div className="hs-visor-estado">
              <Loader2 size={22} className="hs-spin" />
              <span>Cargando documento desde Dropbox Sign...</span>
            </div>
          )}

          {error && !loading && (
            <div className="hs-visor-estado hs-visor-estado-error">
              <AlertTriangle size={22} />
              <span>{error}</span>
            </div>
          )}

          {blobUrl && !loading && !error && (
            <iframe
              className="hs-visor-frame"
              src={blobUrl}
              title={`Documento de ${template.title || 'la plantilla'}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
