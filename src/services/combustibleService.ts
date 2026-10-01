import { supabase } from '../lib/supabase'
import type {
  FuelSummary,
  FuelFillup,
  RangoSemana,
  ConductorEnCarga,
} from '../modules/vehiculos/control-combustible/types/combustible.types'

const SUMMARY_SELECT = `
  id, vehiculo_id, patente, geotab_device_id, periodo_dias,
  fecha_desde, fecha_hasta,
  distancia_km, combustible_litros, ralenti_litros, ralenti_pct,
  rendimiento_km_litro, energia_kwh, llenados_count, tiene_telemetria,
  nivel_actual_pct, nivel_actual_fecha,
  sede_id, synced_at,
  vehiculo:vehiculos(marca, modelo, gnc)
`

const FILLUP_SELECT = `
  id, geotab_fillup_id, vehiculo_id, patente, geotab_device_id,
  conductor_id, conductor_name, fecha_evento,
  volume_litros, derived_volume_litros,
  tank_nivel_min_pct, tank_nivel_max_pct, subida_pct,
  total_fuel_used_previo, odometro_metros, distance_previo_km,
  cost, currency_code, product_type, confidence,
  location_lat, location_lng, location_direccion, tank_capacity_litros,
  sede_id, synced_at
`

/**
 * Trae el resumen agregado por vehículo (último período).
 */
export async function fetchFuelSummary(sedeId?: string | null, periodoDias = 30): Promise<FuelSummary[]> {
  let q = supabase
    .from('geotab_fuel_summary')
    .select(SUMMARY_SELECT)
    .eq('periodo_dias', periodoDias)
    .order('combustible_litros', { ascending: false })
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as FuelSummary[]
}

/**
 * Trae los llenados detectados (FillUp) del vehículo o de toda la sede.
 */
export async function fetchFillups(opts: {
  sedeId?: string | null
  vehiculoId?: string | null
  desde?: Date
  hasta?: Date
}): Promise<FuelFillup[]> {
  let q = supabase
    .from('geotab_fillups')
    .select(FILLUP_SELECT)
    .order('fecha_evento', { ascending: false })
  if (opts.sedeId) q = q.eq('sede_id', opts.sedeId)
  if (opts.vehiculoId) q = q.eq('vehiculo_id', opts.vehiculoId)
  if (opts.desde) q = q.gte('fecha_evento', opts.desde.toISOString())
  if (opts.hasta) q = q.lte('fecha_evento', opts.hasta.toISOString())
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as FuelFillup[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtro por semana, estado del vehículo y conductor en cada carga
// ─────────────────────────────────────────────────────────────────────────────

/** 'AF 541-GI' -> 'AF541GI' (mismo criterio que la bitácora). */
export const normalizarPatente = (p: string | null | undefined): string =>
  (p || '').replace(/[\s\-.%]/g, '').toUpperCase()

const sumarDia = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Semana en hora Argentina (sin horario de verano): [lunes 00:00, lunes siguiente 00:00). */
export function limitesSemana(r: RangoSemana): { desde: Date; hastaExclusivo: Date; desdeIso: string; hastaIsoExcl: string } {
  const desdeIso = `${r.desde}T00:00:00-03:00`
  const hastaIsoExcl = `${sumarDia(r.hasta)}T00:00:00-03:00`
  return { desde: new Date(desdeIso), hastaExclusivo: new Date(hastaIsoExcl), desdeIso, hastaIsoExcl }
}

/** Trae todas las páginas de una consulta (PostgREST corta en 1000 filas). */
async function traerTodo<T>(
  armar: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000
  const out: T[] = []
  for (let from = 0; from < 50000; from += PAGINA) {
    const { data, error } = await armar(from, from + PAGINA - 1)
    if (error) throw error
    const filas = (data || []) as T[]
    out.push(...filas)
    if (filas.length < PAGINA) break
  }
  return out
}

/**
 * Km recorridos en la semana por patente (normalizada), desde la bitácora de Geotab
 * (km por turno). Mismo criterio que el control de exceso de km: se excluyen los
 * turnos "Sin Actividad".
 */
export async function fetchKmSemana(r: RangoSemana): Promise<Map<string, number>> {
  const { desdeIso, hastaIsoExcl } = limitesSemana(r)
  const filas = await traerTodo<{ patente_normalizada: string | null; kilometraje: number | null }>((a, b) =>
    supabase
      .from('geotab_bitacora')
      .select('patente_normalizada, kilometraje')
      .gte('periodo_inicio', desdeIso)
      .lt('periodo_inicio', hastaIsoExcl)
      .neq('estado', 'Sin Actividad')
      .range(a, b),
  )
  const km = new Map<string, number>()
  for (const f of filas) {
    const pat = normalizarPatente(f.patente_normalizada)
    if (!pat) continue
    km.set(pat, (km.get(pat) || 0) + (Number(f.kilometraje) || 0))
  }
  return km
}

const nombreConductor = (c: { nombres?: string | null; apellidos?: string | null } | null | undefined): string =>
  `${c?.nombres || ''} ${c?.apellidos || ''}`.replace(/\s+/g, ' ').trim()

/**
 * Estado actual de cada vehículo y conductores a cargo hoy (asignación activa,
 * mismo criterio que el módulo Conductores: conductor 'asignado' o 'activo').
 */
export async function fetchEstadoYACargo(vehiculoIds: string[]): Promise<
  Map<string, { estado: string | null; estadoCodigo: string | null; aCargo: string[] }>
> {
  const out = new Map<string, { estado: string | null; estadoCodigo: string | null; aCargo: string[] }>()
  if (vehiculoIds.length === 0) return out
  const [veh, asig] = await Promise.all([
    supabase.from('vehiculos').select('id, vehiculos_estados(codigo, descripcion)').in('id', vehiculoIds),
    supabase
      .from('asignaciones')
      .select('vehiculo_id, horario, asignaciones_conductores(horario, estado, conductores(nombres, apellidos))')
      .in('estado', ['activo', 'activa'])
      .in('vehiculo_id', vehiculoIds),
  ])
  if (veh.error) throw veh.error
  if (asig.error) throw asig.error

  for (const v of (veh.data || []) as any[]) {
    out.set(v.id, {
      estado: v.vehiculos_estados?.descripcion ?? null,
      estadoCodigo: v.vehiculos_estados?.codigo ?? null,
      aCargo: [],
    })
  }
  for (const a of (asig.data || []) as any[]) {
    const fila = out.get(a.vehiculo_id) ?? { estado: null, estadoCodigo: null, aCargo: [] }
    const aCargoTodoDia = ['todo_dia', 'a_cargo', 'cargo'].includes(String(a.horario || '').toLowerCase())
    for (const ac of (a.asignaciones_conductores || []) as any[]) {
      if (!['asignado', 'activo'].includes(String(ac.estado || ''))) continue
      const nombre = nombreConductor(ac.conductores)
      if (!nombre) continue
      const h = String(ac.horario || '').toLowerCase()
      const turno = aCargoTodoDia ? 'A cargo' : h.startsWith('d') ? 'D' : h.startsWith('n') ? 'N' : ''
      fila.aCargo.push(turno ? `${turno}: ${nombre}` : nombre)
    }
    out.set(a.vehiculo_id, fila)
  }
  return out
}

/** Fecha/hora de Geotab: con zona la respeta; sin zona la toma como hora Argentina. */
function parseFechaArt(s: string | null | undefined): number | null {
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const t = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? Date.parse(iso) : Date.parse(`${iso}-03:00`)
  return Number.isFinite(t) ? t : null
}

const fmtLocalArt = (ms: number): string =>
  new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T')

const MARGEN_VIAJE_MS = 3 * 60 * 60 * 1000 // viaje más cercano a la carga: hasta 3 h antes o después

/**
 * Quién tenía el vehículo en cada carga (los vehículos son compartidos).
 *  1. GPS: el viaje de Geotab (geotab_historico, conductor identificado) que contiene
 *     la hora de la carga, o el más cercano dentro de 3 h.
 *  2. Asignación vigente en ese momento. Si había dos turnos (diurno y nocturno) y no
 *     hay GPS, se muestran los dos como "sin confirmar".
 *  3. Conductor que informa Geotab en la carga.
 */
export async function fetchConductoresEnCargas(
  vehiculoId: string | null,
  patente: string,
  fillups: FuelFillup[],
): Promise<Map<string, ConductorEnCarga>> {
  const res = new Map<string, ConductorEnCarga>()
  if (fillups.length === 0) return res
  const tiempos = fillups.map(f => Date.parse(f.fecha_evento)).filter(Number.isFinite)
  const min = Math.min(...tiempos) - MARGEN_VIAJE_MS
  const max = Math.max(...tiempos) + MARGEN_VIAJE_MS
  const patNorm = normalizarPatente(patente)

  // 1. Viajes GPS de esa patente alrededor de las cargas
  let viajes: { conductor: string; ini: number; fin: number }[] = []
  try {
    const patron = patNorm.split('').join('%')
    const filas = await traerTodo<any>((a, b) =>
      supabase
        .from('geotab_historico')
        .select('patente, conductor, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3')
        .ilike('patente', `%${patron}%`)
        .gte('fecha_hora_inicio_gmt3', fmtLocalArt(min - 24 * 60 * 60 * 1000))
        .lte('fecha_hora_inicio_gmt3', fmtLocalArt(max))
        .order('fecha_hora_inicio_gmt3', { ascending: true })
        .range(a, b),
    )
    viajes = filas
      .filter(v => normalizarPatente(v.patente) === patNorm && String(v.conductor || '').trim())
      .map(v => {
        const ini = parseFechaArt(v.fecha_hora_inicio_gmt3)
        const fin = parseFechaArt(v.fecha_hora_fin_gmt3) ?? ini
        return { conductor: String(v.conductor).trim(), ini: ini ?? 0, fin: fin ?? 0 }
      })
      .filter(v => v.ini > 0)
  } catch (e) {
    console.warn('[Combustible] Sin viajes GPS para resolver el conductor', e)
  }

  // 2. Asignaciones del vehículo (con sus tramos por conductor)
  let tramos: { nombre: string; turno: string; ini: number; fin: number | null }[] = []
  if (vehiculoId) {
    try {
      const { data, error } = await supabase
        .from('asignaciones')
        .select('horario, fecha_inicio, fecha_inicio_real, asignaciones_conductores(horario, estado, fecha_inicio, fecha_fin, conductores(nombres, apellidos))')
        .eq('vehiculo_id', vehiculoId)
      if (error) throw error
      for (const a of (data || []) as any[]) {
        for (const ac of (a.asignaciones_conductores || []) as any[]) {
          if (String(ac.estado || '') === 'cancelado') continue
          const ini = parseFechaArt(ac.fecha_inicio ?? a.fecha_inicio_real ?? a.fecha_inicio)
          if (ini === null) continue
          const h = String(ac.horario || a.horario || '').toLowerCase()
          tramos.push({
            nombre: nombreConductor(ac.conductores),
            turno: h.startsWith('d') ? 'D' : h.startsWith('n') ? 'N' : '',
            ini,
            fin: parseFechaArt(ac.fecha_fin),
          })
        }
      }
      tramos = tramos.filter(t => t.nombre)
    } catch (e) {
      console.warn('[Combustible] Sin asignaciones para resolver el conductor', e)
    }
  }

  for (const f of fillups) {
    const t = Date.parse(f.fecha_evento)
    if (!Number.isFinite(t)) continue

    // GPS: viaje que contiene la carga, si no el más cercano (antes o después) dentro del margen
    const contiene = viajes.find(v => v.ini <= t && t <= v.fin)
    let cercano = contiene
    if (!cercano) {
      let mejor = Infinity
      for (const v of viajes) {
        const dist = t > v.fin ? t - v.fin : v.ini - t
        if (dist >= 0 && dist <= MARGEN_VIAJE_MS && dist < mejor) {
          mejor = dist
          cercano = v
        }
      }
    }
    if (cercano) {
      res.set(f.id, { nombre: cercano.conductor, fuente: 'gps' })
      continue
    }

    const vigentes = tramos.filter(tr => tr.ini <= t && (tr.fin === null || tr.fin >= t))
    const nombres = [...new Map(vigentes.map(v => [v.nombre, v])).values()]
    if (nombres.length === 1) {
      res.set(f.id, { nombre: nombres[0].nombre, fuente: 'asignacion' })
      continue
    }
    if (nombres.length > 1) {
      res.set(f.id, {
        nombre: nombres.map(v => (v.turno ? `${v.turno}: ${v.nombre}` : v.nombre)).join(' · '),
        fuente: 'compartido',
      })
      continue
    }
    if (f.conductor_name && f.conductor_name.trim()) {
      res.set(f.id, { nombre: f.conductor_name.trim(), fuente: 'geotab' })
      continue
    }
    res.set(f.id, { nombre: 'Sin dato', fuente: 'sin_dato' })
  }
  return res
}

