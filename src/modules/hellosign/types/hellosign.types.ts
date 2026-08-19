// src/modules/hellosign/types/hellosign.types.ts
/**
 * Tipos de la API de Dropbox Sign (ex HelloSign).
 * Referencia: https://developers.hellosign.com/api/reference/
 */

export interface HelloSignRole {
  name: string;
  order?: number | null;
}

export interface HelloSignQuotas {
  api_signature_requests_left?: number | null;
  documents_left?: number | null;
  templates_left?: number | null;
  sms_verifications_left?: number | null;
}

export interface HelloSignAccount {
  account_id: string;
  email_address?: string | null;
  is_locked?: boolean | null;
  is_paid_hs?: boolean | null;
  is_paid_hf?: boolean | null;
  quotas?: HelloSignQuotas | null;
}

export interface HelloSignFormField {
  api_id?: string;
  name?: string;
  type?: string;
  signer?: string | number;
  required?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  page?: number | null;
}

export interface HelloSignCustomField {
  name: string;
  type?: string;
  api_id?: string;
  signer?: string | number | null;
  required?: boolean;
}

export interface HelloSignDocument {
  name: string;
  index: number;
  field_groups?: unknown[];
  form_fields?: HelloSignFormField[];
  custom_fields?: HelloSignCustomField[];
}

export interface HelloSignTemplate {
  template_id: string;
  title: string;
  message?: string | null;
  updated_at: number;
  is_embedded?: boolean | null;
  is_creator?: boolean | null;
  can_edit?: boolean | null;
  is_locked?: boolean | null;
  metadata?: Record<string, unknown>;
  signer_roles?: HelloSignRole[];
  cc_roles?: HelloSignRole[];
  documents?: HelloSignDocument[];
  accounts?: HelloSignAccount[];
  custom_fields?: HelloSignCustomField[];
  named_form_fields?: HelloSignFormField[];
}

export interface HelloSignListInfo {
  num_pages: number;
  num_results: number;
  page: number;
  page_size: number;
}

export interface TemplateListResponse {
  templates: HelloSignTemplate[];
  list_info: HelloSignListInfo;
}

export interface HelloSignStatus {
  configured: boolean;
  connected: boolean;
  hasClientId?: boolean;
  /** client_id de la app; el SDK embebido lo necesita en el browser. */
  clientId?: string | null;
  message?: string;
  account?: {
    account_id: string | null;
    email_address: string | null;
    is_locked: boolean | null;
  };
}

export interface EmbeddedDraft {
  template_id: string;
  edit_url: string;
  expires_at?: number;
}

export interface EmbeddedDraftResponse {
  template: EmbeddedDraft | null;
}

export interface UpdateFilesResponse {
  template: { template_id: string } | null;
}

export interface SendWithTemplateSigner {
  role: string;
  name: string;
  email_address: string;
}

export interface SendWithTemplateCc {
  role: string;
  email_address: string;
}

export interface SendWithTemplateCustomField {
  name: string;
  value: string;
}

export interface SendWithTemplatePayload {
  template_id: string;
  subject?: string;
  message?: string;
  signers: SendWithTemplateSigner[];
  ccs?: SendWithTemplateCc[];
  custom_fields?: SendWithTemplateCustomField[];
  test_mode?: boolean;
}

export interface SignatureRequestSignature {
  signature_id: string;
  signer_email_address?: string | null;
  signer_name?: string | null;
  status_code?: string | null;
}

export interface SignatureRequest {
  signature_request_id: string;
  title?: string | null;
  subject?: string | null;
  message?: string | null;
  is_complete?: boolean | null;
  test_mode?: boolean | null;
  signing_url?: string | null;
  details_url?: string | null;
  signatures?: SignatureRequestSignature[];
}

export interface SendWithTemplateResponse {
  signature_request: SignatureRequest | null;
}
