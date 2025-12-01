// src/utils/security.ts
import { z } from 'zod'
import DOMPurify from 'dompurify'

// =====================================================
// VALIDADORES ZOD
// =====================================================

export const UUIDSchema = z.string().uuid('ID inválido')

export const SearchTermSchema = z.string()
  .max(100, 'Búsqueda demasiado larga')
  .trim()

export const PermissionFieldSchema = z.enum([
  'can_view',
  'can_create',
  'can_edit',
  'can_delete'
])

// =====================================================
// SANITIZACIÓN XSS
// =====================================================

/**
 * Sanitiza un string para prevenir XSS
 * @param dirty - String potencialmente peligroso
 * @returns String sanitizado
 */
export function sanitizeHTML(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // No permitir ningún tag HTML
    ALLOWED_ATTR: [], // No permitir ningún atributo
    KEEP_CONTENT: true // Mantener el contenido del texto
  })
}

/**
 * Sanitiza un objeto completo recursivamente
 * @param obj - Objeto con strings potencialmente peligrosos
 * @returns Objeto sanitizado
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeHTML(value) as any
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key as keyof T] = sanitizeObject(value)
    } else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map(item =>
        typeof item === 'string' ? sanitizeHTML(item) :
        typeof item === 'object' ? sanitizeObject(item) :
        item
      ) as any
    } else {
      sanitized[key as keyof T] = value
    }
  }

  return sanitized
}

// =====================================================
// LOGGING SEGURO
// =====================================================

/**
 * Logger condicional que solo funciona en desarrollo
 */
export const devLog = {
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args)
    }
  },
  error: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(...args)
    }
  },
  warn: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args)
    }
  }
}

// =====================================================
// MANEJO DE ERRORES SEGURO
// =====================================================

export interface SafeErrorResult {
  userMessage: string
  logMessage: string
  shouldRetry: boolean
}

/**
 * Convierte un error de Supabase/DB en un mensaje seguro para el usuario
 * @param error - Error original
 * @returns Objeto con mensaje seguro para usuario y detalles para logs
 */
export function handleDatabaseError(error: any): SafeErrorResult {
  devLog.error('❌ Database error:', error)

  // Errores comunes de Supabase/PostgreSQL
  const errorCode = error?.code || error?.error_code || ''
  const errorMessage = error?.message || ''

  // Violación de foreign key
  if (errorCode === '23503') {
    return {
      userMessage: 'No se puede completar la operación. Verifica que todos los datos sean válidos.',
      logMessage: `FK violation: ${errorMessage}`,
      shouldRetry: false
    }
  }

  // Violación de unique constraint
  if (errorCode === '23505') {
    return {
      userMessage: 'Este registro ya existe en el sistema.',
      logMessage: `Unique violation: ${errorMessage}`,
      shouldRetry: false
    }
  }

  // Violación de permisos (RLS)
  if (errorCode === '42501' || errorMessage.includes('permission denied')) {
    return {
      userMessage: 'No tienes permisos para realizar esta acción.',
      logMessage: `Permission denied: ${errorMessage}`,
      shouldRetry: false
    }
  }

  // Error de conexión
  if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
    return {
      userMessage: 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.',
      logMessage: `Network error: ${errorMessage}`,
      shouldRetry: true
    }
  }

  // Error genérico
  return {
    userMessage: 'Ocurrió un error inesperado. Por favor, intenta nuevamente.',
    logMessage: `Unexpected error: ${errorMessage}`,
    shouldRetry: true
  }
}

// =====================================================
// VALIDACIÓN DE PERMISOS
// =====================================================

export interface PermissionCheck {
  hasPermission: boolean
  reason?: string
}

/**
 * Verifica si un usuario tiene un permiso específico
 * @param userRole - Rol del usuario
 * @param requiredPermission - Permiso requerido
 * @returns Objeto indicando si tiene permiso y razón si no
 */
export function checkPermission(
  userRole: string | undefined,
  requiredPermission: string
): PermissionCheck {
  if (!userRole) {
    return {
      hasPermission: false,
      reason: 'Usuario no autenticado'
    }
  }

  // Lista de roles con permisos administrativos
  const adminRoles = ['admin', 'administrador', 'superadmin']

  if (adminRoles.includes(userRole.toLowerCase())) {
    return { hasPermission: true }
  }

  return {
    hasPermission: false,
    reason: 'Permisos insuficientes para esta acción'
  }
}

// =====================================================
// RATE LIMITING (básico, client-side)
// =====================================================

class RateLimiter {
  private attempts: Map<string, number[]> = new Map()
  private maxAttempts: number
  private windowMs: number

  constructor(maxAttempts: number = 10, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs
  }

  /**
   * Verifica si una acción está dentro del rate limit
   * @param key - Identificador único de la acción
   * @returns true si está permitido, false si excede el límite
   */
  check(key: string): boolean {
    const now = Date.now()
    const attempts = this.attempts.get(key) || []

    // Filtrar intentos dentro de la ventana de tiempo
    const recentAttempts = attempts.filter(time => now - time < this.windowMs)

    if (recentAttempts.length >= this.maxAttempts) {
      devLog.warn(`⚠️ Rate limit exceeded for: ${key}`)
      return false
    }

    // Agregar el intento actual
    recentAttempts.push(now)
    this.attempts.set(key, recentAttempts)

    return true
  }

  /**
   * Limpia intentos antiguos
   */
  cleanup() {
    const now = Date.now()
    for (const [key, attempts] of this.attempts.entries()) {
      const recentAttempts = attempts.filter(time => now - time < this.windowMs)
      if (recentAttempts.length === 0) {
        this.attempts.delete(key)
      } else {
        this.attempts.set(key, recentAttempts)
      }
    }
  }
}

// Instancia global de rate limiter
export const rateLimiter = new RateLimiter(10, 60000) // 10 intentos por minuto

// Limpiar rate limiter cada 5 minutos
if (typeof window !== 'undefined') {
  setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000)
}
