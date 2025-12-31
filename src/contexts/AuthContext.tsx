// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserWithRole } from '../types/database.types'
import Swal from 'sweetalert2'

interface AuthContextType {
  user: User | null
  profile: UserWithRole | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Generar token único para esta sesión/pestaña
function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

// Token de esta instancia (pestaña/navegador)
const CURRENT_SESSION_TOKEN = generateSessionToken()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserWithRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Ref para evitar múltiples registros de sesión
  const sessionRegisteredRef = useRef(false)
  // Ref para el canal de Realtime
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    // Obtener sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
        // Registrar sesión activa
        registerActiveSession(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (event === 'SIGNED_IN' && session?.user) {
        loadProfile(session.user.id)
        // Registrar sesión activa al hacer login
        registerActiveSession(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setProfile(null)
        setLoading(false)
        // Limpiar suscripción de sesión
        cleanupSessionChannel()
      }
    })

    return () => {
      subscription.unsubscribe()
      cleanupSessionChannel()
    }
  }, [])

  // Limpiar canal de Realtime
  const cleanupSessionChannel = () => {
    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current)
      sessionChannelRef.current = null
    }
  }

  // Registrar sesión activa en BD
  const registerActiveSession = async (userId: string) => {
    if (sessionRegisteredRef.current) return
    sessionRegisteredRef.current = true

    try {
      // Obtener info del dispositivo
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`

      // Upsert: Actualizar o insertar sesión (una sola por usuario)
      // Usamos 'as any' porque la tabla fue agregada después de generar los tipos
      const { error } = await (supabase
        .from('user_sessions') as any)
        .upsert({
          user_id: userId,
          session_token: CURRENT_SESSION_TOKEN,
          device_info: deviceInfo,
          last_activity: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error registrando sesión:', error)
        return
      }

      console.log('📱 Sesión registrada:', CURRENT_SESSION_TOKEN.substring(0, 10) + '...')

      // Suscribirse a cambios en la sesión del usuario
      subscribeToSessionChanges(userId)

    } catch (error) {
      console.error('Error en registerActiveSession:', error)
    }
  }

  // Suscribirse a cambios de sesión (para detectar login en otro dispositivo)
  const subscribeToSessionChanges = (userId: string) => {
    // Limpiar canal anterior si existe
    cleanupSessionChannel()

    sessionChannelRef.current = supabase
      .channel(`user_session_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_sessions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newSession = payload.new as { session_token?: string }

          // Si el token cambió y no es el nuestro, nos desloguearon
          if (newSession.session_token && newSession.session_token !== CURRENT_SESSION_TOKEN) {
            console.log('🚫 Sesión invalidada: Login detectado en otro dispositivo')
            handleForcedLogout()
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Monitoreando sesión activa')
        }
      })
  }

  // Manejar logout forzado (sesión iniciada en otro lugar)
  const handleForcedLogout = async () => {
    // Mostrar alerta antes de cerrar sesión
    await Swal.fire({
      icon: 'warning',
      title: 'Sesión cerrada',
      text: 'Se inició sesión en otro dispositivo o navegador. Solo se permite una sesión activa.',
      confirmButtonText: 'Entendido',
      allowOutsideClick: false,
      allowEscapeKey: false,
    })

    // Cerrar sesión localmente (sin eliminar de BD ya que la nueva sesión está activa)
    sessionRegisteredRef.current = false
    cleanupSessionChannel()
    await supabase.auth.signOut()
  }

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          roles (*)
        `)
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data as UserWithRole)
    } catch (error) {
      console.error('Error cargando perfil:', error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    sessionRegisteredRef.current = false // Permitir nuevo registro de sesión
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signInWithGoogle = async () => {
    sessionRegisteredRef.current = false // Permitir nuevo registro de sesión
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin'
      }
    })
  }

  const signOut = async () => {
    try {
      // Eliminar sesión de la BD
      if (user) {
        await (supabase
          .from('user_sessions') as any)
          .delete()
          .eq('user_id', user.id)
      }
    } catch (error) {
      console.error('Error eliminando sesión:', error)
    }

    sessionRegisteredRef.current = false
    cleanupSessionChannel()
    await supabase.auth.signOut()
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id)
    }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
