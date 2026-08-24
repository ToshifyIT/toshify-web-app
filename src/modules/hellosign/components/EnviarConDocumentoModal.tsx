// src/modules/hellosign/components/EnviarConDocumentoModal.tsx
/**
 * "Enviar con otro documento": sube un documento nuevo que calca los campos de
 * la plantilla elegida y lo envía a firmar. La plantilla original NO se toca:
 * queda intacta en el listado para seguir usándose.
 *
 * La API de Dropbox Sign no tiene un endpoint directo para esto, así que el
 * flujo se arma encadenando tres llamadas:
 *  1. template/update_files crea una plantilla DERIVADA con el documento nuevo
 *     y los campos/roles calcados de la original.
 *  2. Se espera (polling) a que Dropbox Sign termine de procesarla, porque la
 *     creación es asincrónica.
 *  3. signature_request/send_with_template envía usando la derivada.
 *  4. La derivada se elimina para que el listado quede limpio. El envío ya
 *     quedó registrado en "Documentos enviados" y no se ve afectado.
 *
 * Igual que en "Reemplazar documento": el archivo nuevo debe tener igual o más
 * páginas y la misma orientación que el original, porque los campos se
 * superponen por coordenadas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Info, Loader2, Upload, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import type {
  HelloSignTemplate,
  SendWithTemplateCc,
  SendWithTemplateCustomField,
  SendWithTemplateSigner,
} from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';

interface EnviarConDocumentoModalProps {
  template: HelloSignTemplate;
  onClose: () => void;
  /** Se dispara tras un envío exitoso (para refrescar listados). */
  onEnviado: () => void;
}

const EXTENSIONES = '.pdf,.doc,.docx';
const MAX_MB = 20;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Polling: cada cuánto y por cuánto tiempo esperamos a que Dropbox Sign termine. */
const POLL_INTERVALO_MS = 5000;
const POLL_INTENTOS = 24; // ~2 minutos

type Fase = 'formulario' | 'subiendo' | 'esperando' | 'enviando' | 'limpiando' | 'timeout';

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function EnviarConDocumentoModal({
  template,
  onClose,
  onEnviado,
}: EnviarConDocumentoModalProps) {
  const [detalle, setDetalle] = useState<HelloSignTemplate>(template);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [subject, setSubject] = useState(template.title ?? '');
  const [message, setMessage] = useState(template.message ?? '');
  const [testMode, setTestMode] = useState(true);
  const [signers, setSigners] = useState<SendWithTemplateSigner[]>([]);
  const [ccs, setCcs] = useState<SendWithTemplateCc[]>([]);
  const [customFields, setCustomFields] = useState<SendWithTemplateCustomField[]>([]);

  const [fase, setFase] = useState<Fase>('formulario');
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const cancelado = useRef(false);
  /** true cuando el usuario pidió detener el proceso antes del envío. */
  const abortar = useRef(false);

  useEffect(() => {
    cancelado.current = false;
    return () => {
      cancelado.current = true;
    };
  }, []);

  // Carga el detalle para obtener roles y campos reales de la plantilla base.
  // La derivada hereda exactamente estos roles/campos, así que el formulario
  // se arma con los de la original.
  useEffect(() => {
    let abortado = false;

    const cargar = async () => {
      setCargandoDetalle(true);
      try {
        const data = await hellosignService.getTemplate(template.template_id);
        if (abortado) return;

        const base = data ?? template;
        setDetalle(base);
        setSigners(
          (base.signer_roles ?? []).map((role) => ({
            role: role.name,
            name: '',
            email_address: '',
          })),
        );
        setCcs(
          (base.cc_roles ?? []).map((role) => ({
            role: role.name,
            email_address: '',
          })),
        );

        const campos =
          base.custom_fields ??
          (base.documents ?? []).flatMap((doc) => doc.custom_fields ?? []);
        setCustomFields(campos.map((field) => ({ name: field.name, value: '' })));
      } catch (err) {
        if (!abortado) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la plantilla');
        }
      } finally {
        if (!abortado) setCargandoDetalle(false);
      }
    };

    void cargar();
    return () => {
      abortado = true;
    };
  }, [template]);

  const camposRequeridos = useMemo(() => {
    const campos =
      detalle.custom_fields ??
      (detalle.documents ?? []).flatMap((doc) => doc.custom_fields ?? []);
    return new Set(campos.filter((f) => f.required).map((f) => f.name));
  }, [detalle]);

  const enProceso =
    fase === 'subiendo' || fase === 'esperando' || fase === 'enviando' || fase === 'limpiando';

  const actualizarSigner = (
    index: number,
    campo: 'name' | 'email_address',
    valor: string,
  ) => {
    setSigners((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [campo]: valor } : s)),
    );
  };

  const actualizarCc = (index: number, valor: string) => {
    setCcs((prev) =>
      prev.map((cc, i) => (i === index ? { ...cc, email_address: valor } : cc)),
    );
  };

  const actualizarCustomField = (index: number, valor: string) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, value: valor } : f)),
    );
  };

  const validar = (): string | null => {
    if (!archivo) return 'Elegí el documento que querés enviar.';
    if (archivo.size > MAX_MB * 1024 * 1024) {
      return `El archivo supera los ${MAX_MB} MB.`;
    }
    if (signers.length === 0) return 'La plantilla no tiene roles de firma definidos.';

    for (const signer of signers) {
      if (!signer.name.trim()) return `Falta el nombre del firmante "${signer.role}".`;
      if (!EMAIL_REGEX.test(signer.email_address.trim())) {
        return `El email del firmante "${signer.role}" no es válido.`;
      }
    }

    for (const cc of ccs) {
      if (cc.email_address.trim() && !EMAIL_REGEX.test(cc.email_address.trim())) {
        return `El email de la copia "${cc.role}" no es válido.`;
      }
    }

    for (const field of customFields) {
      if (camposRequeridos.has(field.name) && !field.value.trim()) {
        return `El campo "${field.name}" es obligatorio.`;
      }
    }

    return null;
  };

  /** El usuario pidió detener: se corta antes de enviar y se limpia todo. */
  const handleDetener = () => {
    abortar.current = true;
    setCancelando(true);
  };

  /** Cierre del proceso cuando fue detenido por el usuario. */
  const finalizarCancelacion = async (derivadaId: string | null) => {
    if (derivadaId) {
      try {
        setFase('limpiando');
        await hellosignService.deleteTemplate(derivadaId);
      } catch {
        setAvisoParcial(
          'Se detuvo el proceso, pero no se pudo borrar la plantilla temporal ' +
            'que se había creado. Vas a verla en el listado: podés eliminarla a mano.',
        );
      }
    }
    abortar.current = false;
    setCancelando(false);
    setFase('formulario');
    setError('Proceso detenido. No se envió nada a los firmantes.');
  };

  /** Best-effort: borra la plantilla derivada; si falla solo avisa. */
  const limpiarDerivada = async (derivadaId: string): Promise<boolean> => {
    try {
      await hellosignService.deleteTemplate(derivadaId);
      return true;
    } catch {
      setAvisoParcial(
        'El envío salió bien, pero no se pudo borrar la plantilla temporal que ' +
          'Dropbox Sign crea para este flujo. Vas a verla en el listado: podés ' +
          'eliminarla a mano sin afectar el documento ya enviado.',
      );
      return false;
    }
  };

  const handleEnviar = async () => {
    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }

    const confirmacion = await Swal.fire({
      title: 'Enviar con otro documento',
      html:
        `Se enviará <b>${archivo!.name}</b> usando los campos de ` +
        `<b>${detalle.title}</b>. La plantilla original no se modifica.` +
        (testMode
          ? '<br/><br/>Modo <b>prueba</b>: no consume créditos y no tiene validez legal.'
          : '<br/><br/>Se enviará una solicitud <b>real</b> a los firmantes indicados.'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)',
    });
    if (!confirmacion.isConfirmed) return;

    setError(null);
    setAvisoParcial(null);
    abortar.current = false;
    setCancelando(false);

    // 1. Subir el documento: crea la plantilla derivada con los campos calcados.
    setFase('subiendo');
    let derivadaId: string | null = null;

    try {
      const form = new FormData();
      // OJO: acá NO se manda client_id. Solo hace falta para el editor embebido
      // y, si la API App no está aprobada por Dropbox Sign, adjuntarlo hace
      // fallar los envíos reales con "App not approved yet". La plantilla
      // derivada es temporal y nunca se abre en el editor, así que no lo
      // necesita.
      form.append('files[0]', archivo!, archivo!.name);
      form.append('test_mode', JSON.stringify(testMode));

      const { template: creada } = await hellosignService.updateTemplateFiles(
        template.template_id,
        form,
      );

      derivadaId = creada?.template_id ?? null;
      if (!derivadaId) {
        throw new Error('Dropbox Sign no devolvió el ID de la plantilla derivada.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento');
      setFase('formulario');
      abortar.current = false;
      setCancelando(false);
      return;
    }

    // ¿Detuvieron mientras subía? Se borra la derivada y no se envía nada.
    if (abortar.current) {
      await finalizarCancelacion(derivadaId);
      return;
    }

    // 2. Polling: la creación es asincrónica, esperamos a que exista de verdad.
    setFase('esperando');
    let confirmada = false;

    for (let i = 1; i <= POLL_INTENTOS; i += 1) {
      if (cancelado.current) return;
      if (abortar.current) break;
      setIntento(i);
      await espera(POLL_INTERVALO_MS);
      if (cancelado.current) return;
      if (abortar.current) break;

      try {
        const nueva = await hellosignService.getTemplate(derivadaId);
        if (nueva?.template_id) {
          confirmada = true;
          break;
        }
      } catch {
        // Mientras procesa puede responder 404/409: seguimos intentando.
      }
    }

    // ¿Detuvieron durante la espera? Se borra la derivada y no se envía nada.
    if (abortar.current) {
      await finalizarCancelacion(derivadaId);
      return;
    }

    if (!confirmada) {
      // No se envió nada y la original está intacta.
      setFase('timeout');
      return;
    }

    // 3. Enviar la solicitud usando la plantilla derivada.
    setFase('enviando');
    try {
      const { signature_request: solicitud } = await hellosignService.sendWithTemplate({
        template_id: derivadaId,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        signers: signers.map((s) => ({
          role: s.role,
          name: s.name.trim(),
          email_address: s.email_address.trim(),
        })),
        ccs: ccs.filter((cc) => cc.email_address.trim()),
        custom_fields: customFields.filter((f) => f.value.trim()),
        test_mode: testMode,
      });

      // 4. Limpieza: la derivada ya cumplió su función.
      setFase('limpiando');
      const limpio = await limpiarDerivada(derivadaId);

      showSuccess(
        'Solicitud enviada',
        solicitud?.signature_request_id
          ? `ID: ${solicitud.signature_request_id}`
          : undefined,
      );
      onEnviado();

      if (limpio) {
        onClose();
      } else {
        // Queda el aviso visible para que el usuario sepa qué borrar a mano.
        setFase('formulario');
      }
    } catch (err) {
      // El envío falló: borramos la derivada para no dejar basura.
      setFase('limpiando');
      await limpiarDerivada(derivadaId);
      setAvisoParcial(null);
      const mensaje = err instanceof Error ? err.message : 'No se pudo enviar la solicitud';
      setError(mensaje);
      setFase('formulario');
      void Swal.fire('Error', mensaje, 'error');
    }
  };

  const mensajeFase =
    fase === 'subiendo'
      ? 'Subiendo el documento...'
      : fase === 'esperando'
        ? `Dropbox Sign está copiando los campos al documento nuevo... (${intento}/${POLL_INTENTOS})`
        : fase === 'enviando'
          ? 'Enviando la solicitud de firma...'
          : fase === 'limpiando'
            ? 'Quitando la plantilla temporal...'
            : '';

  return (
    <div className="modal-overlay" onClick={enProceso ? undefined : onClose}>
      <div className="modal-content hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Enviar con otro documento · {detalle.title}</h2>
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
          {cargandoDetalle && (
            <div className="hs-modal-loading">
              <Loader2 size={18} className="hs-spin" />
              <span>Cargando roles de la plantilla...</span>
            </div>
          )}

          {error && (
            <div className="hs-alert hs-alert-error">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          {avisoParcial && (
            <div className="hs-alert hs-alert-warn">
              <AlertTriangle size={15} />
              <span>{avisoParcial}</span>
            </div>
          )}

          {fase === 'timeout' ? (
            <div className="hs-alert hs-alert-warn">
              <AlertTriangle size={15} />
              <span>
                Dropbox Sign sigue procesando el documento y <b>no se envió nada</b>. Tu
                plantilla original está intacta. Esperá unos minutos y tocá
                “Sincronizar”: si aparece una plantilla duplicada, borrala a mano y volvé
                a intentar. Si nunca aparece, suele ser porque el documento tiene menos
                páginas o distinta orientación que el original.
              </span>
            </div>
          ) : (
            <>
              <div className="hs-alert hs-alert-info">
                <Info size={15} />
                <span>
                  El documento que subas usará los campos y roles de <b>{detalle.title}</b>{' '}
                  ({(detalle.signer_roles ?? []).map((r) => r.name).join(', ') || 'sin roles'}
                  ) y se enviará a firmar. <b>La plantilla original no se modifica.</b> El
                  documento debe tener <b>igual o más páginas</b> y la{' '}
                  <b>misma orientación</b> que el original.
                </span>
              </div>

              <h3 className="section-title">Documento a enviar</h3>
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
                  <label htmlFor="hs-ecd-subject">Asunto del email</label>
                  <input
                    id="hs-ecd-subject"
                    type="text"
                    maxLength={255}
                    value={subject}
                    disabled={enProceso}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ej: Contrato de locación Toshify"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="hs-ecd-message">Mensaje</label>
                  <textarea
                    id="hs-ecd-message"
                    maxLength={5000}
                    rows={3}
                    value={message}
                    disabled={enProceso}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Mensaje que verán los firmantes"
                  />
                </div>
              </div>

              <h3 className="section-title">Firmantes</h3>
              {signers.length === 0 && !cargandoDetalle && (
                <p className="hs-empty-inline">
                  Esta plantilla no define roles de firma, no se puede enviar.
                </p>
              )}
              {signers.map((signer, index) => (
                <div key={`${signer.role}-${index}`} className="hs-signer-block">
                  <span className="hs-signer-role">{signer.role}</span>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Nombre</label>
                      <input
                        type="text"
                        value={signer.name}
                        disabled={enProceso}
                        onChange={(e) => actualizarSigner(index, 'name', e.target.value)}
                        placeholder="Nombre y apellido"
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={signer.email_address}
                        disabled={enProceso}
                        onChange={(e) =>
                          actualizarSigner(index, 'email_address', e.target.value)
                        }
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {ccs.length > 0 && (
                <>
                  <h3 className="section-title">Copias (CC)</h3>
                  {ccs.map((cc, index) => (
                    <div key={`${cc.role}-${index}`} className="form-row">
                      <div className="form-group">
                        <label>{cc.role}</label>
                        <input
                          type="email"
                          value={cc.email_address}
                          disabled={enProceso}
                          onChange={(e) => actualizarCc(index, e.target.value)}
                          placeholder="correo@ejemplo.com (opcional)"
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {customFields.length > 0 && (
                <>
                  <h3 className="section-title">Campos personalizados</h3>
                  {customFields.map((field, index) => (
                    <div key={`${field.name}-${index}`} className="form-row">
                      <div className="form-group">
                        <label>
                          {field.name}
                          {camposRequeridos.has(field.name) && ' *'}
                        </label>
                        <input
                          type="text"
                          value={field.value}
                          disabled={enProceso}
                          onChange={(e) => actualizarCustomField(index, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}

              <label className="form-checkbox-label hs-testmode">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={testMode}
                  disabled={enProceso}
                  onChange={(e) => setTestMode(e.target.checked)}
                />
                <span>
                  Modo prueba (<code>test_mode</code>) — no consume créditos ni tiene
                  validez legal
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
          {fase === 'subiendo' || fase === 'esperando' ? (
            // Mientras sube o espera todavía no se envió nada: se puede detener.
            <button
              className="btn-secondary"
              onClick={handleDetener}
              disabled={cancelando}
              title="Detiene el proceso antes de enviar y borra la plantilla temporal"
            >
              {cancelando ? (
                <>
                  <Loader2 size={15} className="hs-spin" />
                  Deteniendo...
                </>
              ) : (
                'Detener subida'
              )}
            </button>
          ) : (
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={fase === 'enviando' || fase === 'limpiando'}
            >
              {fase === 'timeout' ? 'Cerrar' : 'Cancelar'}
            </button>
          )}
          {fase !== 'timeout' && (
            <button
              className="btn-primary"
              onClick={handleEnviar}
              disabled={enProceso || cargandoDetalle || !archivo || signers.length === 0}
            >
              {enProceso ? (
                <Loader2 size={15} className="hs-spin" />
              ) : (
                <FileUp size={15} />
              )}
              {enProceso ? 'Procesando...' : 'Enviar con este documento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
