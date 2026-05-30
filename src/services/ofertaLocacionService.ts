// src/services/ofertaLocacionService.ts
// Servicio para generación de documentos de Oferta de Locación

export interface OfertaLocacionGenerateRequest {
  oferta_id: string
}

export interface OfertaLocacionGenerateResponse {
  success: boolean
  googleDocUrl?: string
  folderUrl?: string
  message?: string
  error?: string
}

/**
 * Invoca el endpoint de generación de documento de Oferta de Locación.
 * Retorna la URL del documento generado en Drive.
 */
export async function generateOfertaLocacion(
  params: OfertaLocacionGenerateRequest
): Promise<OfertaLocacionGenerateResponse> {
  try {
    const response = await fetch('/api/generate-oferta-locacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Error al generar documento'
      }
    }

    return {
      success: true,
      googleDocUrl: data.googleDocUrl,
      folderUrl: data.folderUrl,
      message: data.message
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return {
      success: false,
      error: msg
    }
  }
}
