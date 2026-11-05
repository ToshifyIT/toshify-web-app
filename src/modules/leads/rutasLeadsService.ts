// src/modules/leads/rutasLeadsService.ts
//
// Parejas por recorrido en auto para cada lead nuevo (sql/parejas_lead_rutas.sql).
//
// Cada lead de los últimos DIAS_LEAD_NUEVO días se procesa UNA sola vez:
//  1. Filtro gratis en línea recta: los conductores activos (con o sin compañero)
//     y los leads recientes ya procesados que estén a RADIO_KM o menos, que es lo
//     que se recorre en MINUTOS_MAX a la velocidad estimada del mapa.
//  2. Esos se confirman con Google (Distance Matrix, recorrido en auto). Lo ya
//     medido alguna vez sale de mediciones_rutas y no se vuelve a pagar.
//  3. Se guardan en parejas_lead los que dan MINUTOS_MAX o menos, y el lead queda
//     marcado como procesado para no volver a buscarlo.
//
// Corre en segundo plano al abrir Leads o Distribución en mapa. El gasto lo frena
// un tope MENSUAL que vive en la base (reservar_mediciones_rutas), dentro del cupo
// gratis de Google: si se llega, los leads siguen con la estimación en línea recta
// hasta el mes siguiente (y si para entonces tienen más de DIAS_LEAD_NUEVO días,
// se quedan con la estimación). Si Google rechaza el pedido (cuota en 0,
// clave sin permiso), no se marca nada y se reintenta en la próxima apertura.
import { supabase } from '../../lib/supabase'
import { GOOGLE_MAPS_SCRIPT_URL } from '../../lib/googleMaps'
import {
  medirRutasReales, tramosSinMedir, VELOCIDAD_ESTIMADA_KMH,
} from '../onboarding/distribucion-mapa-v2/emparejamientoService'
import { coordsValidas, haversineKm } from '../onboarding/distribucion-mapa-v2/utils'
import { ESTADOS_SIN_PAREJA } from './leadEstados'

/** Tiempo máximo por calle para guardar una pareja. */
export const MINUTOS_MAX_CALLE = 40
/** Antigüedad máxima (días) de un lead para buscarle parejas por calle. */
export const DIAS_LEAD_NUEVO = 7
/** Distancia en línea recta que, a la velocidad estimada, son MINUTOS_MAX_CALLE. */
const RADIO_KM = (MINUTOS_MAX_CALLE / 60) * VELOCIDAD_ESTIMADA_KMH
/** Leads que procesa como mucho cada apertura de pantalla. */
const MAX_LEADS_POR_CORRIDA = 40
const PAGINA = 1000
const LOTE_IDS = 100

const INACTIVOS = ['cancelado', 'completado', 'finalizado']

interface Punto {
  id: string
  lat: number
  lng: number
}

export type MotivoCorte = 'tope' | 'google' | null

export interface ResultadoCorrida {
  procesados: number
  motivoCorte: MotivoCorte
}

let corriendo: Promise<ResultadoCorrida> | null = null

function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
}

async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = (data || []) as T[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

/** Google Maps con la librería de rutas (Distance Matrix) lista para usar. */
async function cargarGoogleRutas(): Promise<boolean> {
  const w = window as any
  if (!w.google?.maps) {
    if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
      const script = document.createElement('script')
      script.src = GOOGLE_MAPS_SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }
    for (let i = 0; i < 200 && !w.google?.maps?.importLibrary; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  try {
    if (w.google?.maps?.importLibrary) await w.google.maps.importLibrary('routes')
  } catch (err) {
    console.warn('[rutasLeads] No se pudo cargar la librería de rutas de Google:', err)
  }
  return !!w.google?.maps?.DistanceMatrixService
}

/** Conductores en un auto con asignación activa (cualquier turno), con ubicación. */
async function cargarConductoresActivos(): Promise<Punto[]> {
  const filas = await leerTodo<any>((a, b) => supabase
    .from('asignaciones')
    .select('id, asignaciones_conductores (estado, conductores (id, apellidos, direccion_lat, direccion_lng))')
    .in('estado', ['activo', 'activa'])
    .order('id')
    .range(a, b))
  const porId = new Map<string, Punto>()
  for (const asig of filas) {
    for (const ac of asig.asignaciones_conductores || []) {
      const c = ac.conductores
      if (!c || INACTIVOS.includes(String(ac.estado || '').toLowerCase())) continue
      if (/interno/i.test(c.apellidos || '')) continue
      if (!coordsValidas(c.direccion_lat, c.direccion_lng)) continue
      porId.set(c.id, { id: c.id, lat: Number(c.direccion_lat), lng: Number(c.direccion_lng) })
    }
  }
  return [...porId.values()]
}

/** Estado de procesamiento de una lista de leads. */
async function cargarEstados(ids: string[]): Promise<Map<string, string>> {
  const estados = new Map<string, string>()
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await supabase
      .from('leads_rutas_procesadas')
      .select('lead_id, estado')
      .in('lead_id', ids.slice(i, i + LOTE_IDS))
    if (error) throw error
    for (const f of (data || []) as { lead_id: string; estado: string }[]) estados.set(f.lead_id, f.estado)
  }
  return estados
}

async function soltar(leadId: string) {
  await supabase.from('leads_rutas_procesadas').delete().eq('lead_id', leadId).eq('estado', 'en_proceso')
}

async function corrida(): Promise<ResultadoCorrida> {
  const desde = haceDias(DIAS_LEAD_NUEVO)
  const recientes = (await leerTodo<any>((a, b) => supabase
    .from('leads')
    .select('id, latitud, longitud, estado_de_lead, created_at')
    .gte('created_at', desde)
    // Los más nuevos primero: el que acaba de entrar se mide enseguida
    .order('created_at', { ascending: false })
    .order('id')
    .range(a, b)))
    .filter((l) => coordsValidas(l.latitud, l.longitud) && !ESTADOS_SIN_PAREJA.has(l.estado_de_lead || ''))
  if (recientes.length === 0) return { procesados: 0, motivoCorte: null }

  const estados = await cargarEstados(recientes.map((l) => l.id))
  const pendientes = recientes.filter((l) => estados.get(l.id) !== 'listo').slice(0, MAX_LEADS_POR_CORRIDA)
  if (pendientes.length === 0) return { procesados: 0, motivoCorte: null }

  if (!(await cargarGoogleRutas())) return { procesados: 0, motivoCorte: 'google' }

  const conductores = await cargarConductoresActivos()
  // Leads con los que se compara: los recientes ya procesados. Así cada par
  // lead↔lead se mide una sola vez, cuando entra el más nuevo de los dos.
  const leadsListos: Punto[] = recientes
    .filter((l) => estados.get(l.id) === 'listo')
    .map((l) => ({ id: l.id, lat: Number(l.latitud), lng: Number(l.longitud) }))

  let procesados = 0
  for (const l of pendientes) {
    const { data: tomados, error: errTomar } = await supabase.rpc('tomar_leads_para_rutas', { p_ids: [l.id] })
    if (errTomar) throw errTomar
    if (!((tomados || []) as unknown[]).length) continue // otro navegador lo está procesando

    const origen = { lat: Number(l.latitud), lng: Number(l.longitud) }
    const candidatos: Array<Punto & { tipo: 'conductor' | 'lead' }> = [
      ...conductores.map((c) => ({ ...c, tipo: 'conductor' as const })),
      ...leadsListos.filter((x) => x.id !== l.id).map((x) => ({ ...x, tipo: 'lead' as const })),
    ].filter((c) => haversineKm(origen.lat, origen.lng, c.lat, c.lng) <= RADIO_KM)

    const destinos = candidatos.map((c) => ({ lat: c.lat, lng: c.lng }))
    const nuevos = await tramosSinMedir(origen, destinos)
    let reservados = 0
    if (nuevos > 0) {
      const { data: ok, error: errReserva } = await supabase.rpc('reservar_mediciones_rutas', { p_cantidad: nuevos })
      if (errReserva) throw errReserva
      reservados = Number(ok) || 0
      if (reservados < nuevos) {
        if (reservados > 0) await supabase.rpc('devolver_mediciones_rutas', { p_cantidad: reservados })
        await soltar(l.id)
        return { procesados, motivoCorte: 'tope' }
      }
    }

    const mediciones = await medirRutasReales(origen, destinos)
    const medidas = mediciones.filter((m) => m && m.fuente === 'matrix').length
    const fallidas = mediciones.length - medidas
    if (nuevos > 0 && fallidas >= nuevos) {
      // Google no respondió ninguno de los nuevos: no se marca el lead y se
      // devuelve la reserva, para reintentarlo en la próxima apertura
      if (reservados > 0) await supabase.rpc('devolver_mediciones_rutas', { p_cantidad: reservados })
      await soltar(l.id)
      return { procesados, motivoCorte: 'google' }
    }

    const parejas = candidatos
      .map((c, i) => ({ c, m: mediciones[i] }))
      .filter((x) => x.m && x.m.fuente === 'matrix' && x.m.tiempoMinutos <= MINUTOS_MAX_CALLE)
      .map((x) => ({
        lead_id: l.id,
        tipo: x.c.tipo,
        otro_id: x.c.id,
        distancia_km: x.m!.distanciaKm,
        tiempo_minutos: x.m!.tiempoMinutos,
      }))
    if (parejas.length > 0) {
      const { error } = await supabase.from('parejas_lead').upsert(parejas, { onConflict: 'lead_id,tipo,otro_id', ignoreDuplicates: true })
      if (error) throw error
    }
    const { error: errListo } = await supabase
      .from('leads_rutas_procesadas')
      .update({ estado: 'listo', candidatos: candidatos.length, medidos: medidas, parejas: parejas.length, procesado_en: new Date().toISOString() })
      .eq('lead_id', l.id)
    if (errListo) throw errListo

    leadsListos.push({ id: l.id, lat: origen.lat, lng: origen.lng })
    procesados++
  }
  return { procesados, motivoCorte: null }
}

/**
 * Procesa los leads nuevos pendientes, en segundo plano. Si ya hay una corrida en
 * esta pestaña, devuelve esa. Nunca tira: un error se loguea y devuelve 0.
 */
export function procesarLeadsNuevos(): Promise<ResultadoCorrida> {
  if (!corriendo) {
    corriendo = corrida()
      .catch((err) => {
        console.error('[rutasLeads] No se pudieron procesar los leads nuevos:', err)
        return { procesados: 0, motivoCorte: null as MotivoCorte }
      })
      .finally(() => { corriendo = null })
  }
  return corriendo
}

// =====================================================
// Lectura
// =====================================================

export interface MedidaCalle {
  km: number
  minutos: number
}

export interface ParejasCalle {
  /** Leads ya procesados: para ellos vale lo medido por calle, no la estimación. */
  procesados: Set<string>
  /** lead_id -> conductor_id -> recorrido por calle (40 min o menos). */
  conductoresPorLead: Map<string, Map<string, MedidaCalle>>
}

/** Parejas lead ↔ conductor guardadas, de los leads procesados en los últimos `dias`. */
export async function cargarParejasCalle(dias = 30): Promise<ParejasCalle> {
  const desde = haceDias(dias)
  const [procesadas, filas] = await Promise.all([
    leerTodo<{ lead_id: string }>((a, b) => supabase
      .from('leads_rutas_procesadas')
      .select('lead_id')
      .eq('estado', 'listo')
      .gte('procesado_en', desde)
      .order('lead_id')
      .range(a, b)),
    leerTodo<{ lead_id: string; otro_id: string; distancia_km: number | string; tiempo_minutos: number }>((a, b) => supabase
      .from('parejas_lead')
      .select('lead_id, otro_id, distancia_km, tiempo_minutos')
      .eq('tipo', 'conductor')
      .gte('creado_en', desde)
      .order('lead_id')
      .order('otro_id')
      .range(a, b)),
  ])
  const conductoresPorLead = new Map<string, Map<string, MedidaCalle>>()
  for (const f of filas) {
    let m = conductoresPorLead.get(f.lead_id)
    if (!m) conductoresPorLead.set(f.lead_id, (m = new Map()))
    m.set(f.otro_id, { km: Number(f.distancia_km), minutos: f.tiempo_minutos })
  }
  return { procesados: new Set(procesadas.map((p) => p.lead_id)), conductoresPorLead }
}

/** Otros leads a 40 min o menos por calle de un lead (en las dos direcciones). */
export async function cargarLeadsCercaPorCalle(leadId: string): Promise<Array<{ leadId: string } & MedidaCalle>> {
  const [comoBase, comoOtro] = await Promise.all([
    supabase.from('parejas_lead').select('otro_id, distancia_km, tiempo_minutos').eq('tipo', 'lead').eq('lead_id', leadId),
    supabase.from('parejas_lead').select('lead_id, distancia_km, tiempo_minutos').eq('tipo', 'lead').eq('otro_id', leadId),
  ])
  if (comoBase.error) throw comoBase.error
  if (comoOtro.error) throw comoOtro.error
  const out = new Map<string, MedidaCalle>()
  for (const f of (comoBase.data || []) as any[]) out.set(f.otro_id, { km: Number(f.distancia_km), minutos: f.tiempo_minutos })
  for (const f of (comoOtro.data || []) as any[]) out.set(f.lead_id, { km: Number(f.distancia_km), minutos: f.tiempo_minutos })
  return [...out].map(([id, m]) => ({ leadId: id, ...m })).sort((a, b) => a.minutos - b.minutos)
}
