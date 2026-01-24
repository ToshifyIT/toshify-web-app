/**
 * Toast notifications using SweetAlert2
 * Estilo banner/toast en la parte superior de la pantalla
 */
import Swal from 'sweetalert2'

// Configuración base para toasts
const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 2000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer
    toast.onmouseleave = Swal.resumeTimer
  },
  customClass: {
    popup: 'toast-popup',
    title: 'toast-title',
    icon: 'toast-icon'
  }
})

/**
 * Muestra un toast de éxito
 */
export function showSuccess(title: string, text?: string) {
  return Toast.fire({
    icon: 'success',
    title,
    text
  })
}

/**
 * Muestra un toast de error
 */
export function showError(title: string, text?: string) {
  return Toast.fire({
    icon: 'error',
    title,
    text
  })
}

/**
 * Muestra un toast de advertencia
 */
export function showWarning(title: string, text?: string) {
  return Toast.fire({
    icon: 'warning',
    title,
    text
  })
}

/**
 * Muestra un toast de información
 */
export function showInfo(title: string, text?: string) {
  return Toast.fire({
    icon: 'info',
    title,
    text
  })
}

// Export default para uso directo
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo
}
