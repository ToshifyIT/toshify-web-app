// src/modules/hellosign/components/TemplateDetalleModal.tsx
/**
 * Drawer/modal con el detalle completo de una plantilla de Dropbox Sign:
 * roles de firma, copias, documentos y campos personalizados.
 */

import { useEffect, useState } from 'react';
import { FileText, Loader2, Users, X } from 'lucide-react';
import type { HelloSignTemplate } from '../types/hellosign.types';
import {
  formatFechaHelloSign,
  getAccesoLabel,
  hellosignService,
} from '../hellosignService';

interface TemplateDetalleModalProps {
  template: HelloSignTemplate;
  onClose: () => void;
  onUsar: (template: HelloSignTemplate) => void;
}

export function TemplateDetalleModal({
  template,
  onClose,
  onUsar,
}: TemplateDetalleModalProps) {
  const [detalle, setDetalle] = useState<HelloSignTemplate>(template);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await hellosignService.getTemplate(template.template_id);
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
  }, [template.template_id]);

  const signerRoles = detalle.signer_roles ?? [];
  const ccRoles = detalle.cc_roles ?? [];
  const documentos = detalle.documents ?? [];
  const customFields =
    detalle.custom_fields ??
    documentos.flatMap((doc) => doc.custom_fields ?? []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content hs-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{detalle.title || 'Plantilla sin título'}</h2>
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

          {error && <div className="hs-alert hs-alert-error">{error}</div>}

          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Template ID</span>
              <span className="detail-value hs-mono">{detalle.template_id}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Última actualización</span>
              <span className="detail-value">
                {formatFechaHelloSign(detalle.updated_at)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Quiénes pueden acceder</span>
              <span className="detail-value">{getAccesoLabel(detalle)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Estado</span>
              <span className="detail-value">
                <span className={`hs-badge ${detalle.is_locked ? 'hs-badge-red' : 'hs-badge-green'}`}>
                  {detalle.is_locked ? 'Bloqueada' : 'Disponible'}
                </span>
                {detalle.can_edit && (
                  <span className="hs-badge hs-badge-blue" style={{ marginLeft: 6 }}>
                    Editable
                  </span>
                )}
                {detalle.is_embedded && (
                  <span className="hs-badge hs-badge-purple" style={{ marginLeft: 6 }}>
                    Embebida
                  </span>
                )}
              </span>
            </div>
          </div>

          {detalle.message && (
            <>
              <h3 className="section-title">Mensaje por defecto</h3>
              <p className="hs-message">{detalle.message}</p>
            </>
          )}

          <h3 className="section-title">
            Roles de firma ({signerRoles.length})
          </h3>
          {signerRoles.length === 0 ? (
            <p className="hs-empty-inline">Esta plantilla no define roles de firma.</p>
          ) : (
            <ul className="hs-role-list">
              {signerRoles.map((role, index) => (
                <li key={`${role.name}-${index}`} className="hs-role-item">
                  <Users size={14} />
                  <span className="hs-role-name">{role.name}</span>
                  <span className="hs-role-order">Orden {role.order ?? index}</span>
                </li>
              ))}
            </ul>
          )}

          {ccRoles.length > 0 && (
            <>
              <h3 className="section-title">Copias (CC) ({ccRoles.length})</h3>
              <ul className="hs-role-list">
                {ccRoles.map((role, index) => (
                  <li key={`${role.name}-cc-${index}`} className="hs-role-item">
                    <Users size={14} />
                    <span className="hs-role-name">{role.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="section-title">Documentos ({documentos.length})</h3>
          {documentos.length === 0 ? (
            <p className="hs-empty-inline">Sin documentos asociados.</p>
          ) : (
            <ul className="hs-doc-list">
              {documentos.map((doc) => (
                <li key={`${doc.name}-${doc.index}`} className="hs-doc-item">
                  <FileText size={14} />
                  <span className="hs-doc-name">{doc.name}</span>
                  <span className="hs-doc-meta">
                    {(doc.form_fields?.length ?? 0)} campos
                  </span>
                </li>
              ))}
            </ul>
          )}

          {customFields.length > 0 && (
            <>
              <h3 className="section-title">
                Campos personalizados ({customFields.length})
              </h3>
              <ul className="hs-role-list">
                {customFields.map((field, index) => (
                  <li key={`${field.name}-${index}`} className="hs-role-item">
                    <span className="hs-role-name">{field.name}</span>
                    <span className="hs-role-order">
                      {field.type ?? 'text'}
                      {field.required ? ' · obligatorio' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="btn-primary"
            onClick={() => onUsar(detalle)}
            disabled={loading || signerRoles.length === 0}
            title={
              signerRoles.length === 0
                ? 'La plantilla no tiene roles de firma'
                : 'Enviar solicitud de firma'
            }
          >
            Usar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
