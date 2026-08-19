// src/modules/hellosign/components/UsarPlantillaModal.tsx
/**
 * Formulario para enviar una solicitud de firma a partir de una plantilla
 * (POST /signature_request/send_with_template).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import type {
  HelloSignTemplate,
  SendWithTemplateCc,
  SendWithTemplateCustomField,
  SendWithTemplateSigner,
} from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';

interface UsarPlantillaModalProps {
  template: HelloSignTemplate;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UsarPlantillaModal({ template, onClose }: UsarPlantillaModalProps) {
  const [detalle, setDetalle] = useState<HelloSignTemplate>(template);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState(template.title ?? '');
  const [message, setMessage] = useState(template.message ?? '');
  const [testMode, setTestMode] = useState(true);
  const [signers, setSigners] = useState<SendWithTemplateSigner[]>([]);
  const [ccs, setCcs] = useState<SendWithTemplateCc[]>([]);
  const [customFields, setCustomFields] = useState<SendWithTemplateCustomField[]>([]);

  // Carga el detalle para obtener roles y campos reales de la plantilla.
  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setCargandoDetalle(true);
      try {
        const data = await hellosignService.getTemplate(template.template_id);
        if (cancelado) return;

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
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la plantilla');
        }
      } finally {
        if (!cancelado) setCargandoDetalle(false);
      }
    };

    void cargar();
    return () => {
      cancelado = true;
    };
  }, [template]);

  const camposRequeridos = useMemo(() => {
    const campos =
      detalle.custom_fields ??
      (detalle.documents ?? []).flatMap((doc) => doc.custom_fields ?? []);
    return new Set(campos.filter((f) => f.required).map((f) => f.name));
  }, [detalle]);

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

  const handleEnviar = async () => {
    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }

    const confirmacion = await Swal.fire({
      title: 'Enviar solicitud de firma',
      html: testMode
        ? 'Se enviará en <b>modo prueba</b> (no consume créditos y no tiene validez legal).'
        : 'Se enviará una solicitud <b>real</b> a los firmantes indicados.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)',
    });
    if (!confirmacion.isConfirmed) return;

    setEnviando(true);
    setError(null);

    try {
      const { signature_request: solicitud } = await hellosignService.sendWithTemplate({
        template_id: detalle.template_id,
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

      showSuccess(
        'Solicitud enviada',
        solicitud?.signature_request_id
          ? `ID: ${solicitud.signature_request_id}`
          : undefined,
      );
      onClose();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo enviar la solicitud';
      setError(mensaje);
      void Swal.fire('Error', mensaje, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Usar plantilla · {detalle.title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
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

          {error && <div className="hs-alert hs-alert-error">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="hs-subject">Asunto del email</label>
              <input
                id="hs-subject"
                type="text"
                maxLength={255}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ej: Contrato de locación Toshify"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="hs-message">Mensaje</label>
              <textarea
                id="hs-message"
                maxLength={5000}
                rows={3}
                value={message}
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
                    onChange={(e) => actualizarSigner(index, 'name', e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={signer.email_address}
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
              onChange={(e) => setTestMode(e.target.checked)}
            />
            <span>
              Modo prueba (<code>test_mode</code>) — no consume créditos ni tiene
              validez legal
            </span>
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleEnviar}
            disabled={enviando || cargandoDetalle || signers.length === 0}
          >
            {enviando ? <Loader2 size={15} className="hs-spin" /> : <Send size={15} />}
            {enviando ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
