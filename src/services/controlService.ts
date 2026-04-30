// src/services/controlService.ts
// Servicio para completar control de documentos existentes en Google Drive

export interface ControlCompletionRequest {
  conductor_id: string
  asignacion_id?: string | null
  // Campos comunes (todas las sedes)
  km: string
  ltnafta: string
  observations: string
  // Campos adicionales (solo Bariloche)
  cristal_status?: string | null
  carter?: string | null
  tires?: string | null
  others_docs?: string | null
  other_accesory?: string | null
  make_chains?: string | null
  status_chains?: string | null
  tensioners_chains?: string | null
  others_kit?: string | null
}

export interface ControlCompletionResponse {
  success: boolean
  document?: {
    googleDocId: string
    pdfUrl: string | null
    plantillaUsada: string
  }
  error?: string
}

/**
 * Completa el control editando el Google Doc existente y generando el PDF.
 * Usa Google Docs API (replaceAllText) para reemplazar placeholders directamente.
 */
export async function completeControl(
  params: ControlCompletionRequest
): Promise<ControlCompletionResponse> {
  try {
    const response = await fetch('/api/complete-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Error al completar control'
      }
    }

    return {
      success: true,
      document: data.document
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return {
      success: false,
      error: msg
    }
  }
}
