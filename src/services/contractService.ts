// src/services/contractService.ts
// Servicio para generación de contratos desde el wizard de Programación

export interface ContractGenerationRequest {
  // Modo A CARGO
  conductor_id?: string | null
  tipo_documento?: string | null
  // Modo TURNO
  conductor_diurno_id?: string | null
  conductor_nocturno_id?: string | null
  documento_diurno?: string | null
  documento_nocturno?: string | null
  // Común
  vehiculo_id: string
  modalidad: 'turno' | 'a_cargo'
  sede_id?: string | null
  programacion_id?: string | null
  created_by?: string | null
  created_by_name?: string | null
}

export interface GeneratedDocument {
  conductor_id: string
  conductor_nombre: string
  turno: string | null
  googleDocUrl: string
  pdfUrl: string
  folderUrl: string
  folderId: string
}

export interface ContractGenerationResponse {
  success: boolean
  documents: GeneratedDocument[]
  message?: string
  error?: string
}

/**
 * Invoca el endpoint de generación de contratos en el servidor.
 * Retorna los documentos generados con sus URLs de Drive.
 */
export async function generateContracts(
  params: ContractGenerationRequest
): Promise<ContractGenerationResponse> {
  try {
    const response = await fetch('/api/generate-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        documents: [],
        error: data.error || 'Error al generar documentos'
      }
    }

    return {
      success: true,
      documents: data.documents || [],
      message: data.message
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return {
      success: false,
      documents: [],
      error: msg
    }
  }
}
