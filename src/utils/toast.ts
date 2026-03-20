/**
 * Toast notifications using SweetAlert2
 * Estilo banner/toast en la parte superior de la pantalla
 */
import Swal from 'sweetalert2'

const ICONS: Record<string, string> = {
  success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
}

function fireToast(type: string, title: string, text?: string) {
  const subtitle = text ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${text}</div>` : ''
  return Swal.fire({
    toast: true,
    position: 'top',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    iconHtml: ICONS[type] || ICONS.info,
    title: `<div style="display:flex;flex-direction:column;"><span>${title}</span>${subtitle}</div>`,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer
      toast.onmouseleave = Swal.resumeTimer
    },
    customClass: {
      popup: `toast-popup swal2-icon-${type}`,
      title: 'toast-title',
      icon: 'toast-icon-custom'
    }
  })
}

/**
 * Muestra un toast de éxito
 */
export function showSuccess(title: string, text?: string) {
  return fireToast('success', title, text)
}

/**
 * Muestra un toast de error
 */
export function showError(title: string, text?: string) {
  return fireToast('error', title, text)
}

/**
 * Muestra un toast de advertencia
 */
export function showWarning(title: string, text?: string) {
  return fireToast('warning', title, text)
}

/**
 * Muestra un toast de información
 */
export function showInfo(title: string, text?: string) {
  return fireToast('info', title, text)
}

// Export default para uso directo
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo
}
