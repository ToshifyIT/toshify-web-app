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

// Techo para la llamada remota de logout. Si el servidor (o el lock de auth)
// no responde en este tiempo, se cierra la sesion localmente igual.
const SIGNOUT_TIMEOUT_MS = 5000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserWithRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const initRef = useRef(false)
  const signingOutRef = useRef(false)

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
          // IMPORTANTE: no llamar a ningun metodo de `supabase.auth` desde aqui.
          // supabase-js invoca este callback DENTRO del lock de auth y espera a
          // que termine (_removeSession -> _notifyAllSubscribers -> await). Si
          // el callback vuelve a pedir el lock (p. ej. getSession()), queda
          // encolado detras del propio signOut que lo esta esperando: deadlock.
          // La promesa nunca resuelve, el lock queda tomado para siempre y toda
          // llamada de auth posterior de esa pestana cuelga (el boton "Cerrar
          // Sesion" deja de responder hasta recargar la pagina).
          //
          // El evento ya trae la sesion resultante como parametro: se usa esa,
          // sin consultar nada. Para SIGNED_OUT es siempre null.
          if (newSession) {
            setSession(newSession)
            setUser(newSession.user)
          } else {
            setSession(null)
            setUser(null)
            setProfile(null)
          }
          setLoading(false)
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
        .select('*, roles(*)')
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
    // Evita el doble disparo del botón (dos POST /auth/v1/logout seguidos,
    // donde el segundo siempre falla porque la sesión ya fue invalidada).
    if (signingOutRef.current) return
    signingOutRef.current = true

    try {
      // scope 'local' cierra únicamente esta sesión. Con 'global' (default de
      // supabase-js) se invalidan todas las sesiones del usuario, lo que en
      // entornos compartidos (DEMO) desloguea a otros y devuelve 403 cuando la
      // sesión ya estaba vencida o revocada.
      // Red de seguridad: si la llamada no responde en SIGNOUT_TIMEOUT_MS (red
      // caida, o el lock de auth tomado por otra operacion colgada), se
      // continua igual con la limpieza local del `finally`. El usuario nunca
      // queda con un boton que no hace nada.
      const result = await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(
            () => resolve({ error: { message: `timeout tras ${SIGNOUT_TIMEOUT_MS}ms` } }),
            SIGNOUT_TIMEOUT_MS
          )
        ),
      ])

      if (result?.error) {
        // Token ya expirado/revocado, o la request no respondio: el objetivo
        // del logout igual se cumple con la limpieza local.
        console.warn('[auth] signOut remoto no confirmado, se limpia la sesion local:', result.error.message)
      }
    } catch (error) {
      console.warn('[auth] signOut lanzó una excepción, se limpia la sesión local:', error)
    } finally {
      // La limpieza local nunca debe depender del exito de la request.
      setSession(null)
      setUser(null)
      setProfile(null)
      setMustChangePassword(false)
      setLoading(false)
      signingOutRef.current = false
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id)
    }
  }, [user])

  const markPasswordChanged = useCallback(async () => {
    const { error: rpcError } = await (supabase.rpc as any)('mark_password_changed')

    if (rpcError) {
      const { error: updateError } = await (supabase
        .from('user_profiles') as any)
        .update({ must_change_password: false })
        .eq('id', user?.id)

      if (updateError) throw updateError
    }

    setMustChangePassword(false)
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
