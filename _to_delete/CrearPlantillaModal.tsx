// src/modules/hellosign/components/CrearPlantillaModal.tsx
/**
 * Alta de plantillas de Dropbox Sign desde Toshify, en dos pasos:
 *
 *  1. Formulario: documento base + título + roles de firma/CC.
 *     Se manda al backend, que llama a template/create_embedded_draft.
 *  2. Editor embebido: con el `edit_url` que devuelve la API se abre el editor
 *     de Dropbox Sign dentro de un iframe, donde se arrastran los campos.
 *
 * Al terminar (evento `createTemplate`) la plantilla ya queda en la cuenta y el
 * listado se refresca solo.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { showSuccess } from '../../../utils/toast';
import { hellosignService } from '../hellosignService';
import {
  HELLOSIGN_EVENTS,
  cargarHelloSignEmbedded,
  type HelloSignClient,
} from '../helloSignEmbedded';

interface CrearPlantillaModalProps {
  /** client_id de la app de Dropbox Sign (viene de /api/hellosign/status). */
  clientId: string | null;
  onClose: () => void;
  /** Se dispara cuando la plantilla quedó creada, para refrescar el listado. */
  onCreada: () => void;
}

const EXTENSIONES = '.pdf,.doc,.docx';
const MAX_MB = 20;

export function CrearPlantillaModal({
  clientId,
  onClose,
  onCreada,
}: CrearPlantillaModalProps) {
  const [paso, setPaso] = useState<'formulario' | 'editor'>('formulario');

  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [signerRoles, setSignerRoles] = useState<string[]>(['Firmante']);
  const [ccRoles, setCcRoles] = useState<string[]>([]);
  const [testMode, setTestMode] = useState(true);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [editorListo, setEditorListo] = useState(false);
  const [editorBloqueado, setEditorBloqueado] = useState(false);

  const contenedorEditor = useRef<HTMLDivElement | null>(null);
  const clienteSdk = useRef<HelloSignClient | null>(null);

  /* ----------------------------------------------------------------- roles */

  const actualizarSignerRole = (index: number, valor: string) => {
    setSignerRoles((prev) => prev.map((r, i) => (i === index ? valor : r)));
  };

  const actualizarCcRole = (index: number, valor: string) => {
    setCcRoles((prev) => prev.map((r, i) => (i === index ? valor : r)));
  };

  /* ------------------------------------------------------------ paso 1: API */

  const validar = (): string | null => {
    if (!clientId) {
      return 'Falta HELLOSIGN_CLIENT_ID en el .env: es obligatorio para el editor embebido.';
    }
    if (!archivo) return 'Elegí el documento base (PDF o Word).';
    if (archivo.size > MAX_MB * 1024 * 1024) {
      return `El archivo supera los ${MAX_MB} MB.`;
    }
    if (!titulo.trim()) return 'Poné un nombre para la plantilla.';

    const rolesValidos = signerRoles.map((r) => r.trim()).filter(Boolean);
    if (rolesValidos.length === 0) return 'Definí al menos un rol de firma.';
    if (new Set(rolesValidos).size !== rolesValidos.length) {
      return 'Los roles de firma no pueden repetirse.';
    }
    return null;
  };

  const handleContinuar = async () => {
    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      // OJO con el formato: en multipart, Dropbox Sign espera los campos
      // complejos como UN solo valor JSON (no `signer_roles[0][name]`), los
      // booleanos como "true"/"false", y solo los archivos con clave indexada.
      // Es lo que hace su SDK oficial en generateFormData().
      //   signer_roles -> [{"name":"Locatario","order":0}]
      //   cc_roles     -> ["Administracion"]   (array de STRINGS, no de objetos)
      const form = new FormData();
      form.append('client_id', clientId as string);
      form.append('files[0]', archivo as File, (archivo as File).name);
      form.append('title', titulo.trim());
      if (asunto.trim()) form.append('subject', asunto.trim());
      if (mensaje.trim()) form.append('message', mensaje.trim());
      form.append('test_mode', JSON.stringify(testMode));

      const rolesFirma = signerRoles
        .map((rol, index) => ({ name: rol.trim(), order: index }))
        .filter((rol) => rol.name);
      form.append('signer_roles', JSON.stringify(rolesFirma));

      const rolesCopia = ccRoles.map((rol) => rol.trim()).filter(Boolean);
      if (rolesCopia.length > 0) {
        form.append('cc_roles', JSON.stringify(rolesCopia));
      }

      const { template } = await hellosignService.createEmbeddedDraft(form);
      if (!template?.edit_url) {
        throw new Error('Dropbox Sign no devolvió la URL del editor.');
      }

      setEditUrl(template.edit_url);
      setPaso('editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el borrador');
    } finally {
      setEnviando(false);
    }
  };

  /* --------------------------------------------------- paso 2: editor embebido */

  useEffect(() => {
    if (paso !== 'editor' || !editUrl || !clientId) return;

    let cancelado = false;
    let timeoutBloqueo: number | undefined;

    const abrirEditor = async () => {
      try {
        const HelloSign = await cargarHelloSignEmbedded();
        if (cancelado || !contenedorEditor.current) return;

        const cliente = new HelloSign({ clientId });
        clienteSdk.current = cliente;

        cliente.on(HELLOSIGN_EVENTS.createTemplate, () => {
          showSuccess('Plantilla creada', 'Ya aparece en el listado.');
          onCreada();
          onClose();
        });

        cliente.on(HELLOSIGN_EVENTS.close, () => {
          if (!cancelado) onClose();
        });

        cliente.on(HELLOSIGN_EVENTS.ready, () => {
          window.clearTimeout(timeoutBloqueo);
          if (!cancelado) setEditorListo(true);
        });

        cliente.on(HELLOSIGN_EVENTS.error, (payload) => {
          const detalle =
            (payload as { signatureId?: string; code?: string } | undefined)?.code ?? '';
          setError(`El editor de Dropbox Sign devolvió un error. ${detalle}`.trim());
        });

        cliente.open(editUrl, {
          container: contenedorEditor.current,
          testMode,
          skipDomainVerification: testMode,
          allowCancel: true,
        });

        // Si el iframe nunca reporta "ready" es que quedo tapado (CSP, dominio
        // no verificado o plan). Se avisa y se ofrece abrirlo en otra pestana.
        timeoutBloqueo = window.setTimeout(() => {
          if (!cancelado) setEditorBloqueado(true);
        }, 8000);
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No se pudo abrir el editor');
        }
      }
    };

    void abrirEditor();

    return () => {
      cancelado = true;
      window.clearTimeout(timeoutBloqueo);
      try {
        clienteSdk.current?.close();
      } catch {
        // El SDK puede quejarse si ya se cerró solo; no importa.
      }
      clienteSdk.current = null;
    };
    // onClose/onCreada son estables en el módulo padre (useState setters / useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, editUrl, clientId, testMode]);

  /* ------------------------------------------------------------------ render */

  const esEditor = paso === 'editor';

  return (
    <div className="modal-overlay" onClick={esEditor ? undefined : onClose}>
      <div
        className={`modal-content ${esEditor ? 'hs-visor-modal' : 'hs-modal'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`modal-header ${esEditor ? 'hs-visor-header' : ''}`}>
          <h2>{esEditor ? `Editor · ${titulo}` : 'Nueva plantilla'}</h2>

          {esEditor && editUrl && (
            <div className="hs-visor-acciones">
              <button
                className="btn-secondary"
                onClick={() => window.open(editUrl, '_blank', 'noopener,noreferrer')}
                title="Abrir el editor de Dropbox Sign fuera de Toshify"
              >
                <ExternalLink size={15} />
                Abrir en pestaña nueva
              </button>
            </div>
          )}

          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {esEditor ? (
          <div className="modal-body hs-visor-body">
            {error ? (
              <div className="hs-visor-estado hs-visor-estado-error">
                <AlertTriangle size={22} />
                <span>{error}</span>
              </div>
            ) : (
              <>
                {editorBloqueado && !editorListo && (
                  <div className="hs-alert hs-alert-error hs-editor-aviso">
                    <AlertTriangle size={15} />
                    <span>
                      El editor no cargó dentro de Toshify. Suele pasar cuando Dropbox
                      Sign no permite embeber el dominio (hace falta aprobación de la app)
                      o cuando la CSP bloquea{' '}
                      <code>{editUrl ? new URL(editUrl).origin : 'el origen'}</code>. Usá
                      “Abrir en pestaña nueva” para crear la plantilla igual.
                    </span>
                  </div>
                )}
                <div className="hs-editor-container" ref={contenedorEditor} />
              </>
            )}
          </div>
        ) : (
          <>
            <div className="modal-body">
              {error && (
                <div className="hs-alert hs-alert-error">
                  <AlertTriangle size={15} />
                  <span>{error}</span>
                </div>
              )}

              {!clientId && (
                <div className="hs-alert hs-alert-error">
                  <AlertTriangle size={15} />
                  <span>
                    No hay <code>HELLOSIGN_CLIENT_ID</code> configurado. Sin eso el editor
                    embebido no puede abrirse.
                  </span>
                </div>
              )}

              <h3 className="section-title">Documento base</h3>
              <label className="hs-file-drop">
                <input
                  type="file"
                  accept={EXTENSIONES}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setArchivo(file);
                    if (file && !titulo.trim()) {
                      setTitulo(file.name.replace(/\.[^.]+$/, ''));
                    }
                  }}
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
                  <label htmlFor="hs-titulo">Nombre de la plantilla *</label>
                  <input
                    id="hs-titulo"
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej: Contrato de locación 2026"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="hs-asunto">Asunto por defecto</label>
                  <input
                    id="hs-asunto"
                    type="text"
                    value={asunto}
                    onChange={(e) => setAsunto(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="hs-mensaje">Mensaje por defecto</label>
                  <textarea
                    id="hs-mensaje"
                    rows={2}
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <h3 className="section-title">Roles de firma *</h3>
              {signerRoles.map((rol, index) => (
                <div key={`signer-${index}`} className="hs-rol-row">
                  <input
                    type="text"
                    className="hs-rol-input"
                    value={rol}
                    onChange={(e) => actualizarSignerRole(index, e.target.value)}
                    placeholder={`Ej: ${index === 0 ? 'Locatario' : 'Locadora'}`}
                  />
                  <button
                    type="button"
                    className="hs-rol-quitar"
                    onClick={() => setSignerRoles((prev) => prev.filter((_, i) => i !== index))}
                    disabled={signerRoles.length === 1}
                    title="Quitar rol"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary hs-rol-agregar"
                onClick={() => setSignerRoles((prev) => [...prev, ''])}
              >
                <Plus size={14} />
                Agregar rol de firma
              </button>

              <h3 className="section-title">Roles de copia (CC)</h3>
              {ccRoles.length === 0 && (
                <p className="hs-empty-inline">Sin roles de copia.</p>
              )}
              {ccRoles.map((rol, index) => (
                <div key={`cc-${index}`} className="hs-rol-row">
                  <input
                    type="text"
                    className="hs-rol-input"
                    value={rol}
                    onChange={(e) => actualizarCcRole(index, e.target.value)}
                    placeholder="Ej: Administración"
                  />
                  <button
                    type="button"
                    className="hs-rol-quitar"
                    onClick={() => setCcRoles((prev) => prev.filter((_, i) => i !== index))}
                    title="Quitar rol"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary hs-rol-agregar"
                onClick={() => setCcRoles((prev) => [...prev, ''])}
              >
                <Plus size={14} />
                Agregar rol de copia
              </button>

              <label className="form-checkbox-label hs-testmode">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                />
                <span>
                  Modo prueba (<code>test_mode</code>) — necesario para trabajar en
                  localhost sin verificación de dominio
                </span>
              </label>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose} disabled={enviando}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleContinuar}
                disabled={enviando || !clientId}
              >
                {enviando ? <Loader2 size={15} className="hs-spin" /> : <Upload size={15} />}
                {enviando ? 'Subiendo...' : 'Continuar al editor'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
