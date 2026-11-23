// src/modules/reportes/control-gestores/contactoCapitanesService.ts
// Dashboard de Capitanes > Contacto con conductores y leads (2Chat), pedido 2026-11-18.
// Solo los capitanes activos (Ali, Carla, Eunice).
//
// - Cada llamada o mensaje es del capitán que la hizo en 2Chat. El usuario de 2Chat
//   se reconoce por el primer nombre ("Carla Anabel Noguera" → Carla Noguera).
//   Ali tiene usuario propio desde el 18/11/2026; antes llamaba por la cuenta
//   compartida «Info Toshify», que no se puede asignar a nadie y va aparte.
// - Se separa por canal (llamada / WhatsApp) y por destino (conductor / lead).
// - Contacto efectivo = llamada atendida en la que se habló con la persona. Es la
//   misma regla que Integraciones > 2Chat: lo confirma Gemini al escuchar la grabación;
//   si todavía no se analizó, cuenta si duró 30 segundos o más. Un mensaje de WhatsApp
//   que mandó el capitán también cuenta como contacto.
// - Cobertura = conductores del capitán (los que manejaban al empezar el período,
//   capitán = conductores.guia, igual que el churn) con al menos un contacto
//   en el período, lo haya hecho quien lo haya hecho.
// - Conversiones = leads que pasaron a conductor en el período (leads.fecha_convertido)
//   y que antes habían tenido contacto por 2Chat. Se asignan al capitán del último
//   contacto, y el canal es por dónde se los contactó: llamada, WhatsApp o los dos.
//   Al convertirse, 2Chat puede cruzar el número con el conductor nuevo, así que el
//   contacto se busca por lead_id y también por teléfono.
import { supabase } from '../../../lib/supabase'
import { GUIAS_ACTIVOS, homologarGuia } from '../../leads/guias'
import { sumarDias } from '../kpis-v2/kpisV2Types'
import { finDe, type Granularidad } from './controlGestoresService'

export const CUENTA_COMPARTIDA = 'Cuenta compartida'
export const TOTAL_CONTACTO = 'Total'
const SEGUNDOS_CONVERSACION = 30
const PAGINA = 1000
const LOTE_IN = 100

export type CanalConversion = 'llamada' | 'whatsapp' | 'ambos'

export interface ContactoCapitan {
  capitan: string
  llamadasConductores: number
  efectivasConductores: number
  llamadasLeads: number
  efectivasLeads: number
  /** Llamadas a números que no son ni conductor ni lead */
  llamadasOtros: number
  /** Nota promedio (1 a 5) de las llamadas analizadas */
  calidad: number | null
  mensajesConductores: number
  mensajesLeads: number
  /** Cobertura de sus conductores */
  conductores: number
  contactados: number
  /** Leads que contactó en el período y cuántos de ellos ya son conductores */
  leadsContactados: number
  leadsConvertidos: number
  /** Leads que pasaron a conductor en el período, por canal de contacto */
  conversiones: Record<CanalConversion, number>
}

export interface ConversionLead {
  lead: string
  capitan: string
  canal: CanalConversion
  /** Día de la conversión (YYYY-MM-DD) */
  dia: string
}

export interface ContactoCapitanes {
  porCapitan: ContactoCapitan[]
  total: ContactoCapitan
  /** Llamadas por «Info Toshify»: no se sabe quién las hizo */
  compartida: { llamadas: number; efectivos: number }
  /** Conversiones del período con contacto previo por 2Chat, la más nueva primero */
  conversiones: ConversionLead[]
  /** Leads que pasaron a conductor en el período (con o sin 2Chat) */
  convertidosPeriodo: number
  /** Contactos (llamadas efectivas + mensajes) de cada capitán en cada período */
  historia: { inicio: string; contactos: Map<string, number> }[]
}

/** Sede de la persona (embed): twochat_llamadas/twochat_mensajes no tienen sede_id */
interface SedeDePersona {
  conductor_id: string | null
  lead_id: string | null
  conductores?: { sede_id: string | null } | null
  leads?: { sede_id: string | null } | null
}

interface Llamada extends SedeDePersona {
  fecha: string
  agente: string | null
  resultado: string
  tipo_atencion: string | null
  duracion: number | null
  calificacion: number | null
  numero_clave: string | null
}

interface Mensaje extends SedeDePersona {
  fecha: string
  session_key: string
  numero_clave: string | null
}

interface LeadConvertido {
  id: string
  nombre_completo: string | null
  fecha_convertido: string
  phone: string | null
  whatsapp_number: string | null
}

/** Capitán activo del usuario de 2Chat, la cuenta compartida, o null */
function capitanDe(agente: string | null | undefined): string | null {
  const nombre = (agente || '').trim()
  if (!nombre) return null
  if (/info\s*toshify/i.test(nombre)) return CUENTA_COMPARTIDA
  const capitan = homologarGuia(nombre.split(/\s+/)[0])
  return capitan && GUIAS_ACTIVOS.includes(capitan) ? capitan : null
}

const esEfectiva = (l: Llamada) => l.resultado === 'atendida'
  && (l.tipo_atencion ? l.tipo_atencion === 'conversacion' : (l.duracion ?? 0) >= SEGUNDOS_CONVERSACION)

/** Día de Argentina (UTC-3) de un timestamp */
const diaART = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10)

/** Últimos 10 dígitos del teléfono (mismo cruce que hace 2Chat) */
const claveTelefono = (t: string | null | undefined) => {
  const d = String(t || '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

async function todas<T>(armar: (desde: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde)
    if (error) throw error
    const lote = (data as T[]) || []
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

/** Consulta por lotes de .in() (la URL tiene límite) */
async function porLotes<T>(valores: string[], armar: (lote: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let i = 0; i < valores.length; i += LOTE_IN) {
    const { data, error } = await armar(valores.slice(i, i + LOTE_IN))
    if (error) throw error
    filas.push(...((data as T[]) || []))
  }
  return filas
}

function vacio(capitan: string): ContactoCapitan {
  return {
    capitan, llamadasConductores: 0, efectivasConductores: 0, llamadasLeads: 0, efectivasLeads: 0, llamadasOtros: 0,
    calidad: null, mensajesConductores: 0, mensajesLeads: 0, conductores: 0, contactados: 0,
    leadsContactados: 0, leadsConvertidos: 0, conversiones: { llamada: 0, whatsapp: 0, ambos: 0 },
  }
}

/**
 * @param periodos inicios de la evolución
 * @param elegido período que se mira en los números y la tabla
 * @param activos conductores al empezar el período elegido → capitán
 * @param filtroSede aplicarFiltroSede del SedeContext: leads y contactos solo de la sede elegida
 */
export async function cargarContactoCapitanes(
  granularidad: Granularidad,
  periodos: string[],
  elegido: { inicio: string; fin: string },
  activos: Map<string, string>,
  filtroSede?: <T>(query: T, campo?: string) => T,
): Promise<ContactoCapitanes> {
  const filtro = filtroSede ?? (<T>(query: T) => query)
  const primero = [...periodos, elegido.inicio].sort()[0]
  const desde = `${primero}T00:00:00-03:00`
  const hasta = `${sumarDias(elegido.fin, 1)}T00:00:00-03:00`
  const COLS_LLAMADA = 'fecha, agente, resultado, tipo_atencion, duracion, calificacion, conductor_id, lead_id, numero_clave'
  const COLS_MENSAJE = 'fecha, session_key, conductor_id, lead_id, numero_clave'
  // Las tablas de 2Chat no tienen sede_id: la sede sale del conductor o del lead
  const COLS_SEDE = 'conductores(sede_id), leads(sede_id)'

  const [llamadasTodas, mensajesTodos, conversaciones, convertidos, sedesFiltro] = await Promise.all([
    todas<Llamada>((d) => supabase.from('twochat_llamadas').select(`${COLS_LLAMADA}, ${COLS_SEDE}`)
      .gte('fecha', desde).lt('fecha', hasta).order('fecha').range(d, d + PAGINA - 1)),
    todas<Mensaje>((d) => supabase.from('twochat_mensajes').select(`${COLS_MENSAJE}, ${COLS_SEDE}`)
      .eq('enviado_por', 'agente').gte('fecha', desde).lt('fecha', hasta).order('fecha').range(d, d + PAGINA - 1)),
    todas<{ session_key: string; agente: string | null }>((d) => supabase.from('twochat_conversaciones')
      .select('session_key, agente').range(d, d + PAGINA - 1)),
    todas<LeadConvertido>((d) => filtro(supabase.from('leads')
      .select('id, nombre_completo, fecha_convertido, phone, whatsapp_number')
      .gte('fecha_convertido', `${elegido.inicio}T00:00:00`).lt('fecha_convertido', `${sumarDias(elegido.fin, 1)}T00:00:00`))
      .range(d, d + PAGINA - 1)),
    // Sedes que abarca el filtro (la elegida, o las reales si es "Todas")
    filtroSede
      ? Promise.resolve(filtro(supabase.from('sedes').select('id'), 'id')).then(({ data, error }) => {
        if (error) throw error
        return new Set(((data as { id: string }[]) || []).map((r) => r.id))
      })
      : Promise.resolve(null),
  ])
  // Contacto con un conductor o lead de otra sede (p. ej. Pruebas) no cuenta.
  // Los números que no son ni conductor ni lead no tienen sede y quedan.
  const enSede = (r: SedeDePersona) => {
    if (!sedesFiltro) return true
    if (r.conductor_id) return sedesFiltro.has(r.conductores?.sede_id ?? '')
    if (r.lead_id) return sedesFiltro.has(r.leads?.sede_id ?? '')
    return true
  }
  const llamadas = llamadasTodas.filter(enSede)
  const mensajes = mensajesTodos.filter(enSede)
  const agenteDeChat = new Map(conversaciones.map((c) => [c.session_key, c.agente]))
  const capitanDeMensaje = (m: Mensaje) => capitanDe(agenteDeChat.get(m.session_key))

  // ── Período elegido ──
  const enElegido = (iso: string) => {
    const dia = diaART(iso)
    return dia >= elegido.inicio && dia <= elegido.fin
  }
  const filas = new Map<string, ContactoCapitan>(GUIAS_ACTIVOS.map((g) => [g, vacio(g)]))
  const total = vacio(TOTAL_CONTACTO)
  const compartida = { llamadas: 0, efectivos: 0 }
  const notas = new Map<string, number[]>()
  const conductoresContactados = new Set<string>()
  // Leads que contactó cada capitán en el período
  const leadsDe = new Map<string, Set<string>>(GUIAS_ACTIVOS.map((g) => [g, new Set<string>()]))

  for (const l of llamadas) {
    if (!enElegido(l.fecha)) continue
    const efectiva = esEfectiva(l)
    if (efectiva && l.conductor_id) conductoresContactados.add(l.conductor_id)
    const capitan = capitanDe(l.agente)
    if (capitan === CUENTA_COMPARTIDA) {
      compartida.llamadas++
      if (efectiva) compartida.efectivos++
      continue
    }
    const f = capitan ? filas.get(capitan) : undefined
    if (!f) continue
    for (const x of [f, total]) {
      if (l.conductor_id) {
        x.llamadasConductores++
        if (efectiva) x.efectivasConductores++
      } else if (l.lead_id) {
        x.llamadasLeads++
        if (efectiva) x.efectivasLeads++
      } else {
        x.llamadasOtros++
      }
    }
    if (efectiva && !l.conductor_id && l.lead_id) leadsDe.get(f.capitan)?.add(l.lead_id)
    if (l.calificacion != null) {
      for (const k of [f.capitan, total.capitan]) notas.set(k, [...(notas.get(k) ?? []), l.calificacion])
    }
  }
  for (const m of mensajes) {
    if (!enElegido(m.fecha)) continue
    if (m.conductor_id) conductoresContactados.add(m.conductor_id)
    const f = filas.get(capitanDeMensaje(m) ?? '')
    if (!f) continue
    for (const x of [f, total]) {
      if (m.conductor_id) x.mensajesConductores++
      else if (m.lead_id) x.mensajesLeads++
    }
    if (!m.conductor_id && m.lead_id) leadsDe.get(f.capitan)?.add(m.lead_id)
  }
  for (const [conductorId, capitan] of activos) {
    const f = filas.get(capitan)
    if (!f) continue
    for (const x of [f, total]) {
      x.conductores++
      if (conductoresContactados.has(conductorId)) x.contactados++
    }
  }
  for (const x of [...filas.values(), total]) {
    const n = notas.get(x.capitan)
    x.calidad = n?.length ? n.reduce((a, b) => a + b, 0) / n.length : null
  }

  // De los leads contactados en el período, cuántos ya son conductores
  const todosLosLeads = [...new Set([...leadsDe.values()].flatMap((s) => [...s]))]
  const yaConvertidos = new Set(
    (await porLotes<{ id: string }>(todosLosLeads, (lote) => supabase.from('leads')
      .select('id').in('id', lote).not('fecha_convertido', 'is', null))).map((r) => r.id),
  )
  const unicosTotal = new Set<string>()
  for (const [capitan, set] of leadsDe) {
    const f = filas.get(capitan)
    if (!f) continue
    f.leadsContactados = set.size
    f.leadsConvertidos = [...set].filter((id) => yaConvertidos.has(id)).length
    for (const id of set) unicosTotal.add(id)
  }
  total.leadsContactados = unicosTotal.size
  total.leadsConvertidos = [...unicosTotal].filter((id) => yaConvertidos.has(id)).length

  // ── Conversiones del período: contacto previo por 2Chat, por canal ──
  const conversionesLista: ConversionLead[] = []
  if (convertidos.length) {
    const ids = convertidos.map((c) => c.id)
    const claves = [...new Set(convertidos.flatMap((c) => [claveTelefono(c.phone), claveTelefono(c.whatsapp_number)])
      .filter((k): k is string => !!k))]
    const [llPorLead, llPorTel, msPorLead, msPorTel] = await Promise.all([
      porLotes<Llamada>(ids, (lote) => supabase.from('twochat_llamadas').select(COLS_LLAMADA).in('lead_id', lote)),
      porLotes<Llamada>(claves, (lote) => supabase.from('twochat_llamadas').select(COLS_LLAMADA).in('numero_clave', lote)),
      porLotes<Mensaje>(ids, (lote) => supabase.from('twochat_mensajes').select(COLS_MENSAJE).eq('enviado_por', 'agente').in('lead_id', lote)),
      porLotes<Mensaje>(claves, (lote) => supabase.from('twochat_mensajes').select(COLS_MENSAJE).eq('enviado_por', 'agente').in('numero_clave', lote)),
    ])
    for (const lead of convertidos) {
      const misClaves = new Set([claveTelefono(lead.phone), claveTelefono(lead.whatsapp_number)].filter(Boolean))
      const esDelLead = (r: { lead_id: string | null; numero_clave: string | null }) =>
        r.lead_id === lead.id || (!!r.numero_clave && misClaves.has(r.numero_clave))
      const corte = new Date(`${lead.fecha_convertido.slice(0, 19)}-03:00`).getTime()
      const antes = (iso: string) => new Date(iso).getTime() <= corte
      const contactos: { fecha: string; canal: 'llamada' | 'whatsapp'; capitan: string | null }[] = []
      const vistos = new Set<string>()
      for (const l of [...llPorLead, ...llPorTel]) {
        const k = `${l.fecha}|${l.numero_clave}`
        if (vistos.has(k) || !esDelLead(l) || !esEfectiva(l) || !antes(l.fecha)) continue
        vistos.add(k)
        contactos.push({ fecha: l.fecha, canal: 'llamada', capitan: capitanDe(l.agente) })
      }
      for (const m of [...msPorLead, ...msPorTel]) {
        const k = `${m.fecha}|${m.session_key}`
        if (vistos.has(k) || !esDelLead(m) || !antes(m.fecha)) continue
        vistos.add(k)
        contactos.push({ fecha: m.fecha, canal: 'whatsapp', capitan: capitanDeMensaje(m) })
      }
      if (!contactos.length) continue
      const canales = new Set(contactos.map((c) => c.canal))
      const canal: CanalConversion = canales.size > 1 ? 'ambos' : [...canales][0]
      // Capitán del último contacto que se pueda asignar a alguien
      const ultimo = contactos
        .filter((c) => c.capitan && c.capitan !== CUENTA_COMPARTIDA)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
      const capitan = ultimo?.capitan ?? CUENTA_COMPARTIDA
      const f = filas.get(capitan)
      if (f) f.conversiones[canal]++
      total.conversiones[canal]++
      conversionesLista.push({
        lead: (lead.nombre_completo || 'Sin nombre').replace(/\s+/g, ' ').trim(),
        capitan,
        canal,
        dia: lead.fecha_convertido.slice(0, 10),
      })
    }
  }

  // ── Evolución: contactos (llamadas efectivas + mensajes) por período ──
  const historia = periodos.map((inicio) => ({ inicio, fin: finDe(granularidad, inicio), contactos: new Map<string, number>() }))
  const sumar = (capitan: string | null, iso: string) => {
    if (!capitan || capitan === CUENTA_COMPARTIDA) return
    const dia = diaART(iso)
    const p = historia.find((h) => dia >= h.inicio && dia <= h.fin)
    if (!p) return
    p.contactos.set(capitan, (p.contactos.get(capitan) ?? 0) + 1)
  }
  for (const l of llamadas) if (esEfectiva(l)) sumar(capitanDe(l.agente), l.fecha)
  for (const m of mensajes) sumar(capitanDeMensaje(m), m.fecha)

  return {
    porCapitan: [...filas.values()],
    total,
    compartida,
    conversiones: conversionesLista.sort((a, b) => b.dia.localeCompare(a.dia)),
    convertidosPeriodo: convertidos.length,
    historia: historia.map(({ inicio, contactos }) => ({ inicio, contactos })),
  }
}
