/**
 * Toasts del sistema (arriba, se van solos; error 6 s, aviso 5 s, info 4 s, éxito 2,5 s).
 * Se dibujan con las alertas propias (components/ui/alertas). El título y el texto
 * se muestran como TEXTO, nunca como HTML.
 */
import { toast } from '../components/ui/alertas'

/** Muestra un toast de éxito */
export function showSuccess(title: string, text?: string) {
  return toast.ok(title, text)
}

/** Muestra un toast de error */
export function showError(title: string, text?: string) {
  return toast.error(title, text)
}

/** Muestra un toast de advertencia */
export function showWarning(title: string, text?: string) {
  return toast.aviso(title, text)
}

/** Muestra un toast de información */
export function showInfo(title: string, text?: string) {
  return toast.info(title, text)
}

export { toast }
export { confirmar, avisar } from '../components/ui/alertas'

// Export default para uso directo
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
}
