// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
// import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase')
}

// Timeout duro para toda request de Supabase (auth, REST, RPC, storage).
// Defensa ante MITM lento de antivirus (AVG/Avast "HTTPS scanning") que puede
// dejar el handshake TLS pending sin reject -> la promesa de fetch nunca
// resolvía ni fallaba, y el spinner de arranque quedaba colgado para siempre.
// NO afecta a usuarios sin AV: en red normal las requests terminan en <1s,
// muy por debajo del timeout. Solo agrega un techo a algo que hoy es infinito.
const SUPABASE_FETCH_TIMEOUT_MS = 20000

const fetchWithTimeout: typeof fetch = (input, init) => {
  // Respetar un signal externo si Supabase ya pasó uno (auth lo hace).
  const externalSignal = init?.signal ?? undefined
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS)

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId))
}

// Cliente Supabase con configuración nativa estable + timeout de red defensivo.
// global.fetch solo cubre HTTP (no los WebSockets de Realtime), que es lo
// deseado: no queremos abortar suscripciones long-lived.
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
})
