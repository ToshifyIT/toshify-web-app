// src/services/controlService.ts
// Servicio para generación de documentos de control desde Asignaciones Activas

export interface ControlGenerationRequest {
  conductor_id: string
  vehiculo_id: string
  modalidad: 'turno' | 'a_cargo'
  turno?: string | null
  sede_id?: string | null
  asignacion_id?: string | null
  created_by?: string | null
  created_by_name?: string | null
  // Campos de control manuales
  km: string
  ltnafta: string
  cristal_status?: string | null  // solo a_cargo
  carter?: string | null          // solo a_cargo
  tires?: string | null           // solo a_cargo
}

export interface ControlGenerationResponse {
  success: boolean
  document?: {
    googleDocUrl: string
    pdfUrl: string | null
    folderUrl: string
    folderId: string
    fileName: string
  }
  error?: string
}

/**
 * Invoca el endpoint de generación de control en el servidor.
 * Genera el documento con los campos de control completados y sube PDF a Drive.
 */
export async function generateControlDocument(
  params: ControlGenerationRequest
): Promise<ControlGenerationResponse> {
  try {
    const response = await fetch('/api/generate-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Error al generar documento de control'
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
