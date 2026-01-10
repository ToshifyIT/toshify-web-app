// src/services/driveService.ts
// Servicio para integración con Google Drive

interface CreateFolderResponse {
  success: boolean
  folderId?: string
  folderUrl?: string
  folderName?: string
  error?: string
}

/**
 * Crea una carpeta en Google Drive para un conductor
 * @param conductorId - UUID del conductor
 * @param conductorNombre - Nombre completo del conductor
 * @param conductorDni - DNI del conductor (opcional)
 * @returns Objeto con el ID y URL de la carpeta creada
 */
export async function createConductorDriveFolder(
  conductorId: string,
  conductorNombre: string,
  conductorDni?: string | null
): Promise<CreateFolderResponse> {
  try {
    const response = await fetch('/api/create-drive-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: 'conductor',
        conductorId,
        conductorNombre,
        conductorDni: conductorDni || undefined
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error creating folder:', data)
      return {
        success: false,
        error: data.error || 'Error al crear carpeta en Drive'
      }
    }

    return {
      success: true,
      folderId: data.folderId,
      folderUrl: data.folderUrl,
      folderName: data.folderName
    }

  } catch (error: any) {
    console.error('Error creating Drive folder:', error)
    return {
      success: false,
      error: error.message || 'Error desconocido al crear carpeta'
    }
  }
}

/**
 * Abre la carpeta de Drive del conductor en una nueva pestaña
 * @param folderUrl - URL de la carpeta en Drive
 */
export function openDriveFolder(folderUrl: string): void {
  window.open(folderUrl, '_blank', 'noopener,noreferrer')
}
