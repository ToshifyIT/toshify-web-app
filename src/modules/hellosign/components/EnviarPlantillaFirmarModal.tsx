// src/modules/hellosign/components/EnviarPlantillaFirmarModal.tsx
/**
 * "Enviar Plantilla a Firmar": envío de una plantilla de Dropbox Sign desde
 * otros módulos de la app (ej. Onboarding > Asignaciones), sin pasar por la
 * pantalla de HelloSign.
 *
 *  - Se elige una plantilla existente; según la elegida se despliegan sus
 *    firmantes y campos, con el primer rol prellenado con el conductor.
 *  - Se puede subir un documento propio (PDF/Word): en ese caso funciona igual
 *    que "Enviar con otro documento" — crea una plantilla DERIVADA con los
 *    campos calcados (template/update_files), espera a que Dropbox Sign la
 *    procese, envía con ella y la elimina. La plantilla original NO se toca.
 *  - Sin documento subido, envía el documento propio de la plantilla
 *    (send_with_template directo).
 *  - Muestra arriba el enlace a la carpeta de contratos (Drive) del conductor.
 *  - Registra el envío en la tabla `hellosign_envios` (Supabase) para que el
 *    módulo de origen sepa que a ese conductor ya se le envió su plantilla.
 *  - El envío aparece automáticamente en "Documentos enviados" de HelloSign.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  FileSignature,
  FolderOpen,
  Info,
  Loader2,
  Send,
  Upload,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  HelloSignTemplate,
  SendWithTemplateCc,
  SendWithTemplateCustomField,
  SendWithTemplateSigner,
} from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';
import '../HelloSignModule.css';

export interface ConductorParaFirma {
  conductorId: string | null;
  nombre: string;
  email?: string | null;
  /** Carpeta de contratos (Drive) del conductor, si tiene. */
  driveUrl?: string | null;
}

interface EnviarPlantillaFirmarModalProps {
  conductor: ConductorParaFirma;
  /** Asignación desde la que se dispara el envío (para el registro en BD). */
  asignacionId?: string | null;
  onClose: () => void;
  /** Se dispara tras un envío exitoso, con los datos del registro creado. */
  onEnviado?: (registro: {
    conductorId: string | null;
    templateTitle: string;
    createdAt: string;
  }) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXTENSIONES = '.pdf,.doc,.docx';
const MAX_MB = 20;

/** Polling: cada cuánto y por cuánto tiempo esperamos a que Dropbox Sign termine. */
const POLL_INTERVALO_MS = 5000;
const POLL_INTENTOS = 24; // ~2 minutos

type Fase = 'formulario' | 'subiendo' | 'esperando' | 'enviando' | 'limpiando' | 'timeout';

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function EnviarPlantillaFirmarModal({
  conductor,
  asignacionId,
  onClose,
  onEnviado,
}: EnviarPlantillaFirmarModalProps) {
  const { user, profile } = useAuth();

  const [plantillas, setPlantillas] = useState<HelloSignTemplate[]>([]);
  const [cargandoPlantillas, setCargandoPlantillas] = useState(true);
  const [plantillaId, setPlantillaId] = useState<string>('');

  const [detalle, setDetalle] = useState<HelloSignTemplate | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
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

  // Vista previa del documento subido (solo PDF: el navegador no renderiza Word).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const esPdf = !!archivo && (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name));

  useEffect(() => {
    if (!archivo || !esPdf) {
      setPreviewUrl(null);
      setShowPreview(false);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  useEffect(() => {
    cancelado.current = false;
    return () => {
      cancelado.current = true;
    };
  }, []);

  // Carga el listado de plantillas de la cuenta (solo las que tienen roles).
  useEffect(() => {
    let abortado = false;

    const cargar = async () => {
      setCargandoPlantillas(true);
      try {
        const lista = await hellosignService.listAllTemplates();
        if (abortado) return;
        const conRoles = lista
          .filter((t) => (t.signer_roles ?? []).length > 0)
          .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        setPlantillas(conRoles);
      } catch (err) {
        if (!abortado) {
          setError(
            err instanceof Error ? err.message : 'No se pudieron cargar las plantillas',
          );
        }
      } finally {
        if (!abortado) setCargandoPlantillas(false);
      }
    };

    void cargar();
    return () => {
      abortado = true;
    };
  }, []);

  // Al elegir una plantilla, trae el detalle y arma el formulario con el
  // primer rol prellenado con los datos del conductor.
  useEffect(() => {
    if (!plantillaId) {
      setDetalle(null);
      setSigners([]);
      setCcs([]);
      setCustomFields([]);
      return;
    }

    let abortado = false;

    const cargar = async () => {
      setCargandoDetalle(true);
      setError(null);
      try {
        const data = await hellosignService.getTemplate(plantillaId);
        if (abortado) return;

        const base = data ?? plantillas.find((t) => t.template_id === plantillaId) ?? null;
        if (!base) throw new Error('No se pudo cargar la plantilla elegida.');

        setDetalle(base);
        setSubject(base.title ?? '');
        setMessage(base.message ?? '');
        setSigners(
          (base.signer_roles ?? []).map((role, index) => ({
            role: role.name,
            name: index === 0 ? conductor.nombre : '',
            email_address: index === 0 ? conductor.email ?? '' : '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaId]);

  const camposRequeridos = useMemo(() => {
    if (!detalle) return new Set<string>();
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
    if (!plantillaId || !detalle) return 'Elegí la plantilla que querés enviar.';
    if (archivo && archivo.size > MAX_MB * 1024 * 1024) {
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
            'que se había creado. La vas a ver en HelloSign: podés eliminarla a mano.',
        );
      }
    }
    abortar.current = false;
    setCancelando(false);
    setFase('formulario');
    setError('Proceso detenido. No se envió nada a los firmantes.');
  };

  /** Best-effort: borra la plantilla derivada; si falla solo avisa. */
  const limpiarDerivada = async (derivadaId: string): Promise<void> => {
    try {
      await hellosignService.deleteTemplate(derivadaId);
    } catch {
      setAvisoParcial(
        'El envío salió bien, pero no se pudo borrar la plantilla temporal de ' +
          'Dropbox Sign. La vas a ver en HelloSign: podés eliminarla a mano sin ' +
          'afectar el documento ya enviado.',
      );
    }
  };

  /** Guarda el registro del envío en Supabase (no rompe el envío si falla). */
  const registrarEnvio = async (signatureRequestId: string | null) => {
    try {
      const { error: dbError } = await (supabase.from('hellosign_envios') as any).insert({
        signature_request_id: signatureRequestId,
        template_id: detalle!.template_id,
        template_title: detalle!.title ?? null,
        asignacion_id: asignacionId ?? null,
        conductor_id: conductor.conductorId,
        conductor_nombre: conductor.nombre || null,
        enviado_por: user?.id ?? null,
        enviado_por_nombre: profile?.full_name || user?.email || null,
        test_mode: testMode,
      });
      if (dbError) throw dbError;
    } catch {
      void Swal.fire(
        'Enviado, pero sin registro',
        'La solicitud de firma se envió bien, pero no se pudo guardar el registro ' +
          'en la base (¿existe la tabla hellosign_envios?). El envío igual se ve en ' +
          'HelloSign → Documentos enviados.',
        'warning',
      );
    }
  };

  const handleEnviar = async () => {
    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }

    const confirmacion = await Swal.fire({
      title: 'Enviar plantilla a firmar',
      html:
        (archivo
          ? `Se enviará <b>${archivo.name}</b> usando los campos de <b>${detalle!.title}</b>. ` +
            'La plantilla original no se modifica.'
          : `Se enviará <b>${detalle!.title}</b> con su documento original.`) +
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

    let templateParaEnvio = detalle!.template_id;
    let derivadaId: string | null = null;

    // Con documento propio: crear la plantilla derivada y esperar a que exista.
    if (archivo) {
      setFase('subiendo');
      try {
        const form = new FormData();
        // Sin client_id: solo hace falta para el editor embebido y con la app
        // sin aprobar rompe los envíos reales ("App not approved yet").
        form.append('files[0]', archivo, archivo.name);
        form.append('test_mode', JSON.stringify(testMode));

        const { template: creada } = await hellosignService.updateTemplateFiles(
          detalle!.template_id,
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

      if (abortar.current) {
        await finalizarCancelacion(derivadaId);
        return;
      }

      // Polling: la creación es asincrónica, esperamos a que exista de verdad.
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

      if (abortar.current) {
        await finalizarCancelacion(derivadaId);
        return;
      }

      if (!confirmada) {
        // No se envió nada y la plantilla original está intacta.
        setFase('timeout');
        return;
      }

      templateParaEnvio = derivadaId;
    }

    // Envío de la solicitud de firma.
    setFase('enviando');
    try {
      const { signature_request: solicitud } = await hellosignService.sendWithTemplate({
        template_id: templateParaEnvio,
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

      // Limpieza de la derivada (solo si hubo documento propio).
      if (derivadaId) {
        setFase('limpiando');
        await limpiarDerivada(derivadaId);
      }

      const createdAt = new Date().toISOString();
      await registrarEnvio(solicitud?.signature_request_id ?? null);

      showSuccess(
        'Solicitud enviada',
        solicitud?.signature_request_id
          ? `ID: ${solicitud.signature_request_id}`
          : undefined,
      );
      onEnviado?.({
        conductorId: conductor.conductorId,
        templateTitle: detalle!.title ?? '',
        createdAt,
      });
      onClose();
    } catch (err) {
      // El envío falló: si había derivada, se borra para no dejar basura.
      if (derivadaId) {
        setFase('limpiando');
        await limpiarDerivada(derivadaId);
        setAvisoParcial(null);
      }
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
    <div className="modal-overlay" onClick={enProceso ? undefined : onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <FileSignature size={17} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Enviar Plantilla a Firmar · {conductor.nombre || 'Conductor'}
          </h2>
          <button className="modal-close" onClick={onClose} disabled={enProceso} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Carpeta de contratos (Drive) del conductor */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              marginBottom: '12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary, var(--border-color, #e5e7eb))',
              borderRadius: '8px',
              fontSize: '12px',
              flexWrap: 'wrap',
            }}
          >
            <FolderOpen size={16} style={{ color: conductor.driveUrl ? '#2563EB' : '#9CA3AF', flexShrink: 0 }} />
            {conductor.driveUrl ? (
              <>
                <a
                  href={conductor.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}
                >
                  Ver Carta Oferta (carpeta del conductor)
                </a>
                <span
                  onClick={() => {
                    navigator.clipboard.writeText(conductor.driveUrl!);
                    showSuccess('URL copiada');
                  }}
                  style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }}
                  title="Click para copiar URL"
                >
                  Copiar enlace
                </span>
              </>
            ) : (
              <span style={{ color: '#9CA3AF', fontWeight: 500 }}>
                Este conductor no tiene carpeta de contratos cargada
              </span>
            )}
          </div>

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
                Dropbox Sign sigue procesando el documento y <b>no se envió nada</b>. La
                plantilla original está intacta. Esperá unos minutos y reintentá; si en
                HelloSign aparece una plantilla duplicada, borrala a mano. Si nunca
                aparece, suele ser porque el documento tiene menos páginas o distinta
                orientación que el original.
              </span>
            </div>
          ) : (
            <>
              <h3 className="section-title">Plantilla</h3>
              {cargandoPlantillas ? (
                <div className="hs-modal-loading">
                  <Loader2 size={18} className="hs-spin" />
                  <span>Cargando plantillas de Dropbox Sign...</span>
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="hs-epf-plantilla">Elegí la plantilla a enviar</label>
                    <select
                      id="hs-epf-plantilla"
                      value={plantillaId}
                      disabled={enProceso}
                      onChange={(e) => setPlantillaId(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Seleccionar plantilla —</option>
                      {plantillas.map((t) => (
                        <option key={t.template_id} value={t.template_id}>
                          {t.title || 'Sin título'}
                          {(t.signer_roles ?? []).length > 0
                            ? ` (${(t.signer_roles ?? []).map((r) => r.name).join(', ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {cargandoDetalle && (
                <div className="hs-modal-loading">
                  <Loader2 size={18} className="hs-spin" />
                  <span>Cargando roles y campos de la plantilla...</span>
                </div>
              )}

              {detalle && !cargandoDetalle && (
                <>
                  <div className="hs-alert hs-alert-info">
                    <Info size={15} />
                    <span>
                      Si subís un documento, usará los campos y roles de{' '}
                      <b>{detalle.title}</b> (
                      {(detalle.signer_roles ?? []).map((r) => r.name).join(', ') || 'sin roles'}
                      ) y <b>la plantilla original no se modifica</b>. El documento debe
                      tener <b>igual o más páginas</b> y la <b>misma orientación</b> que el
                      original. Si no subís nada, se envía el documento propio de la
                      plantilla.
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
                        : `Elegí un PDF o Word (máx. ${MAX_MB} MB) — opcional`}
                    </span>
                  </label>
                  {archivo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowPreview(true)}
                        disabled={!esPdf}
                        title={
                          esPdf
                            ? 'Ver las hojas del documento antes de enviarlo'
                            : 'La vista previa solo está disponible para PDF (los Word no se pueden mostrar en el navegador)'
                        }
                      >
                        <Eye size={15} />
                        Vista previa
                      </button>
                      {!esPdf && (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          Vista previa disponible solo para PDF
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setArchivo(null)}
                        disabled={enProceso}
                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Quitar documento
                      </button>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="hs-epf-subject">Asunto del email</label>
                      <input
                        id="hs-epf-subject"
                        type="text"
                        maxLength={255}
                        value={subject}
                        disabled={enProceso}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="hs-epf-message">Mensaje</label>
                      <textarea
                        id="hs-epf-message"
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
              disabled={enProceso || cargandoDetalle || !detalle || signers.length === 0}
            >
              {enProceso ? <Loader2 size={15} className="hs-spin" /> : <Send size={15} />}
              {enProceso ? 'Procesando...' : 'Enviar a firmar'}
            </button>
          )}
        </div>
      </div>

      {/* Vista previa del documento subido (hojas del PDF) */}
      {showPreview && previewUrl && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1200 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPreview(false);
          }}
        >
          <div
            className="modal-content hs-visor-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(900px, 92vw)', height: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header hs-visor-header">
              <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Vista previa · {archivo?.name}
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowPreview(false)}
                aria-label="Cerrar vista previa"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body hs-visor-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <iframe
                className="hs-visor-frame"
                style={{ flex: 1, width: '100%', border: 'none' }}
                src={previewUrl}
                title={`Vista previa: ${archivo?.name ?? ''}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
