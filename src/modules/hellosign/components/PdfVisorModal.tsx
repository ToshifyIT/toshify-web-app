// src/modules/hellosign/components/PdfVisorModal.tsx
/**
 * Visor genérico de PDF servido por nuestro backend.
 *
 * Descarga el archivo, lo pasa a un blob y lo embebe en un <iframe>. Usar un
 * blob local en vez de apuntar el iframe directo a la API permite mostrar los
 * errores de verdad (si la API devuelve JSON de error, el iframe lo pintaría
 * como texto) y evita depender del X-Frame-Options global de server.js.
 *
 * Lo usan tanto las plantillas como los documentos enviados.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, X } from 'lucide-react';

interface PdfVisorModalProps {
  /** Título que se muestra en el header del modal. */
  titulo: string;
  /** Endpoint de nuestro backend que devuelve el binario. */
  fileUrl: string;
  /** Nombre sugerido al descargar (sin extensión). */
  nombreDescarga?: string;
  onClose: () => void;
}

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

export function PdfVisorModal({
  titulo,
  fileUrl,
  nombreDescarga,
  onClose,
}: PdfVisorModalProps) {
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
        // cache: 'no-store' saltea el cache HTTP del navegador: el backend
        // responde con max-age=300 y sin esto se puede ver una versión vieja
        // del documento (p. ej. sin las firmas recién aplicadas).
        const respuesta = await fetch(fileUrl, { cache: 'no-store' });

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
  }, [fileUrl]);

  const abrirEnPestana = () => {
    if (blobUrl) window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const descargar = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = aNombreArchivo(nombreDescarga ?? titulo);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hs-visor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header hs-visor-header">
          <h2>{titulo || 'Documento'}</h2>

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
              title={`Documento: ${titulo}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
