// src/modules/hellosign/components/ReemplazarDocumentoModal.tsx
/**
 * "Reemplazar documento": sube un archivo nuevo conservando los campos ya
 * ubicados en la plantilla actual (template/update_files).
 *
 * Cómo funciona realmente la API, que condiciona todo este flujo:
 *  - NO reemplaza in-place: crea OTRA plantilla con los campos calcados y deja
 *    la original intacta. Para que "Reemplazar" no mienta, al final borramos la
 *    original con template/delete.
 *  - Es asincrónica: el 200 OK solo dice que pasó la validación inicial. Por eso
 *    hacemos polling del template_id nuevo antes de dar nada por hecho.
 *  - El documento nuevo debe tener igual o mayor cantidad de páginas y la misma
 *    orientación. Si no, Dropbox Sign falla después, por callback.
 *
 * REGLA DE SEGURIDAD: la plantilla original se borra ÚNICAMENTE si pudimos
 * confirmar que la nueva existe. Ante cualquier duda, no se borra nada.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader2, Replace, Upload, X } from 'lucide-react';
import { showSuccess } from '../../../utils/toast';
import type { HelloSignTemplate } from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';

interface ReemplazarDocumentoModalProps {
  template: HelloSignTemplate;
  clientId: string | null;
  onClose: () => void;
  /** Se dispara cuando el listado debe refrescarse. */
  onReemplazada: () => void;
}

const EXTENSIONES = '.pdf,.doc,.docx';
const MAX_MB = 20;

/** Polling: cada cuánto y por cuánto tiempo esperamos a que Dropbox Sign termine. */
const POLL_INTERVALO_MS = 5000;
const POLL_INTENTOS = 24; // ~2 minutos

type Fase = 'formulario' | 'subiendo' | 'esperando' | 'borrando' | 'timeout';

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ReemplazarDocumentoModal({
  template,
  clientId,
  onClose,
  onReemplazada,
}: ReemplazarDocumentoModalProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [testMode, setTestMode] = useState(true);

  const [fase, setFase] = useState<Fase>('formulario');
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);

  const cancelado = useRef(false);

  useEffect(() => {
    cancelado.current = false;
    return () => {
      cancelado.current = true;
    };
  }, []);

  const enProceso = fase === 'subiendo' || fase === 'esperando' || fase === 'borrando';

  const handleReemplazar = async () => {
    if (!archivo) {
      setError('Elegí el documento nuevo.');
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_MB} MB.`);
      return;
    }

    setError(null);
    setAvisoParcial(null);
    setFase('subiendo');

    let nuevoId: string | null = null;

    try {
      const form = new FormData();
      if (clientId) form.append('client_id', clientId);
      form.append('files[0]', archivo, archivo.name);
      form.append('test_mode', JSON.stringify(testMode));
      if (asunto.trim()) form.append('subject', asunto.trim());
      if (mensaje.trim()) form.append('message', mensaje.trim());

      const { template: creada } = await hellosignService.updateTemplateFiles(
        template.template_id,
        form,
      );

      nuevoId = creada?.template_id ?? null;
      if (!nuevoId) {
        throw new Error('Dropbox Sign no devolvió el ID de la plantilla nueva.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento');
      setFase('formulario');
      return;
    }

    // Polling: la creación es asincrónica, así que esperamos a verla existir.
    setFase('esperando');
    let confirmada = false;

    for (let i = 1; i <= POLL_INTENTOS; i += 1) {
      if (cancelado.current) return;
      setIntento(i);
      await espera(POLL_INTERVALO_MS);
      if (cancelado.current) return;

      try {
        const nueva = await hellosignService.getTemplate(nuevoId);
        if (nueva?.template_id) {
          confirmada = true;
          break;
        }
      } catch {
        // Mientras procesa puede responder 404/409: seguimos intentando.
      }
    }

    if (!confirmada) {
      // No confirmamos nada: por seguridad NO se toca la plantilla original.
      setFase('timeout');
      return;
    }

    // Recién ahora borramos la original.
    setFase('borrando');
    try {
      await hellosignService.deleteTemplate(template.template_id);
      showSuccess('Documento reemplazado', 'Los campos se copiaron a la versión nueva.');
    } catch (err) {
      setAvisoParcial(
        'La plantilla nueva se creó bien, pero no se pudo borrar la anterior: ' +
          (err instanceof Error ? err.message : 'error desconocido') +
          '. Vas a ver las dos en el listado.',
      );
      onReemplazada();
      return;
    }

    onReemplazada();
    onClose();
  };

  const mensajeFase =
    fase === 'subiendo'
      ? 'Subiendo el documento...'
      : fase === 'esperando'
        ? `Dropbox Sign está copiando los campos al documento nuevo... (${intento}/${POLL_INTENTOS})`
        : fase === 'borrando'
          ? 'Quitando la plantilla anterior...'
          : '';

  return (
    <div className="modal-overlay" onClick={enProceso ? undefined : onClose}>
      <div className="modal-content hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reemplazar documento</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={enProceso}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="hs-alert hs-alert-error">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          {avisoParcial && (
            <div className="hs-alert hs-alert-error">
              <AlertTriangle size={15} />
              <span>{avisoParcial}</span>
            </div>
          )}

          {fase === 'timeout' ? (
            <div className="hs-alert hs-alert-warn">
              <AlertTriangle size={15} />
              <span>
                Dropbox Sign sigue procesando el documento. <b>No se borró</b> la
                plantilla anterior. Esperá unos minutos y tocá “Sincronizar”: si la
                versión nueva aparece, borrá la vieja a mano. Si nunca aparece, suele ser
                porque el documento tiene menos páginas o distinta orientación que el
                original.
              </span>
            </div>
          ) : (
            <>
              <div className="hs-alert hs-alert-info">
                <Info size={15} />
                <span>
                  Se conservan los campos de <b>{template.title}</b> y sus roles (
                  {(template.signer_roles ?? []).map((r) => r.name).join(', ') || 'sin roles'}
                  ). El documento nuevo debe tener <b>igual o más páginas</b> y la{' '}
                  <b>misma orientación</b>. Al terminar, la plantilla anterior se elimina.
                </span>
              </div>

              <h3 className="section-title">Documento nuevo</h3>
              <label className="hs-file-drop">
                <input
                  type="file"
                  accept={EXTENSIONES}
                  disabled={enProceso}
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                />
                <Upload size={18} />
                <span>
                  {archivo
                    ? `${archivo.name} · ${(archivo.size / 1024 / 1024).toFixed(2)} MB`
                    : `Elegí un PDF o Word (máx. ${MAX_MB} MB)`}
                </span>
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="hs-rep-asunto">Nuevo asunto por defecto</label>
                  <input
                    id="hs-rep-asunto"
                    type="text"
                    value={asunto}
                    disabled={enProceso}
                    onChange={(e) => setAsunto(e.target.value)}
                    placeholder="Opcional — se mantiene el actual si lo dejás vacío"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="hs-rep-mensaje">Nuevo mensaje por defecto</label>
                  <textarea
                    id="hs-rep-mensaje"
                    rows={2}
                    value={mensaje}
                    disabled={enProceso}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <label className="form-checkbox-label hs-testmode">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={testMode}
                  disabled={enProceso}
                  onChange={(e) => setTestMode(e.target.checked)}
                />
                <span>
                  Modo prueba (<code>test_mode</code>)
                </span>
              </label>

              {enProceso && (
                <div className="hs-proceso">
                  <Loader2 size={18} className="hs-spin" />
                  <span>{mensajeFase}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={enProceso}>
            {fase === 'timeout' ? 'Cerrar' : 'Cancelar'}
          </button>
          {fase !== 'timeout' && (
            <button
              className="btn-primary"
              onClick={handleReemplazar}
              disabled={enProceso || !archivo}
            >
              {enProceso ? (
                <Loader2 size={15} className="hs-spin" />
              ) : (
                <Replace size={15} />
              )}
              {enProceso ? 'Procesando...' : 'Reemplazar documento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
