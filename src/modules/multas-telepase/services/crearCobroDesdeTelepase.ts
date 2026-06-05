// src/modules/multas-telepase/services/crearCobroDesdeTelepase.ts
// Crea una incidencia de cobro + penalidad a partir de un registro de TelePASE (peaje),
// sin UI. Mismo flujo que crearCobroDesdeMulta (incidencia + penalidad -> "Por Aplicar").
//
// Resuelve automaticamente: vehiculo (por patente), conductor (por nombre del peaje),
// turno (modalidad de la asignacion, igual que multas), tipo "P005 - Peaje", estado PENDIENTE,
// monto desde la tarifa del peaje. Registrado por R2D2.

import { supabase } from '../../../lib/supabase'

export interface TelepaseCobroInput {
  id: string
  patente: string
  fecha: string
  hora: string
  estacion: string
  via: string
  tarifa: string
  concesionario: string
  conductor: string
  ibutton: string
}

export interface CrearCobroTelepaseCtx {
  userId?: string | null
  sedeId?: string | null
}

export type CrearCobroTelepaseResult =
  | { ok: true; incidenciaId: string; penalidadId: string }
  | { ok: false; needsManualInput: true; reason: string }
  | { ok: false; error: string }

function normalizePatente(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/[\s-]/g, '').toUpperCase()
}

function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function getLocalDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekNumber(dateStr: string): number {
  if (!dateStr) return 0
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

// La tarifa viene como "4.177,59" (formato AR). Convertir a number.
function parseTarifaToNumber(s: string | number | null | undefined): number {
  if (s == null || s === '') return 0
  if (typeof s === 'number') return s
  let str = s.replace(/[^\d,.-]/g, '')
  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')
  if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.')
  else if (lastDot !== -1 && lastComma !== -1) str = str.replace(/,/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function buildDescripcion(t: TelepaseCobroInput): string {
  const partes = [
    `Peaje TelePASE`,
    t.estacion ? `Estación: ${t.estacion}` : null,
    t.via ? `Vía: ${t.via}` : null,
    t.concesionario ? `Concesionario: ${t.concesionario}` : null,
    (t.fecha || t.hora) ? `Fecha: ${t.fecha || ''} ${t.hora || ''}`.trim() : null,
  ].filter(Boolean)
  return partes.join(' — ')
}

function findConductorByName(
  conductores: Array<{ id: string; nombre_completo: string }>,
  rawName: string | null | undefined,
): { id: string; nombre_completo: string } | null {
  const n = normalizeName(rawName)
  if (!n) return null
  let c = conductores.find(x => normalizeName(x.nombre_completo) === n)
  if (c) return c
  const tokens = n.split(' ').filter(t => t.length >= 3)
  if (tokens.length === 0) return null
  c = conductores.find(x => {
    const candidate = normalizeName(x.nombre_completo)
    return tokens.every(t => candidate.includes(t))
  })
  return c || null
}

export async function crearCobroDesdeTelepase(
  registro: TelepaseCobroInput,
  ctx: CrearCobroTelepaseCtx,
): Promise<CrearCobroTelepaseResult> {
  // 1) Periodo abierto de la sede para tomar fecha/semana (fallback: hoy)
  let fecha = getLocalDateString()
  if (ctx.sedeId) {
    const { data: periodos } = await (supabase.from('periodos_facturacion' as any) as any)
      .select('fecha_inicio')
      .eq('sede_id', ctx.sedeId)
      .eq('estado', 'abierto')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
    if (periodos && periodos[0]?.fecha_inicio) fecha = periodos[0].fecha_inicio
  }
  const semana = getWeekNumber(fecha)

  // 2) Tipo "P005 - Peaje"
  const { data: tipos } = await (supabase.from('tipos_cobro_descuento' as any) as any)
    .select('id, codigo, nombre')
    .eq('is_active', true)
  const tipoPeaje = (tipos || []).find((t: any) => t.codigo === 'P005_PEAJE')
    || (tipos || []).find((t: any) => t.nombre?.toLowerCase().includes('peaje'))
  if (!tipoPeaje) return { ok: false, error: 'No se encontró el tipo "P005 - Peaje" en tipos_cobro_descuento' }

  // 3) Estado PENDIENTE
  const { data: estados } = await (supabase.from('incidencias_estados' as any) as any)
    .select('id, codigo')
    .eq('is_active', true)
  const estadoPendiente = (estados || []).find((e: any) => e.codigo === 'PENDIENTE') || (estados || [])[0]
  if (!estadoPendiente) return { ok: false, error: 'No se encontró el estado PENDIENTE de incidencias' }

  // 4) Vehiculo por patente
  const patNorm = normalizePatente(registro.patente)
  const { data: vehiculos } = await supabase.from('vehiculos').select('id, patente, sede_id').is('deleted_at', null)
  const vehiculo = (vehiculos || []).find((v: any) => normalizePatente(v.patente) === patNorm)
  if (!vehiculo) {
    return { ok: false, needsManualInput: true, reason: `No se encontró el vehículo con patente ${registro.patente}` }
  }

  // 5) Conductor por nombre (el peaje ya trae el conductor de la bitacora)
  const { data: conductoresRaw } = await supabase.from('conductores').select('id, nombres, apellidos')
  const conductores = (conductoresRaw || []).map((c: any) => ({
    id: c.id, nombre_completo: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
  }))
  const conductor = findConductorByName(conductores, registro.conductor)
  if (!conductor) {
    return {
      ok: false,
      needsManualInput: true,
      reason: registro.conductor
        ? `No se encontró el conductor "${registro.conductor}" en la base.`
        : 'El peaje no tiene conductor asignado.',
    }
  }

  // 6) Sede: la del vehiculo si no vino en el ctx
  const sedeId = ctx.sedeId || vehiculo.sede_id || null

  // 7) Turno (modalidad) desde asignaciones — MISMA logica que multas
  let turno: string | null = null
  const { data: asignaciones } = await (supabase
    .from('asignaciones')
    .select('horario, asignaciones_conductores(horario, conductor_id)')
    .eq('vehiculo_id', vehiculo.id) as any)
  for (const asig of (asignaciones || [])) {
    const ac = (asig.asignaciones_conductores || []).find((x: any) => x.conductor_id === conductor.id)
    if (!ac) continue
    if (asig.horario !== 'turno') { turno = 'A cargo'; break }
    if (ac.horario === 'diurno') { turno = 'Diurno'; break }
    if (ac.horario === 'nocturno') { turno = 'Nocturno'; break }
    turno = 'A cargo'; break
  }

  const monto = parseTarifaToNumber(registro.tarifa)
  const descripcion = buildDescripcion(registro)

  // 8) INSERT en incidencias
  const { data: incidenciaCreada, error: incError } = await (supabase.from('incidencias' as any) as any)
    .insert({
      vehiculo_id: vehiculo.id,
      conductor_id: conductor.id,
      estado_id: estadoPendiente.id,
      sede_id: sedeId,
      semana,
      fecha,
      turno,
      area: 'Logística',
      descripcion,
      conductor_nombre: conductor.nombre_completo,
      vehiculo_patente: vehiculo.patente,
      tipo: 'cobro',
      tipo_cobro_descuento_id: tipoPeaje.id,
      monto: monto || null,
      telepase_id: registro.id,
      created_by: ctx.userId || null,
      created_by_name: 'R2D2',
    })
    .select('id')
    .single()
  if (incError || !incidenciaCreada) return { ok: false, error: incError?.message || 'Error al crear la incidencia' }

  // 9) INSERT en penalidades — hace que aparezca en "Por Aplicar"
  const { data: penalidadCreada, error: penError } = await (supabase.from('penalidades' as any) as any)
    .insert({
      incidencia_id: incidenciaCreada.id,
      vehiculo_id: vehiculo.id,
      conductor_id: conductor.id,
      tipo_cobro_descuento_id: tipoPeaje.id,
      semana,
      fecha,
      turno,
      area_responsable: 'ADMINISTRACION',
      detalle: 'Cobro por peaje',
      monto: monto || null,
      observaciones: descripcion,
      aplicado: false,
      rechazado: false,
      conductor_nombre: conductor.nombre_completo,
      vehiculo_patente: vehiculo.patente,
      created_by: ctx.userId || null,
      created_by_name: 'R2D2',
      sede_id: sedeId,
    })
    .select('id')
    .single()
  if (penError || !penalidadCreada) {
    // Rollback: si la penalidad falla, borrar la incidencia recien creada para no dejarla a medias.
    await (supabase.from('incidencias' as any) as any).delete().eq('id', incidenciaCreada.id)
    return { ok: false, error: penError?.message || 'Error al crear la penalidad' }
  }

  return { ok: true, incidenciaId: incidenciaCreada.id, penalidadId: penalidadCreada.id }
}
