// src/services/twoChatService.ts
// Cliente del router /api/2chat (server-2chat.js). La API key de 2Chat vive solo
// en el servidor; acá solo viaja el token de sesión de Supabase.
import { supabase } from '../lib/supabase'

export type EstadoSync2Chat =
  | 'sincronizado'
  | 'pendiente'
  | 'sin_telefono'
  | 'error'
  | 'telefono_duplicado'

export interface ContactoTwoChat {
  conductor_id: string
  nombres: string
  apellidos: string
  dni: string | null
  email: string | null
  telefono_original: string | null
  telefono: string | null
  estado_conductor: string | null
  estado_conductor_label: string | null
  estado_sync: EstadoSync2Chat
  detalle: string | null
  twochat_contact_uuid: string | null
  sincronizado_en: string | null
  telefono_cambio: boolean
}

export interface ContactosTwoChatResponse {
  filas: ContactoTwoChat[]
  canal_whatsapp: boolean
  puede_sincronizar: boolean
}

export interface SincronizarResponse {
  creados: number
  /** Ya existían en 2Chat con ese teléfono: se vincularon sin crear otro */
  vinculados: number
  errores: number
  omitidos: number
  resultados: Array<{ conductor_id: string; ok: boolean; vinculado: boolean; twochat_contact_uuid: string | null; error: string | null }>
}

export type ResultadoLlamada = 'atendida' | 'no_atendida' | 'ocupado' | 'cancelada' | 'fallida'

export interface LlamadaTwoChat {
  id: string
  fecha: string
  agente_id: string | null
  agente: string
  direccion: 'saliente' | 'entrante'
  numero: string | null
  conductor_id: string | null
  conductor: string | null
  estado_conductor: string | null
  lead_id: string | null
  lead: string | null
  estado_lead: string | null
  /** Con quién coincide el número: primero conductores, después leads */
  tipo_contacto: 'conductor' | 'lead' | null
  resultado: ResultadoLlamada
  status_2chat: string | null
  duracion: number
  por_whatsapp: boolean
  costo_usd: number
  grabacion: string | null
}

/** Tamaño de lote que acepta el servidor por llamada a /sincronizar */
export const LOTE_SINCRONIZACION = 25

async function pedir<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sin sesión activa')

  const res = await fetch(`/api/2chat${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  const texto = await res.text()
  let data: unknown = null
  try { data = texto ? JSON.parse(texto) : null } catch { data = null }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new Error(msg || `Error ${res.status} del servidor${texto ? '' : ' (¿está corriendo el server?)'}`)
  }
  return data as T
}

/** sedeId null = "Todas las sedes" (el servidor deja afuera las solo_admin, p. ej. Pruebas) */
export function obtenerContactosTwoChat(sedeId: string | null): Promise<ContactosTwoChatResponse> {
  const qs = sedeId ? `?${new URLSearchParams({ sede_id: sedeId })}` : ''
  return pedir<ContactosTwoChatResponse>(`/contactos${qs}`)
}

export function sincronizarContactosTwoChat(
  conductorIds: string[],
  sedeId: string | null,
): Promise<SincronizarResponse> {
  return pedir<SincronizarResponse>('/sincronizar', {
    method: 'POST',
    body: JSON.stringify({ conductor_ids: conductorIds, sede_id: sedeId }),
  })
}

export interface LlamadasTwoChatResponse {
  llamadas: LlamadaTwoChat[]
  /** Llamadas traídas de 2Chat y guardadas en esta consulta */
  procesadas: number
  /** Última vez que se trajeron llamadas de 2Chat */
  actualizado_en: string | null
  /** Si 2Chat falló: se muestran las llamadas ya guardadas */
  error_sync: string | null
}

/**
 * Lee las llamadas guardadas (twochat_llamadas). Antes, el servidor trae de 2Chat
 * solo las nuevas (como mucho una vez por minuto; actualizar=true lo fuerza).
 */
export function obtenerLlamadasTwoChat(params: {
  desde: string
  hasta: string
  direccion: 'outbound' | 'inbound' | 'todas'
  actualizar?: boolean
}): Promise<LlamadasTwoChatResponse> {
  const { actualizar, ...resto } = params
  const qs = new URLSearchParams({ ...resto, ...(actualizar ? { actualizar: '1' } : {}) })
  return pedir<LlamadasTwoChatResponse>(`/llamadas?${qs}`)
}

export interface CrearLeadResponse {
  lead_id: string
  /** El número ya era de un lead: se devuelve ese en vez de crear otro */
  existente: boolean
}

/** Crea un lead (fuente 2Chat) para un número sin coincidencia y le vincula sus llamadas */
export function crearLeadDesdeLlamada(params: {
  nombre: string
  telefono: string
  sedeId: string | null
}): Promise<CrearLeadResponse> {
  return pedir<CrearLeadResponse>('/crear-lead', {
    method: 'POST',
    body: JSON.stringify({ nombre: params.nombre, telefono: params.telefono, sede_id: params.sedeId }),
  })
}

/** Abre la ficha del lead en el módulo Leads, en una pestaña nueva */
export function abrirLeadEnPestana(leadId: string): void {
  const base = window.location.pathname.startsWith('/demo') ? '/demo' : ''
  window.open(`${base}/leads?lead=${encodeURIComponent(leadId)}`, '_blank', 'noopener')
}
