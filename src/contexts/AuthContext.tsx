// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react'
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

// Flag global para saber si el logout fue intencional
let intentionalSignOut = false

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserWithRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    // Evitar doble inicialización en React StrictMode
    if (initRef.current) return
    initRef.current = true

    // Función para inicializar la sesión
    const initSession = async () => {
      try {
        // Primero intentar obtener la sesión existente
        const { data: { session: existingSession }, error } = await supabase.auth.getSession()

        if (error) {
          setLoading(false)
          return
        }

        if (existingSession) {
          setSession(existingSession)
          setUser(existingSession.user)
          await loadProfile(existingSession.user.id)

          // Si el token está por expirar (menos de 5 min), refrescar
          const now = Math.floor(Date.now() / 1000)
          const timeLeft = existingSession.expires_at! - now
          if (timeLeft < 300) {
            const { data: refreshed } = await supabase.auth.refreshSession()
            if (refreshed.session) {
              setSession(refreshed.session)
              setUser(refreshed.session.user)
            }
          }
        } else {
          setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    }

    initSession()

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      switch (event) {
        case 'SIGNED_IN':
          if (newSession) {
            setSession(newSession)
            setUser(newSession.user)
            loadProfile(newSession.user.id)
          }
          break

        case 'TOKEN_REFRESHED':
          if (newSession) {
            setSession(newSession)
            setUser(newSession.user)
          }
          break

        case 'SIGNED_OUT':
          if (intentionalSignOut) {
            intentionalSignOut = false
            setSession(null)
            setUser(null)
            setProfile(null)
            setLoading(false)
          } else {
            // SIGNED_OUT no intencional - verificar si hay sesión válida
            const { data } = await supabase.auth.getSession()
            if (data.session) {
              setSession(data.session)
              setUser(data.session.user)
            } else {
              // Realmente no hay sesión
              setSession(null)
              setUser(null)
              setProfile(null)
              setLoading(false)
            }
          }
          break

        case 'INITIAL_SESSION':
          // Ya manejado en initSession
          break

        default:
          if (newSession) {
            setSession(newSession)
            setUser(newSession.user)
          }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          id,
          nombres,
          apellidos,
          nombre_completo,
          email,
          role_id,
          sede_id,
          must_change_password,
          avatar_url,
          roles (id, name, label)
        `)
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data as UserWithRole)
      setMustChangePassword((data as any).must_change_password === true)
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/estado-de-flota'
      }
    })
  }, [])

  const signOut = useCallback(async () => {
    intentionalSignOut = true
    await supabase.auth.signOut()
    setProfile(null)
    setMustChangePassword(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id)
    }
  }, [user])

  const markPasswordChanged = useCallback(async () => {
    try {
      const { error: rpcError } = await (supabase.rpc as any)('mark_password_changed')

      if (rpcError) {
        const { error: updateError } = await (supabase
          .from('user_profiles') as any)
          .update({ must_change_password: false })
          .eq('id', user?.id)

        if (updateError) throw updateError
      }

      setMustChangePassword(false)
    } catch (error) {
      throw error
    }
  }, [user])

  const value = useMemo(() => ({
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
  }), [user, profile, session, loading, mustChangePassword, signIn, signInWithGoogle, signOut, refreshProfile, markPasswordChanged])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
