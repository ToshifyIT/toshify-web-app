// src/pages/integraciones/twochat/TwoChatPage.tsx
// Integraciones > 2Chat: Control de llamadas, Control de mensajes y Contactos
import {
  TwoChatLlamadasModule,
  TwoChatContactosModule,
} from '../../../modules/integraciones/twochat/TwoChatModule'
import { TwoChatMensajesModule } from '../../../modules/integraciones/twochat/TwoChatMensajes'

export function TwoChatLlamadasPage() {
  return <TwoChatLlamadasModule />
}

export function TwoChatContactosPage() {
  return <TwoChatContactosModule />
}

export function TwoChatMensajesPage() {
  return <TwoChatMensajesModule />
}
