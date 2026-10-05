// src/lib/authRedirectError.ts
/**
 * Mensajes de error de autenticación que se muestran en la pantalla de login.
 *
 * Al volver de "Continuar con Google", si Supabase Auth rechaza el ingreso (p. ej.
 * DISABLE_SIGNUP=true y el correo no tiene cuenta), redirige con el error en la URL
 * (?error=…&error_description=… o en el #hash). Esa URL es /estado-de-flota, que sin
 * sesión rebota a /login y el error se perdería. Por eso este módulo se importa
 * PRIMERO en main.tsx: captura el error antes de cualquier redirección (y antes de que
 * supabase-js procese la URL), lo guarda en sessionStorage y limpia la URL.
 */

const CLAVE = 'toshify_auth_error'

export const MENSAJE_CUENTA_INEXISTENTE =
  'Esa cuenta no existe en Toshify. Pedile a un administrador que te cree el usuario.'

export function guardarErrorAuth(mensaje: string): void {
  try {
    sessionStorage.setItem(CLAVE, mensaje)
  } catch {
    // sessionStorage no disponible (modo privado estricto): el mensaje no se muestra
  }
}

/** Devuelve el mensaje pendiente (si hay) y lo borra para que no se repita. */
export function tomarErrorAuth(): string | null {
  try {
    const mensaje = sessionStorage.getItem(CLAVE)
    if (mensaje) sessionStorage.removeItem(CLAVE)
    return mensaje
  } catch {
    return null
  }
}

function capturarErrorDeUrl(): void {
  try {
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const error = query.get('error') || hash.get('error')
    if (!error) return

    const descripcion = query.get('error_description') || hash.get('error_description') || ''
    const codigo = query.get('error_code') || hash.get('error_code') || ''
    // GoTrue con DISABLE_SIGNUP: "Signups not allowed for this instance" / error_code signup_disabled
    const sinCuenta = /signup|sign up|not allowed/i.test(`${descripcion} ${codigo}`)

    guardarErrorAuth(
      sinCuenta
        ? MENSAJE_CUENTA_INEXISTENTE
        : `No se pudo iniciar sesión con Google${descripcion ? `: ${descripcion}` : '.'}`
    )

    // Limpiar la URL para que el error no se repita al recargar.
    query.delete('error')
    query.delete('error_description')
    query.delete('error_code')
    const search = query.toString()
    const hashFinal = hash.has('error') ? '' : window.location.hash
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${hashFinal}`)
  } catch {
    // Nunca bloquear el arranque de la app por esto
  }
}

capturarErrorDeUrl()
