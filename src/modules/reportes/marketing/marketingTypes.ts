// src/modules/reportes/marketing/marketingTypes.ts
// Tipos y cálculos del Dashboard Marketing. Los números vienen de la función SQL
// get_dashboard_marketing (sql/dashboard_marketing.sql); acá solo se filtran por
// segmento y se suman.

export type Segmento = 'Pauta redes' | 'Web' | 'Referidos' | 'Otras fuentes' | 'Sin fuente'
export type FiltroSegmento = 'Pauta redes' | 'Web' | 'Todos'
export type Perfil = 'Cumple' | 'Medio' | 'No cumple' | 'Sin datos'

export const FILTROS_SEGMENTO: { id: FiltroSegmento; label: string; info: string }[] = [
  { id: 'Pauta redes', label: 'Pauta redes', info: 'Leads que vienen de la pauta en redes: tienen canal o link de anuncio, o entraron por Sellium / Intercom.' },
  { id: 'Web', label: 'Web (orgánico)', info: 'Leads del formulario del sitio web. No vienen de la pauta.' },
  { id: 'Todos', label: 'Todos', info: 'Todas las fuentes, incluidos referidos y leads sin fuente cargada.' },
]

export const PERFILES: Perfil[] = ['Cumple', 'Medio', 'No cumple', 'Sin datos']

export interface EtapasEmbudo {
  leads: number
  filtros: number
  acepta: number
  video: number
  documentacion: number
  entrevista: number
  aptos: number
  convertidos: number
  con_auto: number
  descartados: number
  calificables: number
  /** Conductores nuevos: leads del período que ya recibieron su primer auto */
  nuevos: number
}

export interface FilaEmbudo extends EtapasEmbudo {
  rango: 'actual' | 'anterior'
  segmento: Segmento
}

export interface FilaCalidad {
  segmento: Segmento
  canal: string
  perfil: Perfil
  cantidad: number
}

export interface FilaRendimiento {
  leads: number
  calificables: number
  cumple: number
  acepta: number
  documentacion: number
  aptos: number
  nuevos: number
}

export interface FilaCanal extends FilaRendimiento {
  canal: string
}

export interface FilaAnuncio extends FilaRendimiento {
  anuncio: string
  canal: string
}

export interface FilaZona {
  segmento: Segmento
  zona: string
  leads: number
  acepta: number
  documentacion: number
  aptos: number
  descartados: number
  descartados_zona: number
  nuevos: number
}

export interface FilaDescarte {
  segmento: Segmento
  motivo: string
  cantidad: number
}

export interface FilaCausal extends FilaDescarte {
  causal: string
}

export interface FilaControl {
  segmento: Segmento
  leads: number
  sin_zona: number
  sin_canal: number
  con_link_posible: number
  sin_anuncio: number
  sin_edad: number
  calificables: number
  perfil_sin_datos: number
}

export interface NuevosConductores {
  total: number
  total_anterior: number
  dias_mediana: number | null
  dias_mediana_segmento: { segmento: Segmento; mediana: number | null }[]
  por_zona: { segmento: Segmento; zona: string; cantidad: number }[]
  por_segmento: { segmento: Segmento; cantidad: number }[]
  turnos: { segmento: Segmento; diurno: number; nocturno: number; cargo: number }[]
  /** Recibieron su primer auto en el período pero su lead es anterior al período */
  fuera_de_rango: { segmento: Segmento; cantidad: number }[]
}

export interface MarketingRaw {
  periodo: { hoy: string; desde: string; hasta: string; anterior: { desde: string; hasta: string } }
  embudo: FilaEmbudo[]
  calidad: FilaCalidad[]
  canales: FilaCanal[]
  anuncios: FilaAnuncio[]
  zonas: FilaZona[]
  descartes: FilaDescarte[]
  causales: FilaCausal[]
  control: FilaControl[]
  nuevos_conductores: NuevosConductores
}

// ───────────── Filtro por segmento ─────────────

export function enSegmento(segmento: Segmento, filtro: FiltroSegmento): boolean {
  return filtro === 'Todos' || segmento === filtro
}

const ETAPAS_VACIAS: EtapasEmbudo = {
  leads: 0, filtros: 0, acepta: 0, video: 0, documentacion: 0, entrevista: 0, aptos: 0,
  convertidos: 0, con_auto: 0, descartados: 0, calificables: 0, nuevos: 0,
}

export function embudoDe(d: MarketingRaw, rango: 'actual' | 'anterior', filtro: FiltroSegmento): EtapasEmbudo {
  const out = d.embudo
    .filter(f => f.rango === rango && enSegmento(f.segmento, filtro))
    .reduce<EtapasEmbudo>((acc, f) => {
      const suma = { ...acc }
      for (const k of Object.keys(ETAPAS_VACIAS) as (keyof EtapasEmbudo)[]) suma[k] = acc[k] + (Number(f[k]) || 0)
      return suma
    }, { ...ETAPAS_VACIAS })
  return out
}

export function calidadDe(d: MarketingRaw, filtro: FiltroSegmento): Record<Perfil, number> {
  const out: Record<Perfil, number> = { Cumple: 0, Medio: 0, 'No cumple': 0, 'Sin datos': 0 }
  for (const f of d.calidad) if (enSegmento(f.segmento, filtro)) out[f.perfil] += Number(f.cantidad) || 0
  return out
}

/** Perfil por canal (solo pauta). */
export function calidadPorCanal(d: MarketingRaw): { canal: string; perfiles: Record<Perfil, number>; total: number }[] {
  const mapa = new Map<string, Record<Perfil, number>>()
  for (const f of d.calidad) {
    if (f.segmento !== 'Pauta redes') continue
    const fila = mapa.get(f.canal) ?? { Cumple: 0, Medio: 0, 'No cumple': 0, 'Sin datos': 0 }
    fila[f.perfil] += Number(f.cantidad) || 0
    mapa.set(f.canal, fila)
  }
  return [...mapa.entries()]
    .map(([canal, perfiles]) => ({ canal, perfiles, total: PERFILES.reduce((s, p) => s + perfiles[p], 0) }))
    .sort((a, b) => b.total - a.total)
}

export function zonasDe(d: MarketingRaw, filtro: FiltroSegmento): Omit<FilaZona, 'segmento'>[] {
  const mapa = new Map<string, Omit<FilaZona, 'segmento'>>()
  for (const f of d.zonas) {
    if (!enSegmento(f.segmento, filtro)) continue
    const z = mapa.get(f.zona) ?? {
      zona: f.zona, leads: 0, acepta: 0, documentacion: 0, aptos: 0, descartados: 0, descartados_zona: 0, nuevos: 0,
    }
    z.leads += f.leads
    z.acepta += f.acepta
    z.documentacion += f.documentacion
    z.aptos += f.aptos
    z.descartados += f.descartados
    z.descartados_zona += f.descartados_zona
    z.nuevos += f.nuevos
    mapa.set(f.zona, z)
  }
  return [...mapa.values()].sort((a, b) => (a.zona === 'Sin dato' ? 1 : 0) - (b.zona === 'Sin dato' ? 1 : 0) || b.leads - a.leads)
}

export function descartesDe(d: MarketingRaw, filtro: FiltroSegmento): { motivo: string; cantidad: number }[] {
  const mapa = new Map<string, number>()
  for (const f of d.descartes) if (enSegmento(f.segmento, filtro)) mapa.set(f.motivo, (mapa.get(f.motivo) || 0) + f.cantidad)
  return [...mapa.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
}

export function causalesDe(d: MarketingRaw, filtro: FiltroSegmento): { causal: string; motivo: string; cantidad: number }[] {
  const mapa = new Map<string, { causal: string; motivo: string; cantidad: number }>()
  for (const f of d.causales) {
    if (!enSegmento(f.segmento, filtro)) continue
    const c = mapa.get(f.causal) ?? { causal: f.causal, motivo: f.motivo, cantidad: 0 }
    c.cantidad += f.cantidad
    mapa.set(f.causal, c)
  }
  return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10)
}

export function controlDe(d: MarketingRaw, filtro: FiltroSegmento): Omit<FilaControl, 'segmento'> {
  const out = { leads: 0, sin_zona: 0, sin_canal: 0, con_link_posible: 0, sin_anuncio: 0, sin_edad: 0, calificables: 0, perfil_sin_datos: 0 }
  for (const f of d.control) {
    if (!enSegmento(f.segmento, filtro)) continue
    out.leads += f.leads
    out.sin_zona += f.sin_zona
    out.sin_canal += f.sin_canal
    out.con_link_posible += f.con_link_posible
    out.sin_anuncio += f.sin_anuncio
    out.sin_edad += f.sin_edad
    out.calificables += f.calificables
    out.perfil_sin_datos += f.perfil_sin_datos
  }
  return out
}

/** Link del anuncio legible: dominio + final del camino. */
export function anuncioCorto(link: string): string {
  try {
    const u = new URL(link)
    const camino = u.pathname.replace(/\/+$/, '')
    const fin = camino.length > 28 ? `…${camino.slice(-26)}` : camino
    return `${u.hostname.replace(/^www\./, '')}${fin}${u.search ? '?…' : ''}`
  } catch {
    return link.length > 40 ? `${link.slice(0, 38)}…` : link
  }
}

// ───────────── Glosario (lo que ve la agencia) ─────────────

export const GLOSARIO: { termino: string; definicion: string }[] = [
  { termino: 'Leads', definicion: 'Personas que entraron a Toshibase en el período (fecha de creación del lead). Las conversaciones que informa Meta son otra cosa: no todas se convierten en lead.' },
  { termino: 'Pasaron filtros', definicion: 'Dirección con cobertura y edad aprobada (21 años o más).' },
  { termino: 'Acepta oferta', definicion: 'Aceptó la propuesta que le envió el chatbot (o el lead avanzó más). Quien solo recibió la propuesta no cuenta acá.' },
  { termino: 'Envió video introducción', definicion: 'Envió el video de introducción ("Video recibido" o etapa Hireflix, incluido Apto Hireflix) o avanzó más.' },
  { termino: 'Documentación', definicion: 'Llegó a la etapa de documentos: pendientes o enviados (precandidato).' },
  { termino: 'Entrevista', definicion: 'Convocado a la inducción, que es la entrevista ("Convocatoria Inducción") o más adelante.' },
  { termino: 'Aptos', definicion: 'Pasaron la entrevista: "Apto Inducción" o ya son conductores.' },
  { termino: 'Conductores nuevos', definicion: 'Leads creados en el período que ya recibieron su primer auto (primera asignación). Es lo que cuenta como conductor captado por la pauta de ese período.' },
  { termino: 'Fuera de rango', definicion: 'Recibieron su primer auto en el período pero entraron como lead antes: no corresponden a la pauta del período filtrado y se muestran aparte.' },
  { termino: 'Conversión', definicion: 'Conductores nuevos ÷ leads del período (los dos sobre los mismos leads).' },
  { termino: 'Perfil del lead', definicion: 'Se mide sobre los leads que llegaron a la propuesta: antes el chatbot no preguntó licencia, monotributo ni experiencia. Cumple: 21+, licencia D1, monotributo y experiencia. Medio: 21+ con parte de los requisitos. No cumple: menor de 21, sin licencia o sin experiencia.' },
  { termino: 'Pauta redes / Web', definicion: 'Pauta redes: leads con canal o link de anuncio, o que entraron por Sellium / Intercom. Web: formulario del sitio (orgánico), se mide aparte.' },
  { termino: 'Sin canal identificado', definicion: 'Lead de pauta sin el link del anuncio, así que no se sabe si vino de Facebook o Instagram. El link se carga desde el 30/09/2026.' },
]

/** Suma de una lista con segmento, filtrada. */
export function sumarPorSegmento<T extends { segmento: Segmento }>(filas: T[], filtro: FiltroSegmento, valor: (f: T) => number): number {
  return filas.filter(f => enSegmento(f.segmento, filtro)).reduce((acc, f) => acc + (Number(valor(f)) || 0), 0)
}
