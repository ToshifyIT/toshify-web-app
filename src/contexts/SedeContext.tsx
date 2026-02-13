// src/contexts/SedeContext.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @fileoverview Context para manejo de sedes
 * El usuario tiene una sede por defecto (de su perfil) pero puede cambiar
 * si tiene permisos. Los admins ven todas las sedes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export interface Sede {
  id: string
  nombre: string
  codigo: string
  pais: string
  ciudad: string
  direccion: string | null
  telefono: string | null
  email: string | null
  es_principal: boolean
  activa: boolean
  created_at: string
  updated_at: string
}

interface SedeContextType {
  /** Todas las sedes disponibles */
  sedes: Sede[]
  /** Sede actualmente seleccionada */
  sedeActual: Sede | null
  /** ID de la sede actualmente seleccionada */
  sedeActualId: string | null
  /** Sede por defecto del usuario (de su perfil) */
  sedeUsuario: Sede | null
  /** Cargando sedes */
  loading: boolean
  /** Cambiar sede seleccionada */
  cambiarSede: (sedeId: string) => void
  /** Si el usuario puede cambiar de sede (admins) */
  puedeVerTodasSedes: boolean
}

const SedeContext = createContext<SedeContextType | undefined>(undefined)

const SEDE_KEY = 'toshify-sede-id'

export function SedeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [sedes, setSedes] = useState<Sede[]>([])
  const [sedeActual, setSedeActual] = useState<Sede | null>(null)
  const [sedeUsuario, setSedeUsuario] = useState<Sede | null>(null)
  const [loading, setLoading] = useState(true)

  // Admins y superadmins pueden ver todas las sedes
  const roleName = (profile?.roles?.name || '').toLowerCase()
  const puedeVerTodasSedes = roleName === 'admin' || roleName === 'superadmin' || roleName === 'administrador'

  // Cargar sedes
  useEffect(() => {
    if (!profile) return

    const cargarSedes = async () => {
      try {
        const { data, error } = await (supabase
          .from('sedes') as any)
          .select('*')
          .eq('activa', true)
          .order('es_principal', { ascending: false })
          .order('nombre')

        if (error) throw error

        const sedesData = (data || []) as Sede[]
        setSedes(sedesData)

        // Determinar sede del usuario
        const userSedeId = (profile as any).sede_id
        const sedeDelUsuario = userSedeId
          ? sedesData.find(s => s.id === userSedeId) || null
          : sedesData.find(s => s.es_principal) || sedesData[0] || null

        setSedeUsuario(sedeDelUsuario)

        // Recuperar sede guardada en localStorage (solo si puede ver todas)
        const storedSedeId = localStorage.getItem(SEDE_KEY)
        if (puedeVerTodasSedes && storedSedeId) {
          const storedSede = sedesData.find(s => s.id === storedSedeId)
          if (storedSede) {
            setSedeActual(storedSede)
          } else {
            setSedeActual(sedeDelUsuario)
          }
        } else {
          setSedeActual(sedeDelUsuario)
        }
      } catch (error) {
        console.error('Error cargando sedes:', error)
        // Fallback: sin sede
      } finally {
        setLoading(false)
      }
    }

    cargarSedes()
  }, [profile, puedeVerTodasSedes])

  const cambiarSede = useCallback((sedeId: string) => {
    const sede = sedes.find(s => s.id === sedeId)
    if (sede) {
      setSedeActual(sede)
      localStorage.setItem(SEDE_KEY, sedeId)
    }
  }, [sedes])

  const sedeActualId = sedeActual?.id || null

  return (
    <SedeContext.Provider value={{
      sedes,
      sedeActual,
      sedeActualId,
      sedeUsuario,
      loading,
      cambiarSede,
      puedeVerTodasSedes,
    }}>
      {children}
    </SedeContext.Provider>
  )
}

/**
 * Hook para acceder al contexto de sede
 */
export function useSede(): SedeContextType {
  const context = useContext(SedeContext)
  if (context === undefined) {
    throw new Error('useSede debe usarse dentro de SedeProvider')
  }
  return context
}
