// src/modules/leads/parejasLeads.ts
//
// "Pareja posible" en Leads: para cada lead, el conductor activo más cercano al que
// le falta compañero (asignación por TURNO con el otro turno vacante) y con el que
// el turno encaja. Sirve para priorizar el contacto: los leads con pareja cerca se
// suben más rápido que los que hay que ir a buscarles con quién.
//
// Mismas reglas que Distribución en mapa (onboarding/distribucion-mapa-v2):
//  - Turno: el lead tiene que querer el turno que le falta al auto; sin preferencia
//    (o sin dato) sirve para cualquiera (turnosComplementarios).
//  - Tiempo: estimado en línea recta a la velocidad urbana del mapa
//    (minutosEstimadosLineal, calibrado con tramos medidos), sin llamar a Google: se calcula al instante para
//    todos los leads y no cuesta nada. Es el mismo "Tiempo estimado" del mapa.
//  - Umbrales: hasta UMBRAL_MINUTOS_DEFAULT (25') = cerca; hasta UMBRAL_MINUTOS_MAX
//    (40') = posible; más lejos no se muestra.
//  - Leads nuevos ya procesados (rutasLeadsService.ts): en vez de la estimación se
//    usa el recorrido real en auto guardado en parejas_lead.
import type { TurnoEfectivo } from '../onboarding/distribucion-mapa-v2/types'
import { supabase } from '../../lib/supabase'
import {
  UMBRAL_MINUTOS_DEFAULT, UMBRAL_MINUTOS_MAX, minutosEstimadosLineal,
} from '../onboarding/distribucion-mapa-v2/emparejamientoService'
import {
  coordsValidas, haversineKm, horarioATurno, turnoLeadATurno, turnosComplementarios,
} from '../onboarding/distribucion-mapa-v2/utils'

/** Conductor activo al que le falta compañero en su auto. */
export interface ConductorSinCompanero {
  conductorId: string
  nombre: string
  lat: number
  lng: number
  zona: string | null
  /** Turno que hace hoy el conductor. */
  turnoOcupado: TurnoEfectivo
  /** Turno vacante del auto: el que tendría que hacer el lead. */
  turnoLibre: TurnoEfectivo
  patente: string
  vehiculoId: string | null
  /** Agente responsable del auto (vehiculos.guia_responsable), si está cargado. */
  responsable: string | null
}

export type NivelPareja = 'cerca' | 'posible'

export interface OpcionPareja {
  conductor: ConductorSinCompanero
  km: number
  minutos: number
  nivel: NivelPareja
  /** 'calle' = recorrido real en auto; 'estimado' = línea recta a velocidad urbana. */
  fuente: 'calle' | 'estimado'
}

export interface ParejaLead extends OpcionPareja {
  /** Cuántos conductores sin compañero hay dentro del umbral "posible". */
  opciones: number
  /** Todas las opciones, de la más cercana a la más lejana. */
  candidatos: OpcionPareja[]
}

const INACTIVOS = ['cancelado', 'completado', 'finalizado']

type AplicarFiltroSede = <T>(q: T) => T

type FilaAsignacion = {
  horario: string | null
  vehiculo_id: string | null
  vehiculos: { patente: string | null; guia_responsable?: string | null } | null
  asignaciones_conductores: {
    horario: string | null
    estado: string | null
    conductores: {
      id: string
      nombres: string | null
      apellidos: string | null
      zona: string | null
      direccion_lat: number | null
      direccion_lng: number | null
    } | null
  }[] | null
}

export async function cargarConductoresSinCompanero(aplicarFiltroSede: AplicarFiltroSede): Promise<ConductorSinCompanero[]> {
  const consultar = (conResponsable: boolean) => aplicarFiltroSede((supabase.from('asignaciones') as any)
    .select(`
      horario, vehiculo_id,
      vehiculos ( patente${conResponsable ? ', guia_responsable' : ''} ),
      asignaciones_conductores (
        horario, estado,
        conductores ( id, nombres, apellidos, zona, direccion_lat, direccion_lng )
      )
    `))
    .in('estado', ['activo', 'activa'])
    .eq('horario', 'turno')

  // Sin la columna guia_responsable (falta sql/vehiculos_guia_responsable.sql) se sigue sin el dato
  let { data, error } = await consultar(true)
  if (error) ({ data, error } = await consultar(false))
  if (error) throw error

  const resultado: ConductorSinCompanero[] = []
  for (const a of (data || []) as FilaAsignacion[]) {
    const activos = (a.asignaciones_conductores || [])
      .filter(ac => ac.conductores && !INACTIVOS.includes(String(ac.estado || '').toLowerCase()))
    const diurno = activos.find(ac => horarioATurno(ac.horario) === 'DIURNO')
    const nocturno = activos.find(ac => horarioATurno(ac.horario) === 'NOCTURNO')
    // Le falta compañero: exactamente uno de los dos turnos cubierto
    if (!!diurno === !!nocturno) continue
    const ocupado = (diurno || nocturno)!
    const c = ocupado.conductores!
    if (!coordsValidas(c.direccion_lat, c.direccion_lng)) continue
    resultado.push({
      conductorId: c.id,
      nombre: `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
      lat: Number(c.direccion_lat),
      lng: Number(c.direccion_lng),
      zona: c.zona,
      turnoOcupado: diurno ? 'DIURNO' : 'NOCTURNO',
      turnoLibre: diurno ? 'NOCTURNO' : 'DIURNO',
      patente: a.vehiculos?.patente || '',
      vehiculoId: a.vehiculo_id,
      responsable: a.vehiculos?.guia_responsable ?? null,
    })
  }
  return resultado
}

/** Minutos estimados en línea recta, igual que el "Tiempo estimado" del mapa. */
function minutosEstimados(km: number): number {
  return minutosEstimadosLineal(km)
}

/**
 * Mejor pareja para un lead: el conductor sin compañero más cercano cuyo turno libre
 * encaja con el turno del lead. null si el lead no tiene ubicación o no hay ninguno
 * dentro de UMBRAL_MINUTOS_MAX.
 */
export function mejorPareja(
  lead: { latitud?: number | null; longitud?: number | null; turno?: string | null },
  conductores: ConductorSinCompanero[],
  /**
   * Recorridos por calle del lead (conductor_id -> medida), si ya se procesó.
   * Con esto, sólo cuentan los conductores que dan 40 min o menos por calle.
   */
  porCalle?: Map<string, { km: number; minutos: number }> | null,
): ParejaLead | null {
  if (!coordsValidas(lead.latitud, lead.longitud)) return null
  const punto = { lat: Number(lead.latitud), lng: Number(lead.longitud) }
  const turnoLead = turnoLeadATurno(lead.turno)

  const candidatos: OpcionPareja[] = []
  for (const c of conductores) {
    if (!turnosComplementarios(turnoLead, c.turnoOcupado)) continue
    let km: number
    let minutos: number
    if (porCalle) {
      const medida = porCalle.get(c.conductorId)
      if (!medida) continue
      km = medida.km
      minutos = medida.minutos
    } else {
      km = haversineKm(punto.lat, punto.lng, c.lat, c.lng)
      minutos = minutosEstimados(km)
    }
    if (minutos > UMBRAL_MINUTOS_MAX) continue
    candidatos.push({
      conductor: c, km, minutos,
      nivel: minutos <= UMBRAL_MINUTOS_DEFAULT ? 'cerca' : 'posible',
      fuente: porCalle ? 'calle' : 'estimado',
    })
  }
  if (candidatos.length === 0) return null
  candidatos.sort((x, y) => x.minutos - y.minutos || x.km - y.km)
  return { ...candidatos[0], opciones: candidatos.length, candidatos }
}

/** Texto del tooltip de la etiqueta. */
export function detallePareja(p: ParejaLead): string {
  const turno = (t: TurnoEfectivo) => (t === 'DIURNO' ? 'diurno' : t === 'NOCTURNO' ? 'nocturno' : 'sin preferencia')
  const partes = [
    `${p.conductor.nombre} (${turno(p.conductor.turnoOcupado)}) necesita compañero ${turno(p.conductor.turnoLibre)}`,
    p.conductor.patente ? `Auto ${p.conductor.patente}` : '',
    p.conductor.responsable ? `Capitán: ${p.conductor.responsable}` : '',
    p.fuente === 'calle'
      ? `${p.minutos} min en auto (${p.km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km por calle)`
      : `~${p.minutos} min (${p.km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km en línea recta)`,
    p.opciones > 1 ? `${p.opciones} opciones a menos de ${UMBRAL_MINUTOS_MAX} min` : '',
  ]
  return partes.filter(Boolean).join(' · ')
}

const TURNO_CORTO: Record<TurnoEfectivo, string> = { DIURNO: 'Diurno', NOCTURNO: 'Nocturno', SIN_PREFERENCIA: 'Sin pref.' }

function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

/** Distribución en mapa abierta con el lead fijado como base y la línea hasta el conductor. */
export function rutaMapaPareja(leadId: string, conductorId: string): string {
  return `/onboarding/distribucion-mapa-v2?lead=${encodeURIComponent(leadId)}&conductor=${encodeURIComponent(conductorId)}`
}

/**
 * Tabla HTML (para Alerta.fire) con todas las parejas posibles de un lead. Los
 * "Ver en mapa" llevan data-mapa con la ruta interna: quien abre la alerta los
 * engancha con el router (navigate) en didOpen.
 */
export interface LeadCercaHtml {
  nombre: string
  zona: string | null
  turno: string | null
  estado: string | null
  km: number
  minutos: number
}

/** Filas por página en la alerta de opciones. */
const FILAS_POR_PAGINA = 10

const ESTILO_CELDA = 'padding:5px 8px;vertical-align:middle;'
const ESTILO_TH = 'padding:4px 8px;font-size:10.5px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;opacity:.6;'

function celdaTiempo(minutos: number, km: number, porCalle: boolean): string {
  const color = minutos <= UMBRAL_MINUTOS_DEFAULT ? '#6D28D9' : 'inherit'
  const kmTxt = km.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return `<td style="${ESTILO_CELDA}text-align:right;white-space:nowrap;">
    <b style="color:${color};">${porCalle ? '' : '~'}${minutos} min</b>
    <span style="opacity:.6;font-size:11px;margin-left:4px;">${kmTxt} km</span></td>`
}

function nombreConZona(nombre: string, zona: string | null): string {
  return `<td style="${ESTILO_CELDA}text-align:left;max-width:260px;">
    <span style="font-weight:600;">${escaparHtml(nombre)}</span>${zona ? `<span style="opacity:.55;font-size:11px;margin-left:6px;">${escaparHtml(zona)}</span>` : ''}</td>`
}

/** Tabla con su paginador; las filas llevan data-pagina y se muestran de a una página. */
function tablaPaginada(id: string, titulo: string, encabezados: string[], filas: string[]): string {
  if (filas.length === 0) return ''
  const paginas = Math.ceil(filas.length / FILAS_POR_PAGINA)
  const cuerpo = filas.map((f, i) => {
    const pagina = Math.floor(i / FILAS_POR_PAGINA)
    const zebra = i % 2 === 1 ? 'background:rgba(128,128,128,.06);' : ''
    return f.replace('<tr>', `<tr data-pagina="${pagina}" style="${zebra}${pagina > 0 ? 'display:none;' : ''}">`)
  }).join('')
  const boton = (accion: string, texto: string) =>
    `<button type="button" data-pager-accion="${accion}" style="border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer;">${texto}</button>`
  const pager = paginas <= 1 ? '' : `
    <div data-pager style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:6px;font-size:12px;">
      ${boton('ant', '‹ Anterior')}
      <span data-pager-texto style="opacity:.7;">1–${Math.min(FILAS_POR_PAGINA, filas.length)} de ${filas.length}</span>
      ${boton('sig', 'Siguiente ›')}
    </div>`
  return `<section data-tabla-paginada="${id}" data-total="${filas.length}" data-pagina-actual="0" style="margin-top:12px;">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;">
      <span style="font-weight:700;font-size:13px;">${titulo}</span>
      <span style="opacity:.6;font-size:11.5px;">${filas.length}</span>
    </div>
    <div data-tabla-cuerpo>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead><tr style="border-bottom:1px solid rgba(128,128,128,.3);">${encabezados.join('')}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    </div>${pager}
  </section>`
}

/**
 * Engancha los paginadores de htmlOpcionesPareja. Llamarlo en el didOpen de la
 * alerta (el HTML de Alerta.fire no ejecuta scripts).
 */
export function activarPaginacionOpciones(popup: HTMLElement): void {
  popup.querySelectorAll<HTMLElement>('[data-tabla-paginada]').forEach((tabla) => {
    const total = Number(tabla.dataset.total) || 0
    const paginas = Math.ceil(total / FILAS_POR_PAGINA)
    const mostrar = (pagina: number) => {
      tabla.dataset.paginaActual = String(pagina)
      tabla.querySelectorAll<HTMLElement>('tr[data-pagina]').forEach((tr) => {
        tr.style.display = Number(tr.dataset.pagina) === pagina ? '' : 'none'
      })
      const texto = tabla.querySelector<HTMLElement>('[data-pager-texto]')
      if (texto) texto.textContent = `${pagina * FILAS_POR_PAGINA + 1}–${Math.min((pagina + 1) * FILAS_POR_PAGINA, total)} de ${total}`
      tabla.querySelectorAll<HTMLButtonElement>('[data-pager-accion]').forEach((b) => {
        const deshabilitado = b.dataset.pagerAccion === 'ant' ? pagina === 0 : pagina >= paginas - 1
        b.disabled = deshabilitado
        b.style.opacity = deshabilitado ? '.4' : '1'
        b.style.cursor = deshabilitado ? 'default' : 'pointer'
      })
    }
    tabla.querySelectorAll<HTMLButtonElement>('[data-pager-accion]').forEach((b) => {
      b.addEventListener('click', () => {
        const actual = Number(tabla.dataset.paginaActual) || 0
        mostrar(Math.max(0, Math.min(paginas - 1, actual + (b.dataset.pagerAccion === 'ant' ? -1 : 1))))
      })
    })
    mostrar(0)
    // Mismo alto en todas las páginas: la última (con menos filas) no achica el popup
    const cuerpo = tabla.querySelector<HTMLElement>('[data-tabla-cuerpo]')
    if (cuerpo && paginas > 1) cuerpo.style.minHeight = `${cuerpo.offsetHeight}px`
  })
}

/**
 * Tabla HTML (para Alerta.fire) con todas las parejas posibles de un lead,
 * paginadas de a FILAS_POR_PAGINA (activarPaginacionOpciones en didOpen). Los
 * "Ver en mapa" llevan data-mapa con la ruta interna: quien abre la alerta los
 * engancha con el router (navigate) en didOpen.
 */
export function htmlOpcionesPareja(p: ParejaLead | null, leadId: string, leadsCerca: LeadCercaHtml[] = []): string {
  const candidatos = p?.candidatos ?? []
  const porCalle = p ? p.fuente === 'calle' : true

  const filasConductores = candidatos.map(o => {
    const c = o.conductor
    const ruta = rutaMapaPareja(leadId, c.conductorId)
    return `<tr>
      ${nombreConZona(c.nombre, c.zona)}
      <td style="${ESTILO_CELDA}text-align:left;white-space:nowrap;"><span style="opacity:.7;">${TURNO_CORTO[c.turnoOcupado]} →</span> <b>${TURNO_CORTO[c.turnoLibre]}</b></td>
      <td style="${ESTILO_CELDA}text-align:left;font-family:monospace;font-size:12px;white-space:nowrap;">${escaparHtml(c.patente || '-')}</td>
      <td style="${ESTILO_CELDA}text-align:left;white-space:nowrap;opacity:.85;">${escaparHtml(c.responsable || '-')}</td>
      ${celdaTiempo(o.minutos, o.km, o.fuente === 'calle')}
      <td style="${ESTILO_CELDA}text-align:right;white-space:nowrap;">
        <a href="#" data-mapa="${escaparHtml(ruta)}" title="Abre Distribución en mapa con el lead y este conductor"
           style="color:#2563eb;font-weight:600;text-decoration:none;">Mapa</a>
      </td>
    </tr>`
  })

  const filasLeads = leadsCerca.map(o => `<tr>
      ${nombreConZona(o.nombre, o.zona)}
      <td style="${ESTILO_CELDA}text-align:left;white-space:nowrap;">${escaparHtml(o.turno || '-')}</td>
      <td style="${ESTILO_CELDA}text-align:left;white-space:nowrap;opacity:.85;">${escaparHtml(o.estado || '-')}</td>
      ${celdaTiempo(o.minutos, o.km, true)}
    </tr>`)

  const th = (texto: string, alinear: 'left' | 'right' = 'left') => `<th style="${ESTILO_TH}text-align:${alinear};">${texto}</th>`
  // Corto: el "~" delante de los minutos ya indica que es estimado
  const explicacion = porCalle
    ? `Tiempo en auto. Hasta ${UMBRAL_MINUTOS_DEFAULT} min = cerca (en violeta).`
    : `Tiempo en auto (~ = estimado). Hasta ${UMBRAL_MINUTOS_DEFAULT} min = cerca (en violeta).`

  return `<div style="font-size:13px;text-align:left;">
    <p style="margin:0 0 2px;opacity:.7;font-size:12px;text-align:center;">${explicacion}</p>
    ${tablaPaginada('conductores', 'Conductores sin compañero con el turno que le sirve', [th('Conductor'), th('Turno → falta'), th('Auto'), th('Capitán'), th('Tiempo', 'right'), th('')], filasConductores)}
    ${tablaPaginada('leads', `Otros leads a ${UMBRAL_MINUTOS_MAX} min o menos por calle`, [th('Lead'), th('Turno'), th('Estado'), th('Tiempo', 'right')], filasLeads)}
  </div>`
}

// =====================================================
// Leads ya programados (Programación de onboarding)
// =====================================================

/** Lead que ya tiene una programación pendiente (no completada, cancelada ni eliminada). */
export interface ProgramacionLead {
  programacionId: string
  turno: 'DIURNO' | 'NOCTURNO' | 'A_CARGO'
  patente: string
  fechaCita: string | null
  /** Con quién comparte el auto (el otro turno), si está cargado. */
  companero: string | null
}

export interface ProgramacionesActivas {
  /** lead_id -> su programación. */
  porLead: Map<string, ProgramacionLead>
  /** "vehiculoId|TURNO" de los turnos que ya están programados (no se ofrecen a otros leads). */
  turnosTomados: Set<string>
}

type FilaProgramacion = {
  id: string
  modalidad: string | null
  vehiculo_entregar_id: string | null
  vehiculo_entregar_patente: string | null
  fecha_cita: string | null
  conductor_diurno_id: string | null
  conductor_diurno_nombre: string | null
  conductor_nocturno_id: string | null
  conductor_nocturno_nombre: string | null
  conductor_id: string | null
  conductor_nombre: string | null
}

export async function cargarProgramacionesActivas(aplicarFiltroSede: AplicarFiltroSede): Promise<ProgramacionesActivas> {
  const porLead = new Map<string, ProgramacionLead>()
  const turnosTomados = new Set<string>()

  const { data, error } = await aplicarFiltroSede((supabase.from('v_programaciones_onboarding') as any)
    .select('id, modalidad, vehiculo_entregar_id, vehiculo_entregar_patente, fecha_cita, conductor_diurno_id, conductor_diurno_nombre, conductor_nocturno_id, conductor_nocturno_nombre, conductor_id, conductor_nombre')
    .not('estado', 'in', '(completado,cancelado)')
    .or('eliminado.is.null,eliminado.eq.false'))
  if (error) throw error
  const filas = (data || []) as FilaProgramacion[]
  if (filas.length === 0) return { porLead, turnosTomados }

  // La vista no trae los lead_*_id: se leen de la tabla (como ProgramacionV2Module)
  const leadIds = new Map<string, { d: string | null; n: string | null; c: string | null }>()
  for (let i = 0; i < filas.length; i += 100) {
    const { data: extra } = await (supabase.from('programaciones_onboarding') as any)
      .select('id, lead_diurno_id, lead_nocturno_id, lead_cargo_id')
      .in('id', filas.slice(i, i + 100).map(f => f.id))
    for (const r of (extra || []) as { id: string; lead_diurno_id: string | null; lead_nocturno_id: string | null; lead_cargo_id: string | null }[]) {
      leadIds.set(r.id, { d: r.lead_diurno_id, n: r.lead_nocturno_id, c: r.lead_cargo_id })
    }
  }

  for (const f of filas) {
    const leads = leadIds.get(f.id) ?? { d: null, n: null, c: null }
    const patente = f.vehiculo_entregar_patente || ''
    const diurnoNombre = (f.conductor_diurno_nombre || '').trim() || null
    const nocturnoNombre = (f.conductor_nocturno_nombre || '').trim() || null
    const esTurno = (f.modalidad || '').toLowerCase() === 'turno'

    if (esTurno) {
      const diurnoOcupado = !!(f.conductor_diurno_id || diurnoNombre || leads.d)
      const nocturnoOcupado = !!(f.conductor_nocturno_id || nocturnoNombre || leads.n)
      if (f.vehiculo_entregar_id) {
        if (diurnoOcupado) turnosTomados.add(`${f.vehiculo_entregar_id}|DIURNO`)
        if (nocturnoOcupado) turnosTomados.add(`${f.vehiculo_entregar_id}|NOCTURNO`)
      }
      if (leads.d) porLead.set(leads.d, { programacionId: f.id, turno: 'DIURNO', patente, fechaCita: f.fecha_cita, companero: nocturnoNombre })
      if (leads.n) porLead.set(leads.n, { programacionId: f.id, turno: 'NOCTURNO', patente, fechaCita: f.fecha_cita, companero: diurnoNombre })
    } else {
      if (f.vehiculo_entregar_id && (f.conductor_id || f.conductor_nombre || leads.c)) {
        turnosTomados.add(`${f.vehiculo_entregar_id}|DIURNO`)
        turnosTomados.add(`${f.vehiculo_entregar_id}|NOCTURNO`)
      }
      if (leads.c) porLead.set(leads.c, { programacionId: f.id, turno: 'A_CARGO', patente, fechaCita: f.fecha_cita, companero: null })
    }
  }
  return { porLead, turnosTomados }
}

/** Saca a los conductores cuyo turno libre ya está programado para otra persona. */
export function sinTurnosTomados(conductores: ConductorSinCompanero[], turnosTomados: Set<string>): ConductorSinCompanero[] {
  if (turnosTomados.size === 0) return conductores
  return conductores.filter(c => !c.vehiculoId || !turnosTomados.has(`${c.vehiculoId}|${c.turnoLibre}`))
}

/** Texto de la etiqueta y del tooltip de un lead programado. */
export function textoProgramacion(p: ProgramacionLead): { etiqueta: string; detalle: string } {
  const turno = p.turno === 'DIURNO' ? 'diurno' : p.turno === 'NOCTURNO' ? 'nocturno' : 'a cargo'
  const fecha = p.fechaCita ? p.fechaCita.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : null
  const etiqueta = [
    'Programado',
    p.patente,
    p.companero ? `con ${p.companero.split(' ')[0]}` : '',
    fecha ?? '',
  ].filter(Boolean).join(' · ')
  const detalle = [
    `Programado en el turno ${turno}${p.patente ? ` del auto ${p.patente}` : ''}`,
    p.companero ? `Compañero: ${p.companero}` : p.turno === 'A_CARGO' ? '' : 'Todavía sin compañero en el otro turno',
    fecha ? `Cita: ${fecha}` : '',
  ].filter(Boolean).join(' · ')
  return { etiqueta, detalle }
}
