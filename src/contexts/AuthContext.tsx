// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserWithRole } from '../types/database.types'

interface AuthContextType {
  user: User | null
  profile: UserWithRole | null
  session: Session | null
  loading: boolean
  mustChangePassword: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  markPasswordChanged: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserWithRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    // Obtener sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
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
      } else if (event === 'SIGNED_OUT') {
        setProfile(null)
        setLoading(false)
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refrescado exitosamente, mantener sesión activa
        console.log('🔄 Token refrescado automáticamente')
      }
    })

    // Función para refrescar sesión de forma segura
    const refreshSessionSafe = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          const { error } = await supabase.auth.refreshSession()
          if (error) {
            console.warn('⚠️ Error refrescando sesión:', error.message)
          } else {
            console.log('✅ Sesión refrescada correctamente')
          }
        }
      } catch (err) {
        console.warn('⚠️ Error en refresh:', err)
      }
    }

    // Heartbeat: refrescar token cada 2 minutos para mantener sesión activa
    const heartbeatInterval = setInterval(refreshSessionSafe, 2 * 60 * 1000)

    // Refrescar cuando la ventana recupera el foco (usuario vuelve a la pestaña)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Ventana activa - refrescando sesión...')
        refreshSessionSafe()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Refrescar cuando hay actividad del usuario (cada 5 min máximo)
    let lastActivity = Date.now()
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActivity > 5 * 60 * 1000) { // Si pasaron más de 5 min desde última actividad
        lastActivity = now
        refreshSessionSafe()
      }
    }
    window.addEventListener('click', handleActivity)
    window.addEventListener('keydown', handleActivity)

    return () => {
      subscription.unsubscribe()
      clearInterval(heartbeatInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('click', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [])

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
      // Verificar si debe cambiar contraseña (campo agregado por migración)
      setMustChangePassword((data as any).must_change_password === true)
    } catch (error) {
      console.error('Error cargando perfil:', error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/estado-de-flota'
      }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setMustChangePassword(false)
  }

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id)
    }
  }

  const markPasswordChanged = async () => {
    try {
      // Intentar con función RPC primero
      const { error: rpcError } = await (supabase.rpc as any)('mark_password_changed')

      if (rpcError) {
        // Fallback: actualizar directamente la tabla
        console.warn('RPC mark_password_changed falló, usando fallback directo:', rpcError)
        const { error: updateError } = await (supabase
          .from('user_profiles') as any)
          .update({ must_change_password: false })
          .eq('id', user?.id)

        if (updateError) throw updateError
      }

      setMustChangePassword(false)
    } catch (error) {
      console.error('Error marcando contraseña como cambiada:', error)
      throw error
    }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    mustChangePassword,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
    markPasswordChanged,
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
