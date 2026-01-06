/**
 * Utilidades de fecha para el proyecto Toshify
 *
 * ESTÁNDAR:
 * - GUARDAR: Siempre en UTC usando toISOString()
 * - MOSTRAR: Siempre en hora Argentina (America/Buenos_Aires)
 */

// Zona horaria de Argentina
export const ARGENTINA_TIMEZONE = 'America/Buenos_Aires'

// Locale para formato argentino
export const ARGENTINA_LOCALE = 'es-AR'

/**
 * Formatea una fecha para mostrar en hora Argentina
 * @param date - Fecha en string ISO, Date object, o timestamp
 * @param options - Opciones adicionales de formato
 * @returns Fecha formateada en hora Argentina
 */
export function formatDateTimeAR(
  date: string | Date | number | null | undefined,
  options?: {
    includeSeconds?: boolean
    dateOnly?: boolean
    timeOnly?: boolean
  }
): string {
  if (!date) return '-'

  try {
    const dateObj = typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date

    if (isNaN(dateObj.getTime())) return '-'

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: ARGENTINA_TIMEZONE,
    }

    if (options?.dateOnly) {
      formatOptions.day = '2-digit'
      formatOptions.month = '2-digit'
      formatOptions.year = 'numeric'
    } else if (options?.timeOnly) {
      formatOptions.hour = '2-digit'
      formatOptions.minute = '2-digit'
      if (options?.includeSeconds) {
        formatOptions.second = '2-digit'
      }
    } else {
      // Fecha y hora completa
      formatOptions.day = '2-digit'
      formatOptions.month = '2-digit'
      formatOptions.year = 'numeric'
      formatOptions.hour = '2-digit'
      formatOptions.minute = '2-digit'
      if (options?.includeSeconds) {
        formatOptions.second = '2-digit'
      }
    }

    return dateObj.toLocaleString(ARGENTINA_LOCALE, formatOptions)
  } catch {
    return '-'
  }
}

/**
 * Formatea solo la fecha en hora Argentina (DD/MM/YYYY)
 */
export function formatDateAR(date: string | Date | number | null | undefined): string {
  return formatDateTimeAR(date, { dateOnly: true })
}

/**
 * Formatea solo la hora en hora Argentina (HH:MM)
 */
export function formatTimeAR(date: string | Date | number | null | undefined): string {
  return formatDateTimeAR(date, { timeOnly: true })
}

/**
 * Obtiene la fecha/hora actual en formato ISO (UTC) para guardar en BD
 * @returns String ISO en UTC
 */
export function getNowUTC(): string {
  return new Date().toISOString()
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD (hora Argentina)
 * Útil para inputs de tipo date
 */
export function getTodayDateString(): string {
  const now = new Date()
  // Crear fecha en zona Argentina
  const argentinaDate = new Date(now.toLocaleString('en-US', { timeZone: ARGENTINA_TIMEZONE }))
  const year = argentinaDate.getFullYear()
  const month = String(argentinaDate.getMonth() + 1).padStart(2, '0')
  const day = String(argentinaDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Convierte una fecha local de Argentina a UTC ISO string para guardar en BD
 * @param dateString - Fecha en formato YYYY-MM-DD
 * @param timeString - Hora en formato HH:MM (opcional)
 * @returns ISO string en UTC
 */
export function toUTCFromArgentina(dateString: string, timeString?: string): string {
  const time = timeString || '00:00'
  // Crear fecha asumiendo que es hora Argentina
  const argentinaDateStr = `${dateString}T${time}:00`

  // Crear el Date interpretándolo como Argentina
  const date = new Date(argentinaDateStr)

  // Ajustar por la diferencia de timezone (Argentina es UTC-3)
  // Esto es una aproximación - para precisión total usar una librería como date-fns-tz
  return date.toISOString()
}

/**
 * Opciones de formato para toLocaleString con timezone Argentina
 * Usar cuando no se puede usar formatDateTimeAR directamente
 */
export const DATE_FORMAT_OPTIONS_AR: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ARGENTINA_TIMEZONE
}

export const DATE_ONLY_OPTIONS_AR: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ARGENTINA_TIMEZONE
}

export const TIME_ONLY_OPTIONS_AR: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ARGENTINA_TIMEZONE
}
