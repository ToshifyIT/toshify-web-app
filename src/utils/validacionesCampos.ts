// src/utils/validacionesCampos.ts
//
// Validaciones de FORMATO de los campos de una persona (documento, contacto,
// fechas). Son independientes de si el campo es obligatorio: esto responde
// "¿lo que hay escrito tiene forma de DNI?", no "¿hay algo escrito?".
//
// Cada funcion devuelve null si el valor es valido, o el mensaje de error para
// mostrar. Un valor vacio SIEMPRE devuelve null: la obligatoriedad se decide
// aparte, en cada pantalla.

/** Deja solo digitos. */
export function soloDigitos(valor: string): string {
  return (valor || '').replace(/\D/g, '')
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Edad minima para ser conductor. */
export const EDAD_MINIMA_CONDUCTOR = 18

/** DNI argentino: 7 u 8 digitos, sin letras. */
export function validarDni(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (/[^\d.\s]/.test(v)) return 'El DNI solo puede tener numeros'
  const d = soloDigitos(v)
  if (d.length < 7 || d.length > 8) return 'El DNI debe tener 7 u 8 digitos'
  return null
}

/**
 * CUIT/CUIL: 11 digitos y digito verificador correcto (modulo 11).
 *
 * Se valida el verificador y no solo el largo porque es lo que detecta el
 * error real: un CUIT tipeado con un digito cambiado tiene 11 digitos igual.
 */
export function validarCuit(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (/[^\d\-.\s]/.test(v)) return 'El CUIT solo puede tener numeros y guiones'
  const d = soloDigitos(v)
  if (d.length !== 11) return 'El CUIT debe tener 11 digitos'

  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let suma = 0
  for (let i = 0; i < 10; i++) suma += Number(d[i]) * multiplicadores[i]
  const resto = suma % 11
  let verificador = 11 - resto
  if (verificador === 11) verificador = 0
  if (verificador === 10) verificador = 9

  if (verificador !== Number(d[10])) return 'El CUIT no es valido (digito verificador)'
  return null
}

export function validarEmail(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  return RE_EMAIL.test(v) ? null : 'El email no tiene un formato valido'
}

/**
 * Telefono: se aceptan +, espacios, guiones y parentesis porque asi vienen
 * cargados; lo que se exige es que queden entre 8 y 15 digitos (E.164).
 */
export function validarTelefono(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (/[^\d+()\-.\s]/.test(v)) return 'El telefono tiene caracteres invalidos'
  const d = soloDigitos(v)
  if (d.length < 8) return 'El telefono es demasiado corto'
  if (d.length > 15) return 'El telefono es demasiado largo'
  return null
}

/** Codigo de area + numero de un telefono argentino (ej: 11 + 8 digitos, 3484 + 6). */
const LARGO_NACIONAL_AR = 10

/** Quita el 15 que se intercala despues del codigo de area (11-15-xxxx, 351-15-xxx, 2944-15-xx). */
function quitar15(d: string): string {
  if (/^[23]\d{3}15\d+/.test(d)) return d.slice(0, 4) + d.slice(6)
  if (/^[23]\d{2}15\d+/.test(d)) return d.slice(0, 3) + d.slice(5)
  if (/^1115\d+/.test(d)) return '11' + d.slice(4)
  return d
}

/**
 * Area + numero argentino (10 digitos, empieza con 11, 2 o 3) a partir de los
 * digitos tal como vinieron, o null si no encaja. Quita lo que suele sobrar:
 * 00 / 054 / 54 (pais), 9 (celular), 0 (area), 15 intercalado y un 11 repetido
 * ("+11 11 2399-5885", tipico del formulario web).
 */
function nacionalAR(digitos: string): string | null {
  let d = digitos
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('054') && d.length >= 12) d = d.slice(1)
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2)
  if (d.startsWith('9') && d.length === LARGO_NACIONAL_AR + 1) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === LARGO_NACIONAL_AR + 2 && d.startsWith('1111')) d = d.slice(2)
  if (d.length === LARGO_NACIONAL_AR + 2) d = quitar15(d)
  return d.length === LARGO_NACIONAL_AR && /^(11|[23])/.test(d) ? d : null
}

/**
 * Celular en el formato en que se guarda: `+549` + codigo de area + numero
 * (mismo criterio que el trigger de la tabla leads, sql/normalizar_telefono_leads.sql).
 * Acepta como lo tipea la gente: "11 1234-5678", "011 15 1234-5678",
 * "+54 11 1234 5678", "+54 9 3484 310602", "+03484310602".
 *
 *  - Primero Argentina: si los digitos encajan como area + numero argentino se
 *    guarda +549..., aunque vengan con un "+" delante ("+1122494176" es 11 2249-4176).
 *  - 9: es el prefijo de celular para WhatsApp; si falta, se agrega.
 *  - Codigo de area: 11 (AMBA) u otro (28xx, 351, 3484...). Area + numero
 *    tienen que sumar 10 digitos.
 *
 * Si no encaja como argentino y vino con codigo internacional (+598, +55...),
 * se respeta como numero de otro pais. Devuelve null si no se puede interpretar.
 */
export function normalizarCelularAR(valor: string | null | undefined): string | null {
  // Al copiar un numero desde WhatsApp vienen marcas invisibles de direccion de texto
  const v = (valor || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim()
  if (!v || /[^\d+()\-.\s]/.test(v)) return null

  const d = soloDigitos(v)
  const nacional = nacionalAR(d)
  if (nacional) return `+549${nacional}`

  // Codigo de otro pais (ningun codigo de pais empieza con 0: un "+0..." es un tipeo)
  const internacional = v.startsWith('+') || d.startsWith('00')
  const sinPrefijo = d.startsWith('00') ? d.slice(2) : d
  if (internacional && !sinPrefijo.startsWith('54') && !sinPrefijo.startsWith('0')) {
    return sinPrefijo.length >= 8 && sinPrefijo.length <= 15 ? `+${sinPrefijo}` : null
  }
  return null
}

/** Celular argentino (o con codigo de otro pais). Ver normalizarCelularAR. */
export function validarCelularAR(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (normalizarCelularAR(v)) return null
  return 'Celular invalido: debe tener codigo de area y numero (ej: 11 1234-5678 o +54 9 11 1234-5678)'
}

/** Fecha 'YYYY-MM-DD' real (rechaza 31/02 y similares). */
function esFechaValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return false
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  return (
    d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  )
}

/** Años cumplidos a hoy. */
export function calcularEdad(fechaIso: string): number {
  const nac = new Date(`${fechaIso.substring(0, 10)}T00:00:00`)
  const hoy = new Date()
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

/** Fecha de nacimiento: real, pasada y con al menos EDAD_MINIMA_CONDUCTOR. */
export function validarFechaNacimiento(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (!esFechaValida(v)) return 'La fecha no es valida'
  const edad = calcularEdad(v)
  if (edad < 0) return 'La fecha de nacimiento no puede ser futura'
  if (edad < EDAD_MINIMA_CONDUCTOR) return `Debe tener al menos ${EDAD_MINIMA_CONDUCTOR} años`
  if (edad > 100) return 'La fecha de nacimiento no parece correcta'
  return null
}

/**
 * Vencimiento de licencia: solo se exige que sea una fecha real.
 *
 * NO se rechaza una fecha pasada a proposito: "licencia vencida" es un estado
 * legitimo del sistema (ver estadoLicencia) y bloquear la carga escondería el
 * dato en vez de mostrarlo.
 */
export function validarFechaVencimiento(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  return esFechaValida(v) ? null : 'La fecha no es valida'
}

/** Nro. de licencia: alfanumerico, entre 5 y 20 caracteres. */
export function validarNumeroLicencia(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (!/^[A-Za-z0-9\-.\s]+$/.test(v)) return 'El numero de licencia tiene caracteres invalidos'
  const limpio = v.replace(/[\s\-.]/g, '')
  if (limpio.length < 5) return 'El numero de licencia es demasiado corto'
  if (limpio.length > 20) return 'El numero de licencia es demasiado largo'
  return null
}

/**
 * Nombre completo: al menos dos palabras.
 *
 * No es capricho: la conversion parte el nombre a la mitad para llenar
 * `nombres` y `apellidos` del conductor. Con una sola palabra, `apellidos`
 * queda vacio.
 */
export function validarNombreCompleto(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (/\d/.test(v)) return 'El nombre no puede tener numeros'
  const palabras = v.split(/\s+/).filter(Boolean)
  if (palabras.length < 2) return 'Ingresa nombre y apellido'
  if (v.length < 5) return 'El nombre es demasiado corto'
  return null
}

/** URL http/https. */
export function validarUrl(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'El link debe empezar con http:// o https://'
    return null
  } catch {
    return 'El link no es una URL valida'
  }
}

/** Direccion: algo con calle y numero, no una sola palabra. */
export function validarDireccion(valor: string | null | undefined): string | null {
  const v = (valor || '').trim()
  if (!v) return null
  if (v.length < 6) return 'La direccion es demasiado corta'
  return null
}
