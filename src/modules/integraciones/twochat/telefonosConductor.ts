// src/modules/integraciones/twochat/telefonosConductor.ts
// Números a los que se puede llamar a un conductor: el de WhatsApp (telefono_contacto)
// y el secundario (telefono_secundario). Si el secundario falta, no es un número válido
// o es el mismo que el de WhatsApp, queda uno solo y el botón Llamar llama directo.

export type TipoTelefono = 'principal' | 'secundario'

export interface TelefonoLlamada {
  tipo: TipoTelefono
  etiqueta: string
  numero: string
}

const digitos = (t: string | null | undefined) => (t || '').replace(/\D/g, '')

export function telefonosParaLlamar(principal: string | null | undefined, secundario: string | null | undefined): TelefonoLlamada[] {
  const lista: TelefonoLlamada[] = []
  if (digitos(principal).length >= 10) lista.push({ tipo: 'principal', etiqueta: 'WhatsApp', numero: String(principal).trim() })
  const sec = digitos(secundario)
  if (sec.length >= 10 && sec.slice(-10) !== digitos(principal).slice(-10)) {
    lista.push({ tipo: 'secundario', etiqueta: 'Secundario', numero: String(secundario).trim() })
  }
  return lista
}
