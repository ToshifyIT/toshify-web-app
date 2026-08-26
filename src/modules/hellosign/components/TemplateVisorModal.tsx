// src/modules/hellosign/components/TemplateVisorModal.tsx
/**
 * Visor del documento de una plantilla.
 * Es un envoltorio fino sobre PdfVisorModal, que es genérico y también usan
 * los documentos enviados.
 */

import type { HelloSignTemplate } from '../types/hellosign.types';
import { hellosignService } from '../hellosignService';
import { PdfVisorModal } from './PdfVisorModal';

interface TemplateVisorModalProps {
  template: HelloSignTemplate;
  onClose: () => void;
}

export function TemplateVisorModal({ template, onClose }: TemplateVisorModalProps) {
  return (
    <PdfVisorModal
      titulo={template.title || 'Documento'}
      fileUrl={hellosignService.getTemplateFileUrl(template.template_id)}
      nombreDescarga={template.title || 'plantilla'}
      onClose={onClose}
    />
  );
}
