// src/modules/integraciones/uss/utils/uss.utils.ts
/**
 * Utilidades para el módulo USS
 */

import { SEVERITY_THRESHOLDS, SEVERITY_COLORS } from '../constants/uss.constants'

/**
 * Obtiene el nivel de severidad de un exceso
 */
export function getSeverityLevel(exceso: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (exceso >= SEVERITY_THRESHOLDS.CRITICAL) return 'CRITICAL'
  if (exceso >= SEVERITY_THRESHOLDS.HIGH) return 'HIGH'
  if (exceso >= SEVERITY_THRESHOLDS.MEDIUM) return 'MEDIUM'
  return 'LOW'
}

/**
 * Obtiene el color según el exceso
 */
export function getSeverityColor(exceso: number): string {
  const severity = getSeverityLevel(exceso)
  return SEVERITY_COLORS[severity]
}

/**
 * Formatea la duración de segundos a formato legible
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return `${hours}h ${remainingMinutes}m`
}

/**
 * Formatea fecha para mostrar en hora Argentina (UTC-3)
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formatea solo la fecha en hora Argentina
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Formatea velocidad con unidad
 */
export function formatSpeed(speed: number): string {
  return `${Math.round(speed)} km/h`
}

/**
 * Extrae el nombre del conductor del formato Wialon
 * Ejemplo: "44 -Leandro Daniel Torres" -> "Leandro Daniel Torres"
 */
export function extractConductorName(wialonName: string | null): string {
  if (!wialonName) return 'Sin conductor'

  // El formato típico es "número -Nombre" o "número- Nombre"
  const match = wialonName.match(/^\d+\s*-\s*(.+)$/)
  return match ? match[1].trim() : wialonName
}

/**
 * Trunca la ubicación si es muy larga
 */
export function truncateLocation(location: string, maxLength: number = 40): string {
  if (!location) return 'Sin ubicación'
  if (location.length <= maxLength) return location
  return location.substring(0, maxLength) + '...'
}

/**
 * Calcula el rango de fechas para un período específico
 */
export function getDateRangeForPeriod(period: 'today' | 'yesterday' | 'week' | 'month'): { start: string; end: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (period) {
    case 'today':
      return {
        start: today.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        start: yesterday.toISOString().split('T')[0],
        end: yesterday.toISOString().split('T')[0],
      }
    }
    case 'week': {
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)
      return {
        start: weekAgo.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
    }
    case 'month': {
      const monthAgo = new Date(today)
      monthAgo.setDate(monthAgo.getDate() - 30)
      return {
        start: monthAgo.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
    }
  }
}
