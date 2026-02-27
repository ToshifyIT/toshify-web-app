// src/contexts/SedeContext.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @fileoverview Context para manejo de sedes
 * El usuario tiene una sede por defecto (de su perfil) pero puede cambiar
 * si tiene permisos. Los admins ven todas las sedes.
 * sedeActualId = null cuando se selecciona "Todas las sedes"
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
  /** Sede actualmente seleccionada (null si "Todas") */
  sedeActual: Sede | null
  /** ID de la sede actualmente seleccionada (null si "Todas") */
  sedeActualId: string | null
  /** Si está viendo todas las sedes */
  verTodas: boolean
  /** Sede por defecto del usuario (de su perfil) */
  sedeUsuario: Sede | null
  /** Cargando sedes */
  loading: boolean
  /** Cambiar sede seleccionada (usar 'todas' para ver todas) */
  cambiarSede: (sedeId: string) => void
  /** Si el usuario puede cambiar de sede (admins) */
  puedeVerTodasSedes: boolean
  /**
   * Helper para aplicar filtro de sede a una query de supabase.
   * Si verTodas = true, no agrega filtro.
   * Si verTodas = false, agrega .eq('sede_id', sedeActualId)
   */
  aplicarFiltroSede: <T>(query: T, campo?: string) => T
}

const SedeContext = createContext<SedeContextType | undefined>(undefined)

const SEDE_KEY = 'toshify-sede-id'
const TODAS_VALUE = 'todas'

export function SedeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [sedes, setSedes] = useState<Sede[]>([])
  const [sedeActual, setSedeActual] = useState<Sede | null>(null)
  const [verTodas, setVerTodas] = useState(false)
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

        // Determinar sede del usuario: priorizar sede del perfil, sino la principal (CABA)
        const userSedeId = (profile as any).sede_id
        const sedePrincipal = sedesData.find(s => s.es_principal) || sedesData[0] || null
        const sedeDelUsuario = userSedeId
          ? sedesData.find(s => s.id === userSedeId) || sedePrincipal
          : sedePrincipal

        setSedeUsuario(sedeDelUsuario)

        // Recuperar sede guardada en localStorage
        const storedSedeId = localStorage.getItem(SEDE_KEY)
        if (storedSedeId) {
          if (storedSedeId === TODAS_VALUE && puedeVerTodasSedes) {
            setSedeActual(null)
            setVerTodas(true)
          } else if (storedSedeId !== TODAS_VALUE) {
            const storedSede = sedesData.find(s => s.id === storedSedeId)
            if (storedSede) {
              setSedeActual(storedSede)
              setVerTodas(false)
            } else {
              setSedeActual(sedeDelUsuario)
              setVerTodas(false)
            }
          } else {
            setSedeActual(sedeDelUsuario)
            setVerTodas(false)
          }
        } else {
          setSedeActual(sedeDelUsuario)
          setVerTodas(false)
        }
      } catch (error) {
        console.error('Error cargando sedes:', error)
      } finally {
        setLoading(false)
      }
    }

    cargarSedes()
  }, [profile, puedeVerTodasSedes])

  const cambiarSede = useCallback((sedeId: string) => {
    // "Todas las sedes" solo para admins
    if (sedeId === TODAS_VALUE && !puedeVerTodasSedes) return

    if (sedeId === TODAS_VALUE) {
      setSedeActual(null)
      setVerTodas(true)
      localStorage.setItem(SEDE_KEY, TODAS_VALUE)
    } else {
      const sede = sedes.find(s => s.id === sedeId)
      if (sede) {
        setSedeActual(sede)
        setVerTodas(false)
        localStorage.setItem(SEDE_KEY, sedeId)
      }
    }
  }, [sedes, puedeVerTodasSedes])

  const sedeActualId = verTodas ? null : (sedeActual?.id || null)

  // Helper para aplicar filtro de sede a queries
  const aplicarFiltroSede = useCallback(<T,>(query: T, campo = 'sede_id'): T => {
    if (verTodas) return query
    if (!sedeActual?.id) return query
    return (query as any).eq(campo, sedeActual.id)
  }, [verTodas, sedeActual])

  return (
    <SedeContext.Provider value={{
      sedes,
      sedeActual,
      sedeActualId,
      verTodas,
      sedeUsuario,
      loading,
      cambiarSede,
      puedeVerTodasSedes,
      aplicarFiltroSede,
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
