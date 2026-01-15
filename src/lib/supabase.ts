// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase')
}

// Keys para almacenamiento
const STORAGE_KEY = 'toshify-supabase-auth'
const SESSION_BACKUP_KEY = 'toshify-session-backup'

// Custom storage adapter con backup redundante
const customStorage = {
  getItem: (key: string): string | null => {
    try {
      let value = localStorage.getItem(key)

      // Si no hay valor y es la key principal, intentar recuperar del backup
      if (!value && key === STORAGE_KEY) {
        const backup = localStorage.getItem(SESSION_BACKUP_KEY)
        if (backup) {
          console.log('🔄 Recuperando sesión desde backup...')
          localStorage.setItem(key, backup)
          value = backup
        }
      }

      // Siempre guardar backup cuando hay valor
      if (value && key === STORAGE_KEY) {
        localStorage.setItem(SESSION_BACKUP_KEY, value)
      }

      return value
    } catch (error) {
      console.error('Error leyendo localStorage:', error)
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value)

      // Guardar backup de la sesión
      if (key === STORAGE_KEY && value) {
        localStorage.setItem(SESSION_BACKUP_KEY, value)
        console.log('💾 Sesión guardada con backup')
      }
    } catch (error) {
      console.error('Error guardando en localStorage:', error)
    }
  },
  removeItem: (key: string): void => {
    try {
      // NO eliminar automáticamente - solo la key principal
      // El backup se mantiene para recuperación
      localStorage.removeItem(key)
      console.log('🗑️ Storage removido:', key)
    } catch (error) {
      console.error('Error eliminando de localStorage:', error)
    }
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: STORAGE_KEY,
  }
})

// Función para obtener sesión de backup si la principal falla
export const getBackupSession = (): string | null => {
  try {
    return localStorage.getItem(SESSION_BACKUP_KEY)
  } catch {
    return null
  }
}

// Función para limpiar todo al cerrar sesión (SOLO cuando es logout explícito)
export const clearAllAuthStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SESSION_BACKUP_KEY)
    // Limpiar cualquier otro key de Supabase
    Object.keys(localStorage)
      .filter(key => key.includes('supabase') || key.includes('toshify'))
      .forEach(key => localStorage.removeItem(key))
    console.log('🧹 Storage de autenticación limpiado completamente')
  } catch (error) {
    console.error('Error limpiando storage:', error)
  }
}