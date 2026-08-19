// src/modules/hellosign/hellosignService.ts
/**
 * Cliente frontend de la integración Dropbox Sign.
 * Solo habla con /api/hellosign/* (server-hellosign.js) — la API key
 * nunca llega al browser.
 */

import type {
  EmbeddedDraftResponse,
  UpdateFilesResponse,
  HelloSignStatus,
  HelloSignTemplate,
  SendWithTemplatePayload,
  SendWithTemplateResponse,
  TemplateListResponse,
} from './types/hellosign.types';

const API_BASE = '/api/hellosign';

/** Máximo de páginas a recorrer al traer todas las plantillas (100 por página). */
const MAX_PAGES = 20;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  // 502/503/504 los emite el proxy de Vite cuando no hay backend escuchando.
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Error(
      'No se pudo contactar el backend de Dropbox Sign (/api/hellosign). ' +
        'Reiniciá el dev server con `npm run dev` para cargar el plugin, ' +
        'o levantá la API con `npm run dev:api`.',
    );
  }

  // Si volvió HTML es que la ruta cayó en el fallback del SPA: no está montada.
  if (payload === null && text.trim().startsWith('<')) {
    throw new Error(
      'La ruta /api/hellosign no está registrada. Reiniciá el dev server (`npm run dev`).',
    );
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      `Error ${response.status} al conectar con Dropbox Sign`;
    throw new Error(message);
  }

  return payload as T;
}

class HelloSignService {
  /** Estado de configuración/conexión de la integración. */
  async getStatus(): Promise<HelloSignStatus> {
    return request<HelloSignStatus>('/status');
  }

  /** Una página del listado de plantillas. */
  async listTemplates(page = 1, pageSize = 100): Promise<TemplateListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    return request<TemplateListResponse>(`/templates?${params.toString()}`);
  }

  /**
   * Trae TODAS las plantillas recorriendo la paginación de la API.
   * El filtrado/búsqueda se hace del lado del cliente en el DataTable.
   */
  async listAllTemplates(): Promise<HelloSignTemplate[]> {
    const first = await this.listTemplates(1, 100);
    const templates = [...first.templates];

    const numPages = Math.min(first.list_info?.num_pages ?? 1, MAX_PAGES);
    for (let page = 2; page <= numPages; page += 1) {
      const next = await this.listTemplates(page, 100);
      templates.push(...next.templates);
    }

    return templates;
  }

  /** Detalle completo de una plantilla. */
  async getTemplate(templateId: string): Promise<HelloSignTemplate | null> {
    const data = await request<{ template: HelloSignTemplate | null }>(
      `/templates/${templateId}`,
    );
    return data.template;
  }

  /**
   * Crea un borrador de plantilla y devuelve el edit_url del editor embebido.
   * Se manda FormData a proposito: el browser arma el multipart y el backend lo
   * reenvia sin tocarlo. No hay que setear Content-Type a mano.
   */
  async createEmbeddedDraft(form: FormData): Promise<EmbeddedDraftResponse> {
    return request<EmbeddedDraftResponse>('/templates/embedded-draft', {
      method: 'POST',
      body: form,
    });
  }

  /**
   * Sube un documento nuevo conservando los campos de una plantilla existente.
   * Devuelve el ID de la plantilla NUEVA (la original sigue existiendo: la API
   * no reemplaza in-place). El proceso es asincronico del lado de Dropbox Sign.
   */
  async updateTemplateFiles(
    templateId: string,
    form: FormData,
  ): Promise<UpdateFilesResponse> {
    return request<UpdateFilesResponse>(`/templates/${templateId}/update-files`, {
      method: 'POST',
      body: form,
    });
  }

  /** Elimina una plantilla. Es definitivo: Dropbox Sign no tiene papelera. */
  async deleteTemplate(templateId: string): Promise<void> {
    await request<{ ok: boolean }>(`/templates/${templateId}`, { method: 'DELETE' });
  }

  /**
   * URL del documento (PDF) de una plantilla, servida por nuestro backend.
   * Se devuelve la URL en vez del contenido para que el visor decida si la
   * consume como blob, la abre en una pestaña nueva o la descarga.
   */
  getTemplateFileUrl(templateId: string, fileType: 'pdf' | 'zip' = 'pdf'): string {
    return `${API_BASE}/templates/${templateId}/file?file_type=${fileType}`;
  }

  /** Envía una solicitud de firma usando una plantilla. */
  async sendWithTemplate(
    payload: SendWithTemplatePayload,
  ): Promise<SendWithTemplateResponse> {
    return request<SendWithTemplateResponse>('/signature-request/send-with-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

export const hellosignService = new HelloSignService();

/* -------------------------------------------------------------------------- */
/* Helpers de presentación                                                    */
/* -------------------------------------------------------------------------- */

/** `updated_at` viene en segundos epoch. */
export function formatFechaHelloSign(timestamp?: number | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Texto para la columna "Quiénes pueden acceder". */
export function getAccesoLabel(template: HelloSignTemplate): string {
  const total = template.accounts?.length ?? 0;
  if (total <= 1) return 'Solo tú';
  return `Equipo (${total})`;
}

/** true si la plantilla está compartida con más de una cuenta. */
export function isCompartida(template: HelloSignTemplate): boolean {
  return (template.accounts?.length ?? 0) > 1;
}

/** true si se actualizó dentro de los últimos `dias`. */
export function actualizadaEnUltimosDias(
  template: HelloSignTemplate,
  dias: number,
): boolean {
  if (!template.updated_at) return false;
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  return template.updated_at * 1000 >= limite;
}
