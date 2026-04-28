// src/services/intercomService.ts

export interface IntercomContactRequest {
  conductor_id: string
  email: string
  name: string
  user_id: string
  phone: string
  patente: string | null
  turno: string
  companero: string
  direccion: string
  tiempo_de_antiguedad: string
  dni: string
  primer_nombre: string
}

export interface IntercomContactResponse {
  success: boolean
  intercom_id?: string
  status?: 'Creado' | 'Actualizado' | 'Error'
  message?: string
  error?: string
}

export async function createIntercomContact(
  params: IntercomContactRequest
): Promise<IntercomContactResponse> {
  try {
    const response = await fetch('/api/intercom/create-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    const text = await response.text()
    if (!text) {
      return { success: false, status: 'Error', error: 'El servidor no devolvió respuesta. Verifica que el server esté corriendo en el puerto 3001.' }
    }
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      return { success: false, status: 'Error', error: `Respuesta inválida del servidor: ${text.substring(0, 100)}` }
    }
    if (!response.ok) {
      return { success: false, status: 'Error', error: data.error || 'Error al crear contacto en Intercom' }
    }
    return { success: true, intercom_id: data.intercom_id, status: data.status, message: data.message }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, status: 'Error', error: msg }
  }
}
