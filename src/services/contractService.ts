// src/services/contractService.ts
// Servicio para generación de contratos desde el wizard de Programación

/**
 * Tope de espera de /api/generate-contract.
 *
 * Esa ruta la sirve server.js en el puerto 3001 (script `dev:api`), un proceso
 * APARTE del dev server de Vite. Sin tope, si no está levantado o se cuelga, el
 * fetch puede quedar esperando para siempre. Eso antes no se notaba porque la
 * llamada era "fire and forget"; ahora el envío a entrega la ESPERA, así que un
 * cuelgue dejaría al operador con la pantalla tapada y sin salida.
 *
 * Más generoso que el de Drive (15s) porque acá se arma un documento por
 * conductor: son varias llamadas a Google encadenadas del lado del servidor.
 */
const TIMEOUT_CONTRATO_MS = 60000

function signalConTimeout(): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(TIMEOUT_CONTRATO_MS)
  } catch {
    // Navegadores sin AbortSignal.timeout: se pierde el tope, no la función.
    return undefined
  }
}

export interface ContractGenerationRequest {
  // Modo A CARGO
  conductor_id?: string | null
  tipo_documento?: string | null
  /** 'antigua' | 'nueva'. Define el concepto de alquiler y, con él, el importe
   *  que se imprime en el documento. */
  tipo_tarifa?: string | null
  // Modo TURNO
  conductor_diurno_id?: string | null
  conductor_nocturno_id?: string | null
  documento_diurno?: string | null
  documento_nocturno?: string | null
  /** Tarifa por turno: en modalidad turno cada conductor puede tener la suya. */
  tipo_tarifa_diurno?: string | null
  tipo_tarifa_nocturno?: string | null
  // Común
  vehiculo_id: string
  modalidad: 'turno' | 'a_cargo'
  sede_id?: string | null
  programacion_id?: string | null
  propietario?: string | null
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
      body: JSON.stringify(params),
      signal: signalConTimeout()
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
    // Un timeout llega como AbortError: se traduce a un mensaje que diga algo
    // al operador en vez de "signal is aborted without reason".
    const esTimeout = error instanceof Error && error.name === 'TimeoutError'
    const msg = esTimeout
      ? `El servidor no respondió en ${Math.round(TIMEOUT_CONTRATO_MS / 1000)} segundos.`
      : error instanceof Error ? error.message : 'Error desconocido'
    return {
      success: false,
      documents: [],
      error: msg
    }
  }
}
